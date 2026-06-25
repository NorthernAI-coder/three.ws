/**
 * EmbodimentStage — a living agent body you can drop into a panel.
 *
 * This is the engine behind three.ws's headline trick: a generated, rigged avatar
 * that renders inline, lip-syncs the assistant's replies, shows the matching
 * emotion, plays a body gesture, idles between turns, and reacts while a tool runs.
 * It is framework-agnostic — give it a DOM container and a persona (a name + a GLB
 * URL) and it mounts a Three.js scene and drives it. The Apps SDK host bridge and
 * the local demo harness are both thin wrappers around this one class.
 *
 * Everything it does runs on real platform pipelines, not canned stand-ins:
 *   • Body animation rides AnimationManager + the canonicalize/retarget pipeline,
 *     so the baked clip library (idle, gestures) drives ANY humanoid rig. A rig
 *     that can't be skeleton-driven (no skin / non-humanoid prop) is detected up
 *     front (decideRigMode) and falls back to a gentle alive-idle — never a frozen
 *     T-pose.
 *   • Lip-sync is best-first: an Audio2Face ARKit track synced to TTS audio when
 *     present, else live spectral analysis of playing audio, else a deterministic
 *     text-timed mouth envelope. If the rig has no mouth morphs, AvatarMouthTarget
 *     drives the jaw (or head) bone instead, so the face is never frozen.
 *   • Emotion is detected from the reply text (or set explicitly), blended onto the
 *     face (FaceExpression / ARKit morphs) AND expressed through a body gesture, so
 *     even a morph-less rig emotes.
 *
 * State machine: loading → idle ⇄ listening ⇄ thinking ⇄ speaking → (error).
 * Each transition is observable via opts.onState so the host can paint a status.
 */

import {
	Scene, PerspectiveCamera, WebGLRenderer, AmbientLight, DirectionalLight,
	PMREMGenerator, Box3, Vector3, Group, Color,
} from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

import { AnimationManager } from '../../src/animation-manager.js';
import { AvatarMouthTarget } from '../../src/voice/avatar-morph-target.js';
import { A2FPlayer } from '../../src/voice/a2f-player.js';
import { inspectRig, decideRigMode } from '../../src/embodiment/rig-mode.js';
import { expressionForText, expressionFor } from '../../src/embodiment/emotion.js';
import { TextVisemeEnvelope, estimateSpeechDuration } from '../../src/embodiment/text-visemes.js';
import { FaceExpression } from '../../src/embodiment/face-expression.js';

const REDUCED_MOTION =
	typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

// The subset of the baked clip manifest the embodiment stage needs: a believable
// idle plus the emotion gestures the engine asks for. Loaded lazily from the
// platform's animation manifest so the stage rides the same retarget pipeline.
const REQUIRED_CLIPS = [
	'idle', 'av-waiting', 'av-joy', 'av-celebrating', 'xbot-sad-pose',
	'defeated', 'angry', 'reaction', 'wave',
];

export class EmbodimentStage {
	/**
	 * @param {HTMLElement} container
	 * @param {{ onState?: (state:string, detail?:object)=>void, background?: string }} [opts]
	 */
	constructor(container, opts = {}) {
		this.container = container;
		this.onState = typeof opts.onState === 'function' ? opts.onState : () => {};
		this.state = 'loading';
		this._disposed = false;
		this._rigMode = null;
		this._lastT = 0;

		// Lip-sync timing (text-driven path).
		this._speakEnv = null;
		this._speakStart = 0;
		this._speakDur = 0;
		this._audio = null;
		this._a2fActive = false;

		// Subsystems.
		this.anim = new AnimationManager();
		this.mouth = new AvatarMouthTarget();
		this.a2f = new A2FPlayer();
		this.face = new FaceExpression();

		this._buildScene(opts.background);
		this._raf = requestAnimationFrame(this._tick);
		this._onResize = () => this._resize();
		window.addEventListener('resize', this._onResize);
		if (typeof ResizeObserver === 'function') {
			this._ro = new ResizeObserver(() => this._resize());
			this._ro.observe(container);
		}
	}

	// ── scene ───────────────────────────────────────────────────────────────────

	_buildScene(background) {
		const c = this.container;
		const w = Math.max(1, c.clientWidth);
		const h = Math.max(1, c.clientHeight);

		this.scene = new Scene();
		if (background && background !== 'transparent') this.scene.background = new Color(background);

		this.camera = new PerspectiveCamera(32, w / h, 0.05, 200);
		this.camera.position.set(0, 1.45, 3.0);

		this.renderer = new WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
		this.renderer.setSize(w, h);
		this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
		this.renderer.outputColorSpace = 'srgb';
		c.appendChild(this.renderer.domElement);
		this.renderer.domElement.setAttribute('aria-label', 'Interactive 3D agent');
		this.renderer.domElement.setAttribute('role', 'img');

		this.scene.add(new AmbientLight(0xffffff, 0.6));
		const key = new DirectionalLight(0xffffff, 1.6);
		key.position.set(2, 4, 3);
		this.scene.add(key);
		const rim = new DirectionalLight(0x99bbff, 0.5);
		rim.position.set(-3, 2, -2);
		this.scene.add(rim);

		const pmrem = new PMREMGenerator(this.renderer);
		this._envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
		this.scene.environment = this._envTex;
		pmrem.dispose();

		this.controls = new OrbitControls(this.camera, this.renderer.domElement);
		this.controls.enableDamping = true;
		this.controls.dampingFactor = 0.08;
		this.controls.minDistance = 1.0;
		this.controls.maxDistance = 6;
		this.controls.target.set(0, 1.3, 0);
		this.controls.enablePan = false;

		this.root = new Group();
		this.scene.add(this.root);
	}

	_resize() {
		if (this._disposed) return;
		const w = Math.max(1, this.container.clientWidth);
		const h = Math.max(1, this.container.clientHeight);
		this.renderer.setSize(w, h);
		this.camera.aspect = w / h;
		this.camera.updateProjectionMatrix();
	}

	// ── persona loading ───────────────────────────────────────────────────────

	/**
	 * Load (or swap to) a persona's body.
	 * @param {{ glbUrl: string, name?: string, personaId?: string }} persona
	 */
	async loadPersona(persona) {
		this._setState('loading', { name: persona?.name });
		// Clear any previous body.
		if (this._model) {
			this.root.remove(this._model);
			this._disposeObject(this._model);
			this._model = null;
		}
		this.face.reset();
		this._speakEnv = null;
		this._a2fActive = false;

		let gltf;
		try {
			const loader = new GLTFLoader();
			gltf = await loader.loadAsync(persona.glbUrl);
		} catch (err) {
			this._setState('error', { message: 'Could not load this avatar.', cause: String(err?.message || err) });
			return false;
		}
		if (this._disposed) return false;

		const model = gltf.scene || gltf.scenes?.[0];
		if (!model) {
			this._setState('error', { message: 'This file has no renderable scene.' });
			return false;
		}
		this._model = model;
		this.root.add(model);
		this._frameModel(model);

		// Decide rig mode from the node graph BEFORE wiring the animation system.
		const { hasSkinnedMesh, boneNames } = inspectRig(model);
		this._rigMode = decideRigMode({ hasSkinnedMesh, boneNames });

		// Lip-sync + face binding (works regardless of rig mode).
		this.mouth.attach(model);
		this.a2f.attach(model);
		this.face.attach(model);

		// Animation: canonical clip library for humanoids, alive-idle fallback else.
		this.anim.attach(model, { avatarId: persona.personaId, avatarUrl: persona.glbUrl });
		this._clipsReady = false;
		if (this._rigMode.mode === 'canonical' && this.anim.supportsCanonicalClips()) {
			await this._loadClips();
			if (this._disposed) return false;
			this._clipsReady = true;
			await this.anim.play('idle').catch(() => {});
		}

		this._setState('idle', {
			name: persona.name,
			rig: this._rigMode.mode,
			rigReason: this._rigMode.reason,
			hasMouthMorphs: this.mouth.hasMouthMorphs(),
			hasJawBone: this.mouth.hasJawBone(),
			hasFaceMorphs: this.face.hasMorphs(),
			hasVisemeTrack: this.a2f.hasCoverage(),
		});
		return true;
	}

	async _loadClips() {
		// Pull the platform animation manifest and register only what the stage uses.
		let defs = [];
		try {
			const res = await fetch('/animations/manifest.json', { credentials: 'same-origin' });
			if (res.ok) {
				const manifest = await res.json();
				const want = new Set(REQUIRED_CLIPS);
				defs = manifest.filter((d) => want.has(d.name));
			}
		} catch {
			/* manifest unreachable — idle fallback still animates via the bone idle */
		}
		if (!defs.length) return;
		this.anim.setAnimationDefs(defs);
		// Ensure the idle is present before first paint; gestures lazy-load on demand.
		await this.anim.ensureLoaded('idle').catch(() => {});
	}

	_frameModel(model) {
		const box = new Box3().setFromObject(model);
		const size = box.getSize(new Vector3());
		const center = box.getCenter(new Vector3());
		// Recentre on the ground, framed on the upper body / face.
		model.position.x += -center.x;
		model.position.z += -center.z;
		model.position.y += -box.min.y;
		const height = size.y || 1.6;
		const focusY = Math.min(height * 0.82, height - 0.1);
		this.controls.target.set(0, focusY, 0);
		const dist = Math.max(1.4, height * 1.15);
		this.camera.position.set(0, focusY + height * 0.05, dist);
		this.camera.near = Math.max(0.01, dist / 100);
		this.camera.far = dist * 50;
		this.camera.updateProjectionMatrix();
		this.controls.update();
	}

	// ── conversational states ─────────────────────────────────────────────────

	/** The body is attending to the user (between the user typing and a reply). */
	listening() {
		if (this.state === 'speaking') return;
		this._endSpeech();
		this._setState('listening');
		this.face.setTarget({ browInnerUp: 0.12, eyeWideLeft: 0.08, eyeWideRight: 0.08 });
		this._playGestureOrIdle(null, 'idle');
	}

	/** A tool is running — the body shows a thinking beat. */
	thinking() {
		if (this.state === 'speaking') return;
		this._endSpeech();
		this._setState('thinking');
		const expr = expressionFor('thinking', 0.7);
		this.face.setTarget(expr.face);
		this._playGestureOrIdle(expr.gesture, expr.idle);
	}

	/**
	 * Perform a reply. Drives lip-sync + emotion + gesture for this turn, then
	 * settles back to idle.
	 * @param {{ text: string, emotion?: string, intensity?: number, gesture?: string, audioUrl?: string, visemeTrack?: object }} turn
	 */
	async speak(turn = {}) {
		const text = String(turn.text || '').trim();
		if (!text) return;
		const expr = turn.emotion
			? { ...expressionFor(turn.emotion, turn.intensity ?? 0.85) }
			: expressionForText(text);
		const gesture = turn.gesture || expr.gesture;

		this._setState('speaking', { text, emotion: expr.emotion, intensity: expr.intensity, gesture });
		this.face.setTarget(expr.face);
		this._playGestureOrIdle(gesture, expr.idle);

		// Lip-sync source, best-first.
		this._endSpeech(false);
		if (turn.visemeTrack && this.a2f.hasCoverage() && turn.audioUrl) {
			await this._speakWithAudio(turn.audioUrl, turn.visemeTrack);
		} else {
			this._speakWithText(text);
		}
	}

	_speakWithText(text) {
		this._speakEnv = new TextVisemeEnvelope(text);
		this._speakStart = this._clockNow();
		this._speakDur = this._speakEnv.duration;
		this._a2fActive = false;
	}

	async _speakWithAudio(audioUrl, track) {
		try {
			const audio = new Audio(audioUrl);
			audio.crossOrigin = 'anonymous';
			this._audio = audio;
			this.a2f.setTrack(track);
			this._a2fActive = true;
			this._speakDur = track?.durationSec || estimateSpeechDuration('', {});
			await audio.play();
			audio.addEventListener('ended', () => this._endSpeech(), { once: true });
		} catch {
			// Autoplay blocked or audio failed — fall back to the text envelope.
			this._a2fActive = false;
			this._speakWithText(audioUrl ? '' : '');
		}
	}

	_endSpeech(settle = true) {
		if (this._audio) {
			try { this._audio.pause(); } catch { /* noop */ }
			this._audio = null;
		}
		this._speakEnv = null;
		this._a2fActive = false;
		if (this.a2f?.reset) this.a2f.reset();
		this.mouth.setMouthShape({ open: 0, wide: 0, round: 0 });
		if (settle && this.state === 'speaking') {
			this._setState('idle');
			this.face.setTarget({});
			this._playGestureOrIdle(null, 'idle');
		}
	}

	_playGestureOrIdle(gesture, idle = 'idle') {
		if (!this._clipsReady) return; // fallback rig: alive-idle handled in _tick
		const idleName = idle || 'idle';
		this.anim.crossfadeTo(idleName).catch(() => {});
		if (gesture && gesture !== idleName) {
			// Upper-body gesture over the idle so the legs keep their weight shift.
			this.anim.ensureLoaded(gesture)
				.then((ok) => { if (ok) this.anim.playOverlay(gesture, { loop: false, upperBodyOnly: true }).catch(() => {}); })
				.catch(() => {});
		} else {
			this.anim.stopOverlay().catch?.(() => {});
		}
	}

	// ── frame loop ──────────────────────────────────────────────────────────────

	_clockNow() {
		return (typeof performance !== 'undefined' ? performance.now() : Date.now()) / 1000;
	}

	_tick = () => {
		if (this._disposed) return;
		this._raf = requestAnimationFrame(this._tick);
		const now = this._clockNow();
		const dt = this._lastT ? Math.min(0.05, now - this._lastT) : 0.016;
		this._lastT = now;

		// Body animation.
		this.anim.update(dt);

		// Fallback alive-idle: when the rig can't play canonical clips, the body
		// must still breathe. A slow vertical bob + gentle yaw — never a frozen pose.
		if (!this._clipsReady && this._model && !REDUCED_MOTION) {
			const t = now;
			this._model.position.y = (this._model.position.y || 0); // keep grounded base
			this.root.rotation.y = Math.sin(t * 0.25) * 0.18;
			this.root.position.y = Math.sin(t * 1.1) * 0.012;
		}

		// Lip-sync.
		if (this.state === 'speaking') {
			if (this._a2fActive && this._audio) {
				this.a2f.update(this._audio.currentTime);
				if (this._audio.ended) this._endSpeech();
			} else if (this._speakEnv) {
				const t = now - this._speakStart;
				const shape = this._speakEnv.sample(t);
				this.mouth.setMouthShape(shape);
				if (this._speakEnv.done(t)) this._endSpeech();
			}
		}

		// Emotion face ease.
		this.face.update(dt);

		this.controls.update();
		this.renderer.render(this.scene, this.camera);
	};

	// ── state + teardown ──────────────────────────────────────────────────────

	_setState(state, detail = {}) {
		this.state = state;
		try { this.onState(state, detail); } catch { /* host callback must not break the loop */ }
	}

	_disposeObject(obj) {
		obj.traverse?.((node) => {
			if (node.geometry) node.geometry.dispose?.();
			const mats = Array.isArray(node.material) ? node.material : node.material ? [node.material] : [];
			for (const m of mats) {
				for (const k of Object.keys(m)) {
					const v = m[k];
					if (v && v.isTexture) v.dispose?.();
				}
				m.dispose?.();
			}
		});
	}

	destroy() {
		if (this._disposed) return;
		this._disposed = true;
		cancelAnimationFrame(this._raf);
		window.removeEventListener('resize', this._onResize);
		this._ro?.disconnect?.();
		this._endSpeech(false);
		this.mouth.dispose?.();
		if (this._model) this._disposeObject(this._model);
		this._envTex?.dispose?.();
		this.controls?.dispose?.();
		this.renderer?.dispose?.();
		if (this.renderer?.domElement?.parentNode) this.renderer.domElement.parentNode.removeChild(this.renderer.domElement);
	}
}

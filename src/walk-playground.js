// Walk Playground — the page becomes a top-down playground
// ========================================================
// Hands off from the corner Walk Companion (src/walk-companion.js): click the
// companion and it "detaches" from its spot into a free-roaming character you
// steer around the page from a gentle aerial view. The page is treated as a
// floor seen from slightly above — walk anywhere across it with the arrow keys
// / WASD (an on-screen d-pad on touch). There is no gravity and nothing to fall
// off: the little guy strolls all over the page. Walk onto a hyperlink and it
// lights up like a doorway; pause on it or press the dive key and the character
// drops through and you "fall into" the next page, arriving on the other side.
//
// Why this lives in its own module: it is loaded with a dynamic import() the
// first time you detach, so a normal page never pays for the playground's code
// or a second WebGL context — exactly the zero-footprint contract the companion
// already honors. It reuses the companion's shared building blocks: the same
// RobotExpressive rig + embedded clips, the same meshopt-only GLTFLoader, and
// the same global WebGL-context budget (reserve/release) so the two never run
// two contexts at once.

import {
	AmbientLight,
	AnimationMixer,
	Box3,
	CircleGeometry,
	DirectionalLight,
	DoubleSide,
	Group,
	HemisphereLight,
	LoopOnce,
	LoopRepeat,
	Mesh,
	MeshBasicMaterial,
	OrthographicCamera,
	Scene,
	Timer,
	Vector3,
	WebGLRenderer,
} from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { getMeshoptDecoder } from './viewer/internal.js';
import { reserveWebGLContext, releaseWebGLContext } from './webgl-budget.js';
import { log } from './shared/log.js';

const ROBOT_URL = '/animations/robotexpressive.glb';
const RESUME_KEY = 'walk:playground:resume'; // sessionStorage flag: drop in on arrival

// ── Tuning (CSS-pixel units, seconds) ────────────────────────────────────────
const CHAR_PX = 150; // rendered feet-to-head height (pre-foreshorten)
const MOVE_ACCEL = 3600;
const MAX_SPEED = 360;
const RUN_SPEED = 250; // speed above this plays the run clip
const FRICTION = 3200;
const EDGE_PAD = 30; // keep the character this far from the page edges
const CAM_PITCH = 0.5; // radians (~28°) — gentle aerial, "not too dramatic"
const LINK_DWELL_MS = 700; // stand on a link this long → the doorway opens
const SPAWN_GUARD_MS = 1100; // no auto-dive until the user has had a beat of control
const ELEM_PROBE_MS = 90; // throttle for elementFromPoint link hit-testing

function prefersReducedMotion() {
	try {
		return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
	} catch {
		return false;
	}
}
function ssSet(key, val) {
	try {
		sessionStorage.setItem(key, val);
	} catch {
		/* non-fatal */
	}
}
function ssGet(key) {
	try {
		return sessionStorage.getItem(key);
	} catch {
		return null;
	}
}
function ssDel(key) {
	try {
		sessionStorage.removeItem(key);
	} catch {
		/* non-fatal */
	}
}
function clamp(v, lo, hi) {
	return Math.max(lo, Math.min(hi, v));
}

function docWidth() {
	return Math.max(document.documentElement.clientWidth, window.innerWidth || 0);
}
function docHeight() {
	const el = document.scrollingElement || document.documentElement;
	return Math.max(el.scrollHeight, window.innerHeight || 0);
}
function maxScroll() {
	return Math.max(0, docHeight() - window.innerHeight);
}

// Resolve the same-origin link (if any) sitting under a viewport point, walking
// up from the topmost element there. Returns its absolute href or null.
function linkHrefAtPoint(sx, sy) {
	let el = document.elementFromPoint(sx, sy);
	if (!el) return null;
	const a = el.closest?.('a[href]');
	if (!a) return null;
	if (a.target && a.target !== '_self') return null;
	const raw = a.getAttribute('href') || '';
	if (!raw || raw.startsWith('#') || raw.startsWith('javascript:')) return null;
	try {
		const u = new URL(raw, location.href);
		if (u.origin !== location.origin) return null;
		return { href: u.href, el: a };
	} catch {
		return null;
	}
}

// ── Animation controller (RobotExpressive clips) ─────────────────────────────
// States: idle / walk / run / jump (jump is the dive-through flourish). The
// playground logic never branches on clip names — it calls setState(); missing
// clips degrade gracefully to idle.
function makeController(root, clips) {
	const mixer = new AnimationMixer(root);
	const byName = (name) => clips.find((c) => c.name.toLowerCase() === name.toLowerCase());
	const pick = (cands) => {
		for (const n of cands) {
			const c = byName(n);
			if (c) return c;
		}
		return null;
	};
	const map = {
		idle: pick(['Idle', 'idle']),
		walk: pick(['Walking', 'Walk', 'walk']),
		run: pick(['Running', 'Run', 'run', 'Walking', 'walk']),
		jump: pick(['Jump', 'jump', 'WalkJump']),
	};
	const action = {};
	for (const [state, clip] of Object.entries(map)) {
		if (!clip) continue;
		const a = mixer.clipAction(clip);
		a.enabled = true;
		action[state] = a;
	}

	let state = 'idle';
	let current = null;

	function crossfade(next, dur) {
		const a = action[next] || action.idle;
		if (!a) return;
		const once = next === 'jump';
		a.reset();
		a.setLoop(once ? LoopOnce : LoopRepeat, once ? 1 : Infinity);
		a.clampWhenFinished = once;
		a.fadeIn(dur).play();
		if (current && current !== a) current.fadeOut(dur);
		current = a;
	}
	crossfade('idle', 0);

	return {
		setState(next) {
			if (next === state) return;
			state = next;
			crossfade(next, next === 'jump' ? 0.12 : 0.22);
		},
		update(dt) {
			mixer.update(dt);
		},
		dispose() {
			mixer.stopAllAction();
			mixer.uncacheRoot(root);
		},
	};
}

class WalkPlayground {
	constructor() {
		this.mounted = false;
		this._reduced = prefersReducedMotion();
		this._raf = 0;
		this._tick = this._tick.bind(this);
		this._onKeyDown = this._onKeyDown.bind(this);
		this._onKeyUp = this._onKeyUp.bind(this);
		this._onResize = this._onResize.bind(this);

		// Character state, in document coordinates (feet position on the page).
		this.char = { x: 0, y: 0, vx: 0, vy: 0, facing: 0 };
		this._yaw = 0;

		// Input flags (held).
		this.input = { up: false, down: false, left: false, right: false, dive: false };

		// Link doorway arming.
		this._armEl = null;
		this._armAt = 0;
		this._armHref = null;
		this._lastProbe = 0;
		this._diving = false;
		this._spawnGuardUntil = 0;

		// Scratch vectors reused each frame (no per-frame allocation).
		this._v0 = new Vector3();
		this._v1 = new Vector3();
	}

	async mount({ avatarId = null, startScreen = null, dropIn = false } = {}) {
		if (this.mounted) return;
		if (!this._webglSupported()) {
			log.warn('[walk-playground] WebGL unavailable');
			return;
		}
		this.mounted = true;
		this._avatarId = avatarId;

		this._buildDom();
		try {
			await this._buildScene();
		} catch (err) {
			log.warn('[walk-playground] failed to load avatar:', err?.message || err);
			this._teardown();
			return;
		}

		this._placeStart(startScreen, dropIn);
		this._spawnGuardUntil = performance.now() + SPAWN_GUARD_MS;
		this._bindEvents();
		this._hintFor(dropIn);

		this.clock = new Timer();
		this._raf = requestAnimationFrame(this._tick);
	}

	unmount() {
		if (!this.mounted) return;
		this.mounted = false;
		cancelAnimationFrame(this._raf);
		this._raf = 0;
		window.removeEventListener('keydown', this._onKeyDown, true);
		window.removeEventListener('keyup', this._onKeyUp, true);
		window.removeEventListener('resize', this._onResize);
		this._clearArm();
		this._teardown();
	}

	// ── DOM scaffold (canvas + d-pad + hint) ──────────────────────────────────
	_buildDom() {
		ensureStyles();
		const host = document.createElement('div');
		host.className = 'walk-pg';
		host.setAttribute('role', 'application');
		host.setAttribute('aria-label', 'Page playground — walk the character with the arrow keys');
		host.innerHTML = `
			<canvas class="walk-pg-canvas"></canvas>
			<div class="walk-pg-hint" aria-live="polite"></div>
			<button type="button" class="walk-pg-exit" aria-label="Exit playground" title="Exit (Esc)">Exit ✕</button>
			<div class="walk-pg-pad" aria-hidden="true">
				<button type="button" class="walk-pg-btn" data-act="up" aria-label="Walk up">▲</button>
				<div class="walk-pg-pad-row">
					<button type="button" class="walk-pg-btn" data-act="left" aria-label="Walk left">◀</button>
					<button type="button" class="walk-pg-btn walk-pg-dive" data-act="dive" aria-label="Dive into link">⬇</button>
					<button type="button" class="walk-pg-btn" data-act="right" aria-label="Walk right">▶</button>
				</div>
				<button type="button" class="walk-pg-btn" data-act="down" aria-label="Walk down">▼</button>
			</div>
			<div class="walk-pg-flash" aria-hidden="true"></div>
		`;
		document.body.appendChild(host);
		this.host = host;
		this.canvas = host.querySelector('.walk-pg-canvas');
		this.hintEl = host.querySelector('.walk-pg-hint');
		this.flashEl = host.querySelector('.walk-pg-flash');
		host.querySelector('.walk-pg-exit').addEventListener('click', () => exitPlayground());

		// Touch / pointer d-pad — held while pressed.
		host.querySelectorAll('.walk-pg-btn').forEach((btn) => {
			const act = btn.getAttribute('data-act');
			const on = (e) => {
				e.preventDefault();
				this._setAct(act, true);
			};
			const off = (e) => {
				e.preventDefault();
				this._setAct(act, false);
			};
			btn.addEventListener('pointerdown', on);
			btn.addEventListener('pointerup', off);
			btn.addEventListener('pointerleave', off);
			btn.addEventListener('pointercancel', off);
		});
		requestAnimationFrame(() => host.classList.add('is-in'));
	}

	_setAct(act, val) {
		if (act in this.input) this.input[act] = val;
	}

	// ── Three.js scene: orthographic, pitched down for a gentle aerial view ────
	async _buildScene() {
		const renderer = new WebGLRenderer({ canvas: this.canvas, alpha: true, antialias: true });
		renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
		this.renderer = renderer;
		reserveWebGLContext();
		this._resizeRenderer();

		const scene = new Scene();
		this.scene = scene;
		scene.add(new AmbientLight(0xffffff, 0.9));
		const hemi = new HemisphereLight(0xbcd6ff, 0x1a2230, 0.75);
		hemi.position.set(0, 300, 0);
		scene.add(hemi);
		const sun = new DirectionalLight(0xffffff, 1.7);
		sun.position.set(80, 320, 260);
		scene.add(sun);

		this._setupCamera();

		const rig = new Group();
		scene.add(rig);
		this.rig = rig;

		// Soft contact shadow on the page plane (z=0), so the character reads as
		// standing on the page when seen from above.
		const shadow = new Mesh(
			new CircleGeometry(1, 28),
			new MeshBasicMaterial({ color: 0x05070c, transparent: true, opacity: 0.32, side: DoubleSide, depthWrite: false }),
		);
		shadow.renderOrder = -1;
		scene.add(shadow);
		this.shadow = shadow;

		const loader = new GLTFLoader();
		loader.setMeshoptDecoder(await getMeshoptDecoder());
		// Detaching from the corner companion means the same default rig walks
		// out of its spot; an explicit ?avatar= is honored when the API serves it.
		const url = this._avatarId ? `/api/avatars/${encodeURIComponent(this._avatarId)}/glb` : ROBOT_URL;
		let gltf;
		try {
			gltf = await loader.loadAsync(url);
		} catch (err) {
			if (this._avatarId) {
				gltf = await loader.loadAsync(ROBOT_URL); // graceful fallback to shared rig
			} else {
				throw err;
			}
		}
		const model = gltf.scene;
		model.traverse((n) => {
			if (n.isMesh) n.frustumCulled = false;
		});

		// Scale to a fixed pixel height and drop feet to the rig origin.
		const box = new Box3().setFromObject(model);
		const size = box.getSize(new Vector3());
		const scale = CHAR_PX / Math.max(0.001, size.y);
		model.scale.setScalar(scale);
		const box2 = new Box3().setFromObject(model);
		const center = box2.getCenter(new Vector3());
		model.position.x -= center.x;
		model.position.z -= center.z;
		model.position.y -= box2.min.y;
		this.modelHalfW = (size.x * scale) / 2;
		this._shadowR = Math.max(22, this.modelHalfW * 1.15);
		rig.add(model);

		this.controller = makeController(model, gltf.animations || []);
	}

	// Orthographic camera looking at the page plane (z=0) from slightly above, so
	// the world maps to screen pixels at a constant scale while we view upright
	// characters from a gentle downward angle. Feet are glued to exact page
	// points each frame via unproject (see _pagePointAtScreen), which stays exact
	// under any camera tilt because orthographic projection has no perspective.
	_setupCamera() {
		const W = window.innerWidth;
		const H = window.innerHeight;
		const cam = new OrthographicCamera(-W / 2, W / 2, H / 2, -H / 2, -4000, 8000);
		const D = 3000;
		cam.position.set(0, Math.sin(CAM_PITCH) * D, Math.cos(CAM_PITCH) * D);
		cam.up.set(0, 1, 0);
		cam.lookAt(0, 0, 0);
		cam.updateProjectionMatrix();
		cam.updateMatrixWorld(true);
		this.camera = cam;
	}

	// World point on the page plane (z=0) that projects to a given viewport pixel.
	_pagePointAtScreen(sx, sy, out) {
		const W = window.innerWidth;
		const H = window.innerHeight;
		const ndcX = (sx / W) * 2 - 1;
		const ndcY = -((sy / H) * 2 - 1);
		const p0 = this._v0.set(ndcX, ndcY, -1).unproject(this.camera);
		const p1 = this._v1.set(ndcX, ndcY, 1).unproject(this.camera);
		const dz = p1.z - p0.z;
		const t = Math.abs(dz) < 1e-6 ? 0 : -p0.z / dz;
		return out.set(p0.x + (p1.x - p0.x) * t, p0.y + (p1.y - p0.y) * t, 0);
	}

	_placeStart(startScreen, dropIn) {
		const sx = window.scrollX || 0;
		const sy = window.scrollY || 0;
		const w = docWidth();
		if (startScreen) {
			// Detached from the companion's corner — start from that exact spot.
			this.char.x = clamp(startScreen.x + sx, EDGE_PAD, w - EDGE_PAD);
			this.char.y = clamp(startScreen.y + sy, EDGE_PAD, docHeight() - EDGE_PAD);
		} else {
			// Deep-link or drop-in — start near the middle of the current view.
			this.char.x = clamp(w * 0.5, EDGE_PAD, w - EDGE_PAD);
			this.char.y = clamp(sy + window.innerHeight * (dropIn ? 0.32 : 0.4), EDGE_PAD, docHeight() - EDGE_PAD);
		}
		this.char.vx = 0;
		this.char.vy = 0;
		this._dropIn = dropIn;
	}

	// ── Events ────────────────────────────────────────────────────────────────
	_bindEvents() {
		window.addEventListener('keydown', this._onKeyDown, true);
		window.addEventListener('keyup', this._onKeyUp, true);
		window.addEventListener('resize', this._onResize);
	}

	_onKeyDown(e) {
		const k = e.key;
		if (k === 'Escape') {
			exitPlayground();
			return;
		}
		let handled = true;
		if (k === 'ArrowLeft' || k === 'a' || k === 'A') this.input.left = true;
		else if (k === 'ArrowRight' || k === 'd' || k === 'D') this.input.right = true;
		else if (k === 'ArrowUp' || k === 'w' || k === 'W') this.input.up = true;
		else if (k === 'ArrowDown' || k === 's' || k === 'S') this.input.down = true;
		else if (k === ' ' || k === 'Spacebar' || k === 'Enter' || k === 'e' || k === 'E') this.input.dive = true;
		else handled = false;
		if (handled) e.preventDefault();
	}

	_onKeyUp(e) {
		const k = e.key;
		if (k === 'ArrowLeft' || k === 'a' || k === 'A') this.input.left = false;
		else if (k === 'ArrowRight' || k === 'd' || k === 'D') this.input.right = false;
		else if (k === 'ArrowUp' || k === 'w' || k === 'W') this.input.up = false;
		else if (k === 'ArrowDown' || k === 's' || k === 'S') this.input.down = false;
		else if (k === ' ' || k === 'Spacebar' || k === 'Enter' || k === 'e' || k === 'E') this.input.dive = false;
	}

	_onResize() {
		this._resizeRenderer();
		this._setupCamera();
		this.char.x = clamp(this.char.x, EDGE_PAD, docWidth() - EDGE_PAD);
		this.char.y = clamp(this.char.y, EDGE_PAD, docHeight() - EDGE_PAD);
	}

	_resizeRenderer() {
		this.renderer.setSize(window.innerWidth, window.innerHeight, false);
	}

	// ── Hints ─────────────────────────────────────────────────────────────────
	_hintFor(dropIn) {
		const touch = matchMedia('(pointer: coarse)').matches;
		const move = touch ? 'Use the d-pad to walk' : 'Arrow keys / WASD to walk anywhere';
		this._say(dropIn ? `You're in! ${move}. Step on a link to dive deeper.` : `${move}. Step on a link to dive in.`, 5200);
	}

	_say(text, ms = 3200) {
		if (!this.hintEl || !text) return;
		this.hintEl.textContent = text;
		this.hintEl.classList.add('is-in');
		clearTimeout(this._hintTimer);
		this._hintTimer = setTimeout(() => this.hintEl?.classList.remove('is-in'), ms);
	}

	// ── Link doorway arming ───────────────────────────────────────────────────
	_armLink(el, href) {
		if (this._armEl === el) return;
		this._clearArm();
		this._armEl = el;
		this._armHref = href;
		this._armAt = performance.now();
		el.classList.add('walk-pg-portal');
		this._say('Pause here or press Space to dive in', 2400);
	}

	_clearArm() {
		if (this._armEl) this._armEl.classList.remove('walk-pg-portal');
		this._armEl = null;
		this._armHref = null;
	}

	// ── Dive into the next page ───────────────────────────────────────────────
	_dive(href) {
		if (this._diving || !href) return;
		this._diving = true;
		this.controller?.setState('jump');
		if (this._armEl) this._armEl.classList.add('is-open');
		// Flag so the destination relaunches the playground on arrival — the
		// "fall into the next page" payoff.
		ssSet(RESUME_KEY, '1');
		this.flashEl?.classList.add('is-on');
		const go = () => {
			location.href = href;
		};
		if (this._reduced) {
			go();
			return;
		}
		this.char.vx = 0;
		this.char.vy = 0;
		setTimeout(go, 560);
	}

	// ── Main loop ─────────────────────────────────────────────────────────────
	_tick() {
		if (!this.mounted) return;
		this.clock.update();
		const dt = Math.min(this.clock.getDelta(), 0.033);
		if (!this._diving) this._step(dt);
		this._follow();
		this._render(dt);
		this._raf = requestAnimationFrame(this._tick);
	}

	_step(dt) {
		const c = this.char;

		// Build a normalized input vector (so diagonals aren't faster).
		let ix = (this.input.right ? 1 : 0) - (this.input.left ? 1 : 0);
		let iy = (this.input.down ? 1 : 0) - (this.input.up ? 1 : 0);
		if (ix !== 0 && iy !== 0) {
			const inv = 1 / Math.SQRT2;
			ix *= inv;
			iy *= inv;
		}

		if (ix !== 0 || iy !== 0) {
			c.vx += ix * MOVE_ACCEL * dt;
			c.vy += iy * MOVE_ACCEL * dt;
			const sp = Math.hypot(c.vx, c.vy);
			if (sp > MAX_SPEED) {
				const k = MAX_SPEED / sp;
				c.vx *= k;
				c.vy *= k;
			}
		} else {
			// Friction to a stop.
			const f = FRICTION * dt;
			const sp = Math.hypot(c.vx, c.vy);
			if (sp <= f) {
				c.vx = 0;
				c.vy = 0;
			} else {
				const k = (sp - f) / sp;
				c.vx *= k;
				c.vy *= k;
			}
		}

		c.x = clamp(c.x + c.vx * dt, EDGE_PAD, docWidth() - EDGE_PAD);
		c.y = clamp(c.y + c.vy * dt, EDGE_PAD, docHeight() - EDGE_PAD);

		// Facing: turn toward travel direction (model faces +Z at yaw 0).
		const speed = Math.hypot(c.vx, c.vy);
		if (speed > 12) this.char.facing = Math.atan2(c.vx, c.vy);

		// Link hit-test under the feet (throttled), then arm / dive.
		const now = performance.now();
		if (now - this._lastProbe > ELEM_PROBE_MS) {
			this._lastProbe = now;
			const feetX = c.x - (window.scrollX || 0);
			const feetY = c.y - (window.scrollY || 0);
			const hit = linkHrefAtPoint(feetX, feetY);
			if (hit) this._armLink(hit.el, hit.href);
			else if (this._armEl) this._clearArm();
		}

		// Dive: explicit key, or dwelling still on the doorway past the guard.
		if (this._armHref) {
			if (this.input.dive) {
				this._dive(this._armHref);
				return;
			}
			const pastGuard = now > this._spawnGuardUntil;
			if (pastGuard && speed < 24 && now - this._armAt > LINK_DWELL_MS) {
				this._dive(this._armHref);
				return;
			}
		}

		// Animation state.
		let state = 'idle';
		if (speed > RUN_SPEED) state = 'run';
		else if (speed > 12) state = 'walk';
		this.controller?.setState(state);
	}

	// Scroll the page so the character stays in a comfortable central band,
	// letting him reach the whole document by walking up or down.
	_follow() {
		const vh = window.innerHeight;
		const cur = window.scrollY || 0;
		const screenY = this.char.y - cur;
		const top = vh * 0.3;
		const bottom = vh * 0.7;
		let next = cur;
		if (screenY < top) next = this.char.y - top;
		else if (screenY > bottom) next = this.char.y - bottom;
		next = clamp(next, 0, maxScroll());
		if (Math.abs(next - cur) > 0.5) window.scrollTo(0, next);
	}

	_render(dt) {
		const c = this.char;
		const feetX = c.x - (window.scrollX || 0);
		const feetY = c.y - (window.scrollY || 0);

		// Glue the feet to the exact page point beneath them.
		this._pagePointAtScreen(feetX, feetY, this._v0);
		this.rig.position.copy(this._v0);
		if (this.shadow) {
			this.shadow.position.set(this._v0.x, this._v0.y, this._v0.z + 0.5);
			this.shadow.scale.set(this._shadowR, this._shadowR * 0.5, 1);
		}

		if (this._diving) {
			this.rig.rotation.y += dt * 10;
			const s = Math.max(0.04, this.rig.scale.x - dt * 1.6);
			this.rig.scale.setScalar(s);
			if (this.shadow) this.shadow.material.opacity = Math.max(0, this.shadow.material.opacity - dt * 0.8);
		} else {
			// Smoothly turn toward the travel direction (shortest way around).
			let d = this.char.facing - this._yaw;
			while (d > Math.PI) d -= Math.PI * 2;
			while (d < -Math.PI) d += Math.PI * 2;
			this._yaw += d * Math.min(1, dt * 11);
			this.rig.rotation.y = this._yaw;
		}

		this.controller?.update(dt);
		this.renderer.render(this.scene, this.camera);
	}

	_teardown() {
		try {
			this.controller?.dispose();
		} catch {
			/* non-fatal */
		}
		this.controller = null;
		if (this.scene) {
			this.scene.traverse((n) => {
				if (n.isMesh) {
					n.geometry?.dispose?.();
					const mats = Array.isArray(n.material) ? n.material : [n.material];
					mats.forEach((m) => {
						if (!m) return;
						for (const v of Object.values(m)) {
							if (v && v.isTexture) v.dispose();
						}
						m.dispose?.();
					});
				}
			});
		}
		this.scene = null;
		if (this.renderer) {
			this.renderer.dispose();
			this.renderer.forceContextLoss?.();
			this.renderer = null;
			releaseWebGLContext();
		}
		if (this.host?.parentNode) this.host.parentNode.removeChild(this.host);
		this.host = null;
	}

	_webglSupported() {
		try {
			const c = document.createElement('canvas');
			return !!(window.WebGLRenderingContext && (c.getContext('webgl2') || c.getContext('webgl')));
		} catch {
			return false;
		}
	}
}

// ── Scoped styles ─────────────────────────────────────────────────────────────
let _stylesInjected = false;
function ensureStyles() {
	if (_stylesInjected) return;
	_stylesInjected = true;
	const style = document.createElement('style');
	style.id = 'walk-pg-style';
	style.textContent = `
.walk-pg{position:fixed;inset:0;z-index:2147483100;pointer-events:none;opacity:0;transition:opacity .3s ease}
.walk-pg.is-in{opacity:1}
.walk-pg-canvas{position:absolute;inset:0;width:100%;height:100%;pointer-events:none;filter:drop-shadow(0 16px 20px rgba(0,0,0,.28))}
.walk-pg-exit{position:fixed;top:14px;right:14px;z-index:3;pointer-events:auto;border:1px solid rgba(255,255,255,.16);background:rgba(14,16,22,.72);color:#f2f4f8;font:600 12.5px/1 system-ui,sans-serif;padding:9px 13px;border-radius:999px;cursor:pointer;backdrop-filter:blur(6px);transition:background .2s ease,transform .15s ease}
.walk-pg-exit:hover{background:rgba(220,60,60,.85)}
.walk-pg-exit:active{transform:scale(.96)}
.walk-pg-exit:focus-visible{outline:2px solid #7aa2ff;outline-offset:2px}
.walk-pg-hint{position:fixed;left:50%;bottom:22px;transform:translateX(-50%) translateY(8px);z-index:3;pointer-events:none;max-width:88vw;width:max-content;background:rgba(18,20,28,.92);color:#f2f4f8;font:500 13px/1.4 system-ui,sans-serif;padding:9px 14px;border-radius:12px;border:1px solid rgba(255,255,255,.1);box-shadow:0 10px 28px rgba(0,0,0,.35);opacity:0;transition:opacity .3s ease,transform .3s ease;text-align:center}
.walk-pg-hint.is-in{opacity:1;transform:translateX(-50%) translateY(0)}
.walk-pg-pad{position:fixed;left:18px;bottom:18px;z-index:3;display:none;flex-direction:column;align-items:center;gap:8px;pointer-events:none}
.walk-pg-pad-row{display:flex;gap:8px;align-items:center}
.walk-pg-btn{pointer-events:auto;width:54px;height:54px;border-radius:14px;border:1px solid rgba(255,255,255,.18);background:rgba(16,18,26,.78);color:#fff;font-size:20px;display:grid;place-items:center;backdrop-filter:blur(6px);-webkit-user-select:none;user-select:none;touch-action:none}
.walk-pg-btn:active{background:rgba(122,162,255,.5)}
.walk-pg-dive{border-radius:50%;background:rgba(122,162,255,.32)}
.walk-pg-flash{position:fixed;inset:0;z-index:2;pointer-events:none;background:radial-gradient(circle at 50% 50%,rgba(122,162,255,0) 0%,rgba(8,10,16,0) 60%);opacity:0;transition:opacity .5s ease}
.walk-pg-flash.is-on{background:radial-gradient(circle at 50% 50%,rgba(122,162,255,.25) 0%,rgba(6,8,14,.96) 70%);opacity:1}
@media (pointer: coarse){.walk-pg-pad{display:flex}.walk-pg-hint{bottom:200px}}
.walk-pg-portal{outline:2px solid rgba(122,162,255,.9)!important;outline-offset:3px;border-radius:6px;box-shadow:0 0 0 4px rgba(122,162,255,.18),0 0 28px rgba(122,162,255,.45)!important;transition:box-shadow .2s ease,transform .25s ease;animation:walk-pg-pulse 1.1s ease-in-out infinite}
.walk-pg-portal.is-open{transform:scale(.94);box-shadow:0 0 0 6px rgba(122,162,255,.3),0 0 48px rgba(122,162,255,.7)!important}
@keyframes walk-pg-pulse{0%,100%{box-shadow:0 0 0 4px rgba(122,162,255,.16),0 0 22px rgba(122,162,255,.35)}50%{box-shadow:0 0 0 6px rgba(122,162,255,.3),0 0 36px rgba(122,162,255,.6)}}
@media (prefers-reduced-motion:reduce){.walk-pg,.walk-pg-hint,.walk-pg-flash{transition:none}.walk-pg-portal{animation:none}}
`;
	document.head.appendChild(style);
}

// ── Public API ────────────────────────────────────────────────────────────────
let _instance = null;

export function launchPlayground(opts = {}) {
	if (_instance) return _instance;
	_instance = new WalkPlayground();
	_instance.mount(opts);
	return _instance;
}

export function exitPlayground() {
	if (_instance) {
		_instance.unmount();
		_instance = null;
	}
	try {
		window.dispatchEvent(new CustomEvent('walk-playground:exit'));
	} catch {
		/* non-fatal */
	}
}

export function shouldDropIn() {
	return ssGet(RESUME_KEY) === '1';
}

export function consumeDropIn() {
	const v = ssGet(RESUME_KEY) === '1';
	if (v) ssDel(RESUME_KEY);
	return v;
}

// Read-only snapshot of the live character — handy for debugging from the
// console (e.g. `__walkPlayground.state()`).
export function playgroundState() {
	if (!_instance || !_instance.mounted) return null;
	const c = _instance.char;
	return {
		x: Math.round(c.x),
		y: Math.round(c.y),
		vx: Math.round(c.vx),
		vy: Math.round(c.vy),
		speed: Math.round(Math.hypot(c.vx, c.vy)),
		onLink: !!_instance._armHref,
		diving: _instance._diving,
	};
}

if (typeof window !== 'undefined') {
	window.__walkPlayground = { launch: launchPlayground, exit: exitPlayground, state: playgroundState };
}

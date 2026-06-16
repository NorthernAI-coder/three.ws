// /club — three.ws Pole Club
//
// A dark 3D venue with three pole stages arranged in a half-arc. Each pole has
// a "Tip $0.001 to dance" button bound to /api/x402/dance-tip via the x402
// drop-in modal (window.X402.pay). Three distinct dancers stand at their poles
// facing the crowd; once the buyer's USDC settles, that slot's dancer steps
// onto her pole and performs the selected routine for ~12s, then returns to her
// idle stance at the pole. No tip, no routine.

import {
	AdditiveBlending,
	AmbientLight,
	Box3,
	BufferAttribute,
	BufferGeometry,
	Timer,
	Color,
	ConeGeometry,
	DoubleSide,
	EquirectangularReflectionMapping,
	Fog,
	Group,
	HemisphereLight,
	Mesh,
	MeshBasicMaterial,
	PerspectiveCamera,
	PMREMGenerator,
	PointLight,
	Points,
	PointsMaterial,
	Scene,
	SpotLight,
	SRGBColorSpace,
	Vector3,
	WebGLRenderer,
	NoToneMapping,
} from 'three';
import {
	EffectComposer,
	RenderPass,
	EffectPass,
	BloomEffect,
	ToneMappingEffect,
	VignetteEffect,
	SMAAEffect,
	ToneMappingMode,
} from 'postprocessing';
import { HDRLoader } from 'three/addons/loaders/HDRLoader.js';
import { clone as cloneSkinnedScene } from 'three/addons/utils/SkeletonUtils.js';

import { gltfLoader } from './loaders/gltf.js';
import { REQUIRED_VENUE_EMPTIES, collectVenueEmpties, resolveVenueAnchors } from './club-venue.js';
import { AnimationManager } from './animation-manager.js';
import { ClubCamera } from './club-camera.js';
import { ClubAudio, styleAudioFor, TRACK_LABELS } from './club-audio.js';
import { playSequence, ticketSteps } from './club-sequence.js';
import { detectProfile, PROFILES, createFrameWatchdog, isMobileLayout } from './club-perf.js';
import { log } from './shared/log.js';
import { emptyStateHTML } from './shared/state-kit.js';

const AVATAR_URL = '/avatars/default.glb';
const MANIFEST_URL = '/animations/manifest.json';
const POLE_GLB_URL = '/club/props/pole.glb';
const STAGE_GLB_URL = '/club/props/stage.glb';
// Authored nightclub interior + equirectangular HDRI for PBR reflections.
// Both are required — a 404 surfaces an error in the UI; the page does NOT
// fall back to a procedural scene. See public/club/assets/LICENSES.md for
// the named-empty contract these files must satisfy (the contract itself
// lives in src/club-venue.js so it can be unit-tested in isolation).
const VENUE_GLB_URL = '/club/venue/club-venue.glb';
const VENUE_HDRI_URL = '/club/venue/club-hdri.hdr';

// Clips we actually use — keeps the manifest pre-fetch small. Every name here
// must exist in /animations/manifest.json (built by `npm run build:animations`);
// a style sold by /api/x402/dance-tip may only chain clips from this set, or a
// paid routine would crossfade to a no-op and leave the dancer frozen.
const REQUIRED_CLIPS = new Set([
	'idle', 'dance', 'rumba', 'silly', 'thriller', 'capoeira', 'walk',
]);
const WALK_CLIP = 'walk';
// Guaranteed-present clip every dancer can drive. Used as the failsafe routine
// when a ticket's requested clips can't be loaded on the chosen rig, so a paid
// tip always yields a real performance (Hard rule 9: ship a working fallback).
const FALLBACK_CLIP = 'dance';

const TIP_ENDPOINT = '/api/x402/dance-tip';
const TIPS_HISTORY_URL = '/api/club/tips?limit=20';
const TIPS_STREAM_URL = '/api/club/tips/stream';

// ── Stage layout ─────────────────────────────────────────────────────────
// Poles in a half-arc facing the camera (count = POLE_COUNT). Backstage is behind the bar at
// negative Z so dancers visibly walk out before mounting the pole.
const STAGE_RADIUS = 4.2;
const POLE_COUNT = 3;
const POLE_HEIGHT = 3.6;
const PERFORMANCE_FADE = 0.45; // seconds for clip crossfade
// Top of the stage GLB. Authored in scripts/build-club-props.mjs at y=0.18.
// Mirrored here so the dancer rig + pole base sit on the disc face.
const STAGE_TOP_Y = 0.18;

const POLES = Array.from({ length: POLE_COUNT }, (_, i) => {
	// Spread across an arc from -55° to +55° at the front of the room.
	const t = POLE_COUNT === 1 ? 0.5 : i / (POLE_COUNT - 1);
	const angle = -Math.PI * 0.31 + t * Math.PI * 0.62;
	return {
		id: String(i + 1),
		x: Math.sin(angle) * STAGE_RADIUS,
		z: -Math.cos(angle) * STAGE_RADIUS + 1.4, // shift forward of camera focus
		// Backstage spawn point — same X as pole, deeper into the room.
		backstageX: Math.sin(angle) * (STAGE_RADIUS + 0.6),
		backstageZ: -Math.cos(angle) * (STAGE_RADIUS + 0.6) - 2.4,
		yaw: angle + Math.PI, // face the camera (poles look outward)
	};
});

const prefersReducedMotion = typeof window !== 'undefined' &&
	window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// ── DOM ───────────────────────────────────────────────────────────────────
const canvas = document.getElementById('club-canvas');
const polesPanel = document.getElementById('club-poles');
const statusEl = document.getElementById('club-status');
const tipFeedEl = document.getElementById('club-tip-feed');
const feedStatusEl = document.getElementById('club-feed-status');
const lbRowsEl = document.getElementById('club-lb-rows');
const lbTabsEls = document.querySelectorAll('.club-lb-tab');

// Upgrade the static "No tips yet" line to a guided empty state (C06). Cleared
// by renderTipRow() the moment the first tip settles.
if (tipFeedEl) {
	tipFeedEl.innerHTML = emptyStateHTML({
		compact: true,
		live: true,
		icon: '💸',
		title: 'No tips yet',
		body: 'Tip a dancer and they take the pole — every tip lands here live, paid on-chain for $0.001. Be the first.',
	});
}

function setStatus(text, { kind = 'info' } = {}) {
	if (!statusEl) return;
	statusEl.textContent = text;
	statusEl.dataset.kind = kind;
	statusEl.hidden = false;
	clearTimeout(setStatus._t);
	setStatus._t = setTimeout(() => { statusEl.hidden = true; }, 3500);
}

function fmtUsd(atomics, decimals = 6) {
	if (atomics == null) return '';
	const n = Number(atomics) / 10 ** decimals;
	if (n < 0.01) return `$${n.toFixed(4).replace(/0+$/, '').replace(/\.$/, '')}`;
	return `$${n.toFixed(2)}`;
}

// Dedupe ring: the local x402 echo and the SSE channel both deliver the same
// settled tip. Whichever wins the race renders the row; the loser is dropped
// by ticket_id. Capped so it doesn't grow without bound on a long session.
const DEDUPE_MAX = 50;
const renderedTicketIds = new Set();
const renderedOrder = [];

function rememberTicketId(id) {
	if (!id || renderedTicketIds.has(id)) return false;
	renderedTicketIds.add(id);
	renderedOrder.push(id);
	while (renderedOrder.length > DEDUPE_MAX) {
		renderedTicketIds.delete(renderedOrder.shift());
	}
	return true;
}

function formatTimestamp(isoOrDate) {
	try {
		const d = isoOrDate instanceof Date ? isoOrDate : new Date(isoOrDate);
		if (isNaN(d.getTime())) return '';
		return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
	} catch { return ''; }
}

// Render one tip into the feed. Accepts both the server row shape
// (snake_case from /api/club/tips and SSE `tip` events) and the local
// x402 ticket shape (camelCase from window.X402.pay).
function renderTipRow(rowLike, { live = false, prepend = true } = {}) {
	if (!tipFeedEl || !rowLike) return;
	const ticketId = rowLike.ticket_id ?? rowLike.ticketId ?? null;
	if (ticketId && !rememberTicketId(ticketId)) return;

	const dancerId = rowLike.dancer ?? '?';
	const dancerIdx = parseInt(dancerId, 10) - 1;
	const dancerName = DANCER_META[dancerIdx]?.name || `Dancer ${dancerId}`;
	const label = rowLike.label ?? rowLike.dance ?? 'dance';
	const payer = rowLike.payer ?? null;
	const amountAtomics = rowLike.amount_atomics ?? rowLike.amountAtomics ?? null;
	const network = rowLike.network ?? '';
	const timestamp = rowLike.created_at ?? rowLike.startsAt ?? new Date().toISOString();

	tipFeedEl.querySelector('.club-feed-empty')?.remove();
	tipFeedEl.querySelector('.tws-es')?.remove();
	const row = document.createElement('div');
	row.className = 'club-tip-row';
	if (live) row.classList.add('is-live');
	const who = payer ? `${payer.slice(0, 4)}...${payer.slice(-4)}` : 'someone';
	const safeLabel = String(label).replace(/[<>&]/g, '');
	const time = formatTimestamp(timestamp);
	row.innerHTML = `
		<span class="club-tip-time">${time}</span>
		<span class="club-tip-mid"><span class="club-tip-who">${who}</span> tipped ${dancerName} &rarr; ${safeLabel}</span>
		<span class="club-tip-amt">${fmtUsd(amountAtomics)}</span>
	`;
	if (prepend) {
		tipFeedEl.prepend(row);
	} else {
		tipFeedEl.appendChild(row);
	}

	// Max 20 visible entries; oldest fade out.
	while (tipFeedEl.children.length > 20) {
		const oldest = tipFeedEl.lastElementChild;
		if (oldest) {
			oldest.classList.add('is-fading');
			oldest.addEventListener('animationend', () => oldest.remove(), { once: true });
		}
	}

	// If this tip is for the currently-viewed pole, flash its spotlight + card.
	if (live) {
		flashPoleCard(dancerId);
		// Play tip sound via audio system.
		try {
			if (audio.ctx && !audio.muted) {
				playTipSound(audio.ctx, audio.master);
			}
		} catch {}
	}
}

function setFeedStatus(text, kind) {
	if (!feedStatusEl) return;
	if (!text) {
		feedStatusEl.hidden = true;
		feedStatusEl.textContent = '';
		delete feedStatusEl.dataset.kind;
		return;
	}
	feedStatusEl.textContent = text;
	feedStatusEl.dataset.kind = kind || 'info';
	feedStatusEl.hidden = false;
}

// Load the most-recent tips for a fresh page load. Tries twice (one retry
// after 4 s) so a transient network blip doesn't leave the feed empty.
async function loadInitialTips({ attempt = 0 } = {}) {
	try {
		const r = await fetch(TIPS_HISTORY_URL, { cache: 'no-store' });
		if (!r.ok) throw new Error(`HTTP ${r.status}`);
		const data = await r.json();
		const tips = Array.isArray(data?.tips) ? data.tips : [];
		// Server returns newest-first; reverse so the newest ends up at the
		// top after sequential prepend.
		for (const t of tips.slice().reverse()) {
			renderTipRow(t, { live: false });
		}
		setFeedStatus(null);
	} catch (err) {
		log.warn('[club] tip history failed', err);
		if (attempt === 0) {
			setFeedStatus("Couldn't load tip history — retrying", 'error');
			setTimeout(() => loadInitialTips({ attempt: 1 }), 4000);
		} else {
			setFeedStatus("Couldn't load tip history", 'error');
		}
	}
}

// Subscribe to the SSE channel. Reconnects with linear backoff after an
// error; after 3 consecutive failures shows a "live updates paused" badge.
// The badge clears as soon as the next connection succeeds.
function subscribeTipStream() {
	if (typeof window.EventSource !== 'function') {
		setFeedStatus('Live updates paused', 'paused');
		return null;
	}
	let es = null;
	let consecutiveFailures = 0;
	let reconnectTimer = 0;
	let closedByUser = false;

	const open = () => {
		if (closedByUser) return;
		try {
			es = new EventSource(TIPS_STREAM_URL);
		} catch (err) {
			log.warn('[club] EventSource init failed', err);
			scheduleReconnect();
			return;
		}
		es.addEventListener('hello', () => {
			consecutiveFailures = 0;
			setFeedStatus(null);
		});
		es.addEventListener('tip', (e) => {
			try {
				const row = JSON.parse(e.data);
				renderTipRow(row, { live: true });
			} catch (err) {
				log.warn('[club] tip event parse failed', err);
			}
		});
		es.onerror = () => {
			// EventSource auto-reconnects in some browsers but keeps the
			// closed socket in CONNECTING state and re-fires onerror in a
			// spin. Explicitly close + schedule so the failure counter
			// advances predictably and the badge timing is honest.
			try { es?.close(); } catch {}
			es = null;
			consecutiveFailures += 1;
			if (consecutiveFailures >= 3) {
				setFeedStatus('Live updates paused', 'paused');
			}
			scheduleReconnect();
		};
	};

	const scheduleReconnect = () => {
		if (closedByUser) return;
		clearTimeout(reconnectTimer);
		// 1.5 s, 3 s, 6 s, capped — fast enough to recover from a momentary
		// blip without hammering the endpoint during a longer outage.
		const delay = Math.min(1500 * Math.max(1, consecutiveFailures), 6000);
		reconnectTimer = setTimeout(open, delay);
	};

	open();
	window.addEventListener('beforeunload', () => {
		closedByUser = true;
		clearTimeout(reconnectTimer);
		try { es?.close(); } catch {}
	});
	return {
		close() {
			closedByUser = true;
			clearTimeout(reconnectTimer);
			try { es?.close(); } catch {}
		},
	};
}

// ── Perf profile (boot-time pick from real capability signals) ───────────
// One profile picked once, then applied to the renderer, lights, and any
// future scene additions (mirror ball, volumetric cones, crowd, postFX).
// Mid-session, the animate-loop watchdog can swap us down one tier if a
// phone starts throttling; profile is exposed on window so prompts 01–04
// can read it without an explicit import cycle.
let activeProfile = PROFILES[detectProfile()];
if (typeof window !== 'undefined') window.__clubProfile = activeProfile;

// ── Renderer / scene ──────────────────────────────────────────────────────
const renderer = new WebGLRenderer({ canvas, antialias: false, alpha: false });
renderer.setPixelRatio(activeProfile.pixelRatio);
renderer.setSize(window.innerWidth, window.innerHeight, false);
renderer.outputColorSpace = SRGBColorSpace;
renderer.toneMapping = NoToneMapping;
renderer.shadowMap.enabled = activeProfile.shadows;

const scene = new Scene();
scene.background = new Color(0x07050b);
scene.fog = new Fog(0x07050b, 9, 28);
// scene.environment is set inside bootstrap() once the equirectangular HDRI
// (public/club/venue/club-hdri.hdr) has been pre-filtered through
// PMREMGenerator.fromEquirectangular. We intentionally do NOT seed the env
// with a RoomEnvironment lightprobe — PBR materials read straight from the
// loaded HDRI so reflections match the authored interior, not a generic
// neutral sphere.

// Soft room light so the avatars aren't pitch black — but kept low so the
// spotlights do the talking.
scene.add(new AmbientLight(0x150b1a, 0.55));
const hemi = new HemisphereLight(0xff6abf, 0x110820, 0.35);
hemi.position.set(0, 6, 0);
scene.add(hemi);

const camera = new PerspectiveCamera(46, window.innerWidth / window.innerHeight, 0.05, 80);
camera.position.set(0, 1.8, 6.0);
camera.lookAt(0, 1.4, -1.5);

// ── Postprocessing pipeline ─────────────────────────────────────────────
// pmndrs EffectComposer replaces direct renderer.render(). Bloom makes the
// neon elements glow, tone mapping gives cinematic colour, vignette darkens
// the edges, and SMAA handles anti-aliasing at the compositing stage (so
// we disable the renderer's built-in MSAA above).
const bloomEffect = new BloomEffect({
	intensity: 1.2,
	luminanceThreshold: 0.3,
	luminanceSmoothing: 0.08,
	mipmapBlur: true,
});
const toneMappingEffect = new ToneMappingEffect({ mode: ToneMappingMode.ACES_FILMIC });
const vignetteEffect = new VignetteEffect({ darkness: 0.45, offset: 0.35 });
const smaaEffect = new SMAAEffect();

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
composer.addPass(new EffectPass(camera, bloomEffect, toneMappingEffect, vignetteEffect));
composer.addPass(new EffectPass(camera, smaaEffect));

const clubCam = new ClubCamera(camera, {
	onModeChange: (mode) => {
		updateFreeCamChip(mode);
		document.querySelector('#club-stage')?.setAttribute('data-cam-mode', mode);
	},
});
document.querySelector('#club-stage')?.setAttribute('data-cam-mode', clubCam.getMode());

// ── Authored venue ───────────────────────────────────────────────────────
// The floor, walls, ceiling, bar, neon strips, and crowd silhouettes all
// live inside public/club/venue/club-venue.glb. They're added to the scene
// in bootstrap() once GLTFLoader resolves; the named empties inside that
// GLB (stage.NN, backstage.door.NN, truss.spot.NN, truss.mirrorball,
// bar.backsplash.neon) are what drive pole + spotlight placement below.

// ── Poles + spotlights ───────────────────────────────────────────────────
const POLE_COLORS = [0xff3bd6, 0x4ad6ff, 0xff8a3b, 0x9b5dff];

// Dancer registry — display names, bios, accent palette, and the gallery
// avatar each dancer wears. `avatarId` is resolved through /api/avatars/:id at
// boot (see resolveDancerAvatarUrl); a local `avatar` path can be used instead.
// All three rigs are verified drivable by the clip library (CharacterStudio +
// Unreal-mannequin rigs are now retargetable — see src/glb-canonicalize.js),
// and attachAvatar falls back to the default rig if any ever isn't. Each dancer
// is still tinted with her pole's accent color so the three read as a set.
const DANCER_META = [
	{ name: 'Aria', bio: 'Neon pink fire. Classical meets street.', palette: 'pink', avatarId: 'cdc245f4-36f8-4e78-a1b6-58c3b73e247f' },
	{ name: 'Nova', bio: 'Cyan ice. Fluid and hypnotic.', palette: 'cyan', avatarId: '25195a2e-130c-4da5-8cad-8e7490d69b45' },
	{ name: 'Blaze', bio: 'Amber heat. Power and precision.', palette: 'amber', avatarId: 'd92b292e-c2db-40cb-bf88-3e141c6b0057' },
];

// Every dancer is scaled to this standing height (metres) so a mix of
// differently-authored gallery avatars reads as one lineup.
const DANCER_HEIGHT_M = 1.75;

/**
 * Scale a freshly-cloned avatar root to `targetHeight` and ground its feet at
 * local y=0, measuring with the skinning-aware (`precise`) bounding box so a
 * rig with a scaled skeleton root or far-flung bind pose still sizes correctly.
 * Called before the root is parented, so its world space equals its local space
 * and the measured box is directly usable to offset `position.y`.
 *
 * @param {import('three').Object3D} root
 * @param {number} targetHeight
 */
function fitRigToHeight(root, targetHeight) {
	root.updateMatrixWorld(true);
	root.traverse((n) => { if (n.isSkinnedMesh) n.skeleton?.update?.(); });

	let box = new Box3().setFromObject(root, true);
	const height = box.max.y - box.min.y;
	if (Number.isFinite(height) && height > 0.05) {
		const scale = Math.min(8, Math.max(0.05, targetHeight / height));
		root.scale.multiplyScalar(scale);
		root.updateMatrixWorld(true);
		box = new Box3().setFromObject(root, true);
	}
	if (Number.isFinite(box.min.y)) root.position.y -= box.min.y;
}

class PoleStation {
	constructor(idx, layout) {
		this.idx = idx;
		this.layout = layout;
		this.id = layout.id;
		this.stageTopY = STAGE_TOP_Y;

		// Stage + pole GLBs are attached later in attachProps(); construct only
		// the lights, the rig holder, and lifecycle state here so the station
		// exists before async assets finish loading.

		// Spotlight — colored, focused on the pole base.
		const spot = new SpotLight(POLE_COLORS[idx % POLE_COLORS.length], 0, 12, Math.PI / 7, 0.4, 1.6);
		spot.position.set(layout.x, 6.0, layout.z + 0.5);
		spot.target.position.set(layout.x, 0.0, layout.z);
		spot.castShadow = activeProfile.shadows;
		if (activeProfile.shadowMapSize > 0) {
			spot.shadow.mapSize.set(activeProfile.shadowMapSize, activeProfile.shadowMapSize);
		}
		spot.shadow.bias = -0.0008;
		scene.add(spot);
		scene.add(spot.target);
		this.spot = spot;
		// Dancers now stand at their pole even when idle, so the idle spotlight
		// is bright enough to present them ("hot and ready") rather than the
		// dim wash that made sense when the pole was empty between tips.
		this.spotIdleIntensity = 1.6;
		this.spotActiveIntensity = 12.0;
		spot.intensity = this.spotIdleIntensity;

		// Volumetric beam — a translucent cone of light from the spot down to the
		// stage, additively blended so it reads as haze in the air rather than a
		// solid object. A per-vertex gradient (bright at the source → black at the
		// floor) gives the soft falloff without a custom shader; opacity tracks the
		// spotlight and pulses with the beat (see the render loop). The single
		// biggest "it feels real" upgrade for the room.
		const beamH = 6.0;
		const beamGeo = new ConeGeometry(1.15, beamH, 28, 1, true);
		const beamColor = new Color(POLE_COLORS[idx % POLE_COLORS.length]);
		const bpos = beamGeo.attributes.position;
		const bcol = new Float32Array(bpos.count * 3);
		for (let i = 0; i < bpos.count; i += 1) {
			const t = (bpos.getY(i) + beamH / 2) / beamH; // 1 at the apex, 0 at the floor
			const f = t * t; // bias the glow toward the source
			bcol[i * 3] = beamColor.r * f;
			bcol[i * 3 + 1] = beamColor.g * f;
			bcol[i * 3 + 2] = beamColor.b * f;
		}
		beamGeo.setAttribute('color', new BufferAttribute(bcol, 3));
		const beamMat = new MeshBasicMaterial({
			vertexColors: true,
			transparent: true,
			opacity: 0,
			blending: AdditiveBlending,
			depthWrite: false,
			side: DoubleSide,
			fog: false,
			toneMapped: false,
		});
		const beam = new Mesh(beamGeo, beamMat);
		beam.position.set(layout.x, beamH / 2, layout.z); // apex at the spot height, base on the floor
		beam.renderOrder = 2;
		scene.add(beam);
		this.beam = beam;
		this.beamMat = beamMat;
		this.beamBaseOpacity = 0.05;

		// Floor accent point light — sits at the base of the pole.
		const accent = new PointLight(POLE_COLORS[idx % POLE_COLORS.length], 0.9, 4.5, 1.6);
		accent.position.set(layout.x, 0.6, layout.z);
		scene.add(accent);
		this.accent = accent;

		// Dancer rig — stands at the pole, facing the crowd. We populate the
		// skinned mesh later in attachAvatar(); position + yaw are set here so
		// the rig is home the instant the avatar attaches.
		this.rig = new Group();
		this.rig.position.copy(this.homePos);
		this.rig.rotation.y = layout.yaw;
		scene.add(this.rig);

		this.anim = null;
		this.skinned = null;
		this.stage = null;          // root group from stage.glb
		this.pole = null;           // root group from pole.glb

		// Current performance lifecycle.
		this.activeTicket = null;     // backend ticket id
		this.activeUntil = 0;         // ms epoch — informational; sequence loop drives end
		this.performing = false;
		this.walkPhase = 'idle';      // 'idle' | 'to-pole' | 'dancing' | 'returning'
		this._phaseTarget = this.rig.position.clone();

		// Render-loop coupled sleepers (sleep() resolves them in tick()).
		// Wall-clock setTimeout would drift if the tab is throttled or paused;
		// driving sleep off the render clock keeps choreography frame-aligned.
		this._clockSec = 0;
		this._sleepers = [];
	}

	/**
	 * Snap this station's stage / backstage / spotlight positions onto the
	 * world-space anchors harvested from the venue GLB. Called from
	 * bootstrap() AFTER the venue loads but BEFORE attachProps so the cloned
	 * stage disc / pole geo land on the authored stage.NN empties rather
	 * than the analytical fallback baked into the POLES array.
	 *
	 * Mutates `this.layout` in place — downstream code (attachProps,
	 * startPerformance, tick) reads layout each frame, so a single override
	 * pass at boot is enough.
	 *
	 * @param {object} anchors
	 * @param {import('three').Vector3} [anchors.stagePos]
	 * @param {import('three').Vector3} [anchors.backstagePos]
	 * @param {import('three').Vector3} [anchors.spotPos]
	 */
	applyVenueOverrides({ stagePos, backstagePos, spotPos } = {}) {
		if (stagePos) {
			this.layout.x = stagePos.x;
			this.layout.z = stagePos.z;
			this.accent.position.set(stagePos.x, 0.6, stagePos.z);
			// Idle home tracks the pole — restand the rig there (unless she's
			// mid-performance, in which case tick() owns the position).
			if (this.walkPhase === 'idle') {
				this.rig.position.copy(this.homePos);
				this._phaseTarget = this.homePos;
			}
		}
		if (backstagePos) {
			// Backstage anchor is retained for choreography that wants a deeper
			// off-stage point, but dancers idle at the pole now, not backstage.
			this.layout.backstageX = backstagePos.x;
			this.layout.backstageZ = backstagePos.z;
		}
		if (spotPos) {
			this.spot.position.set(spotPos.x, spotPos.y, spotPos.z);
		}
		// Spotlight always re-aims at the (possibly new) stage center.
		this.spot.target.position.set(this.layout.x, 0.0, this.layout.z);
	}

	/**
	 * Clone the pole + stage GLB templates into this station. Called from
	 * bootstrap() once both .glb files have finished loading. Each station gets
	 * its own clone so material tints (per-pole accent emissive) don't leak.
	 */
	attachProps({ poleTemplate, stageTemplate }) {
		const accent = new Color(POLE_COLORS[this.idx % POLE_COLORS.length]);

		const stage = stageTemplate.clone(true);
		stage.position.set(this.layout.x, 0, this.layout.z);
		stage.traverse((n) => {
			if (!n.isMesh) return;
			n.receiveShadow = true;
			if (n.material) {
				n.material = n.material.clone();
				if (n.material.emissive) {
					if (n.name === 'stage.led.ring') {
						n.material.emissive = accent.clone();
						n.material.emissiveIntensity = 1.2;
					} else {
						n.material.emissive.lerp(accent, 0.4);
					}
				}
			}
		});
		scene.add(stage);
		this.stage = stage;

		const pole = poleTemplate.clone(true);
		pole.position.set(this.layout.x, this.stageTopY, this.layout.z);
		pole.traverse((n) => {
			if (!n.isMesh) return;
			n.castShadow = true;
			n.receiveShadow = false;
			if (n.material && n.material.metalness >= 0.9) {
				// Subtle per-pole tint on the chrome only (skip dark brackets / bolts).
				n.material = n.material.clone();
				if (!n.material.emissive) n.material.emissive = new Color(0x000000);
				n.material.emissive = accent.clone().multiplyScalar(0.04);
			}
		});
		scene.add(pole);
		this.pole = pole;
	}

	/**
	 * Clone a template GLB into a tinted, floor-aligned avatar root ready to
	 * drop into the rig. Pure — no scene-graph mutation — so attachAvatar can
	 * build a candidate, test whether its rig animates, and discard it for the
	 * fallback without leaving a half-attached mesh behind.
	 * @param {import('three').Object3D} template
	 */
	_buildAvatarRoot(template) {
		const root = cloneSkinnedScene(template);
		root.traverse((n) => {
			if (!n.isMesh) return;
			n.castShadow = true;
			n.receiveShadow = false;
			if (n.material && 'envMapIntensity' in n.material) {
				n.material = n.material.clone();
				n.material.envMapIntensity = 0.6;
				// Tint each dancer subtly with the pole's accent color so the
				// dancers are visually distinct even before the spotlight kicks in.
				if (n.material.emissive) {
					n.material.emissive = new Color(POLE_COLORS[this.idx % POLE_COLORS.length]);
					n.material.emissiveIntensity = 0.05;
				}
			}
		});
		// Normalize size + ground the feet. Gallery avatars come from many
		// pipelines (CharacterStudio, Unreal, RPM, uploads) at wildly different
		// scales and skeleton offsets — one ships 3m tall and floating, another
		// sub-metre. A plain rest-pose AABB (setFromObject without `precise`)
		// reads the bind-pose geometry, which for a skinned rig can bear no
		// relation to the posed silhouette. Measuring with `precise: true` runs
		// each vertex through SkinnedMesh.getVertexPosition (applies bone skinning),
		// so we get the real standing bounds — then scale every dancer to one
		// height and drop her feet onto y=0 so the lineup reads as a set.
		fitRigToHeight(root, DANCER_HEIGHT_M);
		return root;
	}

	/**
	 * Attach this dancer's avatar. `template` is her chosen GLB; `fallback` is
	 * the known-good default rig. Every shipped avatar is verified drivable, but
	 * we still confirm the clip library can retarget onto the chosen rig at
	 * runtime — if not, we silently swap to the fallback so a dancer is never
	 * frozen mid-stage (Hard rule 9: no errors without solutions).
	 * @param {import('three').Object3D} template
	 * @param {Array} animationDefs
	 * @param {import('three').Object3D} [fallback]
	 */
	attachAvatar(template, animationDefs, fallback = null) {
		this.anim = new AnimationManager();

		let root = this._buildAvatarRoot(template);
		this.rig.add(root);
		this.anim.attach(root);

		if (!this.anim.supportsCanonicalClips() && fallback && fallback !== template) {
			log.warn(`[club] dancer ${this.id} rig not drivable — falling back to default avatar`);
			this.anim.detach();
			this.rig.remove(root);
			root = this._buildAvatarRoot(fallback);
			this.rig.add(root);
			this.anim.attach(root);
		}

		this.skinned = root;
		this.anim.setAnimationDefs(animationDefs);
		// Lazy-load — first clip request fetches its JSON on demand.
		this.anim.play('idle');
	}

	get backstagePos() {
		return new Vector3(this.layout.backstageX, 0, this.layout.backstageZ);
	}
	// Idle home: standing just in front of the pole, facing the crowd. She steps
	// onto the pole (poleBasePos) when a tip lands, then returns here.
	get homePos() {
		return new Vector3(this.layout.x, 0, this.layout.z + 0.5);
	}
	get poleBasePos() {
		return new Vector3(this.layout.x, 0, this.layout.z + 0.02);
	}

	async startPerformance(ticket) {
		this.activeTicket = ticket;
		this.performing = true;
		this.activeUntil = Date.now() + (ticket.durationSec || 12) * 1000;
		this.walkPhase = 'to-pole';
		this._phaseTarget = this.poleBasePos;

		// Spotlight ramps up while the dancer walks on stage.
		this._spotTarget = this.spotActiveIntensity;
		this._accentTarget = 2.4;

		// Auto-cam: if the user opted in and no manual VIP/house shot is active,
		// switch to an orbiting auto-cam for the duration. We remember that the
		// auto-cam started this transition so we can release it on end.
		if (autoFollow && clubCam.getMode() === 'free') {
			this._autoCammed = true;
			clubCam.setAuto(this.layout);
		} else {
			this._autoCammed = false;
		}

		// Update pole card status.
		updatePoleCardStatus(this.id, 'performing');

		// Crossfade idle → walking → dance once the dancer reaches the pole.
		await this.anim?.crossfadeTo(WALK_CLIP, PERFORMANCE_FADE);
	}

	/**
	 * Render-loop coupled sleep. Resolves when `_clockSec` has advanced past
	 * the requested duration. Used by playSequence between crossfades so
	 * choreography stays aligned with the mixer's frame clock even when the
	 * tab is throttled (where setTimeout would still fire on its own schedule
	 * and desync from the visible animation).
	 *
	 * @param {number} ms
	 * @returns {Promise<void>}
	 */
	sleep(ms) {
		if (!Number.isFinite(ms) || ms <= 0) return Promise.resolve();
		return new Promise((resolve) => {
			this._sleepers.push({ wakeAt: this._clockSec + ms / 1000, resolve });
		});
	}

	async _arriveAtPole() {
		this.walkPhase = 'dancing';
		const requested = ticketSteps(this.activeTicket).length
			? ticketSteps(this.activeTicket)
			: [{ clip: this.activeTicket?.clip || FALLBACK_CLIP, durationSec: this.activeTicket?.durationSec || 12 }];

		// A tip is real on-chain money — never let a missing or un-retargetable
		// clip leave her standing frozen at the pole. Drop steps this rig can't
		// drive; if that empties the routine, perform the always-present fallback
		// clip for the routine's full duration so the payer always sees a dance.
		let steps = this.anim ? requested.filter((s) => this.anim.canPlay(s.clip)) : requested;
		if (!steps.length) {
			const total = requested.reduce((acc, s) => acc + (Number(s.durationSec) || 0), 0)
				|| this.activeTicket?.durationSec || 12;
			steps = [{ clip: FALLBACK_CLIP, durationSec: total }];
		}

		try {
			await playSequence({
				anim: this.anim,
				steps,
				fadeSec: PERFORMANCE_FADE,
				isCancelled: () => !this.performing,
				sleep: (ms) => this.sleep(ms),
			});
		} catch (err) {
			// A playback fault must still release the stage — fall through to the
			// walk-off below rather than stranding her mid-routine.
			log.warn(`[club] dancer ${this.id} performance playback failed`, err);
		}

		// Sequence finished (or was cancelled) — step the dancer back off the
		// pole to her idle home. Cancellation is a fast-path: performing is
		// already false, so _endPerformance won't toggle it back, but the
		// walking + audio cleanup still runs.
		if (this.walkPhase === 'dancing') await this._endPerformance();
	}

	async _endPerformance() {
		this.performing = false;
		this.walkPhase = 'returning';
		this._phaseTarget = this.homePos;
		this._spotTarget = this.spotIdleIntensity;
		this._accentTarget = 0.4;
		// Release auto-cam back to free if we were the ones who took it.
		if (this._autoCammed && (clubCam.getMode() === 'auto' || clubCam.getMode() === 'vip')) {
			clubCam.setFree();
		}
		this._autoCammed = false;

		// Update pole card status back to idle.
		updatePoleCardStatus(this.id, 'idle');
		// Signal the audio mixer (and anyone else listening) to fade the
		// style loop back to ambience. Dispatched on window so the page-
		// level audio binding can stay decoupled from this class.
		try {
			window.dispatchEvent(new CustomEvent('club:performance-end', {
				detail: { dancer: this.id, ticket: this.activeTicket },
			}));
		} catch {}
		await this.anim?.crossfadeTo(WALK_CLIP, PERFORMANCE_FADE);
	}

	async _arriveHome() {
		this.walkPhase = 'idle';
		this.activeTicket = null;
		this._phaseTarget = this.homePos;
		await this.anim?.crossfadeTo('idle', PERFORMANCE_FADE);
	}

	tick(dt) {
		// Advance the station clock and wake any sleepers due this frame.
		// Driving sleep off the render clock (not setTimeout) keeps choreography
		// aligned with the mixer when the tab is backgrounded or paused.
		this._clockSec += dt;
		if (this._sleepers.length) {
			let i = 0;
			while (i < this._sleepers.length) {
				if (this._sleepers[i].wakeAt <= this._clockSec) {
					const { resolve } = this._sleepers.splice(i, 1)[0];
					resolve();
				} else {
					i += 1;
				}
			}
		}

		// Lerp spotlight intensity.
		if (this._spotTarget != null) {
			this.spot.intensity += (this._spotTarget - this.spot.intensity) * Math.min(1, dt * 4);
		}
		if (this._accentTarget != null) {
			this.accent.intensity += (this._accentTarget - this.accent.intensity) * Math.min(1, dt * 4);
		}

		// Volumetric beam brightness rides the spotlight: a faint haze when idle,
		// a thick shaft of light when she's under the hot spot. The beat pulse is
		// layered on in the render loop.
		if (this.beamMat) {
			const span = Math.max(0.001, this.spotActiveIntensity - this.spotIdleIntensity);
			const norm = Math.max(0, Math.min(1, (this.spot.intensity - this.spotIdleIntensity) / span));
			this.beamBaseOpacity = 0.045 + norm * 0.17;
		}

		// Drive avatar walk between waypoints.
		if (this.walkPhase === 'to-pole' || this.walkPhase === 'returning') {
			const target = this._phaseTarget;
			const dir = new Vector3().subVectors(target, this.rig.position);
			dir.y = 0;
			const dist = dir.length();
			if (dist < 0.04) {
				this.rig.position.copy(target);
				if (this.walkPhase === 'to-pole') this._arriveAtPole().catch((err) => log.warn(`[club] dancer ${this.id} arrive-at-pole failed`, err));
				else this._arriveHome().catch((err) => log.warn(`[club] dancer ${this.id} arrive-home failed`, err));
			} else {
				dir.normalize();
				const step = Math.min(dist, 1.4 * dt);
				this.rig.position.addScaledVector(dir, step);
				// Face direction of travel.
				const targetYaw = Math.atan2(dir.x, dir.z);
				this.rig.rotation.y += angleDelta(this.rig.rotation.y, targetYaw) * Math.min(1, dt * 6);
			}
		} else if (this.walkPhase === 'dancing') {
			// Keep dancer facing the camera (yaw lerp to original pole yaw).
			// End-of-dance is driven by the playSequence loop in _arriveAtPole,
			// not a wall-clock deadline — that way each sequence step lasts
			// exactly its declared duration in render-loop time.
			const targetYaw = this.layout.yaw;
			this.rig.rotation.y += angleDelta(this.rig.rotation.y, targetYaw) * Math.min(1, dt * 3);
		} else {
			// idle at the pole — face the crowd.
			const targetYaw = this.layout.yaw;
			this.rig.rotation.y += angleDelta(this.rig.rotation.y, targetYaw) * Math.min(1, dt * 1.5);
		}

		this.anim?.update(dt);
	}
}

function angleDelta(from, to) {
	let d = (to - from) % (Math.PI * 2);
	if (d > Math.PI) d -= Math.PI * 2;
	if (d < -Math.PI) d += Math.PI * 2;
	return d;
}

const stations = POLES.map((layout, i) => new PoleStation(i, layout));
if (typeof window !== 'undefined') window.__clubStations = stations;

// ── Disco / strobe light cycling ─────────────────────────────────────────
// A slowly rotating set of fill lights to keep the room feeling alive even
// when no dancers are out. Kept low-intensity so spotlights still dominate.
const disco = new Group();
scene.add(disco);
const discoColors = [0xff2bd6, 0x4ad6ff, 0xff8a3b, 0x6c4dff];
const discoCount = Math.max(1, Math.min(activeProfile.discoLights, discoColors.length));
for (let i = 0; i < discoCount; i++) {
	const p = new PointLight(discoColors[i % discoColors.length], 0.6, 12, 1.4);
	const angle = (i / discoCount) * Math.PI * 2;
	p.position.set(Math.sin(angle) * 5.5, 4.6, Math.cos(angle) * 5.5 - 1);
	disco.add(p);
}

// ── Tip sound effect (synthesized — no external file) ────────────────────
// A short ascending chime when a new tip arrives. Uses oscillator nodes
// to keep the bundle size zero.
function playTipSound(ctx, destination) {
	if (!ctx || !destination) return;
	const now = ctx.currentTime;
	const gain = ctx.createGain();
	gain.gain.setValueAtTime(0.15, now);
	gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
	gain.connect(destination);

	const osc1 = ctx.createOscillator();
	osc1.type = 'sine';
	osc1.frequency.setValueAtTime(880, now);
	osc1.frequency.exponentialRampToValueAtTime(1760, now + 0.12);
	osc1.connect(gain);
	osc1.start(now);
	osc1.stop(now + 0.35);

	const osc2 = ctx.createOscillator();
	osc2.type = 'sine';
	osc2.frequency.setValueAtTime(1320, now + 0.06);
	osc2.frequency.exponentialRampToValueAtTime(2200, now + 0.18);
	const gain2 = ctx.createGain();
	gain2.gain.setValueAtTime(0.08, now + 0.06);
	gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
	osc2.connect(gain2).connect(destination);
	osc2.start(now + 0.06);
	osc2.stop(now + 0.4);
}

// ── Ambient dust particles ──────────────────────────────────────────────
// Subtle floating particles that drift slowly upward, adding atmosphere
// to the venue. Uses Points geometry with a small count (~50).
function createAmbientParticles(count = 50) {
	const positions = new Float32Array(count * 3);
	const velocities = [];
	for (let i = 0; i < count; i++) {
		positions[i * 3] = (Math.random() - 0.5) * 14;
		positions[i * 3 + 1] = Math.random() * 6;
		positions[i * 3 + 2] = (Math.random() - 0.5) * 14 - 2;
		velocities.push({
			x: (Math.random() - 0.5) * 0.08,
			y: 0.02 + Math.random() * 0.04,
			z: (Math.random() - 0.5) * 0.06,
		});
	}
	const geo = new BufferGeometry();
	geo.setAttribute('position', new BufferAttribute(positions, 3));
	const mat = new PointsMaterial({
		color: 0xffeedd,
		size: 0.03,
		transparent: true,
		opacity: 0.35,
		blending: AdditiveBlending,
		depthWrite: false,
	});
	const points = new Points(geo, mat);
	points.frustumCulled = false;

	return {
		mesh: points,
		tick(dt) {
			const posArr = geo.attributes.position.array;
			for (let i = 0; i < count; i++) {
				posArr[i * 3] += velocities[i].x * dt;
				posArr[i * 3 + 1] += velocities[i].y * dt;
				posArr[i * 3 + 2] += velocities[i].z * dt;
				// Reset particle to bottom when it drifts above ceiling.
				if (posArr[i * 3 + 1] > 6.5) {
					posArr[i * 3] = (Math.random() - 0.5) * 14;
					posArr[i * 3 + 1] = -0.5;
					posArr[i * 3 + 2] = (Math.random() - 0.5) * 14 - 2;
				}
			}
			geo.attributes.position.needsUpdate = true;
		},
	};
}

// ── Avatar template + manifest load ──────────────────────────────────────
let animationDefs = null;

/**
 * Resolve a dancer's avatar GLB URL. A gallery `avatarId` is looked up through
 * the same /api/avatars/:id endpoint the rest of the app uses (Vite dev proxies
 * it to production), reading the canonical `.url`; a local `avatar` path is
 * used verbatim. Any failure falls back to the bundled default rig so a dancer
 * always has a model to load.
 *
 * @param {{ avatar?: string, avatarId?: string }} meta
 * @returns {Promise<string>}
 */
async function resolveDancerAvatarUrl(meta) {
	if (meta.avatar) return meta.avatar;
	if (!meta.avatarId) return AVATAR_URL;
	try {
		const res = await fetch(`/api/avatars/${encodeURIComponent(meta.avatarId)}`);
		if (!res.ok) return AVATAR_URL;
		const data = await res.json();
		return data?.avatar?.url || AVATAR_URL;
	} catch {
		return AVATAR_URL;
	}
}

/**
 * Wrap a three.js loader's callback-form `.load()` in a promise that
 * forwards every progress event into `setStatus`. `loadAsync` would be
 * shorter but it swallows the progress callback, leaving the user staring
 * at "Loading club…" for the full duration of a multi-megabyte venue.
 *
 * @template T
 * @param {{ load: (url: string, onLoad: (asset: T) => void, onProgress: (e: ProgressEvent) => void, onError: (err: unknown) => void) => void }} loader
 * @param {string} url
 * @param {string} label
 * @returns {Promise<T>}
 */
function loadWithProgress(loader, url, label) {
	return new Promise((resolve, reject) => {
		loader.load(
			url,
			resolve,
			(e) => {
				if (e && e.total > 0) {
					const pct = Math.round((e.loaded / e.total) * 100);
					setStatus(`${label} ${pct}%`);
				}
			},
			(err) => {
				const message = err?.message || err?.statusText || String(err);
				reject(new Error(`Failed to load ${url}: ${message}`));
			},
		);
	});
}

async function bootstrap() {
	setStatus('Loading club…');

	const loader = gltfLoader(renderer);
	const rgbe = new HDRLoader();

	// Load everything in parallel — the venue + HDRI are the heaviest
	// payloads but the avatar + animation manifest + pole/stage props can
	// fetch in the same window. Any rejection bubbles up to the .catch in
	// the call site below, which paints an error status and stops; no
	// primitive fallback ever gets attached.
	// Resolve each dancer's gallery avatar → GLB URL first (fast JSON lookups),
	// then load the models alongside the venue. AVATAR_URL is always loaded too
	// as the runtime fallback rig. De-dupe so a shared model loads once.
	const dancerUrls = await Promise.all(DANCER_META.map(resolveDancerAvatarUrl));
	const avatarUrls = [...new Set([AVATAR_URL, ...dancerUrls])];
	const [venueGltf, hdrTexture, manifest, poleGltf, stageGltf, ...avatarGltfs] = await Promise.all([
		loadWithProgress(loader, VENUE_GLB_URL, 'Loading club…'),
		loadWithProgress(rgbe, VENUE_HDRI_URL, 'Loading lighting…'),
		fetch(MANIFEST_URL, { cache: 'force-cache' }).then((r) => {
			if (!r.ok) throw new Error(`HTTP ${r.status} loading animation manifest`);
			return r.json();
		}),
		loader.loadAsync(POLE_GLB_URL),
		loader.loadAsync(STAGE_GLB_URL),
		...avatarUrls.map((u) => loader.loadAsync(u)),
	]);

	// HDRI → pre-filtered cubemap for PBR reflections. Background stays
	// the dark fog color so the HDRI only affects materials, not the
	// visible sky.
	hdrTexture.mapping = EquirectangularReflectionMapping;
	const pmrem = new PMREMGenerator(renderer);
	pmrem.compileEquirectangularShader();
	const envRT = pmrem.fromEquirectangular(hdrTexture);
	scene.environment = envRT.texture;
	hdrTexture.dispose();
	pmrem.dispose();

	// Venue geometry — receiveShadow on everything, castShadow only on
	// meshes the artist explicitly opted in via userData (set in Blender's
	// custom-property panel). Keeping the cast set small protects the
	// shadow-budget for the per-pole spotlights.
	venueGltf.scene.traverse((n) => {
		if (n.isMesh) {
			n.receiveShadow = true;
			n.castShadow = n.userData?.castShadow === true;
		}
	});
	scene.add(venueGltf.scene);

	// Resolve every required named empty. Throws if any are missing so the
	// outer catch surfaces a precise error to the user instead of
	// silently placing dancers at the origin.
	const empties = collectVenueEmpties(venueGltf.scene, REQUIRED_VENUE_EMPTIES);
	// The venue's stage / backstage / spot empties are authored for the 4-pole
	// layout. Apply them only when the pole count matches; any other count uses
	// the analytical arc (POLES), which spreads poles evenly for N. The
	// mirrorball + bar-neon anchors are pole-count-independent and resolved
	// regardless (slotCount 0 skips the per-pole arrays but still returns them).
	const VENUE_STAGE_SLOTS = 4;
	const useVenueStages = stations.length === VENUE_STAGE_SLOTS;
	const anchors = resolveVenueAnchors(empties, useVenueStages ? VENUE_STAGE_SLOTS : 0);
	if (useVenueStages) {
		for (let i = 0; i < stations.length; i += 1) {
			stations[i].applyVenueOverrides({
				stagePos: anchors.stages[i],
				backstagePos: anchors.backstages[i],
				spotPos: anchors.spots[i],
			});
		}
	}

	// Expose the mirrorball + bar-neon anchors for prompt 04 (lighting).
	// Both are Object3D nodes — the consumer reads world position / parent
	// frame as needed; we don't pre-resolve to a Vector3 here so prompt 04
	// can also attach children directly to the empty.
	if (typeof window !== 'undefined') {
		window.__clubVenueAnchors = {
			mirrorball: anchors.mirrorball,
			barBacksplashNeon: anchors.barBacksplashNeon,
		};
	}

	// Map each avatar URL → its loaded scene template. Mark meshes cast-shadow
	// up front; per-dancer material cloning/tinting happens in attachAvatar.
	const avatarTemplates = new Map();
	avatarUrls.forEach((url, i) => {
		const tpl = avatarGltfs[i].scene;
		tpl.traverse((n) => { if (n.isMesh) n.castShadow = true; });
		avatarTemplates.set(url, tpl);
	});
	const fallbackTemplate = avatarTemplates.get(AVATAR_URL);

	const poleTemplate = poleGltf.scene;
	const stageTemplate = stageGltf.scene;

	animationDefs = manifest.filter((d) => REQUIRED_CLIPS.has(d.name));

	for (const station of stations) {
		station.attachProps({ poleTemplate, stageTemplate });
		const wanted = dancerUrls[station.idx] || AVATAR_URL;
		const template = avatarTemplates.get(wanted) || fallbackTemplate;
		station.attachAvatar(template, animationDefs, fallbackTemplate);
	}

	// Ambient dust particles — skip on low-perf devices.
	if (activeProfile.tier !== 'low') {
		const particleCount = activeProfile.tier === 'high' ? 50 : 30;
		const particles = createAmbientParticles(particleCount);
		scene.add(particles.mesh);
		// Expose for the render loop to tick.
		if (typeof window !== 'undefined') window.__clubParticles = particles;
	}

	// Backfill history + open the SSE channel so this tab sees other tabs'
	// tips. Both run side-effect-only and don't block the stage being ready.
	loadInitialTips();
	subscribeTipStream();

	// On mobile, default to VIP view of pole 1 for a focused experience.
	if (isMobileLayout()) {
		const firstPole = POLES[0];
		if (firstPole) clubCam.setVip(firstPole);
	}

	setStatus('Tip a pole to make her dance.', { kind: 'ok' });
}

// ── Audio mixer (Web Audio API, lazy-created on first user gesture) ──────
const audio = new ClubAudio();
// Other modules (rim-light pulse from prompt 04) read getPeak() each frame
// via this handle. They handle the no-context case themselves.
if (typeof window !== 'undefined') window.__clubAudio = audio;

// When a performance ends (PoleStation._endPerformance), fade the style
// loop back to ambience. Decoupled via custom event so the station class
// stays focused on motion.
window.addEventListener('club:performance-end', () => {
	audio.fadeOutStyle().catch((err) => log.warn('[club] fadeOutStyle', err));
});

// ── Walk-in anthem ────────────────────────────────────────────────────────
// The moment the bouncer admits the wallet (src/club-gate.js → club:admitted,
// in sync with the walk-through in src/club-entrance.js), play the entrance
// track once. The door's "Pay cover" click is the user gesture that unlocks
// the AudioContext, so prime it there — admit fires a beat later, after the
// autoplay policy would otherwise block the anthem.
{
	const doorPay = document.getElementById('club-door-pay');
	doorPay?.addEventListener('click', () => {
		audio.ensureContext().catch(() => {});
	}, { once: true });

	const armOnGesture = () => {
		const retry = () => audio.playEntrance().catch((err) => log.warn('[club] entrance audio', err));
		window.addEventListener('pointerdown', retry, { once: true });
		window.addEventListener('keydown', retry, { once: true });
	};
	window.addEventListener('club:admitted', () => {
		// On a cached re-entry the door opens with no gesture, so the context is
		// still locked — fall back to playing on the next interaction.
		audio.playEntrance().catch(armOnGesture);
	}, { once: true });
}

// ── Tip flow (x402 drop-in) ──────────────────────────────────────────────
async function tipDancer({ dancer, dance, button }) {
	if (!window.X402?.pay) {
		setStatus('Payment widget still loading — try again in a second.', { kind: 'error' });
		return;
	}

	const station = stations.find((s) => s.id === String(dancer));
	if (!station) {
		setStatus(`No dancer ${dancer} on stage.`, { kind: 'error' });
		return;
	}
	if (station.performing) {
		setStatus(`Dancer ${dancer} is already performing — tip another pole.`, { kind: 'warn' });
		return;
	}

	// A tip is a real on-chain micro-payment. First-timers get the wallet/USDC
	// explainer + guided setup before the payment modal; returning users pass
	// straight through. Lazy-loaded so the club only pays for it on first tip.
	try {
		const { ensureOnchainPrimer } = await import('./shared/onchain-primer.js');
		if (!(await ensureOnchainPrimer({ action: 'tip' }))) return;
	} catch (err) {
		log.warn('[club] onchain primer unavailable', err);
	}

	// First click on a Tip button is the user gesture browsers require to
	// unlock AudioContext. Do this BEFORE opening the wallet modal so the
	// gesture isn't lost by the time we settle. Failures here are
	// non-fatal — the rest of the tip flow still works without audio.
	try {
		await audio.ensureContext();
		audio.startAmbience().catch((err) => log.warn('[club] startAmbience', err));
	} catch (err) {
		log.warn('[club] audio unavailable', err);
	}

	const url = `${TIP_ENDPOINT}?dancer=${encodeURIComponent(dancer)}&dance=${encodeURIComponent(dance)}`;

	button?.classList.add('is-pending');
	const originalLabel = button?.textContent;
	if (button) button.textContent = 'Open wallet…';

	try {
		const out = await window.X402.pay({
			endpoint: url,
			method: 'GET',
			merchant: 'three.ws Pole Club',
			action: `Tip Dancer ${dancer} — ${dance}`,
		});
		const ticket = out?.result;
		if (!ticket?.ok) {
			throw new Error(ticket?.error || 'tip did not settle');
		}
		// A short triple buzz on phones the moment USDC settles — the tip lands
		// in your hand the way it lands on stage.
		try { navigator.vibrate?.([18, 40, 60]); } catch { /* unsupported */ }
		station.startPerformance(ticket).catch((err) => {
			log.warn('[club] startPerformance failed', err);
			setStatus('Performance hit a snag — tip again to retry.', { kind: 'warn' });
		});

		// Crossfade ambience → style loop in sync with the dancer walking
		// out. Prefer the explicit `track` from the ticket; fall back to a
		// dance-key lookup for older tickets/agents that don't send it yet.
		const trackName = ticket.track || styleAudioFor(ticket.dance);
		if (trackName) {
			audio.fadeToStyle(trackName).then(() => {
				const label = TRACK_LABELS[trackName] || trackName;
				setStatus(`Now playing: ${label}`, { kind: 'ok' });
			}).catch((err) => log.warn('[club] fadeToStyle', err));
		}

		// Local echo — renderTipRow's dedupe ring (keyed on ticket_id) drops
		// the SSE copy if it arrives later; if the SSE copy wins the race the
		// local echo here is the one that gets dropped instead.
		renderTipRow({
			ticket_id: ticket.ticketId,
			dancer: ticket.dancer,
			label: ticket.label || ticket.dance,
			payer: ticket.payer,
			amount_atomics: ticket.amountAtomics,
			network: ticket.network,
		}, { live: true });
		setStatus(`Dancer ${ticket.dancer} → ${ticket.label}`, { kind: 'ok' });
		// Fire-and-forget refresh — keep the leaderboard in sync with the tip.
		if (typeof fetchLeaderboard === 'function') fetchLeaderboard();
	} catch (err) {
		if (err?.code !== 'cancelled') {
			setStatus(err?.message || 'tip failed', { kind: 'error' });
		}
	} finally {
		button?.classList.remove('is-pending');
		if (button && originalLabel) button.textContent = originalLabel;
	}
}

// ── Mobile bottom-sheet handle + leaderboard auto-collapse ───────────────
// The right panel becomes a bottom sheet on mobile. The drag handle at the
// top of the sheet toggles `.is-expanded` (CSS transform handles the
// slide). The leaderboard <details> is force-open on desktop and starts
// collapsed on mobile to keep the viewport canvas-first.
{
	const handle = document.getElementById('club-sheet-handle');
	const sheet = document.getElementById('club-right');
	if (handle && sheet) {
		handle.addEventListener('click', () => {
			const expanded = sheet.classList.toggle('is-expanded');
			handle.setAttribute('aria-expanded', expanded ? 'true' : 'false');
		});
	}

	const lbDetails = document.getElementById('club-lb-details');
	if (lbDetails && typeof window.matchMedia === 'function') {
		const mq = window.matchMedia('(max-width: 800px)');
		const apply = () => {
			if (mq.matches) lbDetails.removeAttribute('open');
			else lbDetails.setAttribute('open', '');
		};
		apply();
		if (typeof mq.addEventListener === 'function') mq.addEventListener('change', apply);
		else if (typeof mq.addListener === 'function') mq.addListener(apply);
	}
}

// ── Mute pill in top bar ─────────────────────────────────────────────────
function bindMutePill() {
	const btn = document.getElementById('club-audio-toggle');
	if (!btn) return;
	const render = () => {
		btn.textContent = audio.muted ? '🔇 Audio off' : '🔊 Audio on';
		btn.setAttribute('aria-pressed', audio.muted ? 'true' : 'false');
	};
	render();
	btn.addEventListener('click', async () => {
		try { await audio.ensureContext(); } catch {}
		audio.setMuted(!audio.muted);
		render();
	});
}
bindMutePill();

// ── Free cam chip (shown while in VIP / house) ───────────────────────────
let freeCamChip = null;
function ensureFreeCamChip() {
	if (freeCamChip) return freeCamChip;
	const chip = document.createElement('button');
	chip.type = 'button';
	chip.id = 'club-free-cam';
	chip.textContent = '↩ Free cam';
	chip.hidden = true;
	chip.addEventListener('click', () => clubCam.setFree());
	const stage = document.getElementById('club-stage');
	(stage || document.body).appendChild(chip);
	freeCamChip = chip;
	return chip;
}
function updateFreeCamChip(mode) {
	const chip = ensureFreeCamChip();
	chip.hidden = (mode === 'free');
	if (mode === 'auto') chip.textContent = '↩ Free cam (auto-orbiting)';
	else chip.textContent = '↩ Free cam';
}

// ── Auto-follow tips toggle (persisted) ──────────────────────────────────
const AUTO_FOLLOW_KEY = 'club:autoFollowTips';
let autoFollow = (() => {
	try { return localStorage.getItem(AUTO_FOLLOW_KEY) === '1'; } catch { return false; }
})();
function setAutoFollow(on) {
	autoFollow = !!on;
	try { localStorage.setItem(AUTO_FOLLOW_KEY, autoFollow ? '1' : '0'); } catch {}
}

// ── Side panel — render pole controls ────────────────────────────────────
const DANCES = [
	{ key: 'rumba',    label: 'Rumba' },
	{ key: 'silly',    label: 'Silly' },
	{ key: 'thriller', label: 'Thriller' },
	{ key: 'capoeira', label: 'Capoeira' },
	{ key: 'hiphop',   label: 'Hip Hop' },
	{ key: 'spin',     label: 'Pole Spin' },
	{ key: 'climb',    label: 'Climb + Invert' },
	{ key: 'combo',    label: 'Combo' },
];

// Track per-pole card elements for status updates.
const poleCardEls = new Map();

function updatePoleCardStatus(poleId, status) {
	const cardEl = poleCardEls.get(poleId);
	if (!cardEl) return;
	const dotEl = cardEl.querySelector('.club-status-dot');
	const labelEl = cardEl.querySelector('.club-pole-status-label');
	const btnEl = cardEl.querySelector('.club-tip-btn');
	const progressEl = cardEl.querySelector('.club-pole-progress');

	if (dotEl) {
		dotEl.classList.remove('is-idle', 'is-performing', 'is-backstage');
		dotEl.classList.add(status === 'performing' ? 'is-performing' : status === 'backstage' ? 'is-backstage' : 'is-idle');
	}
	if (labelEl) {
		labelEl.textContent = status === 'performing' ? 'Performing' : status === 'backstage' ? 'Backstage' : 'Idle';
	}
	if (btnEl) {
		if (status === 'performing') {
			btnEl.disabled = true;
			btnEl.textContent = 'Performing...';
		} else {
			btnEl.disabled = false;
			const meta = DANCER_META[parseInt(poleId, 10) - 1] || DANCER_META[0];
			btnEl.textContent = `Tip $0.001`;
		}
	}
	if (progressEl) {
		progressEl.style.display = status === 'performing' ? '' : 'none';
	}
}

function flashPoleCard(poleId) {
	const cardEl = poleCardEls.get(poleId);
	if (!cardEl) return;
	cardEl.classList.remove('is-flash');
	void cardEl.offsetWidth; // force reflow for re-triggering animation
	cardEl.classList.add('is-flash');
	cardEl.addEventListener('animationend', () => cardEl.classList.remove('is-flash'), { once: true });
}

function renderPoles() {
	if (!polesPanel) return;
	polesPanel.innerHTML = '';
	for (const pole of POLES) {
		const idx = parseInt(pole.id, 10) - 1;
		const meta = DANCER_META[idx] || DANCER_META[0];
		const card = document.createElement('div');
		card.className = 'club-pole-card';
		card.setAttribute('role', 'listitem');
		card.setAttribute('aria-label', `Pole ${pole.id} - ${meta.name}`);
		card.dataset.poleId = pole.id;

		card.innerHTML = `
			<div class="club-pole-head">
				<div>
					<span class="club-dancer-name">${meta.name}</span>
					<span class="club-dancer-bio" title="${meta.bio}">${meta.bio}</span>
				</div>
				<span class="club-pole-row-right">
					<button type="button" class="club-cam-btn" data-pole="${pole.id}" title="VIP camera for ${meta.name}" aria-label="VIP camera for pole ${pole.id}">VIP</button>
				</span>
			</div>
			<div class="club-pole-status" aria-label="Status: Idle">
				<span class="club-status-dot is-idle" aria-hidden="true"></span>
				<span class="club-pole-status-label">Idle</span>
				<span class="club-pole-stats" id="club-pole-stats-${pole.id}" aria-label="Tips today: 0">0 tips today</span>
			</div>
			<div class="club-pole-progress" style="display:none" role="progressbar" aria-label="Performance progress" aria-valuenow="0" aria-valuemin="0" aria-valuemax="100">
				<div class="club-pole-progress-bar" style="width:0%"></div>
			</div>
			<label class="club-pole-style">
				<span class="sr-only">Dance style for ${meta.name}</span>
				Style
				<select data-dancer="${pole.id}" class="club-pole-select" aria-label="Dance style for pole ${pole.id}">
					${DANCES.map((d) => `<option value="${d.key}">${d.label}</option>`).join('')}
				</select>
			</label>
			<button type="button" class="club-tip-btn" data-dancer="${pole.id}" aria-label="Tip ${meta.name} $0.001 USDC">
				Tip $0.001
			</button>
		`;
		polesPanel.appendChild(card);
		poleCardEls.set(pole.id, card);
	}

	// Tap card on mobile to VIP.
	polesPanel.addEventListener('click', (e) => {
		const camBtn = e.target.closest('.club-cam-btn');
		if (camBtn) {
			const layout = POLES.find((p) => p.id === camBtn.dataset.pole);
			if (layout) clubCam.setVip(layout);
			return;
		}
		const btn = e.target.closest('.club-tip-btn');
		if (btn) {
			const dancer = btn.dataset.dancer;
			const select = polesPanel.querySelector(`.club-pole-select[data-dancer="${dancer}"]`);
			const dance = select?.value || 'rumba';
			tipDancer({ dancer, dance, button: btn });
			return;
		}
		// Tap the card itself (not a button/select) on mobile → VIP cam.
		const card = e.target.closest('.club-pole-card');
		if (card && isMobileLayout()) {
			const poleId = card.dataset.poleId;
			const layout = POLES.find((p) => p.id === poleId);
			if (layout) clubCam.setVip(layout);
		}
	});
}

// ── Pointer + pinch handling ─────────────────────────────────────────────
// One pointer → orbit (ClubCamera.applyDrag, free mode only). Two pointers →
// pinch zoom (ClubCamera.applyZoom). Wheel also zooms. The camera state
// machine owns yaw/pitch — this block is just input plumbing.
{
	const pointers = new Map(); // pointerId → {x, y}
	let pinchPrevDist = 0;

	const pinchDistance = () => {
		const [a, b] = [...pointers.values()];
		return Math.hypot(a.x - b.x, a.y - b.y);
	};

	canvas.addEventListener('pointerdown', (e) => {
		pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
		canvas.setPointerCapture?.(e.pointerId);
		if (pointers.size === 2) pinchPrevDist = pinchDistance();
	});
	canvas.addEventListener('pointermove', (e) => {
		const prev = pointers.get(e.pointerId);
		if (!prev) return;
		const dx = e.clientX - prev.x;
		const dy = e.clientY - prev.y;
		prev.x = e.clientX; prev.y = e.clientY;

		if (pointers.size === 1) {
			clubCam.applyDrag(dx, dy);
		} else if (pointers.size === 2) {
			const next = pinchDistance();
			// Pinch-in (fingers closer) → zoom in (negative deltaY); pinch-out → zoom out.
			const delta = (pinchPrevDist - next) * 4; // scale to wheel-ish units
			clubCam.applyZoom(delta);
			pinchPrevDist = next;
		}
	});
	const onUp = (e) => {
		if (!pointers.has(e.pointerId)) return;
		pointers.delete(e.pointerId);
		try { canvas.releasePointerCapture?.(e.pointerId); } catch {}
		if (pointers.size < 2) pinchPrevDist = 0;
	};
	canvas.addEventListener('pointerup', onUp);
	canvas.addEventListener('pointercancel', onUp);

	canvas.addEventListener('wheel', (e) => {
		e.preventDefault();
		clubCam.applyZoom(e.deltaY);
	}, { passive: false });
}

// ── Resize ────────────────────────────────────────────────────────────────
function handleResize() {
	const w = window.innerWidth;
	const h = window.innerHeight;
	renderer.setSize(w, h, false);
	composer.setSize(w, h);
	camera.aspect = w / h;
	camera.updateProjectionMatrix();

	// On mobile low-perf, cap pixel ratio to 1 to save GPU budget.
	if (isMobileLayout() && activeProfile.tier === 'low') {
		renderer.setPixelRatio(1);
	}
}
window.addEventListener('resize', handleResize);

// ── Keyboard shortcuts ───────────────────────────────────────────────────
// 0       → overhead house cam
// 1-N     → per-pole VIP cam (N = pole count)
// Esc     → back to free orbit
// Inputs / selects in the side panel are excluded so typing doesn't move
// the camera.
window.addEventListener('keydown', (e) => {
	const tag = e.target?.tagName;
	if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
	if (e.key === '0') return clubCam.setHouse();
	if (e.key === 'Escape') return clubCam.setFree();
	if (/^[1-9]$/.test(e.key)) {
		const layout = POLES.find((p) => p.id === e.key);
		if (layout) clubCam.setVip(layout);
	}
});

// ── Frame-budget watchdog ────────────────────────────────────────────────
// Even with the boot-time profile, a phone can throttle mid-session (thermal,
// background sync, etc.). The watchdog drops us one tier on sustained slow
// frames and we never auto-upgrade. Downgrade re-applies cheap render-state
// flags (pixelRatio, shadowMap, antialias-already-baked); features built
// once (mirror ball, volumetric cones) stay as constructed — turning them
// off mid-flight would mean destroying GPU resources which itself spikes
// frame time. Halting their per-frame work is enough.
const watchdog = createFrameWatchdog({
	initialTier: activeProfile.tier,
	onDowngrade: (nextTier) => {
		const next = PROFILES[nextTier];
		if (!next) return;
		activeProfile = next;
		if (typeof window !== 'undefined') window.__clubProfile = next;
		renderer.setPixelRatio(next.pixelRatio);
		renderer.shadowMap.enabled = next.shadows;
		for (const station of stations) {
			if (station.spot) station.spot.castShadow = next.shadows;
		}
		// Trim disco lights to the new cap so we render fewer point lights.
		while (disco.children.length > next.discoLights) {
			const dropped = disco.children[disco.children.length - 1];
			disco.remove(dropped);
		}
		log.info('[club] downgrading profile to', nextTier);
	},
});

// ── Render loop ──────────────────────────────────────────────────────────
const clock = new Timer();
let rafId = null;
function animate() {
	clock.update();
	const dt = Math.min(clock.getDelta(), 0.066);
	const t = clock.getElapsed();

	watchdog.tick(dt);

	// Beat level — drives both the bloom and the volumetric beams this frame.
	const peak = audio.getPeak();

	for (const station of stations) {
		station.tick(dt);

		// Spotlight pulse — gentle sinusoidal intensity variation.
		// Only for idle poles; performing poles have their own intensity target.
		if (!station.performing && station.spot) {
			const pulse = prefersReducedMotion ? 1.0
				: Math.sin(t * 1.2 + station.idx * 1.5) * 0.15 + 1.0;
			station.spot.intensity = station.spotIdleIntensity * pulse;
		}

		// Volumetric beam — rides the spotlight (set in tick) and breathes with
		// the beat so the haze pulses in time with her routine.
		if (station.beamMat) {
			station.beamMat.opacity = station.beamBaseOpacity * (1 + peak * 0.9)
				+ (prefersReducedMotion ? 0 : Math.sin(t * 1.5 + station.idx) * 0.01);
		}

		// Update progress bar for performing stations.
		if (station.performing && station.activeUntil > 0) {
			const total = (station.activeTicket?.durationSec || 12) * 1000;
			const elapsed = total - (station.activeUntil - Date.now());
			const pct = Math.min(100, Math.max(0, (elapsed / total) * 100));
			const cardEl = poleCardEls.get(station.id);
			if (cardEl) {
				const bar = cardEl.querySelector('.club-pole-progress-bar');
				const progressEl = cardEl.querySelector('.club-pole-progress');
				if (bar) bar.style.width = `${pct}%`;
				if (progressEl) progressEl.setAttribute('aria-valuenow', String(Math.round(pct)));
			}
		}
	}

	// Disco light slow swirl.
	disco.rotation.y = t * 0.25;

	// Ambient particles.
	if (typeof window !== 'undefined' && window.__clubParticles) {
		window.__clubParticles.tick(dt);
	}

	// Camera state machine — orbit / VIP / house / auto.
	clubCam.tick(dt);

	// Audio-reactive bloom — pulse intensity with the beat (skip under reduced motion).
	if (!prefersReducedMotion) bloomEffect.intensity = 1.0 + peak * 1.5;

	composer.render(dt);
	rafId = requestAnimationFrame(animate);
}

renderPoles();

// Bind the auto-follow checkbox to persisted state.
{
	const cb = document.getElementById('club-auto-follow');
	if (cb) {
		cb.checked = autoFollow;
		cb.addEventListener('change', () => setAutoFollow(cb.checked));
	}
}

// ── Leaderboard — fetch + tabs + 30s refresh ─────────────────────────────
// Rank dancers by USDC tipped over the selected window. We also surface
// unpaid_atomics so the user can watch the value drain as the payout cron
// sweeps. Polling pauses when the tab is hidden to spare RPC budget.
const LB_REFRESH_MS = 30_000;
let lbWindow = 'day';
let lbTimer = null;
let lbInflight = false;

async function fetchLeaderboard() {
	if (!lbRowsEl || lbInflight) return;
	lbInflight = true;
	try {
		const res = await fetch(`/api/club/leaderboard?window=${encodeURIComponent(lbWindow)}`, {
			headers: { accept: 'application/json' },
			cache: 'no-store',
		});
		if (!res.ok) throw new Error(`HTTP ${res.status}`);
		const body = await res.json();
		renderLeaderboard(body.rows || []);
	} catch (err) {
		log.error('[club] leaderboard fetch failed', err);
		// Don't blow away an already-rendered table on a transient hiccup.
		if (!lbRowsEl.querySelector('.club-lb-row')) {
			lbRowsEl.innerHTML = '<div class="club-lb-empty">Leaderboard unavailable.</div>';
		}
	} finally {
		lbInflight = false;
	}
}

function renderLeaderboard(rows) {
	if (!lbRowsEl) return;
	if (!rows.length) {
		lbRowsEl.innerHTML = '<div class="club-lb-empty">No tips yet. Be the first to tip a dancer!</div>';
		return;
	}
	const frag = document.createDocumentFragment();
	rows.forEach((row, i) => {
		const total = Number(row.total_atomics || 0);
		const unpaid = Number(row.unpaid_atomics || 0);
		const div = document.createElement('div');
		div.className = 'club-lb-row is-entering' + (unpaid > 0 ? ' has-unpaid' : '');
		div.style.animationDelay = `${i * 0.06}s`;
		const dancerId = String(row.dancer || '').replace(/[<>&]/g, '');
		const dancerIdx = parseInt(dancerId, 10) - 1;
		const metaName = DANCER_META[dancerIdx]?.name || null;
		const name = String(row.display_name || metaName || `Dancer ${dancerId}`).replace(/[<>&]/g, '');

		// Rank badge: gold/silver/bronze for top 3.
		let rankClass = '';
		let rankLabel = String(i + 1);
		if (i === 0) { rankClass = 'is-gold'; rankLabel = '1'; }
		else if (i === 1) { rankClass = 'is-silver'; rankLabel = '2'; }
		else if (i === 2) { rankClass = 'is-bronze'; rankLabel = '3'; }

		const unpaidLabel = unpaid > 0
			? `<small>${fmtUsd(unpaid)} unpaid</small>`
			: '';
		div.innerHTML = `
			<span class="club-lb-rank ${rankClass}" aria-label="Rank ${i + 1}">${rankLabel}</span>
			<span class="club-lb-name">${name}${unpaidLabel}</span>
			<span class="club-lb-amt" aria-label="Total tipped: ${total > 0 ? fmtUsd(total) : 'none'}">${total > 0 ? fmtUsd(total) : '—'}</span>
			<span class="club-lb-tips" aria-label="${row.tip_count || 0} tips">${row.tip_count || 0}×</span>
		`;
		frag.appendChild(div);
	});
	lbRowsEl.innerHTML = '';
	lbRowsEl.appendChild(frag);
}

function setLeaderboardWindow(next) {
	if (next === lbWindow) return;
	lbWindow = next;
	for (const tab of lbTabsEls) {
		const isActive = tab.dataset.window === next;
		tab.classList.toggle('is-active', isActive);
		tab.setAttribute('aria-selected', isActive ? 'true' : 'false');
	}
	// Show loading skeleton while fetching.
	if (lbRowsEl) {
		lbRowsEl.innerHTML = `
			<div class="club-lb-skeleton" aria-label="Loading leaderboard"></div>
			<div class="club-lb-skeleton" style="opacity:0.7"></div>
			<div class="club-lb-skeleton" style="opacity:0.4"></div>
		`;
	}
	fetchLeaderboard();
}

for (const tab of lbTabsEls) {
	tab.addEventListener('click', () => {
		const w = tab.dataset.window;
		if (w) setLeaderboardWindow(w);
	});
}

function startLeaderboardPolling() {
	stopLeaderboardPolling();
	lbTimer = setInterval(fetchLeaderboard, LB_REFRESH_MS);
}
function stopLeaderboardPolling() {
	if (lbTimer) {
		clearInterval(lbTimer);
		lbTimer = null;
	}
}
document.addEventListener('visibilitychange', () => {
	if (document.hidden) {
		stopLeaderboardPolling();
		// Stop the rAF loop entirely on hidden tabs — on mobile, leaving it
		// running heats the phone and drains battery for a tab the user
		// isn't even looking at.
		if (rafId != null) {
			cancelAnimationFrame(rafId);
			rafId = null;
		}
	} else {
		fetchLeaderboard();
		startLeaderboardPolling();
		// Discard the gap delta so the watchdog doesn't see one huge frame
		// (which would immediately count as "slow") on resume.
		clock.update();
		if (rafId == null) animate();
	}
});

fetchLeaderboard();
startLeaderboardPolling();

// ── Status bar — clock + connection indicator ────────────────────────────
{
	const clockEl = document.getElementById('club-clock');
	const connDot = document.getElementById('club-conn-dot');
	const connLabel = document.getElementById('club-conn-label');
	const viewerBarCount = document.getElementById('club-viewer-bar-count');

	function updateClock() {
		if (clockEl) {
			clockEl.textContent = new Date().toLocaleTimeString([], {
				hour: '2-digit',
				minute: '2-digit',
				second: '2-digit',
			});
		}
	}
	updateClock();
	setInterval(updateClock, 1000);

	// Mirror the viewer count from the presence bar into the status bar.
	const viewerCountEl = document.getElementById('club-viewer-count');
	if (viewerCountEl && viewerBarCount) {
		const obs = new MutationObserver(() => {
			viewerBarCount.textContent = `${viewerCountEl.textContent} watching`;
		});
		obs.observe(viewerCountEl, { characterData: true, childList: true, subtree: true });
	}

	// Connection status: watch online/offline events.
	function setConnected(online) {
		if (connDot) connDot.classList.toggle('is-disconnected', !online);
		if (connLabel) connLabel.textContent = online ? 'Connected' : 'Offline';
	}
	window.addEventListener('online', () => setConnected(true));
	window.addEventListener('offline', () => setConnected(false));
	setConnected(navigator.onLine !== false);
}

// ── Entrance animation cleanup ──────────────────────────────────────────
{
	const entrance = document.getElementById('club-entrance');
	if (entrance) {
		entrance.addEventListener('animationend', () => {
			entrance.remove();
		});
	}
}

bootstrap()
	.catch((err) => {
		log.error('[club] bootstrap failed', err);
		setStatus(`Club failed to load: ${err.message}`, { kind: 'error' });
	})
	.finally(() => animate());

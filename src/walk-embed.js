// /walk-embed — chrome-less, iframe-safe walking avatar
//
// Duplicated from src/walk.js so embeds can evolve independently without
// destabilizing the canonical /walk page. Differences vs /walk:
//   • No multiplayer (WalkNet) — embeds don't connect strangers to a room.
//   • No AR camera passthrough — embed hosts can't grant getUserMedia.
//   • No HUD card, no help text, no online pill.
//   • Reads ?bg, ?controls, ?autoplay, ?env, ?ground, ?orbit query params.
//   • postMessage's `walk:ready` on load and `walk:position` each tick.
//
// If you find yourself fixing the same bug here and in walk.js, consider
// extracting a shared controller — but until then duplication keeps the
// blast radius small.

import {
	AmbientLight,
	Box3,
	CircleGeometry,
	Timer,
	Color,
	DirectionalLight,
	Fog,
	Group,
	HemisphereLight,
	Mesh,
	MeshStandardMaterial,
	PCFShadowMap,
	PerspectiveCamera,
	PMREMGenerator,
	Scene,
	ShadowMaterial,
	Vector3,
	WebGLRenderer,
} from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import nipplejs from 'nipplejs';
import { getMeshoptDecoder } from './viewer/internal.js';

import { AnimationManager } from './animation-manager.js';
import { log } from './shared/log.js';
import {
	OUTBOUND,
	installEmbedBridge,
} from './walk-embed-events.js';

const AVATAR_URL_DEFAULT = '/avatars/default.glb';

// ── Embed params ─────────────────────────────────────────────────────────
const params = new URLSearchParams(location.search);
const BG_PARAM = params.get('bg'); // '' or 'transparent' or '#rrggbb'
const CONTROLS = (params.get('controls') || 'joystick').toLowerCase(); // 'joystick' | 'keyboard' | 'none'
const AUTOPLAY = params.get('autoplay') === 'true' || params.get('autoplay') === '1';
const SHOW_GROUND = params.get('ground') !== 'false';
const ORBIT_ENABLED = params.get('orbit') !== 'false';
const ENV_PARAM = (params.get('env') || 'studio').toLowerCase();

// Live-tracked state surfaced to the host via the typed contract. `currentAvatarId`
// is the public identifier hosts gave us (?avatar=<id|url>, else the ?agent=<id>
// whose avatar we resolved) or 'default'; never a resolved internal R2/CDN URL
// with credentials. `currentEnv` and `isReady` back the walk:ready handshake +
// walk:ping replies.
const AGENT_PARAM = params.get('agent');
let currentAvatarId = params.get('avatar') || (AGENT_PARAM ? `agent:${AGENT_PARAM}` : 'default');
let currentEnv = ENV_PARAM;
let isReady = false;

// Real, self-contained scene presets. Each preset retints the clear color,
// fog, ground disc, and the hemisphere/sun lights — no external HDRIs to
// fetch, so the embed stays a single iframe with no extra requests. An
// explicit ?bg= always overrides the preset's background (see applyEnvironment).
const ENVIRONMENTS = {
	studio: { bg: null,     ground: 0x202833, hemiSky: 0xbcd6ff, hemiGround: 0x202830, hemiInt: 0.6,  sun: 0xffffff, sunInt: 1.4, fog: null },
	void:   { bg: 0x08090b, ground: 0x101218, hemiSky: 0x3a4250, hemiGround: 0x0a0c0f, hemiInt: 0.5,  sun: 0xcdd6ff, sunInt: 1.1, fog: null },
	beach:  { bg: 0x86c5ff, ground: 0xe2c98a, hemiSky: 0xcfeaff, hemiGround: 0xb89968, hemiInt: 0.9,  sun: 0xfff2d6, sunInt: 1.7, fog: [0x86c5ff, 16, 44] },
	sunset: { bg: 0xff9d6e, ground: 0x4a3340, hemiSky: 0xffc59e, hemiGround: 0x2a1f33, hemiInt: 0.8,  sun: 0xffcaa0, sunInt: 1.6, fog: [0xff9d6e, 14, 42] },
	night:  { bg: 0x0a1020, ground: 0x141a28, hemiSky: 0x2a3a66, hemiGround: 0x05070d, hemiInt: 0.45, sun: 0x9fb4ff, sunInt: 0.8, fog: [0x0a1020, 16, 46] },
	grid:   { bg: 0x0d0f12, ground: 0x1a1f2a, hemiSky: 0x4a5a80, hemiGround: 0x0d0f12, hemiInt: 0.7,  sun: 0xffffff, sunInt: 1.3, fog: null },
};

// Hosts we'll load a raw ?avatar=<url> from. Same-origin is always allowed (the
// iframe is served from three.ws); these extra hosts cover the R2/CDN buckets and
// model providers three.ws itself stores avatars on. A ?avatar= URL pointing
// anywhere else is rejected and we fall back to the default avatar, so a hostile
// host can't make the embed fetch arbitrary third-party origins on its behalf.
const AVATAR_HOST_ALLOWLIST = [
	/^([a-z0-9-]+\.)*three\.ws$/i,
	/^([a-z0-9-]+\.)*r2\.cloudflarestorage\.com$/i,
	/^([a-z0-9-]+\.)*r2\.dev$/i,
	/(^|\.)readyplayer\.me$/i,
	/(^|\.)models\.readyplayer\.me$/i,
];

const GLB_PATH_RE = /\.(glb|gltf|vrm)(\?|#|$)/i;

// Validate a raw ?avatar= URL. Same-origin (absolute or path-relative) always
// passes; cross-origin must be an allow-listed host AND look like a model file.
// Returns the loadable URL or null if it should be rejected.
function validateAvatarUrl(raw) {
	if (raw.startsWith('/')) return raw; // same-origin path — always safe
	let u;
	try {
		u = new URL(raw, location.origin);
	} catch {
		return null;
	}
	if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
	if (u.origin === location.origin) return u.href;
	const hostOk = AVATAR_HOST_ALLOWLIST.some((re) => re.test(u.hostname));
	if (!hostOk) return null;
	if (!GLB_PATH_RE.test(u.pathname)) return null;
	return u.href;
}

// Resolve a ?agent=<id> to that agent's GLB URL via the real agent record. The
// /api/agents/:id endpoint returns avatar_model_url (custom GLB) and avatar_id;
// we prefer the explicit model URL, fall back to the same-origin avatar GLB proxy
// (which streams bytes with permissive CORS so the embed works on any host), and
// finally to the baked mannequin so an agent is never bodiless.
async function resolveAgentAvatarUrl(agentId) {
	const r = await fetch(`/api/agents/${encodeURIComponent(agentId)}`, {
		headers: { accept: 'application/json' },
	});
	if (!r.ok) throw new Error(`HTTP ${r.status} resolving agent avatar`);
	const body = await r.json();
	const rec = body?.agent || body;
	const direct = rec?.avatar_model_url || rec?.avatar_glb_url || rec?.glb_url;
	if (typeof direct === 'string' && GLB_PATH_RE.test(direct)) {
		return validateAvatarUrl(direct) || `/api/avatars/${encodeURIComponent(rec.avatar_id)}/glb`;
	}
	if (rec?.avatar_id) return `/api/avatars/${encodeURIComponent(rec.avatar_id)}/glb`;
	return AVATAR_URL_DEFAULT;
}

// Resolve the avatar to load from the embed params. Precedence: explicit
// ?avatar= (raw URL or avatar id) wins; otherwise ?agent=<id> resolves to that
// agent's GLB; otherwise the default avatar. Any failure logs and falls back to
// the default so the embed always renders a walking body.
async function resolveAvatarUrl() {
	const id = params.get('avatar');
	if (id) {
		// A direct GLB/VRM URL or site path loads as-is (validated) — this is how
		// Forge/Scan hand a just-generated model into the embed editor
		// (?avatar=<glb url>), the same passthrough the /play worlds use
		// (src/game/avatar-rig.js).
		if (/^https?:\/\//i.test(id) || id.startsWith('/')) {
			const safe = validateAvatarUrl(id);
			if (safe) return safe;
			log.warn('[walk-embed] rejected ?avatar= URL (origin/host not allowed):', id);
			return AVATAR_URL_DEFAULT;
		}
		// Bare avatar id: go through the same-origin GLB proxy (api/avatars/[id]/glb)
		// instead of the metadata JSON. The proxy streams the bytes with
		// `Access-Control-Allow-Origin: *` so hosts on any origin can iframe this
		// page. Fetching the JSON first would just give us back the raw R2 URL,
		// which R2 only allows from the three.ws origin and breaks the moment the
		// embed is dropped onto a third-party site.
		return `/api/avatars/${encodeURIComponent(id)}/glb`;
	}
	if (AGENT_PARAM) {
		try {
			return await resolveAgentAvatarUrl(AGENT_PARAM);
		} catch (err) {
			log.warn('[walk-embed] agent avatar resolve failed, using default:', err?.message || err);
			return AVATAR_URL_DEFAULT;
		}
	}
	return AVATAR_URL_DEFAULT;
}

const ANIMATIONS_MANIFEST_URL = '/animations/manifest.json';
const CLIP_IDLE = 'idle';
const CLIP_WALK = 'av-walk-feminine';
const CLIP_RUN = 'av-walk-feminine'; // no separate run clip; timeScale handles pace difference
// One-shot gesture clips, driven by the `walk:gesture` host command. Mapped to
// real manifest clip names; playOnce settles back to idle when each finishes.
const GESTURE_CLIPS = { wave: 'wave', jump: 'av-superhero-jump' };
// Clip names the embed must have resident for locomotion + gestures.
const REQUIRED_CLIPS = new Set([CLIP_IDLE, CLIP_WALK, CLIP_RUN, ...Object.values(GESTURE_CLIPS)]);

const WALK_SPEED = 1.6;
const RUN_SPEED = 4.0;
const NATURAL_WALK_SPEED = 1.5;
const NATURAL_RUN_SPEED = 3.4;
const TURN_LERP = 0.18;
const CAM_LERP = 0.12;
const LEAN_WALK_RAD = 0.05;
const LEAN_RUN_RAD = 0.13;
const LEAN_LERP = 0.12;
const CAM_OFFSET = new Vector3(0, 1.85, 3.6);
const CAM_LOOK_OFFSET = new Vector3(0, 1.1, 0);
const GROUND_RADIUS = 12;

// ── DOM ───────────────────────────────────────────────────────────────────
const stage = document.getElementById('walk-stage');
const canvas = document.getElementById('walk-canvas');
const joystickEl = document.getElementById('walk-joystick');
const statusEl = document.getElementById('walk-status');

stage.dataset.controls = CONTROLS;

// Apply background. Default is transparent so the host page shows through.
// `?bg=#101820` paints a solid color; `?bg=transparent` is explicit no-op.
if (BG_PARAM && BG_PARAM !== 'transparent') {
	document.body.style.background = BG_PARAM;
	stage.style.background = BG_PARAM;
}

function setStatus(text, { error = false, sticky = false } = {}) {
	if (!statusEl) return;
	statusEl.textContent = text;
	statusEl.classList.toggle('is-error', error);
	statusEl.classList.remove('is-hidden');
	if (!sticky) {
		clearTimeout(setStatus._t);
		setStatus._t = setTimeout(() => statusEl.classList.add('is-hidden'), 2200);
	}
}

// ── Outbound event bus → installEmbedBridge (src/walk-embed-events.js) ──────
// The runtime never touches postMessage itself. It fires typed lifecycle events
// on this tiny in-process bus; the embed bridge (installed from
// pages/walk-embed.html) subscribes via runtime.on() and is the single place
// that validates origins, shapes the envelope, and posts to window.parent. This
// keeps the wire contract in one module and guarantees no internal state leaks
// out by accident — only the fields the bridge forwards ever cross the boundary.
const _listeners = new Map();
function busOn(event, cb) {
	if (!_listeners.has(event)) _listeners.set(event, new Set());
	_listeners.get(event).add(cb);
	return () => _listeners.get(event)?.delete(cb);
}
function emit(type, payload = {}) {
	const set = _listeners.get(type);
	if (!set) return;
	for (const cb of set) {
		try { cb(payload); } catch {}
	}
}

// ── Renderer / scene ──────────────────────────────────────────────────────
const renderer = new WebGLRenderer({ canvas, antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight, false);
const HAS_SOLID_BG = !!(BG_PARAM && BG_PARAM !== 'transparent');
// Paint the actual bg color (not opaque black) so ?bg=#101820 renders the
// requested color. Transparent embeds keep alpha 0 so the host shows through.
renderer.setClearColor(HAS_SOLID_BG ? new Color(BG_PARAM) : 0x000000, HAS_SOLID_BG ? 1 : 0);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = PCFShadowMap;

const scene = new Scene();

const pmrem = new PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

scene.add(new AmbientLight(0xffffff, 0.55));
const hemi = new HemisphereLight(0xbcd6ff, 0x202830, 0.6);
hemi.position.set(0, 5, 0);
scene.add(hemi);
const sun = new DirectionalLight(0xffffff, 1.4);
sun.position.set(4, 8, 6);
sun.castShadow = true;
sun.shadow.mapSize.set(1024, 1024);
sun.shadow.camera.near = 0.5;
sun.shadow.camera.far = 30;
sun.shadow.camera.left = -8;
sun.shadow.camera.right = 8;
sun.shadow.camera.top = 8;
sun.shadow.camera.bottom = -8;
sun.shadow.bias = -0.0005;
scene.add(sun);

// Ground disc — visible by default; ?ground=false swaps it for a shadow
// catcher so the avatar floats on the host page's background.
const groundOpaque = new Mesh(
	new CircleGeometry(GROUND_RADIUS, 64),
	new MeshStandardMaterial({ color: 0x202833, roughness: 0.95, metalness: 0.0 }),
);
groundOpaque.rotation.x = -Math.PI / 2;
groundOpaque.receiveShadow = true;
groundOpaque.visible = SHOW_GROUND;
scene.add(groundOpaque);

const groundShadowCatcher = new Mesh(
	new CircleGeometry(GROUND_RADIUS, 64),
	new ShadowMaterial({ opacity: 0.32 }),
);
groundShadowCatcher.rotation.x = -Math.PI / 2;
groundShadowCatcher.receiveShadow = true;
groundShadowCatcher.visible = !SHOW_GROUND;
scene.add(groundShadowCatcher);

// Apply a scene preset. An explicit ?bg= wins over the preset background so
// transparent/custom embeds keep working; otherwise the preset paints the
// clear color and matching fog. Live-swappable via the `walk:setEnv` message.
function applyEnvironment(id) {
	const env = ENVIRONMENTS[id] || ENVIRONMENTS.studio;
	if (BG_PARAM && BG_PARAM !== 'transparent') {
		renderer.setClearColor(new Color(BG_PARAM), 1);
	} else if (env.bg == null) {
		renderer.setClearColor(0x000000, 0); // transparent — host page shows through
	} else {
		renderer.setClearColor(new Color(env.bg), 1);
		document.body.style.background = `#${env.bg.toString(16).padStart(6, '0')}`;
	}
	scene.fog = env.fog ? new Fog(env.fog[0], env.fog[1], env.fog[2]) : null;
	groundOpaque.material.color.setHex(env.ground);
	hemi.color.setHex(env.hemiSky);
	hemi.groundColor.setHex(env.hemiGround);
	hemi.intensity = env.hemiInt;
	sun.color.setHex(env.sun);
	sun.intensity = env.sunInt;
}
applyEnvironment(ENV_PARAM);

const camera = new PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.05, 200);
const avatarRig = new Group();
scene.add(avatarRig);

const camDesired = new Vector3();
const camLookTarget = new Vector3();
const camLookCurrent = new Vector3();

let cameraYaw = 0;
let cameraPitch = 0.05;
const PITCH_MIN = -0.6;
const PITCH_MAX = 0.7;

function applyCameraImmediate() {
	const offset = CAM_OFFSET.clone();
	offset.applyAxisAngle(new Vector3(1, 0, 0), -cameraPitch);
	offset.applyAxisAngle(new Vector3(0, 1, 0), cameraYaw);
	camDesired.copy(avatarRig.position).add(offset);
	camera.position.copy(camDesired);
	camLookTarget.copy(avatarRig.position).add(CAM_LOOK_OFFSET);
	camLookCurrent.copy(camLookTarget);
	camera.lookAt(camLookCurrent);
}
applyCameraImmediate();

// ── Drag-to-orbit ─────────────────────────────────────────────────────────
// Skipped entirely when ?orbit=false (e.g. the SDK uses it for autoplay-only
// floating avatars where stray pointer drags would just look broken).
if (ORBIT_ENABLED) {
	let dragging = false;
	let lastX = 0, lastY = 0;
	let downId = -1;

	canvas.addEventListener('pointerdown', (e) => {
		const jRect = joystickEl.getBoundingClientRect();
		const overJoystick = CONTROLS === 'joystick' && (
			e.clientX >= jRect.left && e.clientX <= jRect.right &&
			e.clientY >= jRect.top  && e.clientY <= jRect.bottom
		);
		if (overJoystick) return;

		dragging = true;
		downId = e.pointerId;
		lastX = e.clientX;
		lastY = e.clientY;
		canvas.setPointerCapture?.(e.pointerId);
	});
	const onMove = (e) => {
		if (!dragging || e.pointerId !== downId) return;
		const dx = e.clientX - lastX;
		const dy = e.clientY - lastY;
		lastX = e.clientX;
		lastY = e.clientY;
		cameraYaw -= dx * 0.005;
		cameraPitch = Math.max(PITCH_MIN, Math.min(PITCH_MAX, cameraPitch - dy * 0.0035));
	};
	const onUp = (e) => {
		if (e.pointerId !== downId) return;
		dragging = false;
		downId = -1;
		try { canvas.releasePointerCapture?.(e.pointerId); } catch {}
	};
	canvas.addEventListener('pointermove', onMove);
	canvas.addEventListener('pointerup', onUp);
	canvas.addEventListener('pointercancel', onUp);
}

// ── Input state ───────────────────────────────────────────────────────────
const input = {
	keys: { forward: 0, back: 0, left: 0, right: 0, run: false },
	joy: { x: 0, y: 0, active: false },
	autoplay: { active: false, t: 0 },
	// Programmatic vector, set by the `walk:move` host command (analog form).
	// Persists until the host sends move {x:0,y:0} or any live input overrides it.
	cmd: { x: 0, y: 0, run: false, active: false },
	// Scripted discrete move ({ dir, meters }) — walks a fixed distance then stops.
	// `remaining` counts down in metres each frame; `vx/vy` is the unit heading.
	scripted: { remaining: 0, vx: 0, vy: 0, run: false },
	// Seek target from `walk:goto` — drive toward a world (x,z) then stop within
	// GOTO_ARRIVE_EPSILON. Cleared by any live input or a new command.
	seek: { active: false, x: 0, z: 0, run: false },
	_speedMultiplier: 1.0,
};

const GOTO_ARRIVE_EPSILON = 0.18; // metres — close enough to "arrived"

// Map a discrete direction to a camera-relative input vector. forward/back use
// the y axis (joystick up = forward), left/right the x axis — same convention
// readMoveInput already resolves against the camera heading.
const DIR_VECTORS = {
	forward: { vx: 0, vy: 1 },
	back: { vx: 0, vy: -1 },
	left: { vx: -1, vy: 0 },
	right: { vx: 1, vy: 0 },
};

if (CONTROLS === 'keyboard' || CONTROLS === 'joystick') {
	window.addEventListener('keydown', (e) => {
		switch (e.code) {
			case 'KeyW': case 'ArrowUp':    input.keys.forward = 1; break;
			case 'KeyS': case 'ArrowDown':  input.keys.back = 1; break;
			case 'KeyA': case 'ArrowLeft':  input.keys.left = 1; break;
			case 'KeyD': case 'ArrowRight': input.keys.right = 1; break;
			case 'ShiftLeft': case 'ShiftRight': input.keys.run = true; break;
			default: return;
		}
	});
	window.addEventListener('keyup', (e) => {
		switch (e.code) {
			case 'KeyW': case 'ArrowUp':    input.keys.forward = 0; break;
			case 'KeyS': case 'ArrowDown':  input.keys.back = 0; break;
			case 'KeyA': case 'ArrowLeft':  input.keys.left = 0; break;
			case 'KeyD': case 'ArrowRight': input.keys.right = 0; break;
			case 'ShiftLeft': case 'ShiftRight': input.keys.run = false; break;
		}
	});
}

if (CONTROLS === 'joystick') {
	const joystick = nipplejs.create({
		zone: joystickEl,
		mode: 'static',
		position: { left: '50%', top: '50%' },
		size: 110,
		color: 'rgba(255,255,255,0.85)',
		restOpacity: 0.6,
	});
	joystick.on('move', (evt) => {
		// nipplejs v1 passes a single { type, target, data } event object.
		const data = evt?.data;
		if (data?.vector) {
			// data.vector is the proportional stick displacement, already in
			// [-1, 1] per axis (magnitude ≤ 1); y positive = pushed up = forward.
			input.joy.x = data.vector.x;
			input.joy.y = data.vector.y;
			input.joy.active = Math.hypot(data.vector.x, data.vector.y) > 0.05;
		}
	});
	joystick.on('end', () => {
		input.joy.x = 0;
		input.joy.y = 0;
		input.joy.active = false;
	});
}

// ── Avatar loading + animations ──────────────────────────────────────────
const animationManager = new AnimationManager();
let avatar = null;
let avatarYaw = 0;
let avatarLean = 0;
let currentMotion = 'idle';

// The default avatar (and most three.ws avatars) ship with
// EXT_meshopt_compression, so the loader must have the meshopt decoder wired
// before it can parse a single bufferView — otherwise GLTFLoader throws
// "setMeshoptDecoder must be called before loading compressed files". Build the
// loader once and share it across the initial load and live avatar swaps.
let _loaderPromise = null;
function getAvatarLoader() {
	if (!_loaderPromise) {
		_loaderPromise = getMeshoptDecoder().then((decoder) => {
			const loader = new GLTFLoader();
			loader.setMeshoptDecoder(decoder);
			return loader;
		});
	}
	return _loaderPromise;
}

async function loadAvatar() {
	setStatus('loading avatar…', { sticky: true });

	const requestedUrl = await resolveAvatarUrl();
	const loader = await getAvatarLoader();

	// Honor the contract that the embed ALWAYS renders a walking body: if the
	// requested avatar can't be fetched (deleted/expired id, a private avatar an
	// anonymous host can't read, a typo'd id → 404, or a transient network
	// failure) we fall back to the default avatar instead of leaving the host
	// with an empty, all-black stage. The failure is still reported to the host
	// over the typed bridge, and a legible status tells the viewer what happened.
	let gltf;
	let usedFallback = false;
	try {
		gltf = await loader.loadAsync(requestedUrl);
	} catch (err) {
		if (requestedUrl === AVATAR_URL_DEFAULT) throw err; // default itself failed — let boot's catch surface it
		log.warn('[walk-embed] avatar load failed, falling back to default:', err?.message || err);
		emit(OUTBOUND.ERROR, {
			code: 'avatar_load_failed',
			message: String(err?.message || err),
			fallback: true,
		});
		usedFallback = true;
		gltf = await loader.loadAsync(AVATAR_URL_DEFAULT);
	}
	avatar = gltf.scene;
	avatar.traverse((n) => {
		if (n.isMesh) {
			n.castShadow = true;
			n.receiveShadow = false;
			if (n.material && 'envMapIntensity' in n.material) {
				n.material.envMapIntensity = 0.85;
			}
		}
	});

	const box = new Box3().setFromObject(avatar);
	const minY = box.min.y;
	avatar.position.y -= minY;

	avatarRig.add(avatar);

	const height = Math.max(0.5, box.max.y - box.min.y);
	CAM_OFFSET.set(0, height * 1.05, height * 1.95);
	CAM_LOOK_OFFSET.set(0, height * 0.6, 0);
	applyCameraImmediate();

	animationManager.attach(avatar);

	const manifest = await fetch(ANIMATIONS_MANIFEST_URL, { cache: 'force-cache' })
		.then((r) => {
			if (!r.ok) throw new Error(`HTTP ${r.status} fetching animation manifest`);
			return r.json();
		});
	const needed = manifest.filter((d) => REQUIRED_CLIPS.has(d.name));
	if (!needed.some((d) => d.name === CLIP_IDLE) || !needed.some((d) => d.name === CLIP_WALK)) {
		throw new Error('Animation manifest missing idle/walking clips');
	}
	animationManager.setAnimationDefs(needed);
	await animationManager.loadAll();

	await animationManager.crossfadeTo(CLIP_IDLE, 0.0);
	currentMotion = 'idle';

	if (AUTOPLAY) {
		input.autoplay.active = true;
		input.autoplay.t = 0;
	}

	if (usedFallback) {
		setStatus("couldn't load that avatar — showing the default", { sticky: true });
	} else {
		setStatus('walk it');
	}
	isReady = true;
	emit(OUTBOUND.READY, { avatarId: currentAvatarId, env: currentEnv, fallback: usedFallback });
}

// ── Resize ────────────────────────────────────────────────────────────────
function resize() {
	const w = window.innerWidth;
	const h = window.innerHeight;
	renderer.setSize(w, h, false);
	camera.aspect = w / h;
	camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
window.addEventListener('orientationchange', resize);

// ── Main loop ─────────────────────────────────────────────────────────────
const clock = new Timer();
const moveWorld = new Vector3();
const moveForward = new Vector3();
const moveRight = new Vector3();
const upY = new Vector3(0, 1, 0);

// A human grabbing the controls (or a fresh command) cancels every form of
// programmatic drive so they never fight for the avatar.
function cancelProgrammatic() {
	input.scripted.remaining = 0;
	input.cmd.active = false;
	input.seek.active = false;
}

function readMoveInput(dt) {
	// Live input always wins and cancels any programmatic drive so a human can
	// grab control mid-script.
	if (input.joy.active) { cancelProgrammatic(); return { ix: input.joy.x, iy: input.joy.y, run: false }; }
	if (CONTROLS !== 'none') {
		const ix = input.keys.right - input.keys.left;
		const iy = input.keys.forward - input.keys.back;
		if (ix || iy) { cancelProgrammatic(); return { ix, iy, run: input.keys.run }; }
	}
	// Seek to a world (x,z) from walk:goto. Steer in world space, then express
	// the world heading in the camera-relative basis the loop consumes so the
	// avatar walks straight to the point regardless of camera orbit.
	if (input.seek.active && avatar) {
		const dx = input.seek.x - avatarRig.position.x;
		const dz = input.seek.z - avatarRig.position.z;
		const dist = Math.hypot(dx, dz);
		if (dist <= GOTO_ARRIVE_EPSILON) {
			input.seek.active = false;
			return { ix: 0, iy: 0 };
		}
		moveForward.copy(camLookCurrent).sub(camera.position);
		moveForward.y = 0;
		if (moveForward.lengthSq() < 1e-6) moveForward.set(0, 0, -1);
		else moveForward.normalize();
		moveRight.crossVectors(moveForward, upY).normalize();
		const ndx = dx / dist, ndz = dz / dist;
		// Decompose the world unit heading onto the camera basis: iy along
		// forward, ix along right.
		const iy = moveForward.x * ndx + moveForward.z * ndz;
		const ix = moveRight.x * ndx + moveRight.z * ndz;
		// Ease the final stretch so we settle instead of overshooting.
		const gain = Math.min(1, dist / 0.6);
		return { ix: ix * gain, iy: iy * gain, run: input.seek.run };
	}
	// Scripted discrete move: walk a fixed distance then stop. Decrement by the
	// per-frame distance the loop will actually travel (speed × dt) so `meters`
	// maps to real world distance regardless of frame rate.
	if (input.scripted.remaining > 0) {
		const pace = (input.scripted.run ? RUN_SPEED : WALK_SPEED) * (input._speedMultiplier || 1.0);
		input.scripted.remaining = Math.max(0, input.scripted.remaining - pace * dt);
		return { ix: input.scripted.vx, iy: input.scripted.vy, run: input.scripted.run };
	}
	// Held analog vector from `walk:move`.
	if (input.cmd.active) return { ix: input.cmd.x, iy: input.cmd.y, run: input.cmd.run };
	if (input.autoplay.active) {
		// Lazy "walk in a slow circle" pattern — readable, non-distracting,
		// and keeps the avatar within the visible ground disc no matter how
		// long the page sits idle. Period ~16s, radius ramps in over 1s so
		// the avatar starts from rest instead of snapping into motion.
		input.autoplay.t += dt;
		const ramp = Math.min(1, input.autoplay.t / 1.0);
		const angle = input.autoplay.t * (Math.PI * 2 / 16);
		return { ix: Math.cos(angle) * 0.6 * ramp, iy: Math.sin(angle) * 0.6 * ramp };
	}
	return { ix: 0, iy: 0 };
}

let lastBroadcastX = 0;
let lastBroadcastZ = 0;
let lastBroadcastAt = 0;
const BROADCAST_EPSILON = 0.02; // metres — skip duplicate post messages
const BROADCAST_INTERVAL_MS = 100; // walk:position fires at ≤10 Hz per the contract

function round3(n) {
	return Math.round(n * 1000) / 1000;
}

function tick() {
	clock.update();
	const dt = Math.min(clock.getDelta(), 0.05);

	const { ix, iy } = readMoveInput(dt);
	const mag = Math.min(1, Math.hypot(ix, iy));

	const wantRun = mag > 0.9 || input.keys.run;
	const speed = mag * (wantRun ? RUN_SPEED : WALK_SPEED) * (input._speedMultiplier || 1.0);

	if (mag > 0.01 && avatar) {
		moveForward.copy(camLookCurrent).sub(camera.position);
		moveForward.y = 0;
		if (moveForward.lengthSq() < 1e-6) moveForward.set(0, 0, -1);
		else moveForward.normalize();
		moveRight.crossVectors(moveForward, upY).normalize();

		moveWorld.set(0, 0, 0)
			.addScaledVector(moveForward, iy / Math.max(mag, 1e-6))
			.addScaledVector(moveRight, ix / Math.max(mag, 1e-6))
			.normalize()
			.multiplyScalar(speed * dt);

		avatarRig.position.add(moveWorld);

		const r = Math.hypot(avatarRig.position.x, avatarRig.position.z);
		const max = GROUND_RADIUS - 0.5;
		if (r > max) {
			const k = max / r;
			avatarRig.position.x *= k;
			avatarRig.position.z *= k;
		}

		const wantYaw = Math.atan2(moveWorld.x, moveWorld.z);
		avatarYaw = lerpAngle(avatarYaw, wantYaw, TURN_LERP);
		avatarRig.quaternion.setFromAxisAngle(upY, avatarYaw);

		const want = wantRun ? 'run' : 'walk';
		if (currentMotion !== want) {
			currentMotion = want;
			animationManager.crossfadeTo(want === 'run' ? CLIP_RUN : CLIP_WALK, 0.18);
		}
	} else if (currentMotion !== 'idle' && avatar) {
		currentMotion = 'idle';
		animationManager.crossfadeTo(CLIP_IDLE, 0.25);
	}

	if (animationManager.mixer) {
		let ts = 1.0;
		if (currentMotion === 'walk') {
			ts = Math.max(0.45, speed / NATURAL_WALK_SPEED);
		} else if (currentMotion === 'run') {
			ts = Math.max(0.6, speed / NATURAL_RUN_SPEED);
		}
		animationManager.mixer.timeScale = ts;
	}

	const targetLean = currentMotion === 'run'
		? LEAN_RUN_RAD * mag
		: currentMotion === 'walk'
			? LEAN_WALK_RAD * mag
			: 0;
	avatarLean += (targetLean - avatarLean) * LEAN_LERP;
	if (avatar) avatar.rotation.x = avatarLean;

	const offset = CAM_OFFSET.clone();
	offset.applyAxisAngle(new Vector3(1, 0, 0), -cameraPitch);
	offset.applyAxisAngle(upY, cameraYaw);
	camDesired.copy(avatarRig.position).add(offset);
	camera.position.lerp(camDesired, CAM_LERP);

	camLookTarget.copy(avatarRig.position).add(CAM_LOOK_OFFSET);
	camLookCurrent.lerp(camLookTarget, CAM_LERP);
	camera.lookAt(camLookCurrent);

	animationManager.update(dt);

	const now = performance.now();
	if (
		avatar &&
		now - lastBroadcastAt >= BROADCAST_INTERVAL_MS && (
			Math.abs(avatarRig.position.x - lastBroadcastX) > BROADCAST_EPSILON ||
			Math.abs(avatarRig.position.z - lastBroadcastZ) > BROADCAST_EPSILON
		)
	) {
		lastBroadcastAt = now;
		lastBroadcastX = avatarRig.position.x;
		lastBroadcastZ = avatarRig.position.z;
		emit(OUTBOUND.POSITION, {
			x: round3(avatarRig.position.x),
			z: round3(avatarRig.position.z),
			heading: round3(avatarYaw),
		});
	}

	renderer.render(scene, camera);
	requestAnimationFrame(tick);
}

function lerpAngle(a, b, t) {
	let diff = ((b - a + Math.PI) % (Math.PI * 2)) - Math.PI;
	if (diff < -Math.PI) diff += Math.PI * 2;
	return a + diff * t;
}

// ── Imperative runtime handle (consumed by installEmbedBridge) ─────────────
// Every method receives values the bridge has already validated, clamped, and
// bounded against the walk-embed-events contract — so the runtime trusts them
// and just applies them to the real avatar/controls. The bridge is the only
// thing that talks postMessage; the runtime only knows about its scene.
const runtime = {
	on: busOn,
	getReady() {
		return isReady ? { avatarId: currentAvatarId, env: currentEnv } : null;
	},
	// Walk to a world (x, z) then stop. Steered each frame in readMoveInput.
	goto(x, z) {
		cancelProgrammatic();
		const dist = Math.hypot(x - avatarRig.position.x, z - avatarRig.position.z);
		input.seek.active = true;
		input.seek.x = x;
		input.seek.z = z;
		input.seek.run = dist > 4; // jog to far targets, walk to near ones
		input.autoplay.active = false;
	},
	// Held analog vector / discrete nudge from walk:move.
	move(payload) {
		cancelProgrammatic();
		input.autoplay.active = false;
		if (typeof payload.dir === 'string') {
			const v = DIR_VECTORS[payload.dir];
			if (!v) return;
			input.scripted.vx = v.vx;
			input.scripted.vy = v.vy;
			input.scripted.run = false;
			input.scripted.remaining = payload.meters;
		} else {
			input.cmd.x = payload.x;
			input.cmd.y = payload.y;
			input.cmd.run = !!payload.run;
			input.cmd.active = Math.hypot(payload.x, payload.y) > 0.01;
		}
	},
	// One-shot gestures (wave/jump) play over locomotion then settle to idle.
	// Locomotion gestures (idle/walk/run) drive the autoplay loop the same way
	// the legacy walk:setMotion command did.
	gesture(g) {
		if (g === 'wave' || g === 'jump') {
			const clip = GESTURE_CLIPS[g];
			if (clip && animationManager.supportsCanonicalClips?.() !== false) {
				animationManager.playOnce(clip, { settleTo: CLIP_IDLE, fade: 0.18 });
			}
			emit(OUTBOUND.GESTURE, { gesture: g });
			return;
		}
		if (g === 'walk' || g === 'run') {
			input.autoplay.active = true;
			input.autoplay.t = 0;
		} else if (g === 'idle') {
			input.autoplay.active = false;
			input.cmd.active = false;
			input.seek.active = false;
			input.scripted.remaining = 0;
		}
		emit(OUTBOUND.GESTURE, { gesture: g });
	},
	// Show a speech bubble; `voice` is forwarded to the host echo as a hint (the
	// embed renders text, the host owns any TTS). durationMs sets the auto-hide.
	say(text, voice, durationMs) {
		const ms = showSpeechBubble(text, durationMs);
		emit(OUTBOUND.SPEAK, { text, voice, durationMs: ms });
	},
	setEnv(env) {
		applyEnvironment(env);
		currentEnv = env;
		emit(OUTBOUND.ENVIRONMENT, { env });
	},
	async setAvatar(avatarId) {
		try {
			const url = /^https?:\/\//i.test(avatarId) || avatarId.startsWith('/')
				? avatarId
				: `/api/avatars/${encodeURIComponent(avatarId)}/glb`;
			const loader = await getAvatarLoader();
			const gltf = await loader.loadAsync(url);
			if (avatar) avatarRig.remove(avatar);
			avatar = gltf.scene;
			avatar.traverse((n) => {
				if (n.isMesh) {
					n.castShadow = true;
					if (n.material && 'envMapIntensity' in n.material) n.material.envMapIntensity = 0.85;
				}
			});
			const box = new Box3().setFromObject(avatar);
			avatar.position.y -= box.min.y;
			avatarRig.add(avatar);
			const height = Math.max(0.5, box.max.y - box.min.y);
			CAM_OFFSET.set(0, height * 1.05, height * 1.95);
			CAM_LOOK_OFFSET.set(0, height * 0.6, 0);
			applyCameraImmediate();
			animationManager.attach(avatar);
			await animationManager.crossfadeTo(CLIP_IDLE, 0.0);
			currentMotion = 'idle';
			currentAvatarId = avatarId;
			emit(OUTBOUND.AVATAR_CHANGED, { avatarId });
		} catch (err) {
			emit(OUTBOUND.ERROR, { code: 'avatar_load_failed', message: String(err?.message || err) });
		}
	},
	config({ speed, bg, controls } = {}) {
		if (typeof speed === 'number') input._speedMultiplier = speed;
		if (typeof bg === 'string') applyBackground(bg);
		if (typeof controls === 'string') applyControls(controls);
	},
	reset() {
		cancelProgrammatic();
		input.autoplay.active = false;
		avatarRig.position.set(0, 0, 0);
		avatarYaw = 0;
		avatarRig.quaternion.setFromAxisAngle(upY, 0);
		hideSpeechBubble();
		applyCameraImmediate();
	},
};

// Expose the handle so installEmbedBridge (and integration tests) can drive the
// runtime without importing it. Public methods only — no scene internals.
window.__walkEmbed = runtime;

// Apply a runtime background override (walk:config { bg }). 'transparent' lets
// the host page show through; a hex/rgb paints a solid clear color.
function applyBackground(bg) {
	if (!bg || bg === 'transparent') {
		renderer.setClearColor(0x000000, 0);
		document.body.style.background = 'transparent';
		stage.style.background = 'transparent';
		return;
	}
	try {
		renderer.setClearColor(new Color(bg), 1);
		document.body.style.background = bg;
		stage.style.background = bg;
	} catch {}
}

// Swap control scheme at runtime (walk:config { controls }). Only toggles the
// joystick visibility + clears live key/joy state; keyboard listeners stay
// installed and simply go unused when controls are 'none'.
function applyControls(mode) {
	stage.dataset.controls = mode;
	if (mode === 'none') {
		input.keys.forward = input.keys.back = input.keys.left = input.keys.right = 0;
		input.keys.run = false;
		input.joy.x = input.joy.y = 0;
		input.joy.active = false;
	}
}

// Install the postMessage bridge — origin allow-list and target origin come
// from the embed URL so a security-conscious host can pin them.
installEmbedBridge(runtime, {
	allowedOrigins: params.get('allowOrigins')?.split(',').map((s) => s.trim()).filter(Boolean) || '*',
	targetOrigin: params.get('targetOrigin') || '*',
});

// ── Speech bubble (DOM overlay) ───────────────────────────────────────────
// Shows the narration text above the avatar. The text lives in a dedicated
// inner element clamped to 3 lines (-webkit-line-clamp) so long sections wrap
// and truncate cleanly; the pointer triangle is a separate sibling so it never
// participates in the clamp. Authoritative hide is walk:narrateEnd (audio
// ended); the timer is only a fallback if that message is ever lost.
let bubbleEl = null;
let bubbleTextEl = null;
let bubbleHideTimer = null;

function ensureBubble() {
	if (bubbleEl) return bubbleEl;
	bubbleEl = document.createElement('div');
	bubbleEl.setAttribute('role', 'status');
	bubbleEl.setAttribute('aria-live', 'polite');
	bubbleEl.style.cssText = `
		position: fixed;
		left: 50%;
		bottom: 180px;
		transform: translateX(-50%);
		max-width: 280px;
		background: rgba(10,10,10,0.88);
		color: #fafafa;
		font-family: Inter, system-ui, sans-serif;
		font-size: 13px;
		line-height: 1.45;
		padding: 10px 14px;
		border-radius: 14px;
		border: 1px solid rgba(255,255,255,0.12);
		backdrop-filter: blur(12px);
		-webkit-backdrop-filter: blur(12px);
		pointer-events: none;
		z-index: 10;
		opacity: 0;
		transition: opacity 0.25s ease;
	`;

	bubbleTextEl = document.createElement('div');
	bubbleTextEl.style.cssText = `
		display: -webkit-box;
		-webkit-box-orient: vertical;
		-webkit-line-clamp: 3;
		line-clamp: 3;
		overflow: hidden;
		word-break: break-word;
	`;
	bubbleEl.appendChild(bubbleTextEl);

	// Pointer triangle — sibling of the clamped text so it's never counted.
	const tri = document.createElement('div');
	tri.style.cssText = `
		position: absolute;
		bottom: -7px;
		left: 50%;
		transform: translateX(-50%);
		width: 0;
		height: 0;
		border-left: 7px solid transparent;
		border-right: 7px solid transparent;
		border-top: 7px solid rgba(10,10,10,0.88);
	`;
	bubbleEl.appendChild(tri);
	document.body.appendChild(bubbleEl);
	return bubbleEl;
}

// Returns the resolved visible duration (ms) so the host's walk:speak echo can
// report exactly how long the bubble will stay up.
function showSpeechBubble(text, durationMs) {
	clearTimeout(bubbleHideTimer);
	ensureBubble();
	bubbleTextEl.textContent = text.slice(0, 280);
	bubbleEl.style.opacity = '1';
	// Explicit durationMs wins; otherwise estimate from reading time.
	const ms = durationMs && durationMs > 0 ? durationMs : Math.max(2500, text.length * 55);
	bubbleHideTimer = setTimeout(hideSpeechBubble, ms);
	return ms;
}

function hideSpeechBubble() {
	if (bubbleEl) bubbleEl.style.opacity = '0';
}

// ── Boot ──────────────────────────────────────────────────────────────────
loadAvatar()
	.then(() => {
		requestAnimationFrame(tick);
	})
	.catch((err) => {
		log.error('[walk-embed] failed to load avatar:', err);
		if (statusEl) {
			statusEl.textContent = `failed to load avatar: ${err?.message ?? err}`;
			statusEl.classList.add('is-error');
			statusEl.classList.remove('is-hidden');
		}
		emit(OUTBOUND.ERROR, { code: 'avatar_load_failed', message: String(err?.message || err) });
		requestAnimationFrame(tick);
	});

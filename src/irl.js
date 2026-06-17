// src/irl.js — IRL AR playground
//
// Full-screen walking avatar + camera AR passthrough + tap-to-place 3D objects.
// Visual style mirrors /avatars/:id/ar (bottom panel, gradient bg, hero CTA).
// Walking + joystick from walk-embed. Camera mode makes the real floor the stage.

import {
	AmbientLight,
	Box3,
	BoxGeometry,
	CircleGeometry,
	CylinderGeometry,
	DirectionalLight,
	Group,
	HemisphereLight,
	Mesh,
	MeshPhysicalMaterial,
	MeshStandardMaterial,
	OctahedronGeometry,
	PCFShadowMap,
	PerspectiveCamera,
	PlaneGeometry,
	PMREMGenerator,
	Quaternion,
	Raycaster,
	Scene,
	ShadowMaterial,
	SphereGeometry,
	Timer,
	TorusGeometry,
	Vector2,
	Vector3,
	WebGLRenderer,
} from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import nipplejs from 'nipplejs';
import { AnimationManager } from './animation-manager.js';
import { WebXRSession } from './ar/webxr.js';
import { log } from './shared/log.js';
import { createAvatarPicker } from './avatar-picker.js';
import { errorStateEl, skeletonHTML, emptyStateHTML, errorStateHTML, ensureStateKitStyles, attachRetry } from './shared/state-kit.js';

const AVATAR_URL_DEFAULT = '/avatars/default.glb';
const ANIMATIONS_MANIFEST_URL = '/animations/manifest.json';
const CLIP_IDLE = 'idle';
const CLIP_WALK = 'av-walk-feminine';
const CLIP_RUN  = 'av-walk-feminine';

const WALK_SPEED         = 1.6;
const RUN_SPEED          = 4.0;
const NATURAL_WALK_SPEED = 1.5;
const NATURAL_RUN_SPEED  = 3.4;
const TURN_LERP          = 0.18;
const CAM_LERP           = 0.12;
const LEAN_WALK_RAD      = 0.05;
const LEAN_RUN_RAD       = 0.13;
const LEAN_LERP          = 0.12;
const GROUND_RADIUS      = 16;
const CAM_OFFSET         = new Vector3(0, 1.85, 3.6);
const CAM_LOOK_OFFSET    = new Vector3(0, 1.1, 0);
const SPAWN_DURATION     = 0.38; // seconds for placed object scale-up
const TAP_THRESHOLD      = 10;   // px — beyond this it's a drag, not a tap
// ── Camera-aware agents ──────────────────────────────────────────────────
// Loaded nearby agents notice the viewer: they yaw their body toward the phone
// camera, lead with a head turn inside a natural neck cone, idle-drift when
// nobody's close, and perk up once when you first walk into range.
const AWARE_RADIUS_M    = 12;    // viewer must be this close (m) to engage tracking
const NOTICE_RADIUS_M   = 4;     // crossing this (m) fires the one-shot "notice"
const AWARE_MAX_AGENTS  = 5;     // only the nearest N get full per-frame head tracking
const HEAD_CLAMP        = 0.7;   // max neck yaw/pitch from rest (rad) — natural cone
const BODY_SLERP        = 0.05;  // eased body yaw toward the camera
const BODY_RETURN_SLERP = 0.03;  // eased body yaw back to the placed heading
const HEAD_SLERP        = 0.12;  // eased head toward its gaze target
const HEAD_SLERP_NOTICE = 0.40;  // boosted head slerp during a notice reaction
const NOTICE_BOOST_SEC  = 0.40;  // seconds the head-slerp boost lasts after a notice
const POP_DURATION      = 0.45;  // seconds for the perk-up scale pop
const POP_AMOUNT        = 0.04;  // peak +Y scale during the pop (1.0 → 1.04 → 1.0)

// ── URL params ────────────────────────────────────────────────────────────
const params = new URLSearchParams(location.search);
const avatarIdParam  = params.get('avatar')    || '';
const highlightPinId = params.get('highlight') || '';

function resolveAvatarUrl(id) {
	if (!id) return AVATAR_URL_DEFAULT;
	if (/^https?:\/\//i.test(id) || id.startsWith('/')) return id;
	return `/api/avatars/${encodeURIComponent(id)}/glb`;
}

// ── DOM refs ──────────────────────────────────────────────────────────────
const $  = (id) => document.getElementById(id);
// Pre-allocated vectors used in tick() camera-awareness detection (avoids GC churn)
const _camWorldDir = new Vector3();
const _camDirH     = new Vector3();
const _toAgentH    = new Vector3();

const canvas      = $('irl-canvas');
const videoEl     = $('irl-camera');
const joystickEl  = $('irl-joystick');
const nameEl      = $('irl-avatar-name');
const subtitleEl  = $('irl-subtitle');
const statusEl    = $('irl-status');
const statusTxt   = $('irl-status-text');
const spinner     = $('irl-spinner');
const cameraBtn      = $('irl-camera-btn');
const cameraLabel    = $('irl-camera-label');
const placeBtn       = $('irl-place-btn');
const clearBtn       = $('irl-clear-btn');
const pickerEl       = $('irl-picker');
const avatarBtn      = $('irl-avatar-btn');
const lockBtn        = $('irl-lock-btn');
const anchorBtn      = $('irl-anchor-btn');     // WebXR "Place on floor" — revealed only when supported
const xrOverlay      = $('irl-xr-overlay');     // WebXR dom-overlay root (in-session hint + exit + error)
const xrHintEl       = $('irl-xr-hint');
const xrExitBtn      = $('irl-xr-exit');

// ── Status helpers ────────────────────────────────────────────────────────
function setStatus(msg, { error = false, warn = false, loading = false, sticky = false } = {}) {
	clearTimeout(setStatus._t);
	if (!msg) { statusEl.classList.add('is-hidden'); return; }
	statusTxt.textContent = msg;
	statusEl.classList.remove('is-hidden');
	statusEl.classList.toggle('is-error', error);
	statusEl.classList.toggle('is-warn', warn && !error);
	spinner.classList.toggle('hidden', !loading);
	if (!sticky) setStatus._t = setTimeout(() => statusEl.classList.add('is-hidden'), 3000);
}

// ── Renderer / scene ──────────────────────────────────────────────────────
const renderer = new WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight, false);
renderer.setClearColor(0x000000, 0);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = PCFShadowMap;

const scene = new Scene();
const pmrem = new PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

const ambientLight = new AmbientLight(0xffffff, 0.55);
scene.add(ambientLight);
const hemi = new HemisphereLight(0xbcd6ff, 0x202830, 0.6);
hemi.position.set(0, 5, 0);
scene.add(hemi);
const sun = new DirectionalLight(0xffffff, 1.4);
sun.position.set(4, 8, 6);
sun.castShadow = true;
sun.shadow.mapSize.set(1024, 1024);
sun.shadow.camera.near = 0.5;
sun.shadow.camera.far = 32;
sun.shadow.camera.left = -12;
sun.shadow.camera.right = 12;
sun.shadow.camera.top = 12;
sun.shadow.camera.bottom = -12;
sun.shadow.bias = -0.0005;
scene.add(sun);

// ── Ground ────────────────────────────────────────────────────────────────
const groundOpaque = new Mesh(
	new CircleGeometry(GROUND_RADIUS, 64),
	new MeshStandardMaterial({ color: 0x121820, roughness: 0.95, metalness: 0.0 }),
);
groundOpaque.rotation.x = -Math.PI / 2;
groundOpaque.receiveShadow = true;
scene.add(groundOpaque);

const groundShadow = new Mesh(
	new CircleGeometry(GROUND_RADIUS, 64),
	new ShadowMaterial({ opacity: 0.5 }),
);
groundShadow.rotation.x = -Math.PI / 2;
groundShadow.receiveShadow = true;
groundShadow.visible = false;
scene.add(groundShadow);

// Invisible plane at y=0 for raycasting tap-to-place targets
const rayPlane = new Mesh(
	new PlaneGeometry(60, 60),
	new MeshStandardMaterial({ visible: false, side: 2 }),
);
rayPlane.rotation.x = -Math.PI / 2;
rayPlane.position.y = 0.005;
scene.add(rayPlane);

// ── Camera ────────────────────────────────────────────────────────────────
const camera = new PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.05, 200);
const avatarRig = new Group();
scene.add(avatarRig);

const camDesired     = new Vector3();
const camLookTarget  = new Vector3();
const camLookCurrent = new Vector3();
let cameraYaw   = 0;
let cameraPitch = 0.05;
const PITCH_MIN = -0.5;
const PITCH_MAX = 0.65;

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

// ── AR passthrough ────────────────────────────────────────────────────────
let arActive        = false;
let mediaStream     = null;
let arFrozenCamPos  = null;
let arFrozenCamLook = null;

async function enableAR() {
	if (!navigator.mediaDevices?.getUserMedia) {
		setStatus('Camera API not available in this browser', { error: true, sticky: true });
		return;
	}
	setStatus('Requesting camera…', { loading: true, sticky: true });
	try {
		mediaStream = await navigator.mediaDevices.getUserMedia({
			video: { facingMode: { ideal: 'environment' } },
			audio: false,
		});
	} catch (err) {
		const msg = err?.name === 'NotAllowedError'
			? 'Camera permission denied — allow in browser settings'
			: `Camera unavailable: ${err?.message ?? err}`;
		setStatus(msg, { error: true, sticky: true });
		return;
	}

	videoEl.srcObject = mediaStream;

	// Reveal the AR state BEFORE play(). A display:none <video> can leave
	// play()'s promise unsettled in some browsers (notably iOS Safari), which
	// would otherwise hang camera activation forever. Make it visible first,
	// then start playback without blocking on the promise.
	arActive = true;
	document.body.classList.add('is-ar');
	cameraBtn.classList.add('is-active');
	cameraLabel.textContent = 'Camera On';
	subtitleEl.textContent = 'Walk your avatar on the real floor';
	groundOpaque.visible = false;
	groundShadow.visible = true;
	renderer.setClearColor(0x000000, 0);
	scene.background = null;

	videoEl.play().catch(() => {/* autoplay policies — frames still arrive via the stream */});

	// Match Three.js FOV to device rear camera so the avatar's scale agrees
	// with real-world objects (typically 70–75° diagonal for rear cameras).
	const track = mediaStream.getVideoTracks()[0];
	const s = track?.getSettings?.() ?? {};
	const vw = s.width  ?? window.innerWidth;
	const vh = s.height ?? window.innerHeight;
	const diagFov  = 72;
	const diagPx   = Math.hypot(vw, vh);
	const hFovRad  = 2 * Math.atan((vw / diagPx) * Math.tan((diagFov * Math.PI / 180) / 2));
	const aspect   = window.innerWidth / window.innerHeight;
	const vFovDeg  = (2 * Math.atan(Math.tan(hFovRad / 2) / aspect)) * (180 / Math.PI);
	camera.fov = Math.max(50, Math.min(90, vFovDeg));
	camera.updateProjectionMatrix();

	// Freeze camera so the avatar walks through the real room instead of the
	// follow-camera chasing it (which would shift the real-world background).
	arFrozenCamPos  = camera.position.clone();
	arFrozenCamLook = camLookCurrent.clone();

	setStatus('Camera on — walk your avatar on the real floor');
}

function disableAR() {
	if (mediaStream) {
		mediaStream.getTracks().forEach(t => { try { t.stop(); } catch {} });
		mediaStream = null;
	}
	videoEl.srcObject = null;
	arActive = false;
	document.body.classList.remove('is-ar');
	cameraBtn.classList.remove('is-active');
	cameraLabel.textContent = 'Camera AR';
	subtitleEl.textContent = 'Turn on camera to place in your space';
	groundOpaque.visible = true;
	groundShadow.visible = false;
	camera.fov = 50;
	camera.updateProjectionMatrix();
	ambientLight.intensity = 0.55;
	sun.intensity = 1.4;
	arFrozenCamPos  = null;
	arFrozenCamLook = null;
	setStatus('Camera off');
}

cameraBtn.addEventListener('click', () => {
	if (arActive) disableAR();
	else enableAR();
});

// Disable hero button if camera API is absent
if (!navigator.mediaDevices?.getUserMedia) {
	cameraBtn.disabled = true;
	cameraBtn.setAttribute('aria-disabled', 'true');
	cameraLabel.textContent = 'Camera unavailable';
}

// ── Placed objects ────────────────────────────────────────────────────────
let placeModeActive = false;
let selectedType    = 'orb';
const placedObjects = []; // { mesh, spawnT, type }

// ── Session persistence (localStorage) ───────────────────────────────────
const SESSION_KEY = 'irl_session_v1';

// Snapshot the persisted session ONCE at module load. loadAvatar() runs
// _saveSession() against the empty boot scene before _restoreSession() gets to
// read it, so reading localStorage live inside restore would see that wiped
// state. Capture the real saved session here instead.
const _savedSession = (() => {
	try {
		const raw = localStorage.getItem(SESSION_KEY);
		return raw ? JSON.parse(raw) : null;
	} catch { return null; }
})();

function _saveSession() {
	try {
		localStorage.setItem(SESSION_KEY, JSON.stringify({
			avatarId: _currentAvatarId,
			locked:   avatarLocked,
			placedObjects: placedObjects.map(o => ({
				type: o.type,
				x:    o.mesh.position.x,
				z:    o.mesh.position.z,
			})),
		}));
	} catch {}
}

function _restoreSession() {
	const s = _savedSession;
	if (!s) return;
	try {
		// Objects first, then lock — so setLocked()'s own save (and the explicit
		// one below) capture the fully restored scene rather than an empty one.
		for (const o of (s.placedObjects ?? [])) {
			const def = OBJ_DEFS[o.type];
			if (!def) continue;
			const mesh = def.create();
			mesh.position.x = Number(o.x) || 0;
			mesh.position.z = Number(o.z) || 0;
			mesh.scale.setScalar(1); // skip spawn animation on restore
			scene.add(mesh);
			placedObjects.push({ mesh, spawnT: SPAWN_DURATION, type: o.type });
		}
		if (placedObjects.length) clearBtn.hidden = false;
		if (s.locked) setLocked(true);
		// loadAvatar() persisted the empty boot scene before we got here; write
		// the restored state back so it survives a refresh with no further edits.
		_saveSession();
	} catch {}
}

const OBJ_DEFS = {
	orb: {
		create() {
			const m = new Mesh(
				new SphereGeometry(0.22, 32, 24),
				new MeshPhysicalMaterial({
					color: 0x88bbff,
					emissive: 0x1a44aa,
					emissiveIntensity: 0.55,
					metalness: 0.15,
					roughness: 0.04,
					transmission: 0.45,
					thickness: 0.3,
				}),
			);
			m.castShadow = true;
			m.position.y = 0.22;
			return m;
		},
	},
	crate: {
		create() {
			const m = new Mesh(
				new BoxGeometry(0.4, 0.4, 0.4),
				new MeshStandardMaterial({ color: 0xb07830, roughness: 0.85, metalness: 0.0 }),
			);
			m.castShadow = true;
			m.position.y = 0.2;
			return m;
		},
	},
	crystal: {
		create() {
			const m = new Mesh(
				new OctahedronGeometry(0.28, 0),
				new MeshPhysicalMaterial({
					color: 0xcc77ff,
					emissive: 0x440066,
					emissiveIntensity: 0.5,
					metalness: 0.0,
					roughness: 0.0,
					transmission: 0.65,
					thickness: 0.4,
				}),
			);
			m.castShadow = true;
			m.position.y = 0.28;
			return m;
		},
	},
	ring: {
		create() {
			const m = new Mesh(
				new TorusGeometry(0.22, 0.065, 16, 48),
				new MeshStandardMaterial({ color: 0xffd700, metalness: 0.95, roughness: 0.08 }),
			);
			m.castShadow = true;
			m.rotation.x = Math.PI / 2;
			m.position.y = 0.065;
			return m;
		},
	},
	pillar: {
		create() {
			const m = new Mesh(
				new CylinderGeometry(0.1, 0.12, 0.9, 12),
				new MeshStandardMaterial({ color: 0xd8d0c4, roughness: 0.72, metalness: 0.0 }),
			);
			m.castShadow = true;
			m.position.y = 0.45;
			return m;
		},
	},
};

// Object picker wiring
document.querySelectorAll('.irl-obj-btn').forEach(btn => {
	btn.addEventListener('click', () => {
		selectedType = btn.dataset.type;
		document.querySelectorAll('.irl-obj-btn').forEach(b => b.classList.remove('active'));
		btn.classList.add('active');
	});
});
document.querySelector('.irl-obj-btn[data-type="orb"]')?.classList.add('active');

placeBtn.addEventListener('click', () => {
	placeModeActive = !placeModeActive;
	placeBtn.setAttribute('aria-pressed', String(placeModeActive));
	placeBtn.classList.toggle('is-active', placeModeActive);
	pickerEl.hidden = !placeModeActive;
	if (placeModeActive) {
		canvas.style.cursor = 'crosshair';
		setStatus('Tap the floor to drop an object');
	} else {
		canvas.style.cursor = '';
		setStatus(null);
	}
});

clearBtn.addEventListener('click', () => {
	for (const obj of placedObjects) scene.remove(obj.mesh);
	placedObjects.length = 0;
	clearBtn.hidden = true;
	setStatus('Objects cleared');
	_saveSession();
});

// ── Tap-to-place raycasting ───────────────────────────────────────────────
const raycaster  = new Raycaster();
const pointerNDC = new Vector2();
let tapDownX = 0, tapDownY = 0;

canvas.addEventListener('pointerdown', e => { tapDownX = e.clientX; tapDownY = e.clientY; armLongPress(e); });
canvas.addEventListener('pointerup', e => {
	cancelLongPress();
	// While calibrating, taps belong to the nudge gesture — never re-open a sheet.
	if (calibrateActive) return;
	if (Math.hypot(e.clientX - tapDownX, e.clientY - tapDownY) > TAP_THRESHOLD) return;

	pointerNDC.set(
		(e.clientX  / window.innerWidth)  * 2 - 1,
		-(e.clientY / window.innerHeight) * 2 + 1,
	);
	raycaster.setFromCamera(pointerNDC, camera);

	if (placeModeActive) {
		// ── Place mode: drop an object on the ground ─────────────────────
		const hits = raycaster.intersectObject(rayPlane);
		if (!hits.length) return;
		const def = OBJ_DEFS[selectedType];
		if (!def) return;
		const mesh = def.create();
		mesh.position.x = hits[0].point.x;
		mesh.position.z = hits[0].point.z;
		mesh.scale.setScalar(0.001);
		scene.add(mesh);
		placedObjects.push({ mesh, spawnT: 0, type: selectedType });
		clearBtn.hidden = false;
		_saveSession();
	} else {
		// ── Tap on a nearby agent: mesh body first, 2D label net as fallback ──
		// Mesh ray: the nearest intersection is closest to the camera, so two
		// agents projecting to the same pixel resolve to the FRONT body for free.
		let pin = null;
		const agentGroups = nearbyPins.map(p => p.group).filter(Boolean);
		if (agentGroups.length) {
			const hits = raycaster.intersectObjects(agentGroups, true);
			if (hits.length) pin = _pinForObject(hits[0].object);
		}
		// Label net: a finger-sized slop around each on-screen name label catches
		// taps that miss the (often small or distant) body — the floor for tap
		// reliability on a phone. Front agent wins a cluster tie (see helper).
		if (!pin) pin = _nearestLabelWithinSlop(e.clientX, e.clientY);
		if (pin) openPinSheet(pin);
	}
});

// Nearest on-screen name label within a finger-sized radius of the tap (B4).
// Uses the screen positions cached by updateLabels() each frame, so it costs a
// short loop and zero projection/allocation. A clear pixel winner takes it;
// near-ties resolve to the nearer (front) agent so clustered labels behave.
const TAP_SLOP = 28; // px — touch radius around a label centre, wider than the box
function _nearestLabelWithinSlop(px, py) {
	let best = null, bestPx = Infinity;
	for (const pin of nearbyPins) {
		if (!pin._labelOnScreen) continue;
		const d = Math.hypot(px - pin._labelSx, py - pin._labelSy);
		if (d > TAP_SLOP) continue;
		if (d < bestPx - 8) { best = pin; bestPx = d; }
		else if (Math.abs(d - bestPx) <= 8 &&
			(pin.distance_m ?? Infinity) < (best?.distance_m ?? Infinity)) {
			best = pin; bestPx = d;
		}
	}
	return best;
}

function _pinForObject(obj) {
	// Walk up to the agent group and read the pin cached on it (set in
	// spawnNearbyPin). O(depth) with no per-node array scan.
	let node = obj;
	while (node) {
		if (node.userData && node.userData.pin) return node.userData.pin;
		node = node.parent;
	}
	return null;
}

// ── Joystick ──────────────────────────────────────────────────────────────
const input = {
	joy:  { x: 0, y: 0, active: false },
	keys: { forward: 0, back: 0, left: 0, right: 0, run: false },
};

// nipplejs's .on() returns undefined (not chainable), so attach each listener
// on the stored manager — chaining would throw and abort the module's boot.
const joystick = nipplejs.create({
	zone: joystickEl, mode: 'static', position: { left: '50%', top: '50%' },
	size: 110, color: 'rgba(255,255,255,0.85)', restOpacity: 0.6,
});
joystick.on('move', evt => {
	const v = evt?.data?.vector;
	if (v) { input.joy.x = v.x; input.joy.y = v.y; input.joy.active = Math.hypot(v.x, v.y) > 0.05; }
});
joystick.on('end', () => { input.joy.x = 0; input.joy.y = 0; input.joy.active = false; });

window.addEventListener('keydown', e => {
	switch (e.code) {
		case 'KeyW': case 'ArrowUp':         input.keys.forward = 1; break;
		case 'KeyS': case 'ArrowDown':       input.keys.back    = 1; break;
		case 'KeyA': case 'ArrowLeft':       input.keys.left    = 1; break;
		case 'KeyD': case 'ArrowRight':      input.keys.right   = 1; break;
		case 'ShiftLeft': case 'ShiftRight': input.keys.run     = true; break;
	}
});
window.addEventListener('keyup', e => {
	switch (e.code) {
		case 'KeyW': case 'ArrowUp':         input.keys.forward = 0; break;
		case 'KeyS': case 'ArrowDown':       input.keys.back    = 0; break;
		case 'KeyA': case 'ArrowLeft':       input.keys.left    = 0; break;
		case 'KeyD': case 'ArrowRight':      input.keys.right   = 0; break;
		case 'ShiftLeft': case 'ShiftRight': input.keys.run     = false; break;
	}
});

// ── Drag-to-orbit (disabled in place mode so taps don't orbit) ───────────
{
	let dragging = false, lastX = 0, lastY = 0, downId = -1;
	canvas.addEventListener('pointerdown', e => {
		if (placeModeActive || calibrateActive) return;
		const r = joystickEl.getBoundingClientRect();
		if (e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom) return;
		dragging = true; downId = e.pointerId; lastX = e.clientX; lastY = e.clientY;
		canvas.setPointerCapture?.(e.pointerId);
	});
	const onMove = e => {
		// Calibration may engage mid-drag (long-press fires while still held) — yield
		// the pointer to the nudge gesture instead of orbiting the camera.
		if (calibrateActive) { dragging = false; return; }
		if (!dragging || e.pointerId !== downId) return;
		cameraYaw   -= (e.clientX - lastX) * 0.005;
		cameraPitch  = Math.max(PITCH_MIN, Math.min(PITCH_MAX, cameraPitch - (e.clientY - lastY) * 0.0035));
		lastX = e.clientX; lastY = e.clientY;
	};
	const onUp = e => {
		if (e.pointerId !== downId) return;
		dragging = false; downId = -1;
		try { canvas.releasePointerCapture?.(e.pointerId); } catch {}
	};
	canvas.addEventListener('pointermove', onMove);
	canvas.addEventListener('pointerup',     onUp);
	canvas.addEventListener('pointercancel', onUp);
}

// ── Avatar loading ────────────────────────────────────────────────────────
const animMgr = new AnimationManager();
let avatar = null, avatarYaw = 0, avatarLean = 0, currentMotion = 'idle';
let _currentAvatarId = null;
let _currentAgentId  = null;

function _clearAvatar() {
	if (avatar) {
		avatarRig.remove(avatar);
		avatar = null;
	}
	animMgr.detach();
}

async function loadAvatar(idOrUrl, nameOverride) {
	// Resolve id/url — accepts: null (default), a UUID (look up), a direct URL
	const id  = idOrUrl !== undefined ? idOrUrl : avatarIdParam;
	// Track the active avatar for session persistence
	if (id && !/^https?:\/\//.test(id) && !id.startsWith('/')) _currentAvatarId = id;
	let avatarName = nameOverride || 'Your Avatar';
	let glbUrl     = resolveAvatarUrl(typeof idOrUrl === 'string' && /^https?:\/\/|^\//.test(idOrUrl) ? idOrUrl : id);

	// Fetch metadata only when id is a DB UUID (not already a URL)
	_currentAgentId = null;
	if (id && !/^https?:\/\//.test(id) && !id.startsWith('/')) {
		try {
			const res = await fetch(`/api/avatars/${encodeURIComponent(id)}`);
			if (res.ok) {
				const { avatar: meta } = await res.json();
				if (meta?.name && !nameOverride) avatarName = meta.name;
				if (meta?.url)  glbUrl = meta.url;
				if (meta?.agent_id) _currentAgentId = meta.agent_id;
			}
		} catch {}
	}

	nameEl.textContent = avatarName;
	document.title     = `${avatarName} IRL · three.ws`;

	setStatus('Loading avatar…', { loading: true, sticky: true });

	_clearAvatar();

	const loader = new GLTFLoader();
	const gltf   = await loader.loadAsync(glbUrl);
	avatar = gltf.scene;
	avatar.traverse(n => {
		if (n.isMesh) {
			n.castShadow = true;
			if (n.material?.envMapIntensity !== undefined) n.material.envMapIntensity = 0.85;
		}
	});
	const box = new Box3().setFromObject(avatar);
	avatar.position.y -= box.min.y;
	avatarRig.add(avatar);

	const height = Math.max(0.5, box.max.y - box.min.y);
	CAM_OFFSET.set(0, height * 1.05, height * 1.95);
	CAM_LOOK_OFFSET.set(0, height * 0.6, 0);
	applyCameraImmediate();

	animMgr.attach(avatar);
	const manifest = await fetch(ANIMATIONS_MANIFEST_URL, { cache: 'force-cache' }).then(r => {
		if (!r.ok) throw new Error(`HTTP ${r.status}`);
		return r.json();
	});
	const needed = manifest.filter(d => [CLIP_IDLE, CLIP_WALK, CLIP_RUN].includes(d.name));
	if (!needed.length) throw new Error('Animation manifest missing required clips');
	animMgr.setAnimationDefs(needed);
	await animMgr.loadAll();
	await animMgr.crossfadeTo(CLIP_IDLE, 0.0);
	currentMotion = 'idle';

	// Unlock the camera hero button now that the avatar is ready
	cameraBtn.disabled = false;
	cameraBtn.removeAttribute('aria-busy');
	setStatus(null);
	_saveSession();
}

// ── Avatar picker ─────────────────────────────────────────────────────────
const irlAvatarPicker = createAvatarPicker({
	onSelect: async ({ id, url, name }) => {
		_currentAvatarId = id;
		// Update URL so sharing reflects the choice
		const sp = new URLSearchParams(location.search);
		if (id) sp.set('avatar', id); else sp.delete('avatar');
		history.replaceState(null, '', location.pathname + (sp.toString() ? '?' + sp : ''));
		try {
			// Pass UUID id (not the CDN url) so loadAvatar fetches metadata
			// and captures agent_id for pin attribution (task-06).
			await loadAvatar(id || url, name);
		} catch (err) {
			log.error('[irl] avatar swap failed:', err);
			setStatus(`Couldn't load avatar: ${err?.message ?? err}`, { error: true, sticky: true });
		}
	},
});

if (avatarBtn) {
	avatarBtn.addEventListener('click', () => irlAvatarPicker.open(_currentAvatarId));
}

// ── Device orientation (gyro world-lock) ──────────────────────────────────
// When the avatar is locked in AR mode, device rotation drives the Three.js
// camera so the avatar appears pinned to a real-world location as the user
// physically rotates their phone — Pokémon GO style.
let lastDevAlpha = 0, lastDevBeta = 90;
let devOrientBaseAlpha    = null; // null = inactive
let devOrientBaseBeta     = null;
let devOrientBaseCamYaw   = 0;
let devOrientBaseCamPitch = 0;
let prefersAbsOrientation = false;

function onDeviceOrientation(e) {
	const a = e.alpha ?? 0;
	const b = e.beta  ?? 90;
	lastDevAlpha = a;
	lastDevBeta  = b;
	if (!avatarLocked || !arActive || devOrientBaseAlpha === null) return;
	// Delta from baseline — handle 0/360 wrap on alpha
	let dAlpha = a - devOrientBaseAlpha;
	if (dAlpha > 180)  dAlpha -= 360;
	if (dAlpha < -180) dAlpha += 360;
	cameraYaw   = devOrientBaseCamYaw   + dAlpha * (Math.PI / 180);
	cameraPitch = Math.max(PITCH_MIN, Math.min(PITCH_MAX,
		devOrientBaseCamPitch - (b - devOrientBaseBeta) * (Math.PI / 180)));
}

// Prefer absolute (compass-referenced) over page-relative orientation
window.addEventListener('deviceorientationabsolute', e => {
	prefersAbsOrientation = true;
	onDeviceOrientation(e);
}, true);
window.addEventListener('deviceorientation', e => {
	if (prefersAbsOrientation) return;
	onDeviceOrientation(e);
}, true);

// ── Avatar lock ───────────────────────────────────────────────────────────
let avatarLocked = false;

async function setLocked(next) {
	// iOS 13+ requires a user-gesture permission for DeviceOrientationEvent.
	// A declined prompt rejects (or returns 'denied') — either way the gyro
	// world-lock can't work, so surface the designed recovery state instead of
	// silently locking a glued, sensor-less avatar.
	if (next && typeof DeviceOrientationEvent?.requestPermission === 'function') {
		let perm = 'denied';
		try {
			perm = await DeviceOrientationEvent.requestPermission();
		} catch (err) {
			log.error('[irl] orientation permission:', err);
		}
		if (perm !== 'granted') {
			showMotionPermissionHelp();
			return;
		}
	}
	avatarLocked = next;
	if (lockBtn) {
		lockBtn.setAttribute('aria-pressed', String(next));
		lockBtn.classList.toggle('is-active', next);
		lockBtn.querySelector('.irl-lock-label').textContent = next ? 'Pinned' : 'Pin here';
	}
	if (arActive) {
		if (next) {
			// Capture baseline orientation — gyro deltas from here drive the camera
			devOrientBaseAlpha    = lastDevAlpha;
			devOrientBaseBeta     = lastDevBeta;
			devOrientBaseCamYaw   = cameraYaw;
			devOrientBaseCamPitch = cameraPitch;
			arFrozenCamPos  = null;
			arFrozenCamLook = null;
			document.body.classList.add('is-locked');

			// GPS: anchor the avatar to real-world coordinates. If the first fix
			// isn't in yet, defer the precise pin to it (onGPSPosition) rather than
			// dropping the agent at a default origin — locking still works locally.
			if (gpsState.ready) {
				anchorGpsPin();
			} else {
				_pendingGpsLock = true;
				setStatus('Waiting for location to pin precisely…', { loading: true, sticky: true });
			}
		} else {
			devOrientBaseAlpha = null;
			_pendingGpsLock = false;
			arFrozenCamPos  = camera.position.clone();
			arFrozenCamLook = camLookCurrent.clone();
			document.body.classList.remove('is-locked');
			document.body.classList.remove('gps-mode');

			// Remove the GPS pin
			if (gpsPin?.id) {
				fetch(`/api/irl/pins?id=${gpsPin.id}&deviceToken=${_deviceToken}`, { method: 'DELETE' }).catch(() => {});
			}
			gpsPin = null;
			gpsModeActive = false;
		}
	}
	// In AR the lock path owns its own status — the deferred-GPS "Waiting…",
	// the no-compass warning, and the final "Pinned facing …" from commitPin —
	// so don't clobber it here. Only the non-AR orbit lock and unlock fall through.
	if (!arActive) setStatus(next ? 'Agent pinned — drag to orbit' : 'Agent unpinned');
	else if (!next) setStatus('Agent unpinned');
	_saveSession();
}

if (lockBtn) {
	lockBtn.addEventListener('click', () => setLocked(!avatarLocked));
}

// ── Designed guidance sheet ───────────────────────────────────────────────
// iOS Safari has no WebXR, so the whole world-lock rides on motion + GPS
// permissions. When one is missing, a silent no-op leaves the user staring at
// a glued avatar with no idea why — so surface a recoverable state with the
// exact Settings path and a re-tap that re-requests the permission.
const errorSheet     = document.getElementById('irl-error-sheet');
const errorTitleEl   = document.getElementById('irl-error-title');
const errorBodyEl    = document.getElementById('irl-error-body');
const errorActionEl  = document.getElementById('irl-error-action');
const errorDismissEl = document.getElementById('irl-error-dismiss');
let _errorAction = null;

function showErrorState({ title, body, actionLabel, onAction }) {
	if (!errorSheet) { setStatus(title, { error: true, sticky: true }); return; }
	errorTitleEl.textContent = title;
	errorBodyEl.textContent  = body;
	_errorAction = onAction || null;
	if (onAction) {
		errorActionEl.textContent = actionLabel || 'Try again';
		errorActionEl.hidden = false;
	} else {
		errorActionEl.hidden = true;
	}
	errorSheet.classList.add('is-open');
}

function hideErrorState() {
	if (errorSheet) errorSheet.classList.remove('is-open');
	_errorAction = null;
}

if (errorActionEl) errorActionEl.addEventListener('click', () => {
	const fn = _errorAction;
	hideErrorState();
	if (fn) fn();
});
if (errorDismissEl) errorDismissEl.addEventListener('click', hideErrorState);

function showMotionPermissionHelp() {
	showErrorState({
		title: 'Motion access needed to pin',
		body: 'Pinning your agent in real space uses your phone’s motion & orientation sensors. Turn them on in Settings › Safari › Motion & Orientation Access, then tap Try again.',
		actionLabel: 'Try again',
		onAction: () => setLocked(true),
	});
}

// ── GPS world-anchor system ───────────────────────────────────────────────
//
// When the user pins their agent we record the GPS latitude/longitude of that
// real-world spot. From then on the avatar's 3D position is derived from the
// delta between the user's current GPS and the pin's GPS. As they walk away
// the avatar appears smaller (perspective); as they turn, the existing gyro
// system already rotates the camera so the agent stays locked to real-world
// direction — Pokémon GO style, but for 3D AI agents.
//
// Coordinate system: North = −Z  ·  East = +X  ·  Y = up  ·  1 unit = 1 m.

const EYE_HEIGHT = 1.6; // metres — camera height in GPS pin mode

let _deviceToken = localStorage.getItem('irl_device_token');
if (!_deviceToken) {
	_deviceToken = crypto.randomUUID();
	localStorage.setItem('irl_device_token', _deviceToken);
}

const gpsState = { lat: null, lng: null, ready: false, watchId: null, accuracy: null, altitude: null };
let gpsPin = null;        // { lat, lng, id?, heightM } — the user's own anchored pin
let gpsModeActive = false;
// True when the user locked before the first GPS fix landed: onGPSPosition()
// finishes the anchor the instant a fix arrives, instead of pinning at origin.
let _pendingGpsLock = false;

function gpsToWorld(agentLat, agentLng) {
	if (!gpsState.ready) return new Vector3(0, 0, 0);
	const mLat = 110540;
	const mLng = 111320 * Math.cos(gpsState.lat * (Math.PI / 180));
	return new Vector3(
		(agentLng - gpsState.lng) * mLng,   // east  = +X
		0,
		-(agentLat - gpsState.lat) * mLat,  // north = −Z
	);
}

// ── Cross-user anchor consistency (A3) ──────────────────────────────────────
// Foreign pins render from the placement's OWN stored absolute pose — compass
// yaw + floor height — not the viewer's incidental facing. Because both the
// placing device and every viewer reference absolute compass yaw and a shared
// geodetic (lat/lng) frame, the agent lands in the same bearing and floor spot
// for everyone. anchor_yaw_deg / anchor_height_m fall back to the legacy
// `heading` / ground plane when a pin predates the A2 pose columns.
function pinYawRad(pin) {
	const deg = Number.isFinite(pin.anchor_yaw_deg) ? pin.anchor_yaw_deg
		: (pin.heading != null ? pin.heading : 0);
	return -(deg * Math.PI / 180);
}
function pinHeightM(pin) {
	const h = pin.anchor_height_m;
	// Honour only a small, genuine floor offset — a deliberate calibrate height
	// nudge or a future depth-aware/VPS source. Larger magnitudes are eye-height /
	// session-origin conventions, not a cross-user floor delta, so the agent's feet
	// sit on the viewer's own ground plane (y=0) — the honest default until VPS lands.
	return (Number.isFinite(h) && Math.abs(h) <= 1) ? h : 0;
}

// Low-pass the viewer's GPS origin so anchored agents don't swim as GPS jitters
// frame-to-frame. We smooth the ORIGIN, never the pins. A fix worse than the
// reject threshold is dropped outright; a large jump (real walk or a big
// correction) snaps so the origin can't lag a block behind. Tighter fixes are
// trusted more (higher blend weight).
const ORIGIN_REJECT_M = 35;  // ignore fixes noisier than this (m)
const ORIGIN_SNAP_M   = 50;  // beyond this delta, snap instead of blend (m)
function blendOrigin(prev, fix) {
	const acc = Number.isFinite(fix.accuracy) ? fix.accuracy : 20;
	if (acc > ORIGIN_REJECT_M) return prev;
	const jump = haversineMeters(prev.lat, prev.lng, fix.lat, fix.lng);
	if (jump > ORIGIN_SNAP_M) return { lat: fix.lat, lng: fix.lng };
	const k = Math.min(0.4, 12 / acc);
	return {
		lat: prev.lat + (fix.lat - prev.lat) * k,
		lng: prev.lng + (fix.lng - prev.lng) * k,
	};
}

let _lastNearbyFetch = 0;
const NEARBY_RADIUS   = 150; // metres
const NEARBY_INTERVAL = 15000; // ms

function onGPSPosition(pos) {
	const wasReady = gpsState.ready;
	const rawLat = pos.coords.latitude;
	const rawLng = pos.coords.longitude;
	// Retain sensor metadata so a placement records how trustworthy the fix was
	// (A2 anchor pose). accuracy is metres of horizontal error; altitude is the
	// WGS-84 height above the ellipsoid (null where the device can't measure it).
	gpsState.accuracy = pos.coords.accuracy ?? null;
	gpsState.altitude = pos.coords.altitude ?? null;
	// Low-pass the viewer origin (A3) so anchored agents don't swim; the first fix
	// seeds the filter, later fixes are blended by blendOrigin().
	if (!wasReady) {
		gpsState.lat = rawLat;
		gpsState.lng = rawLng;
	} else {
		const blended = blendOrigin(
			{ lat: gpsState.lat, lng: gpsState.lng },
			{ lat: rawLat, lng: rawLng, accuracy: gpsState.accuracy },
		);
		gpsState.lat = blended.lat;
		gpsState.lng = blended.lng;
	}
	gpsState.ready    = true;

	// First fix: GPS is live, so the user can place + manage pins from here.
	if (!wasReady) revealMyPinsBtn();

	// A lock was requested before the first fix — finish anchoring now that we
	// have real coordinates, rather than dropping the agent at a default origin.
	if (_pendingGpsLock && avatarLocked && arActive) {
		_pendingGpsLock = false;
		anchorGpsPin();
	}

	// A WebXR floor anchor was placed before this first fix — persist its pin now.
	// The XRAnchor already holds the agent in the room; this lands the durable,
	// shareable record it couldn't save without coordinates.
	if (_pendingXrAnchorPose) {
		const pose = _pendingXrAnchorPose;
		_pendingXrAnchorPose = null;
		persistFloorAnchor(pose);
	}

	// Move pinned avatar to its GPS-anchored world position. anchor_height_m (A2)
	// keeps the feet on the ground plane on slopes / indoors — 0 today, but read
	// it back so future floor-corrected placements render at the right height.
	if (gpsPin) {
		const wp = gpsToWorld(gpsPin.lat, gpsPin.lng);
		avatarRig.position.set(wp.x, gpsPin.heightM ?? 0, wp.z);
	}

	// Update world positions of all nearby agents. Because each agent's world
	// position is in metres relative to the user at the origin, its live
	// distance is simply hypot(x, z) — so recompute it every fix (the server's
	// distance_m goes stale the moment the user moves) and lazily upgrade the
	// glowing beacon to the real GLB the instant the user walks within range.
	for (const p of nearbyPins) {
		if (!p.group) continue;
		// The agent being calibrated is driven by the nudge gesture this frame, not
		// by GPS — re-apply its working pose against the (possibly shifted) origin.
		if (calibrateActive && _cal && _cal.pin === p) { applyCalToGroup(); updatePinRing(p); continue; }
		const wp = gpsToWorld(p.lat, p.lng);
		p.group.position.set(wp.x, pinHeightM(p), wp.z);
		p.distance_m = Math.round(Math.hypot(wp.x, wp.z));
		updatePinRing(p);
		maybeLoadPinGLB(p);
	}

	const now = Date.now();
	if (now - _lastNearbyFetch > NEARBY_INTERVAL) {
		_lastNearbyFetch = now;
		loadNearbyPins();
	}
}

// Build the GPS world-anchor for the freshly locked own avatar and open the
// caption panel to persist its A2 pose. Requires a live GPS fix — setLocked()
// calls this directly when one is ready, or defers it here via _pendingGpsLock
// until onGPSPosition() lands the first fix.
function anchorGpsPin() {
	const mLat = 110540;
	const mLng = 111320 * Math.cos(gpsState.lat * (Math.PI / 180));
	const pinLat = gpsState.lat + (-avatarRig.position.z / mLat);
	const pinLng = gpsState.lng + ( avatarRig.position.x / mLng);
	gpsModeActive = true;
	document.body.classList.add('gps-mode');
	const headingDeg = ((cameraYaw * 180 / Math.PI) % 360 + 360) % 360;
	// Snap the avatar to face the heading we're about to store so it matches how
	// nearby users will see it — spawnNearbyPin() rotates foreign avatars with the
	// same -(heading) → Y mapping. Keeping avatarYaw in sync means a later
	// unlock+walk lerps from here too.
	avatarYaw = -(headingDeg * Math.PI / 180);
	avatarRig.quaternion.setFromAxisAngle(upY, avatarYaw);
	// Dead-reckoning is only consistent across users when the heading is absolute
	// (compass-referenced). With only page-relative orientation the agent still
	// locks locally, but cross-user bearing (A3) degrades — record the distinction
	// in anchor_source (':rel') so A3 can down-weight it, and warn the user.
	const source = prefersAbsOrientation ? 'gyro-gps' : 'gyro-gps:rel';
	if (!prefersAbsOrientation) {
		setStatus('Compass heading unavailable — others may see this agent rotated', { warn: true });
	}
	openCaptionPanel(pinLat, pinLng, headingDeg, source);
}

function onGPSError(err) {
	// Only intervene when a placement is actively waiting on a fix — otherwise a
	// transient watchPosition timeout shouldn't disturb a working session.
	if (!_pendingGpsLock) return;
	_pendingGpsLock = false;
	const denied = err && err.code === err.PERMISSION_DENIED;
	showErrorState({
		title: denied ? 'Location access needed to pin' : 'Couldn’t get your location',
		body: denied
			? 'Pinning your agent to a real spot needs your location. Enable it in Settings › Safari › Location, then tap Try again.'
			: 'We couldn’t read a GPS fix to pin precisely. Move somewhere with a clearer view of the sky, then tap Try again.',
		actionLabel: 'Try again',
		onAction: () => setLocked(true),
	});
}

function initGPS() {
	if (!navigator.geolocation) return;
	gpsState.watchId = navigator.geolocation.watchPosition(
		onGPSPosition,
		onGPSError,
		{ enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 },
	);
}

function compassLabel(deg) {
	const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
	return dirs[Math.round(((deg % 360) + 360) % 360 / 45) % 8];
}

async function savePin(lat, lng, heading = 0, caption = '', anchor = null) {
	try {
		// Anchor pose (A2): a reproducible record of where the agent stands —
		// floor height, orientation, and how trustworthy this GPS fix was — so a
		// later session or another user can reconstruct the placement. accuracy /
		// altitude always come from the live fix; heightM / yawDeg / quat / source
		// come from the placement mode (gyro-gps today, webxr later).
		const a = anchor || {};
		const anchorBody = {
			heightM:      Number.isFinite(a.heightM) ? a.heightM : null,
			yawDeg:       Number.isFinite(a.yawDeg)  ? a.yawDeg  : ((Math.round(heading) % 360) + 360) % 360,
			quat:         Array.isArray(a.quat) ? a.quat : null,
			gpsAccuracyM: gpsState.accuracy,
			altitudeM:    gpsState.altitude,
			// 'webxr' (A1) · 'gyro-gps' (absolute compass) · 'gyro-gps:rel'
			// (page-relative heading — A3 down-weights its cross-user bearing).
			source:       a.source === 'webxr' ? 'webxr'
				: a.source === 'gyro-gps:rel' ? 'gyro-gps:rel' : 'gyro-gps',
		};
		const r = await fetch('/api/irl/pins', {
			method: 'POST',
			credentials: 'include',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				lat, lng,
				heading:     Math.round(heading) % 360,
				caption:     caption || null,
				avatarUrl:   resolveAvatarUrl(_currentAvatarId),
				avatarName:  nameEl.textContent,
				deviceToken: _deviceToken,
				agentId:     _currentAgentId || null,
				anchor:      anchorBody,
			}),
		});
		if (!r.ok) return null;
		const data = await r.json();
		return data.pin ? { id: data.pin.id, permanent: !!data.pin.permanent } : null;
	} catch { return null; }
}

// ── Caption panel (pre-save) ──────────────────────────────────────────────

const captionPanel   = document.getElementById('irl-caption-panel');
const captionInput   = document.getElementById('irl-caption-input');
const captionConfirm = document.getElementById('irl-caption-confirm');
const captionCancel  = document.getElementById('irl-caption-cancel');

function openCaptionPanel(pinLat, pinLng, headingDeg, source = 'gyro-gps') {
	if (!captionPanel) {
		commitPin(pinLat, pinLng, headingDeg, '', source);
		return;
	}
	captionInput.value = '';
	captionPanel.classList.add('is-open');
	setTimeout(() => captionInput.focus(), 300);
	captionConfirm.onclick = () => {
		captionPanel.classList.remove('is-open');
		commitPin(pinLat, pinLng, headingDeg, captionInput.value.trim(), source);
	};
	captionCancel.onclick = () => {
		captionPanel.classList.remove('is-open');
		setLocked(false);
	};
}

function commitPin(pinLat, pinLng, headingDeg, caption, source = 'gyro-gps') {
	gpsPin = { lat: pinLat, lng: pinLng, heightM: 0 };
	// Gyro-GPS placement pose (A2/A3): the agent stands on the floor. anchor_height_m
	// is a floor-relative offset, and gyro placement has no measured floor depth, so
	// it's 0 — every viewer renders the feet on their own ground plane (pinHeightM).
	// yawDeg is the absolute compass heading; source carries the absolute-vs-relative
	// distinction ('gyro-gps' | 'gyro-gps:rel') for A3. accuracy / altitude are filled
	// from the live GPS fix inside savePin().
	const anchor = { heightM: 0, yawDeg: headingDeg, source };
	savePin(pinLat, pinLng, headingDeg, caption, anchor).then(result => {
		if (result && gpsPin) {
			gpsPin.id = result.id;
			_myPinIds.add(result.id);
			const dir = compassLabel(headingDeg);
			setStatus(result.permanent
				? `Pinned facing ${dir} — permanently visible to nearby users`
				: `Pinned facing ${dir} — others nearby can see you for 7 days`);
			revealMyPinsBtn();
		}
	});
}

// ── WebXR floor anchor (A1) ────────────────────────────────────────────────
//
// On WebXR-capable devices (primarily Android Chrome) the user taps a real
// floor point through a hit-test reticle; the agent binds to a real XRAnchor
// so it stays glued to that world point as the phone moves — no GPS jitter, no
// camera-relative slide. The anchored local pose is converted to a GPS pin and
// persisted through savePin() (A2) so it reloads near the same spot and nearby
// users can see it. iOS Safari (no immersive-ar) never reaches here and stays
// on the gyro+GPS Pin path (A4).

// Viewer shim — the minimal interface WebXRSession drives (see src/xr.js for the
// canonical shape). `content` is the positioned avatar group the anchor glues to.
const xrViewer = {
	renderer,
	scene,
	content: avatarRig,
	controls: { enabled: true },   // stub: IRL drives its own camera, not OrbitControls
	mixer: null,                   // animMgr.update() already advances the mixer — avoid double-stepping
	animationManager: animMgr,
	_afterAnimateHooks: [],
	_rafId: null,
	prevTime: null,
	activeCamera: camera,
	_needsRender: true,
	_updateRenderLoop() { startTick(); },
};

// Single owner of the IRL render loop's RAF handle so WebXRSession can pause it
// (cancelAnimationFrame on xrViewer._rafId) while the XR animation loop runs,
// then resume it on exit via _updateRenderLoop().
function startTick() {
	if (xrViewer._rafId !== null) return;
	xrViewer._rafId = requestAnimationFrame(tick);
}

let xrSession = null;
// A floor anchor placed before the first GPS fix — held here and persisted the
// instant onGPSPosition() lands real coordinates (mirrors _pendingGpsLock for the
// gyro path). The in-session XRAnchor already glues the agent; this rescues its
// durable, shareable pin from a quick tap during GPS warm-up.
let _pendingXrAnchorPose = null;

async function detectFloorAnchorSupport() {
	try {
		if (!(await WebXRSession.isSupported())) return; // iOS Safari / desktop → Pin path only
		if (anchorBtn) anchorBtn.hidden = false;
	} catch {
		// No navigator.xr or a thrown support check → leave the entry hidden; the
		// Pin button (A4 gyro+GPS) remains the anchor path. No console noise.
	}
}

function setXrHint(text) {
	if (xrHintEl) {
		xrHintEl.textContent = text;
		xrHintEl.hidden = false;
	}
}

function clearXrError() {
	const mount = $('irl-xr-error');
	if (mount) { mount.replaceChildren(); mount.hidden = true; }
}

function showXrError(err) {
	const denied = err?.name === 'NotAllowedError' || err?.name === 'SecurityError';
	const body = denied
		? 'Camera and motion access are needed to place your agent on the floor. Allow them in your browser, then retry — or use Pin here for compass + GPS placement.'
		: 'Your device couldn’t hold an AR session. Retry, or use Pin here to place with compass + GPS instead.';
	const mount = $('irl-xr-error');
	if (xrOverlay && mount) {
		if (xrHintEl) xrHintEl.hidden = true;
		mount.replaceChildren(errorStateEl({
			title: 'Floor anchoring couldn’t start',
			body,
			actions: [
				{ label: 'Retry', id: 'xr-retry', primary: true },
				{ label: 'Use Pin instead', id: 'xr-pin' },
			],
		}));
		mount.hidden = false;
		xrOverlay.hidden = false;
	} else {
		setStatus('Floor anchoring couldn’t start — use Pin here instead', { error: true, sticky: true });
	}
}

async function enterFloorAnchor() {
	if (xrSession) { await xrSession.end(); return; }
	// immersive-ar owns the rear camera and the full screen; release the
	// getUserMedia passthrough first so the two don't contend for the camera.
	if (arActive) disableAR();

	clearXrError();
	if (anchorBtn) anchorBtn.classList.add('is-active');
	if (xrOverlay) xrOverlay.hidden = false;
	setXrHint('Point at the floor and move your phone slowly');

	try {
		xrSession = new WebXRSession(xrViewer, {
			domOverlayRoot: xrOverlay,
			onHit: (has) => setXrHint(has
				? 'Tap to place your agent on the floor'
				: 'Point at the floor and move your phone slowly'),
			onAnchored: (pose) => onFloorAnchored(pose),
			onEnd: () => {
				xrSession = null;
				// Drop any anchor still waiting on a GPS fix — the user left this
				// placement, so don't surprise them with a pin saved after they walk
				// away (parity with the gyro path's arActive gate).
				_pendingXrAnchorPose = null;
				// WebXRSession restores an opaque clear color on exit; IRL renders
				// over the page gradient with a transparent canvas — put that back.
				renderer.setClearColor(0x000000, 0);
				if (!arActive) scene.background = null;
				if (anchorBtn) anchorBtn.classList.remove('is-active');
				if (xrOverlay) xrOverlay.hidden = true;
			},
		});
		await xrSession.start();
		setStatus('Floor anchoring on — point at the floor, then tap to place');
	} catch (err) {
		log.error('[irl] WebXR start failed:', err);
		xrSession = null;
		if (anchorBtn) anchorBtn.classList.remove('is-active');
		showXrError(err);
	}
}

// Yaw (rotation about world Y), in degrees clockwise from the local −Z axis —
// the same convention savePin stores and spawnNearbyPin reads back.
function yawFromQuat(q) {
	const siny = 2 * (q.w * q.y + q.z * q.x);
	const cosy = 1 - 2 * (q.y * q.y + q.x * q.x);
	return Math.atan2(siny, cosy) * 180 / Math.PI;
}

// Entry point for a placed floor anchor: persist it now if we have a GPS fix,
// otherwise hold the pose until the first fix lands. The in-session XRAnchor
// already glues the agent either way — this only governs the durable pin.
function onFloorAnchored(pose) {
	if (!gpsState.ready) {
		// The anchor still glues the agent in-session; we just can't convert it to a
		// GPS pin yet. Hold the pose and finish the save the moment the first fix
		// lands (onGPSPosition) rather than dropping it — a quick tap during GPS
		// warm-up should still persist, not vanish.
		_pendingXrAnchorPose = pose;
		setXrHint('Anchored here — saving this spot once your location locks in');
		return;
	}
	persistFloorAnchor(pose);
}

// Convert the anchored local-space pose to a GPS pin and persist it (A2) — the
// durable, shareable record beyond the in-session XRAnchor. Horizontal offset →
// lat/lng uses the same metre-per-degree math as the gyro Pin path (local −Z =
// north, +X = east); height + yaw + GPS-fit trust ride along in the anchor object.
// Split out so onGPSPosition() can replay a pose captured before the first fix.
function persistFloorAnchor(pose) {
	const { position, quaternion } = pose;
	const mLat = 110540;
	const mLng = 111320 * Math.cos(gpsState.lat * (Math.PI / 180));
	const pinLat = gpsState.lat + (-position.z / mLat);
	const pinLng = gpsState.lng + ( position.x / mLng);
	const heading = ((Math.round(yawFromQuat(quaternion)) % 360) + 360) % 360;

	gpsPin = { lat: pinLat, lng: pinLng };
	gpsModeActive = true;
	setXrHint('Anchored — walk around, it stays put');
	savePin(pinLat, pinLng, heading, '', {
		heightM: position.y,        // floor height relative to the eye-level session origin (negative = below)
		yawDeg:  heading,
		quat:    [quaternion.x, quaternion.y, quaternion.z, quaternion.w],
		source:  'webxr',
	}).then(result => {
		if (result && gpsPin) {
			gpsPin.id = result.id;
			revealMyPinsBtn();
			setXrHint(result.permanent
				? 'Anchored & saved — permanently visible to nearby users'
				: 'Anchored & saved — nearby users can see you for 7 days');
		} else {
			setXrHint('Anchored here — couldn’t save the pin, retry on exit');
		}
	});
}

if (anchorBtn) anchorBtn.addEventListener('click', enterFloorAnchor);
if (xrExitBtn) xrExitBtn.addEventListener('click', () => { xrSession?.end(); });
// Taps on the overlay chrome (hint, exit, error actions) must not also fire the
// XR 'select' that places an anchor.
if (xrOverlay) {
	xrOverlay.addEventListener('beforexrselect', (e) => e.preventDefault());
	xrOverlay.addEventListener('click', (e) => {
		const action = e.target.closest('[data-sk-action]')?.dataset.skAction;
		if (action === 'xr-retry') { clearXrError(); enterFloorAnchor(); }
		else if (action === 'xr-pin') { clearXrError(); xrOverlay.hidden = true; setLocked(true); }
	});
}

// ── Nearby agents ─────────────────────────────────────────────────────────
let nearbyPins = []; // [{ id, lat, lng, avatar_url, avatar_name, caption, x402_endpoint, distance_m, group, labelEl, glbLoaded }]

async function loadNearbyPins() {
	if (!gpsState.ready) return;
	try {
		const r = await fetch(
			`/api/irl/pins?lat=${gpsState.lat}&lng=${gpsState.lng}&radius=${NEARBY_RADIUS}`,
		);
		if (!r.ok) return;
		const { pins } = await r.json();

		const incoming = pins.filter(p => !gpsPin?.id || p.id !== gpsPin.id);
		const inIds    = new Set(incoming.map(p => p.id));

		// Remove disappeared pins — dispose their GPU resources, don't just
		// detach. At a busy location agents come and go constantly; without
		// freeing geometries/materials/textures a long session leaks steadily.
		nearbyPins = nearbyPins.filter(p => {
			if (inIds.has(p.id)) return true;
			if (p.group)   { scene.remove(p.group); disposeObject3D(p.group); }
			if (p.labelEl) p.labelEl.remove();
			return false;
		});

		// Spawn new arrivals
		for (const pin of incoming) {
			if (!nearbyPins.find(n => n.id === pin.id)) {
				const entry = { ...pin, group: null, labelEl: null, glbLoaded: false };
				nearbyPins.push(entry);
				spawnNearbyPin(entry);
			}
		}

		updateNearbyBadge();

		// Flash pin label if ?highlight= matches
		if (highlightPinId) {
			const target = nearbyPins.find(p => p.id === highlightPinId);
			if (target?.labelEl) {
				target.labelEl.style.transition = 'background .2s, color .2s';
				target.labelEl.style.background = 'rgba(139,92,246,0.9)';
				target.labelEl.style.color = '#fff';
				setTimeout(() => {
					if (target.labelEl) {
						target.labelEl.style.background = '';
						target.labelEl.style.color = '';
					}
				}, 2500);
			}
		}
	} catch {}
}

// ── Confidence ring (A3) ────────────────────────────────────────────────────
// A flat ground ring under each agent whose radius communicates the REAL GPS
// uncertainty (max of the viewer's live accuracy and the pin's stored
// gps_accuracy_m). Honest by design: consumer GPS is ~5–15 m open-sky and far
// worse in urban canyons / indoors, so we never imply a centimetre-perfect
// pinpoint. Amber when the lock is loose (> RING_LOW_ACC_M).
const RING_LOW_ACC_M = 25;   // above this, the ring goes amber + copy warns
const RING_MIN_M     = 1.4;  // floor radius so a tight fix is still visible
const RING_MAX_M     = 10;   // cap render radius so a loose fix doesn't swallow the scene
const RING_OK_COLOR  = 0x4cc9ff;
const RING_LOW_COLOR = 0xffb020;

// (Re)create the ring mesh on a pin's group. Called on spawn and again after a
// GLB swap (which disposes all group children, ring included).
function attachPinRing(pin) {
	if (!pin.group) return;
	if (pin.ringMesh) { pin.group.remove(pin.ringMesh); disposeObject3D(pin.ringMesh); pin.ringMesh = null; }
	// Unit-radius torus laid flat on the ground; scaled by updatePinRing().
	const ring = new Mesh(
		new TorusGeometry(1, 0.045, 8, 64),
		new MeshStandardMaterial({
			color: RING_OK_COLOR, emissive: RING_OK_COLOR, emissiveIntensity: 0.9,
			roughness: 0.4, metalness: 0, transparent: true, opacity: 0.55, depthWrite: false,
		}),
	);
	ring.rotation.x = Math.PI / 2;
	ring.position.y = 0.02;
	ring.renderOrder = 2;
	pin.group.add(ring);
	pin.ringMesh = ring;
}

// Size + colour the ring from the worse of viewer / pin accuracy. Cheap; called
// every GPS fix (viewer accuracy changes) and once on spawn.
function updatePinRing(pin) {
	const ring = pin.ringMesh;
	if (!ring) return;
	const viewerAcc = Number.isFinite(gpsState.accuracy) ? gpsState.accuracy : 12;
	const pinAcc    = Number.isFinite(pin.gps_accuracy_m) ? pin.gps_accuracy_m : viewerAcc;
	const acc       = Math.max(viewerAcc, pinAcc);
	const radius    = Math.min(RING_MAX_M, Math.max(RING_MIN_M, acc));
	ring.scale.set(radius, radius, 1);
	const low = acc > RING_LOW_ACC_M;
	const m = ring.material;
	m.color.setHex(low ? RING_LOW_COLOR : RING_OK_COLOR);
	m.emissive.setHex(low ? RING_LOW_COLOR : RING_OK_COLOR);
	m.opacity = low ? 0.62 : 0.5;
}

function spawnNearbyPin(pin) {
	const g  = new Group();
	const wp = gpsToWorld(pin.lat, pin.lng);
	// Absolute stored pose (A3): floor height + compass yaw, so two devices at the
	// same place see the agent in the same spot and bearing (see pinYawRad/pinHeightM).
	g.position.set(wp.x, pinHeightM(pin), wp.z);
	g.rotation.y = pinYawRad(pin);

	// Glowing beacon placeholder (replaced by real GLB when close)
	const beacon = new Mesh(
		new SphereGeometry(0.22, 24, 18),
		new MeshPhysicalMaterial({
			color: 0x88bbff, emissive: 0x1a44ff, emissiveIntensity: 0.9,
			metalness: 0.1, roughness: 0.06, transmission: 0.35, thickness: 0.3,
		}),
	);
	beacon.position.y = 1.2;
	beacon.castShadow = true;
	g.add(beacon);
	pin.group = g;
	// Cache the owning pin on the group so a mesh raycast (_pinForObject) maps a
	// hit back to its agent without scanning nearbyPins per node.
	g.userData.pin = pin;
	scene.add(g);

	// Confidence ring (A3) — a ground footprint sized to the real GPS uncertainty
	// so users see the true precision instead of being misled into thinking it's
	// centimetre-perfect. Amber when the lock is loose. Built before the label so
	// the agent reads as "somewhere in here", not a false pinpoint.
	attachPinRing(pin);
	updatePinRing(pin);

	// Floating HTML name label — gold border if this is the owner's own pin
	const el = document.createElement('div');
	el.className   = 'irl-agent-label';
	// Own pin = one this device placed (matched by id via /mine) or the live anchor.
	if (isOwnPin(pin)) {
		el.classList.add('is-own');
	}
	el.style.display = 'none';
	el.innerHTML = `<span class="irl-agent-label-name">${_escHtml(pin.avatar_name || 'Agent')}</span>`;
	el.addEventListener('click', () => openPinSheet(pin));
	document.body.appendChild(el);
	pin.labelEl = el;

	// Load the real GLB if the user is already close; otherwise it upgrades from
	// the beacon automatically as they approach (see maybeLoadPinGLB on GPS fix).
	maybeLoadPinGLB(pin);
}

function _escHtml(s) {
	return String(s ?? '').replace(/[&<>"']/g, c =>
		({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// Recursively free a detached Object3D's GPU resources (geometry, materials,
// and any texture maps on them) so removing a nearby agent doesn't leak.
function disposeObject3D(root) {
	root.traverse(n => {
		if (n.geometry) n.geometry.dispose();
		const mats = Array.isArray(n.material) ? n.material : n.material ? [n.material] : [];
		for (const m of mats) {
			for (const k in m) {
				const v = m[k];
				if (v && v.isTexture) v.dispose();
			}
			m.dispose();
		}
	});
}

// At most this many remote agents render their full GLB at once; the rest stay
// lightweight glowing beacons until the user gets close. Keeps a crowded
// location from loading a dozen rigged models simultaneously.
const MAX_LOADED_GLB = 5;

// Load a pin's real avatar GLB once the user is within range — idempotent, so
// it's safe to call every GPS fix. This is what turns the beacon into the agent
// as you walk up to it.
function maybeLoadPinGLB(pin) {
	if (pin.glbLoaded || pin._glbLoading || !pin.avatar_url) return;
	if (pin.distance_m >= 80) return;
	const loadedCount = nearbyPins.filter(p => p.glbLoaded || p._glbLoading).length;
	if (loadedCount >= MAX_LOADED_GLB) return;
	loadPinGLB(pin);
}

async function loadPinGLB(pin) {
	pin._glbLoading = true;
	try {
		const gltf  = await new GLTFLoader().loadAsync(pin.avatar_url);
		// The pin may have been removed (walked out of range) while the GLB
		// was in flight — free the just-loaded model rather than orphaning it.
		if (!pin.group) { disposeObject3D(gltf.scene); return; }
		const model = gltf.scene;
		model.traverse(n => { if (n.isMesh) n.castShadow = true; });
		const box = new Box3().setFromObject(model);
		model.position.y -= box.min.y;
		// Dispose the placeholder beacon before swapping in the real model.
		while (pin.group.children.length) {
			const child = pin.group.children[0];
			pin.group.remove(child);
			disposeObject3D(child);
		}
		pin.group.add(model);
		pin.glbLoaded = true;
		// Re-apply the stored absolute pose — the GLTF swap (and the dispose loop
		// above, which also removed the confidence ring) reset the group transform.
		pin.group.rotation.y = pinYawRad(pin);
		pin.group.position.y = pinHeightM(pin);
		attachPinRing(pin);
		updatePinRing(pin);

		// Cache the head/torso bone + rest pose once so the per-frame awareness
		// step never walks the tree. baseYaw is the placed heading we ease back to
		// when the viewer leaves; the gaze bone (head preferred, torso fallback)
		// drives the "looks at you" turn. Agents with neither just turn whole-body.
		pin.baseYaw = pin.group.rotation.y;
		pin.headBone = null; pin.spineBone = null;
		model.traverse(n => {
			if (!n.isBone) return;
			const nm = n.name.toLowerCase();
			if (!pin.headBone  && /head|neck/.test(nm))         pin.headBone  = n;
			if (!pin.spineBone && /spine|chest|torso/.test(nm)) pin.spineBone = n;
		});
		pin.restHeadQuat  = pin.headBone  ? pin.headBone.quaternion.clone()  : null;
		pin.restSpineQuat = pin.spineBone ? pin.spineBone.quaternion.clone() : null;
		pin.idleT   = 0;      // idle-drift phase clock
		pin.noticed = false;  // has the viewer already crossed the notice radius?
		pin.noticeT = 0;      // remaining head-slerp boost time after a notice
		pin.popT    = -1;     // perk-up pop clock (-1 = inactive)
	} catch {
		// Allow a later GPS fix to retry the load (transient network/CDN blip).
	} finally {
		pin._glbLoading = false;
	}
}

function updateNearbyBadge() {
	const badge = document.getElementById('irl-nearby-badge');
	if (!badge) return;
	const n = nearbyPins.length;
	badge.textContent = n > 0 ? `${n} nearby` : '';
	badge.hidden = n === 0;
}

// ── My Pins management ────────────────────────────────────────────────────
//
// Anonymous ownership: pins are tied to the localStorage device token, so a
// visitor can browse and delete the pins they placed from this device even
// after a reload — no account needed. The endpoint also unions in any pins the
// user placed while signed in.

const TRASH_SVG = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>';

// Haversine distance in metres between two GPS points
function haversineMeters(lat1, lng1, lat2, lng2) {
	const R = 6371000;
	const dLat = (lat2 - lat1) * Math.PI / 180;
	const dLng = (lng2 - lng1) * Math.PI / 180;
	const a = Math.sin(dLat / 2) ** 2 +
		Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
	return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function relativeTime(iso) {
	const t = new Date(iso).getTime();
	if (!isFinite(t)) return '';
	const secs = Math.max(0, Math.round((Date.now() - t) / 1000));
	if (secs < 60) return 'just now';
	const mins = Math.round(secs / 60);
	if (mins < 60) return `${mins}m ago`;
	const hrs = Math.round(mins / 60);
	if (hrs < 24) return `${hrs}h ago`;
	return `${Math.round(hrs / 24)}d ago`;
}

function _pinMetaLine(p) {
	const parts = [];
	if (gpsState.ready && isFinite(p.lat) && isFinite(p.lng)) {
		parts.push(`${Math.round(haversineMeters(gpsState.lat, gpsState.lng, p.lat, p.lng))}m away`);
	}
	if (p.placed_at) parts.push(relativeTime(p.placed_at));
	if (!p.expires_at) parts.push('permanent');
	return parts.join(' · ');
}

async function loadMyPins() {
	if (!_deviceToken) return [];
	try {
		const r = await fetch(`/api/irl/pins/mine?deviceToken=${encodeURIComponent(_deviceToken)}`, {
			credentials: 'include',
		});
		if (!r.ok) return [];
		const pins = (await r.json()).pins ?? [];
		// Track which nearby pins this device owns so the calibrate affordance (and
		// the gold "your agent" label) light up. The server re-checks ownership on
		// PATCH, so this is purely a client-side gate.
		for (const p of pins) _myPinIds.add(p.id);
		refreshOwnLabels();
		return pins;
	} catch {
		return [];
	}
}

// Re-mark already-spawned nearby labels as own once /mine resolves (the pins may
// have spawned before we knew which were ours).
function refreshOwnLabels() {
	for (const p of nearbyPins) {
		if (p.labelEl) p.labelEl.classList.toggle('is-own', isOwnPin(p));
	}
}

function renderMyPins(pins) {
	const list = document.getElementById('irl-mypins-list');
	if (!list) return;
	if (!pins.length) {
		list.innerHTML = '<p class="irl-mypins-empty">No active pins yet — pin your agent to a real-world spot and it shows up here.</p>';
		return;
	}
	list.innerHTML = pins.map(p => `<div class="irl-pin-row" data-pid="${_escHtml(p.id)}">
		<div class="irl-pin-info">
			<div class="irl-pin-name">${_escHtml(p.avatar_name || 'Agent')}</div>
			${p.caption ? `<div class="irl-pin-caption">${_escHtml(p.caption)}</div>` : ''}
			<div class="irl-pin-meta">${_escHtml(_pinMetaLine(p))}</div>
		</div>
		<button class="irl-pin-del" data-del="${_escHtml(p.id)}" type="button" aria-label="Delete this pin">${TRASH_SVG}</button>
	</div>`).join('');
}

async function openMyPinsSheet() {
	const sheet = document.getElementById('irl-mypins-sheet');
	const list  = document.getElementById('irl-mypins-list');
	if (!sheet || !list) return;
	sheet.classList.add('is-open');
	list.innerHTML = '<p class="irl-mypins-empty">Loading…</p>';
	renderMyPins(await loadMyPins());
}

async function deleteMyPin(id, btn) {
	if (btn) { btn.disabled = true; btn.innerHTML = '…'; }
	const r = await fetch(
		`/api/irl/pins?id=${encodeURIComponent(id)}&deviceToken=${encodeURIComponent(_deviceToken ?? '')}`,
		{ method: 'DELETE', credentials: 'include' },
	).catch(() => null);
	if (!r?.ok) {
		if (btn) { btn.disabled = false; btn.innerHTML = TRASH_SVG; }
		setStatus('Could not delete that pin', { error: true });
		return;
	}
	// If we just deleted the avatar currently anchored in this session, clear it.
	if (gpsPin?.id === id) setLocked(false);

	btn?.closest('.irl-pin-row')?.remove();
	const list = document.getElementById('irl-mypins-list');
	if (list && !list.querySelector('.irl-pin-row')) {
		list.innerHTML = '<p class="irl-mypins-empty">No active pins</p>';
	}
	setStatus('Pin removed');
}

// Reveal the My pins control once GPS is live and this device has a token.
function revealMyPinsBtn() {
	if (!_deviceToken) return;
	const btn = document.getElementById('irl-mypins-btn');
	if (btn) btn.style.display = '';
}

document.getElementById('irl-mypins-btn')?.addEventListener('click', openMyPinsSheet);

document.getElementById('irl-mypins-close')?.addEventListener('click', () => {
	document.getElementById('irl-mypins-sheet')?.classList.remove('is-open');
});

document.getElementById('irl-mypins-list')?.addEventListener('click', (e) => {
	const btn = e.target.closest('[data-del]');
	if (btn) deleteMyPin(btn.dataset.del, btn);
});

// ── Inspect card (v2) helpers ──────────────────────────────────────────────
// Tapping a nearby agent opens a rich card: avatar + name + tier badge, a bio
// line, an on-chain reputation strip, and the paid x402 services the agent
// offers — all from one /api/irl/agent-card aggregation call. Every state
// (skeleton, populated, empty services, no-reputation, error+retry) renders
// through the shared state-kit.

let _cardAbort = null;   // aborts the in-flight agent-card fetch when switching agents
let _activePin = null;   // the pin whose card is shown (drives retry)
let _lastFocus = null;   // element focused before open (restored on close)

// Title-case a tier enum ('trusted' → 'Trusted').
function _tierLabel(tier) {
	return tier ? tier.charAt(0).toUpperCase() + tier.slice(1) : '';
}

// Reputation strip / chip. A real number only when the on-chain asset actually
// has attestations; otherwise an honest "new / unreviewed" chip — never a
// fabricated score.
function _repStripHTML(rep) {
	const hasRep = rep && rep.available && rep.attestation_count > 0;
	if (!hasRep) {
		const label = rep && rep.available
			? 'On-chain · no reviews yet'
			: 'New here · no on-chain reputation yet';
		return `<div class="irl-rep-chip">✦ ${label}</div>`;
	}
	const n = rep.attestation_count;
	const parts = [
		`<span class="irl-rep-star">★</span> <b>${rep.score}</b>/100`,
		`${n} attestation${n === 1 ? '' : 's'}`,
		_tierLabel(rep.tier),
	];
	if (rep.tasks_accepted > 0) {
		parts.push(`${rep.tasks_accepted} task${rep.tasks_accepted === 1 ? '' : 's'} done`);
	}
	return `<div class="irl-rep-strip">${parts.join('<span class="irl-rep-sep">·</span>')}</div>`;
}

// Header tier badge — only when reputation is real (an asset with attestations).
function _setTierBadge(rep) {
	const badge = document.getElementById('irl-sheet-tier');
	if (!badge) return;
	if (rep && rep.available && rep.attestation_count > 0 && rep.tier) {
		badge.textContent = `★ ${rep.score} · ${_tierLabel(rep.tier)}`;
		badge.dataset.tier = rep.tier;
		badge.hidden = false;
	} else {
		badge.hidden = true;
		badge.removeAttribute('data-tier');
	}
}

// Services menu, or a designed empty state when the agent sells nothing.
function _servicesHTML(services) {
	if (!services || !services.length) {
		return emptyStateHTML({
			icon: '',
			title: 'No paid services yet',
			body: 'This agent is here to meet, not to sell.',
			compact: true,
		});
	}
	const rows = services.map((s) => {
		const price = s.price_usd != null
			? `$${Number(s.price_usd).toFixed(2)} ${s.currency || 'USDC'}`
			: 'Free';
		const ep = s.x402_endpoint || '';
		const useBtn = ep
			? `<button type="button" class="irl-service-use" data-x402="${_escHtml(ep)}">Use</button>`
			: '';
		return `<div class="irl-service-row">
			<div class="irl-service-info">
				<span class="irl-service-name">${_escHtml(s.name || s.skill)}</span>
				${s.description ? `<span class="irl-service-desc">${_escHtml(s.description)}</span>` : ''}
			</div>
			<span class="irl-service-price">${_escHtml(price)}</span>
			${useBtn}
		</div>`;
	}).join('');
	return `<div class="irl-sheet-services">
		<div class="irl-services-label">Services</div>
		<div class="irl-services-list">${rows}</div>
	</div>`;
}

// Loading skeleton for the card body (a bio line + a few service rows).
function _cardSkeletonHTML() {
	ensureStateKitStyles();
	return `${skeletonHTML(1, 'text')}${skeletonHTML(3, 'row')}`;
}

// Render the resolved card into the open sheet.
function _applyCard(card, pin) {
	const agent = card.agent || {};
	const sheet = document.getElementById('irl-sheet');

	const thumb = document.getElementById('irl-sheet-thumb');
	if (thumb) {
		if (agent.thumbnail_url) { thumb.src = agent.thumbnail_url; thumb.hidden = false; }
		else { thumb.removeAttribute('src'); thumb.hidden = true; }
	}

	// The card may carry a richer name than the pin's avatar label.
	if (agent.name) {
		const nameEl = document.getElementById('irl-sheet-name');
		if (nameEl) nameEl.textContent = agent.name;
		if (sheet) sheet.dataset.agentName = agent.name;
	}
	if (sheet && agent.profile_url) sheet.dataset.profileUrl = agent.profile_url;

	_setTierBadge(card.reputation);

	const body = document.getElementById('irl-card-body');
	if (body) {
		const parts = [];
		const bio = agent.bio;
		// Skip the bio when it just repeats the pin caption shown above.
		if (bio && bio !== pin.caption) parts.push(`<p class="irl-card-bio">${_escHtml(bio)}</p>`);
		parts.push(_repStripHTML(card.reputation));
		parts.push(_servicesHTML(card.services));
		body.innerHTML = parts.join('');
	}

	// Prefer the card's resolved x402 endpoint for the footer Pay button.
	if (card.x402_endpoint) {
		const payBtn = document.getElementById('irl-sheet-pay');
		if (payBtn) { payBtn.hidden = false; payBtn.dataset.endpoint = card.x402_endpoint; }
	}
}

// Fetch + render the agent card. Aborts any in-flight request so switching
// agents never lands stale data. Re-callable for retry.
async function loadAgentCard(pin) {
	_cardAbort?.abort();
	const ctrl = new AbortController();
	_cardAbort = ctrl;

	const body = document.getElementById('irl-card-body');
	if (body) body.innerHTML = _cardSkeletonHTML();

	// Real agents resolve by agent_id; anonymous pins fall back to the pin id.
	const url = pin.agent_id
		? `/api/irl/agent-card?agent_id=${encodeURIComponent(pin.agent_id)}`
		: `/api/irl/agent-card?pin=${encodeURIComponent(pin.id)}`;

	try {
		const r = await fetch(url, { signal: ctrl.signal });
		if (ctrl.signal.aborted) return;
		if (!r.ok) throw new Error(`HTTP ${r.status}`);
		const { card } = await r.json();
		if (ctrl.signal.aborted) return;
		if (!card) throw new Error('empty card');
		_applyCard(card, pin);
	} catch (err) {
		if (ctrl.signal.aborted || err?.name === 'AbortError') return;
		if (body) {
			body.innerHTML = errorStateHTML({
				title: "Couldn't load this agent",
				body: 'Check your connection and try again.',
			});
		}
	}
}

function closeInspectSheet() {
	_cardAbort?.abort();
	document.getElementById('irl-sheet')?.classList.remove('is-open');
	document.getElementById('irl-sheet-backdrop')?.classList.remove('is-open');
	_activePin = null;
	if (_lastFocus && document.contains(_lastFocus)) {
		try { _lastFocus.focus({ preventScroll: true }); } catch { /* element gone */ }
	}
	_lastFocus = null;
}

// Run an x402 payment against a service endpoint, driving button state through
// the flow. Shared by the footer Pay button and per-service "Use" buttons.
async function runX402Payment(endpoint, btn) {
	if (!endpoint || !btn) return;

	if (!window.ethereum) {
		setStatus('Connect an Ethereum wallet (MetaMask) to pay via x402', { error: true });
		return;
	}

	btn.disabled = true;
	const origText = btn.textContent;

	// Gate on an authorized wallet before signing so we can bail cleanly if the
	// user declines, rather than letting the x402 adapter prompt mid-flow.
	btn.textContent = 'Connecting…';
	try {
		const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
		if (!Array.isArray(accounts) || !accounts.length) {
			setStatus('Connect your wallet to pay via x402', { error: true });
			btn.disabled = false;
			btn.textContent = origText;
			return;
		}
	} catch (err) {
		const m = err?.message ?? String(err);
		setStatus(/reject|denied|4001/i.test(m) ? 'Wallet connection cancelled' : `Couldn't connect wallet — ${m}`, { error: true });
		btn.disabled = false;
		btn.textContent = origText;
		return;
	}

	btn.textContent = 'Sending…';
	try {
		const { withX402 } = await import('../packages/x402-fetch/dist/index.esm.js');
		const pay = withX402(window.ethereum, { maxPaymentUsd: 1.00 });
		const r = await pay(endpoint, { method: 'POST' });
		if (r.ok) {
			setStatus('Payment sent');
			btn.textContent = 'Paid ✓';
			btn.disabled = true;
		} else {
			const msg = await r.text().catch(() => r.status);
			setStatus(`Payment failed (${msg})`, { error: true });
			btn.disabled = false;
			btn.textContent = origText;
		}
	} catch (err) {
		const msg = err?.message ?? String(err);
		if (msg.includes('rejected') || msg.includes('denied')) {
			setStatus('Payment cancelled', { error: true });
		} else {
			setStatus(`Payment failed — ${msg}`, { error: true });
		}
		btn.disabled = false;
		btn.textContent = origText;
	}
}

// ── Interaction sheet ─────────────────────────────────────────────────────
function openPinSheet(pin) {
	const sheet = document.getElementById('irl-sheet');
	if (!sheet) return;

	// Populate basic fields immediately so the sheet opens without delay
	document.getElementById('irl-sheet-name').textContent = pin.avatar_name || 'Agent';
	const distEl = document.getElementById('irl-sheet-dist');
	if (distEl) distEl.textContent = pin.distance_m != null ? `${pin.distance_m}m away` : '';

	const cap = document.getElementById('irl-sheet-caption');
	if (cap) { cap.textContent = pin.caption || ''; cap.hidden = !pin.caption; }

	const payBtn = document.getElementById('irl-sheet-pay');
	if (payBtn) {
		payBtn.hidden = !pin.x402_endpoint;
		payBtn.dataset.endpoint = pin.x402_endpoint ?? '';
	}

	// Calibrate (A3) — only the owner of this pin can fine-tune its real-world
	// spot. The server re-checks ownership; this is the discoverable entry point
	// alongside the long-press gesture.
	const calBtn = document.getElementById('irl-sheet-calibrate');
	if (calBtn) {
		const own = isOwnPin(pin);
		calBtn.hidden = !own;
		calBtn.onclick = own
			? () => { closeInspectSheet(); enterCalibrate(pin); }
			: null;
	}

	// Honest accuracy line (A3) — never imply the placement is centimetre-perfect.
	const accEl = document.getElementById('irl-sheet-accuracy');
	if (accEl) {
		const acc = Number.isFinite(pin.gps_accuracy_m) ? Math.round(pin.gps_accuracy_m) : null;
		if (acc != null) {
			accEl.textContent = acc > RING_LOW_ACC_M
				? `Placed with ~${acc} m GPS accuracy — position can vary between phones. Find a spot with clearer sky for a tighter lock.`
				: `Placed with ~${acc} m GPS accuracy.`;
			accEl.classList.toggle('is-low', acc > RING_LOW_ACC_M);
			accEl.hidden = false;
		} else {
			accEl.hidden = true;
		}
	}

	// Reset the rich-card surfaces before the fresh card resolves: hide the
	// previous agent's thumbnail + tier badge so neither flashes while the next
	// card loads. #irl-card-body gets its skeleton from loadAgentCard() below.
	const multiEl = document.getElementById('irl-sheet-multiplayer');
	const thumbEl = document.getElementById('irl-sheet-thumb');
	const tierEl  = document.getElementById('irl-sheet-tier');
	if (thumbEl) { thumbEl.removeAttribute('src'); thumbEl.hidden = true; }
	if (tierEl)  { tierEl.hidden = true; tierEl.removeAttribute('data-tier'); }
	if (multiEl) multiEl.hidden = true;

	sheet.dataset.agentId   = pin.agent_id   ?? '';
	sheet.dataset.agentName = pin.avatar_name ?? '';
	sheet.dataset.pinId     = pin.id ?? '';
	// Reset the message composer for this agent
	{
		const msgInput  = document.getElementById('irl-msg-input');
		const msgStatus = document.getElementById('irl-sheet-status');
		if (msgInput)  { msgInput.value = ''; msgInput.disabled = false; }
		if (msgStatus) { msgStatus.hidden = true; msgStatus.classList.remove('is-error'); }
	}

	// Open with a designed transition + focus management. Remember what had focus
	// so closeInspectSheet() can restore it; fade the backdrop in alongside the
	// sheet and move focus to the dialog so Escape and screen readers land here.
	_activePin = pin;
	_lastFocus = document.activeElement;
	document.getElementById('irl-sheet-backdrop')?.classList.add('is-open');
	sheet.classList.add('is-open');
	try { sheet.focus({ preventScroll: true }); } catch { /* older browsers */ }

	// Multiplayer note — always show since all pins are publicly visible
	if (multiEl) {
		const multiText = document.getElementById('irl-sheet-multiplayer-text');
		if (multiText) {
			const viewDesc = pin.view_count > 0
				? `Seen by ${pin.view_count} visitor${pin.view_count !== 1 ? 's' : ''} · visible to all users nearby`
				: 'Visible to all users at this location';
			multiText.textContent = viewDesc;
		}
		multiEl.hidden = false;
	}

	// Log the view interaction (fire-and-forget, best-effort)
	if (pin.id) {
		fetch('/api/irl/interactions', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				pinId: pin.id,
				type: 'view',
				deviceToken: _deviceToken,
				agentId: pin.agent_id ?? null,
			}),
		}).catch(() => {});
		pin.view_count = (pin.view_count ?? 0) + 1;
	}

	// Rich card: avatar bio + on-chain reputation + the agent's paid x402 services,
	// from one /api/irl/agent-card aggregation call. loadAgentCard() drops a
	// skeleton into #irl-card-body immediately, then renders the populated /
	// empty-services / no-reputation / error+retry state, and aborts the in-flight
	// fetch when the viewer taps a different agent so stale data never lands.
	loadAgentCard(pin);
}

document.getElementById('irl-sheet-close')?.addEventListener('click', closeInspectSheet);
document.getElementById('irl-sheet-backdrop')?.addEventListener('click', closeInspectSheet);
window.addEventListener('keydown', (e) => {
	if (e.key === 'Escape' && document.getElementById('irl-sheet')?.classList.contains('is-open')) {
		closeInspectSheet();
	}
});

// Per-service "Use" CTA → x402 payment; the error-state Retry re-fetches the card.
// Both delegate off #irl-card-body so they survive every innerHTML re-render
// (skeleton → populated / error).
{
	const cardBody = document.getElementById('irl-card-body');
	if (cardBody) {
		cardBody.addEventListener('click', (e) => {
			const useBtn = e.target.closest('.irl-service-use[data-x402]');
			if (useBtn) runX402Payment(useBtn.dataset.x402, useBtn);
		});
		attachRetry(cardBody, () => { if (_activePin) loadAgentCard(_activePin); });
	}
}

// Leave-a-message — a visitor's note becomes a 'message' interaction in the
// owner's IRL feed (dashboard). Pin id is stamped on the sheet by openPinSheet.
document.getElementById('irl-sheet-msg')?.addEventListener('submit', async (e) => {
	e.preventDefault();
	const sheet  = document.getElementById('irl-sheet');
	const input  = document.getElementById('irl-msg-input');
	const sendBtn = document.getElementById('irl-msg-send');
	const status = document.getElementById('irl-sheet-status');
	const pinId  = sheet?.dataset.pinId;
	const text   = (input?.value ?? '').trim();
	if (!pinId || !text) return;

	if (sendBtn) sendBtn.disabled = true;
	if (input)   input.disabled = true;
	try {
		const r = await fetch('/api/irl/interactions', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				pinId,
				type: 'message',
				message: text,
				deviceToken: _deviceToken,
				agentId: sheet.dataset.agentId || null,
			}),
		});
		if (!r.ok) throw new Error(`HTTP ${r.status}`);
		if (input) input.value = '';
		if (status) {
			status.textContent = 'Message delivered — the owner will see it.';
			status.classList.remove('is-error');
			status.hidden = false;
		}
	} catch {
		if (status) {
			status.textContent = "Couldn't send — try again.";
			status.classList.add('is-error');
			status.hidden = false;
		}
	} finally {
		if (sendBtn) sendBtn.disabled = false;
		if (input)   input.disabled = false;
	}
});

// ── Agent picker ──────────────────────────────────────────────────────────
// Lists the authenticated user's agents. Selecting one loads its avatar GLB
// into the scene and sets it as the current agent for any new pins.

async function openAgentPicker() {
	const sheet = document.getElementById('irl-agents-sheet');
	const list  = document.getElementById('irl-agents-list');
	if (!sheet || !list) return;
	sheet.classList.add('is-open');
	list.innerHTML = '<p class="irl-agents-empty">Loading…</p>';

	let agents = [];
	try {
		const r = await fetch('/api/agents', { credentials: 'include' });
		if (!r.ok) throw new Error('not_auth');
		const data = await r.json();
		agents = data.agents ?? [];
	} catch {
		list.innerHTML = '<p class="irl-agents-empty">Sign in to switch agents. <a href="/login">Log in →</a></p>';
		return;
	}

	if (!agents.length) {
		list.innerHTML = '<p class="irl-agents-empty">No agents yet. <a href="/create">Create your first agent →</a></p>';
		return;
	}

	list.innerHTML = agents.map(a => `
		<div class="irl-agent-row${_currentAgentId === a.id ? ' is-active' : ''}"
		     data-agent-id="${_escHtml(a.id)}"
		     data-avatar-id="${_escHtml(a.avatar_id ?? '')}"
		     data-avatar-url="${_escHtml(a.avatar_model_url ?? '')}"
		     data-name="${_escHtml(a.name)}">
			<div class="irl-agent-thumb">
				${a.avatar_thumbnail_url
					? `<img src="${_escHtml(a.avatar_thumbnail_url)}" alt="" loading="lazy">`
					: '🤖'}
			</div>
			<div class="irl-agent-row-info">
				<div class="irl-agent-row-name">${_escHtml(a.name)}</div>
				${a.description ? `<div class="irl-agent-row-desc">${_escHtml(a.description.slice(0, 90))}</div>` : ''}
			</div>
			${_currentAgentId === a.id ? '<span class="irl-agent-row-check">✓</span>' : ''}
		</div>
	`).join('');
}

document.getElementById('irl-agents-btn')?.addEventListener('click', openAgentPicker);
document.getElementById('irl-agents-close')?.addEventListener('click', () => {
	document.getElementById('irl-agents-sheet')?.classList.remove('is-open');
});

document.getElementById('irl-agents-list')?.addEventListener('click', async (e) => {
	const row = e.target.closest('.irl-agent-row[data-agent-id]');
	if (!row) return;
	const agentId   = row.dataset.agentId;
	const avatarId  = row.dataset.avatarId;
	const avatarUrl = row.dataset.avatarUrl;
	const name      = row.dataset.name;
	document.getElementById('irl-agents-sheet')?.classList.remove('is-open');
	_currentAgentId = agentId;
	// Update URL so a share link carries the chosen agent's avatar
	const sp = new URLSearchParams(location.search);
	if (avatarId) sp.set('avatar', avatarId); else sp.delete('avatar');
	history.replaceState(null, '', location.pathname + (sp.toString() ? '?' + sp : ''));
	try {
		await loadAvatar(avatarId || avatarUrl || null, name || null);
		setStatus(`Switched to ${name}`);
	} catch (err) {
		log.error('[irl] agent switch failed:', err);
		setStatus(`Couldn't load agent: ${err?.message ?? err}`, { error: true });
	}
});

document.getElementById('irl-sheet-view')?.addEventListener('click', () => {
	const sheet   = document.getElementById('irl-sheet');
	const agentId = sheet?.dataset.agentId;
	const name    = sheet?.dataset.agentName || document.getElementById('irl-sheet-name')?.textContent || '';
	closeInspectSheet();
	if (agentId) {
		window.open(`/agents/${agentId}`, '_blank', 'noopener');
	} else {
		window.open(`/walk?agent=${encodeURIComponent(name)}`, '_blank', 'noopener');
	}
});

// Footer Pay CTA — same x402 flow as the per-service "Use" buttons.
document.getElementById('irl-sheet-pay')?.addEventListener('click', (e) => {
	runX402Payment(e.currentTarget.dataset.endpoint, e.currentTarget);
});

// ── Radar minimap ────────────────────────────────────────────────────────
function updateRadar() {
	const radar = document.getElementById('irl-radar');
	if (!radar || !gpsModeActive) return;
	radar.querySelectorAll('.irl-radar-dot').forEach(d => d.remove());
	const R = 60; // half of 120px radar
	for (const pin of nearbyPins) {
		if (!pin.group) continue;
		const wx = pin.group.position.x;
		const wz = pin.group.position.z;
		const px = R + (wx / NEARBY_RADIUS) * R;
		const py = R + (-wz / NEARBY_RADIUS) * R;
		if (px < 0 || px > 120 || py < 0 || py > 120) continue;
		const dot = document.createElement('div');
		dot.className = 'irl-radar-dot';
		dot.style.left = `${px}px`;
		dot.style.top  = `${py}px`;
		dot.title = `${pin.avatar_name || 'Agent'} · ${pin.distance_m ?? Math.round(Math.hypot(wx, wz))}m`;
		dot.addEventListener('click', () => openPinSheet(pin));
		radar.appendChild(dot);
	}
}

// ── Label 3D→2D projection (called each frame) ───────────────────────────
const _lblVec = new Vector3();
// Only flag a focus target when an agent is near enough to actually walk up to
// and interact with — a visible agent across the street shouldn't claim it.
const FOCUS_REACH_M = 60;
let _focusPin = null;
function updateLabels() {
	// Pick the nearest on-screen agent within reach as the proximity focus target
	// (B4) in the same projection pass — the "you'll tap this" affordance.
	let focusPin = null, focusDist = Infinity;
	for (const pin of nearbyPins) {
		if (!pin.labelEl || !pin.group) { pin._labelOnScreen = false; continue; }
		_lblVec.set(
			pin.group.position.x,
			pin.group.position.y + 2.5,
			pin.group.position.z,
		);
		_lblVec.project(camera);
		if (_lblVec.z > 1) { pin.labelEl.style.display = 'none'; pin._labelOnScreen = false; continue; }
		const sx = (_lblVec.x * 0.5 + 0.5) * window.innerWidth;
		const sy = (-_lblVec.y * 0.5 + 0.5) * window.innerHeight;
		const offscreen = sx < -80 || sx > window.innerWidth + 80 || sy < -80 || sy > window.innerHeight + 80;
		pin.labelEl.style.display = offscreen ? 'none' : 'block';
		pin.labelEl.style.left    = `${sx}px`;
		pin.labelEl.style.top     = `${sy}px`;
		// Cache the projected label centre + visibility for the tap handler's 2D
		// label net (_nearestLabelWithinSlop) — no re-projection on tap.
		pin._labelSx = sx;
		pin._labelSy = sy;
		pin._labelOnScreen = !offscreen;
		if (!offscreen) {
			const dm = pin.distance_m ?? Math.hypot(pin.group.position.x, pin.group.position.z);
			if (dm <= FOCUS_REACH_M && dm < focusDist) { focusDist = dm; focusPin = pin; }
		}
	}
	// Exactly one agent is focused at a time; the swap is eased by the label's
	// transform/box-shadow transition. Cheap: only touches the class on change.
	if (focusPin !== _focusPin) {
		_focusPin?.labelEl?.classList.remove('is-focus');
		focusPin?.labelEl?.classList.add('is-focus');
		_focusPin = focusPin;
	}
}

// ── Resize ────────────────────────────────────────────────────────────────
function resize() {
	renderer.setSize(window.innerWidth, window.innerHeight, false);
	camera.aspect = window.innerWidth / window.innerHeight;
	camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
window.addEventListener('orientationchange', resize);

// ── Main loop ─────────────────────────────────────────────────────────────
const clock      = new Timer();
const moveWorld  = new Vector3();
const moveFwd    = new Vector3();
const moveRight  = new Vector3();
const upY        = new Vector3(0, 1, 0);

function lerpAngle(a, b, t) {
	let diff = ((b - a + Math.PI) % (Math.PI * 2)) - Math.PI;
	if (diff < -Math.PI) diff += Math.PI * 2;
	return a + diff * t;
}

const _clampSym = (v, max) => (v < -max ? -max : v > max ? max : v);

// ── Camera-aware agents ────────────────────────────────────────────────────
// Reused temporaries — the awareness step runs every frame over several agents,
// so it allocates nothing: all vectors/quaternions below are scratch space.
const _awareList       = [];                   // nearest-first work list, reused
const _awareProj       = new Vector3();        // NDC on-screen test
const _gazePitchAxis   = new Vector3();        // horizontal axis the head pitches about
const _gazeBoneWorld   = new Vector3();        // gaze bone world position
const _gazeYawQuat     = new Quaternion();
const _gazePitchQuat   = new Quaternion();
const _gazeOffsetQuat  = new Quaternion();
const _gazeParentWorld = new Quaternion();
const _gazeParentInv   = new Quaternion();
const _gazeRestWorld   = new Quaternion();
const _gazeTargetWorld = new Quaternion();
const _gazeTargetLocal = new Quaternion();

function _byAwareDist(a, b) { return a._dist2D - b._dist2D; }

// Rotate a head/torso bone so its neutral (rest) orientation is offset by a
// clamped yaw + pitch about WORLD axes — natural neck movement that reads right
// on any rig without knowing the bone's local "face" axis. `_gazePitchAxis`
// must already hold the horizontal axis to pitch about. Slerps from the bone's
// current pose toward the target so the gaze eases in instead of snapping.
function driveGazeBone(bone, restLocalQuat, yaw, pitch, slerpT) {
	bone.parent.getWorldQuaternion(_gazeParentWorld);
	_gazeRestWorld.multiplyQuaternions(_gazeParentWorld, restLocalQuat);
	_gazeYawQuat.setFromAxisAngle(upY, yaw);
	_gazePitchQuat.setFromAxisAngle(_gazePitchAxis, pitch);
	_gazeOffsetQuat.multiplyQuaternions(_gazeYawQuat, _gazePitchQuat);
	_gazeTargetWorld.multiplyQuaternions(_gazeOffsetQuat, _gazeRestWorld);
	_gazeParentInv.copy(_gazeParentWorld).invert();
	_gazeTargetLocal.multiplyQuaternions(_gazeParentInv, _gazeTargetWorld);
	bone.quaternion.slerp(_gazeTargetLocal, slerpT);
}

// Turn loaded nearby agents toward the viewer. Called from tick() right after
// animMgr.update(dt) and before label projection. Pure client render logic over
// nearbyPins — no data, no network. Cheap: only the nearest few, on-screen,
// in-range agents get full head tracking; everyone else eases home and idles.
function updateAgentAwareness(dt) {
	// Camera forward (horizontal) drives the "is-aware" label glow.
	camera.getWorldDirection(_camWorldDir);
	_camDirH.set(_camWorldDir.x, 0, _camWorldDir.z);
	const camDirHLen = _camDirH.length();
	if (camDirHLen > 0.001) _camDirH.divideScalar(camDirHLen);

	// Collect loaded agents and order nearest-first so the AWARE_MAX_AGENTS cap
	// always spends its budget on the agents the viewer is most likely facing.
	_awareList.length = 0;
	for (const pin of nearbyPins) {
		if (!pin.glbLoaded || !pin.group) continue;
		// The agent under active calibration is driven by the nudge gesture; don't
		// let camera-aware tracking fight the owner's yaw adjustment (A3).
		if (calibrateActive && _cal && _cal.pin === pin) continue;
		pin._dist2D = Math.hypot(
			camera.position.x - pin.group.position.x,
			camera.position.z - pin.group.position.z,
		);
		_awareList.push(pin);
	}
	_awareList.sort(_byAwareDist);

	for (let i = 0; i < _awareList.length; i++) {
		const pin  = _awareList[i];
		const dist = pin._dist2D;
		const dx   = camera.position.x - pin.group.position.x;
		const dz   = camera.position.z - pin.group.position.z;

		// On-screen test (cheap NDC bounds) so off-camera agents cost almost nothing.
		_awareProj
			.set(pin.group.position.x, pin.group.position.y + 1.4, pin.group.position.z)
			.project(camera);
		const onScreen = _awareProj.z < 1 &&
			Math.abs(_awareProj.x) < 1.25 && Math.abs(_awareProj.y) < 1.25;

		const engaged  = i < AWARE_MAX_AGENTS && dist <= AWARE_RADIUS_M && onScreen;
		const gazeBone = pin.headBone || pin.spineBone;
		const restQuat = pin.headBone ? pin.restHeadQuat : pin.restSpineQuat;

		if (engaged) {
			// 1) Body: ease the whole agent's yaw toward the camera's ground point.
			const wantYaw = Math.atan2(dx, dz);
			pin.group.rotation.y = lerpAngle(pin.group.rotation.y, wantYaw, BODY_SLERP);

			// 2) Head/torso: lead the body toward the camera inside a natural cone.
			if (gazeBone && restQuat) {
				// Yaw the head should add beyond the body's current facing.
				let resYaw = ((wantYaw - pin.group.rotation.y + Math.PI) % (Math.PI * 2)) - Math.PI;
				if (resYaw < -Math.PI) resYaw += Math.PI * 2;
				resYaw = _clampSym(resYaw, HEAD_CLAMP);
				// Pitch toward the camera's height (look up/down at the viewer's face).
				gazeBone.getWorldPosition(_gazeBoneWorld);
				const pitch = _clampSym(
					Math.atan2(camera.position.y - _gazeBoneWorld.y, Math.max(dist, 1e-3)),
					HEAD_CLAMP,
				);
				const inv = 1 / Math.max(dist, 1e-6);
				_gazePitchAxis.set(-dz * inv, 0, dx * inv); // = cross(toward-camera, up)
				driveGazeBone(gazeBone, restQuat, resYaw, pitch,
					pin.noticeT > 0 ? HEAD_SLERP_NOTICE : HEAD_SLERP);
			}
			pin.idleT = 0;
		} else {
			// Not engaged: ease the body back to its placed heading...
			const baseYaw = pin.baseYaw != null ? pin.baseYaw : pin.group.rotation.y;
			pin.group.rotation.y = lerpAngle(pin.group.rotation.y, baseYaw, BODY_RETURN_SLERP);
			// ...and play a slow gaze drift so an idle agent never reads as frozen.
			if (gazeBone && restQuat) {
				pin.idleT = (pin.idleT || 0) + dt;
				const driftYaw   = Math.sin(pin.idleT * 0.4) * 0.12;
				const driftPitch = Math.sin(pin.idleT * 0.27 + 1.3) * 0.05;
				const fy = pin.group.rotation.y; // body forward = (sin fy, 0, cos fy)
				_gazePitchAxis.set(-Math.cos(fy), 0, Math.sin(fy)); // cross(forward, up)
				driveGazeBone(gazeBone, restQuat, driftYaw, driftPitch, HEAD_SLERP * 0.5);
			}
		}

		// ── "Notice" one-shot — fire once each time the viewer enters NOTICE_RADIUS_M.
		// Hysteresis on the way out so a re-approach re-greets without flicker.
		if (!pin.noticed && dist < NOTICE_RADIUS_M) {
			pin.noticed = true;
			pin.noticeT = NOTICE_BOOST_SEC; // snap the head to attention briefly
			pin.popT    = 0;                // start the perk-up scale pop
		} else if (pin.noticed && dist > NOTICE_RADIUS_M + 1) {
			pin.noticed = false;
		}
		if (pin.noticeT > 0) pin.noticeT = Math.max(0, pin.noticeT - dt);
		if (pin.popT >= 0) {
			pin.popT += dt;
			if (pin.popT >= POP_DURATION) {
				pin.popT = -1;
				pin.group.scale.y = 1;
			} else {
				pin.group.scale.y = 1 + POP_AMOUNT * Math.sin(Math.PI * pin.popT / POP_DURATION);
			}
		}

		// ── "is-aware" label glow — is the camera roughly pointed at this agent? ──
		_toAgentH.set(-dx, 0, -dz);
		const d2 = _toAgentH.length();
		if (d2 > 0.001) _toAgentH.divideScalar(d2);
		const inView = camDirHLen > 0.001 && _camDirH.dot(_toAgentH) > 0.9 && d2 < 30;
		pin.labelEl?.classList.toggle('is-aware', inView);
	}
}

function tick() {
	clock.update();
	const dt  = Math.min(clock.getDelta(), 0.05);
	const ix  = input.joy.active ? input.joy.x : (input.keys.right   - input.keys.left);
	const iy  = input.joy.active ? input.joy.y : (input.keys.forward  - input.keys.back);
	const mag = Math.min(1, Math.hypot(ix, iy));
	const wantRun = mag > 0.9 || input.keys.run;
	const speed   = mag * (wantRun ? RUN_SPEED : WALK_SPEED);

	if (mag > 0.01 && avatar && !avatarLocked) {
		moveFwd.copy(camLookCurrent).sub(camera.position);
		moveFwd.y = 0;
		if (moveFwd.lengthSq() < 1e-6) moveFwd.set(0, 0, -1); else moveFwd.normalize();
		moveRight.crossVectors(moveFwd, upY).normalize();

		moveWorld
			.set(0, 0, 0)
			.addScaledVector(moveFwd,   iy / Math.max(mag, 1e-6))
			.addScaledVector(moveRight, ix / Math.max(mag, 1e-6))
			.normalize()
			.multiplyScalar(speed * dt);

		avatarRig.position.add(moveWorld);
		const r = Math.hypot(avatarRig.position.x, avatarRig.position.z);
		if (r > GROUND_RADIUS - 0.5) {
			const k = (GROUND_RADIUS - 0.5) / r;
			avatarRig.position.x *= k;
			avatarRig.position.z *= k;
		}

		avatarYaw = lerpAngle(avatarYaw, Math.atan2(moveWorld.x, moveWorld.z), TURN_LERP);
		avatarRig.quaternion.setFromAxisAngle(upY, avatarYaw);

		const want = wantRun ? 'run' : 'walk';
		if (currentMotion !== want) {
			currentMotion = want;
			animMgr.crossfadeTo(want === 'run' ? CLIP_RUN : CLIP_WALK, 0.18);
		}
	} else if (currentMotion !== 'idle' && avatar) {
		currentMotion = 'idle';
		animMgr.crossfadeTo(CLIP_IDLE, 0.25);
	}

	if (animMgr.mixer) {
		let ts = 1.0;
		if (currentMotion === 'walk') ts = Math.max(0.45, speed / NATURAL_WALK_SPEED);
		else if (currentMotion === 'run') ts = Math.max(0.6, speed / NATURAL_RUN_SPEED);
		animMgr.mixer.timeScale = ts;
	}

	const targetLean = currentMotion === 'run'
		? LEAN_RUN_RAD  * mag
		: currentMotion === 'walk' ? LEAN_WALK_RAD * mag : 0;
	avatarLean += (targetLean - avatarLean) * LEAN_LERP;
	if (avatar) avatar.rotation.x = avatarLean;

	// Camera ─────────────────────────────────────────────────────────────────
	if (gpsModeActive && avatarLocked && arActive) {
		// GPS mode (iOS world-lock, A4). Viewer-centric frame: the user is always
		// the origin, so the camera sits at their eye level (0, EYE_HEIGHT, 0) and
		// every agent is positioned relative to them via gpsToWorld(). Walking is
		// the *world* translating past a fixed camera — onGPSPosition() re-derives
		// the locked avatar (and nearby agents) from their GPS pins each fix, so
		// they grow/hold their real spot instead of following the user. Panning
		// only rotates the camera (gyro cameraYaw/Pitch), leaving the avatar on its
		// real-world bearing. Net effect matches WebXR (A1) without any WebXR.
		camera.position.set(0, EYE_HEIGHT, 0);
		camera.rotation.order = 'YXZ';
		camera.rotation.y = cameraYaw;
		camera.rotation.x = -cameraPitch;
		camera.rotation.z = 0;
		camLookCurrent.set(
			Math.sin(cameraYaw) * Math.cos(cameraPitch),
			Math.sin(-cameraPitch),
			-Math.cos(cameraYaw) * Math.cos(cameraPitch),
		).add(camera.position);
	} else if (arFrozenCamPos) {
		// Plain AR mode: background stays anchored, avatar walks freely
		camera.position.copy(arFrozenCamPos);
		camera.lookAt(arFrozenCamLook);
	} else {
		// Normal follow camera
		const offset = CAM_OFFSET.clone();
		offset.applyAxisAngle(new Vector3(1, 0, 0), -cameraPitch);
		offset.applyAxisAngle(upY, cameraYaw);
		camDesired.copy(avatarRig.position).add(offset);
		camera.position.lerp(camDesired, CAM_LERP);
		camLookTarget.copy(avatarRig.position).add(CAM_LOOK_OFFSET);
		camLookCurrent.lerp(camLookTarget, CAM_LERP);
		camera.lookAt(camLookCurrent);
	}

	animMgr.update(dt);

	// Animate placed-object spawn (scale 0 → 1, cubic ease-out)
	for (const obj of placedObjects) {
		if (obj.spawnT < SPAWN_DURATION) {
			obj.spawnT += dt;
			const p = Math.min(1, obj.spawnT / SPAWN_DURATION);
			obj.mesh.scale.setScalar(1 - Math.pow(1 - p, 3));
		}
	}

	// Nearby agents notice the viewer — body/head turn, idle drift, greet pop.
	updateAgentAwareness(dt);

	// Project nearby agent labels to screen space
	updateLabels();
	updateRadar();

	renderer.render(scene, camera);
	xrViewer._rafId = requestAnimationFrame(tick);
}

// ── Nudge-to-calibrate (A3) ────────────────────────────────────────────────
// Cross-user anchor consistency means a placed agent must land in the SAME real
// spot for everyone. Consumer GPS is only ~5–15 m accurate (worse in urban
// canyons / indoors), so the owner — or the anonymous device that placed it —
// can long-press their agent (or tap "Calibrate" in its card) and nudge it a few
// centimetres / degrees into its true spot. The corrected pose re-saves and every
// nearby viewer re-fetches it.
//
// Honest about the ceiling: sub-metre cross-user agreement needs visual
// positioning (VPS). A2 reserved `vps_provider` / `vps_id` for that future path —
// capture a feature snapshot at placement, relocalize viewers against it, and
// store the VPS frame in those columns. Until then the confidence ring + this
// nudge keep the UX truthful and correctable. No coin is involved anywhere here.

let calibrateActive = false;
let _cal = null;                 // active calibration session, or null

// Pin ids this device placed — gates the client-side calibrate affordance and the
// gold "your agent" label. The server re-checks ownership on every PATCH, so this
// is convenience, not a security boundary.
const _myPinIds = new Set();
function isOwnPin(pin) {
	return _myPinIds.has(pin.id) || (gpsPin?.id != null && pin.id === gpsPin.id);
}

// — Long-press to enter calibrate —
let _lpTimer = null, _lpPin = null, _lpX = 0, _lpY = 0, _lpPointerId = -1;
const LONG_PRESS_MS = 520;

function _pinUnderPointer(e) {
	const groups = nearbyPins.map(p => p.group).filter(Boolean);
	if (!groups.length) return null;
	pointerNDC.set((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
	raycaster.setFromCamera(pointerNDC, camera);
	const hits = raycaster.intersectObjects(groups, true);
	if (!hits.length) return null;
	let node = hits[0].object;
	while (node) { const f = nearbyPins.find(p => p.group === node); if (f) return f; node = node.parent; }
	return null;
}

function armLongPress(e) {
	if (placeModeActive || calibrateActive) return;
	cancelLongPress();
	const pin = _pinUnderPointer(e);
	if (!pin) return;
	_lpPin = pin; _lpX = e.clientX; _lpY = e.clientY; _lpPointerId = e.pointerId;
	_lpTimer = setTimeout(() => {
		_lpTimer = null;
		const pin2 = _lpPin;
		if (!pin2) return;
		if (isOwnPin(pin2)) {
			try { navigator.vibrate?.(15); } catch {}
			enterCalibrate(pin2, { pointerId: _lpPointerId, x: _lpX, y: _lpY });
		} else {
			showCalibrateDenied();
		}
	}, LONG_PRESS_MS);
}
function cancelLongPress() { if (_lpTimer) { clearTimeout(_lpTimer); _lpTimer = null; } _lpPin = null; }
function cancelLongPressIfMoved(e) {
	if (_lpTimer && Math.hypot(e.clientX - _lpX, e.clientY - _lpY) > TAP_THRESHOLD) cancelLongPress();
}

// — Calibration session —
function enterCalibrate(pin, seed = null) {
	const panel = document.getElementById('irl-calibrate-panel');
	if (!panel || !pin) return;
	document.getElementById('irl-sheet')?.classList.remove('is-open');
	const yaw0 = Number.isFinite(pin.anchor_yaw_deg) ? pin.anchor_yaw_deg : (pin.heading ?? 0);
	const norm = ((yaw0 % 360) + 360) % 360;
	const h0   = pinHeightM(pin);
	_cal = { pin, origLat: pin.lat, origLng: pin.lng, origYaw: norm, origHeight: h0,
	         lat: pin.lat, lng: pin.lng, yaw: norm, height: h0 };
	calibrateActive = true;
	document.body.classList.add('is-calibrating');
	pin.labelEl?.classList.add('is-calibrating');
	const titleEl = document.getElementById('irl-cal-title');
	if (titleEl) titleEl.textContent = `Calibrating ${pin.avatar_name || 'agent'}`;
	const errEl = document.getElementById('irl-cal-error');
	if (errEl) { errEl.hidden = true; errEl.replaceChildren(); }
	const saveBtn = document.getElementById('irl-cal-save');
	if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = 'Save position'; }
	updateCalReadout(); updateCalAccuracy(); updateCalHeightLabel();
	panel.classList.add('is-open');
	setStatus('Drag to nudge · twist with two fingers to rotate');
	// Reset gesture state; adopt the held finger (long-press) so the drag is live now.
	_calPtrs.clear(); _calTwistStart = null; _calGroundStart = null; _calDragStart = null;
	if (seed) {
		_calPtrs.set(seed.pointerId, { x: seed.x, y: seed.y });
		const gp = _groundPointXY(seed.x, seed.y);
		_calGroundStart = gp ? { x: gp.x, z: gp.z } : null;
		_calDragStart = { lat: _cal.lat, lng: _cal.lng };
		try { canvas.setPointerCapture?.(seed.pointerId); } catch {}
	}
}

function exitCalibrate(revert) {
	document.getElementById('irl-calibrate-panel')?.classList.remove('is-open');
	document.body.classList.remove('is-calibrating');
	if (_cal) {
		_cal.pin.labelEl?.classList.remove('is-calibrating');
		if (revert) {
			_cal.lat = _cal.origLat; _cal.lng = _cal.origLng;
			_cal.yaw = _cal.origYaw; _cal.height = _cal.origHeight;
			applyCalToGroup();
		}
	}
	_cal = null;
	calibrateActive = false;
	_calPtrs.clear(); _calTwistStart = null; _calGroundStart = null; _calDragStart = null;
	const saveBtn = document.getElementById('irl-cal-save');
	if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = 'Save position'; }
}

// Clamp the working pose to a small correction — calibration, never relocation.
function clampCalToBounds() {
	if (!_cal) return;
	const mLat = 110540, mLng = 111320 * Math.cos(_cal.origLat * Math.PI / 180);
	const north = Math.max(-3, Math.min(3, (_cal.lat - _cal.origLat) * mLat));
	const east  = Math.max(-3, Math.min(3, (_cal.lng - _cal.origLng) * mLng));
	_cal.lat = _cal.origLat + north / mLat;
	_cal.lng = _cal.origLng + east / mLng;
	let dy = ((_cal.yaw - _cal.origYaw + 540) % 360) - 180;
	dy = Math.max(-45, Math.min(45, dy));
	_cal.yaw = ((_cal.origYaw + dy) % 360 + 360) % 360;
	_cal.height = Math.max(-1, Math.min(1, _cal.height));
}

// Apply the working pose to the live 3D group so the nudge is fully optimistic.
function applyCalToGroup() {
	if (!_cal?.pin.group) return;
	clampCalToBounds();
	const wp = gpsToWorld(_cal.lat, _cal.lng);
	_cal.pin.group.position.set(wp.x, _cal.height, wp.z);
	_cal.pin.group.rotation.y = -(_cal.yaw * Math.PI / 180);
	_cal.pin.baseYaw = _cal.pin.group.rotation.y;  // keep the camera-aware rest target in sync
}

function _deltaMetres() {
	const mLat = 110540, mLng = 111320 * Math.cos(_cal.origLat * Math.PI / 180);
	const north = (_cal.lat - _cal.origLat) * mLat;
	const east  = (_cal.lng - _cal.origLng) * mLng;
	const dyaw  = ((_cal.yaw - _cal.origYaw + 540) % 360) - 180;
	return { north, east, dyaw };
}
function updateCalReadout() {
	const el = document.getElementById('irl-cal-readout');
	if (!el || !_cal) return;
	const { north, east, dyaw } = _deltaMetres();
	const ns = north >= 0 ? 'N' : 'S', ew = east >= 0 ? 'E' : 'W';
	const dh = (_cal.height - _cal.origHeight) * 100;
	el.textContent = `${Math.abs(north).toFixed(2)} m ${ns} · ${Math.abs(east).toFixed(2)} m ${ew} · ${dyaw >= 0 ? '+' : ''}${dyaw.toFixed(0)}° · ${dh >= 0 ? '+' : ''}${dh.toFixed(0)} cm`;
}
function updateCalAccuracy() {
	const el = document.getElementById('irl-cal-accuracy');
	if (!el || !_cal) return;
	const acc = Number.isFinite(_cal.pin.gps_accuracy_m) ? _cal.pin.gps_accuracy_m
		: (Number.isFinite(gpsState.accuracy) ? gpsState.accuracy : null);
	const low = acc != null && acc > RING_LOW_ACC_M;
	el.classList.toggle('is-low', low);
	el.textContent = acc != null
		? (low
			? `Position is GPS-accurate to ~${Math.round(acc)} m. Find a spot with clearer sky for a tighter lock, then drag to fine-tune.`
			: `Position is GPS-accurate to ~${Math.round(acc)} m. Drag to fine-tune.`)
		: 'Drag to fine-tune this agent’s real-world spot.';
}
function updateCalHeightLabel() {
	const el = document.getElementById('irl-cal-height');
	if (!el || !_cal) return;
	const dh = (_cal.height - _cal.origHeight) * 100;
	el.textContent = `${dh >= 0 ? '+' : ''}${dh.toFixed(0)} cm`;
}
function nudgeHeight(d) {
	if (!_cal) return;
	_cal.height = Math.max(-1, Math.min(1, (_cal.height || 0) + d));
	applyCalToGroup(); updateCalReadout(); updateCalHeightLabel();
}

// — Touch gestures (drag = move on the ground, two-finger twist = rotate yaw) —
const _calPtrs = new Map();
let _calDragStart = null, _calGroundStart = null, _calTwistStart = null;

function _groundPointXY(clientX, clientY) {
	pointerNDC.set((clientX / window.innerWidth) * 2 - 1, -(clientY / window.innerHeight) * 2 + 1);
	raycaster.setFromCamera(pointerNDC, camera);
	const hits = raycaster.intersectObject(rayPlane);
	return hits.length ? hits[0].point : null;
}
function _twoFingerAngle() {
	const pts = [..._calPtrs.values()];
	return Math.atan2(pts[1].y - pts[0].y, pts[1].x - pts[0].x);
}
function calPointerDown(e) {
	if (!calibrateActive) return;
	_calPtrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
	try { canvas.setPointerCapture?.(e.pointerId); } catch {}
	if (_calPtrs.size >= 2) {
		_calTwistStart = { angle: _twoFingerAngle(), yaw: _cal.yaw };
		_calGroundStart = null;
	} else {
		const gp = _groundPointXY(e.clientX, e.clientY);
		_calGroundStart = gp ? { x: gp.x, z: gp.z } : null;
		_calDragStart = { lat: _cal.lat, lng: _cal.lng };
	}
}
function calPointerMove(e) {
	if (!calibrateActive || !_calPtrs.has(e.pointerId)) return;
	_calPtrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
	if (_calPtrs.size >= 2) {
		// Two-finger twist → yaw nudge. Live feedback lets the owner aim it; clamp ±45°.
		if (!_calTwistStart) _calTwistStart = { angle: _twoFingerAngle(), yaw: _cal.yaw };
		let dDeg = (_twoFingerAngle() - _calTwistStart.angle) * 180 / Math.PI;
		dDeg = Math.max(-45, Math.min(45, dDeg));
		_cal.yaw = ((_calTwistStart.yaw + dDeg) % 360 + 360) % 360;
		applyCalToGroup(); updateCalReadout();
		return;
	}
	// Single-finger ground drag → horizontal nudge in metres (clamped ±3 m N/E).
	if (!_calGroundStart || !_calDragStart) {
		const gp0 = _groundPointXY(e.clientX, e.clientY);
		if (gp0) { _calGroundStart = { x: gp0.x, z: gp0.z }; _calDragStart = { lat: _cal.lat, lng: _cal.lng }; }
		return;
	}
	const gp = _groundPointXY(e.clientX, e.clientY);
	if (!gp) return;
	const dEast  = Math.max(-3, Math.min(3, gp.x - _calGroundStart.x));
	const dNorth = Math.max(-3, Math.min(3, -(gp.z - _calGroundStart.z)));
	const mLat = 110540, mLng = 111320 * Math.cos(_calDragStart.lat * Math.PI / 180);
	_cal.lat = _calDragStart.lat + dNorth / mLat;
	_cal.lng = _calDragStart.lng + dEast / mLng;
	applyCalToGroup(); updateCalReadout();
}
function calPointerUp(e) {
	if (!_calPtrs.has(e.pointerId)) return;
	_calPtrs.delete(e.pointerId);
	try { canvas.releasePointerCapture?.(e.pointerId); } catch {}
	if (_calPtrs.size < 2) _calTwistStart = null;
	if (_calPtrs.size === 0) { _calGroundStart = null; _calDragStart = null; }
	else { _calGroundStart = null; _calDragStart = { lat: _cal.lat, lng: _cal.lng }; } // rebase, avoid a jump
}

// — Save / errors —
async function saveCalibrate() {
	if (!_cal) return;
	const saveBtn = document.getElementById('irl-cal-save');
	const errEl   = document.getElementById('irl-cal-error');
	if (errEl) { errEl.hidden = true; errEl.replaceChildren(); }
	if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = 'Saving…'; }
	const pin = _cal.pin;
	const body = { id: pin.id, deviceToken: _deviceToken, calibrate: {
		lat: _cal.lat, lng: _cal.lng, anchorYawDeg: _cal.yaw, anchorHeightM: _cal.height } };
	try {
		const r = await fetch('/api/irl/pins', {
			method: 'PATCH', credentials: 'include',
			headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
		});
		if (!r.ok) {
			const m = r.status === 403 ? 'Only the owner can calibrate this agent.'
				: r.status === 422 ? 'That nudge is too large — calibration is for fine-tuning, not moving the agent.'
				: r.status === 404 ? 'This agent is no longer here.'
				: 'Could not save the new position.';
			throw new Error(m);
		}
		// Commit the corrected pose onto the live pin so it persists this session and
		// every nearby viewer's next re-fetch picks it up (realtime push rides on D1).
		pin.lat = _cal.lat; pin.lng = _cal.lng;
		pin.anchor_yaw_deg = _cal.yaw; pin.heading = Math.round(_cal.yaw);
		pin.anchor_height_m = _cal.height;
		setStatus('Position calibrated — everyone nearby now sees it here');
		exitCalibrate(false);
		loadNearbyPins();
	} catch (err) {
		// Optimistic-undo: keep the nudge on screen with a retry / undo chip — never
		// leave a half-applied, local-only correction.
		if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = 'Save position'; }
		if (errEl) {
			errEl.replaceChildren(errorStateEl({
				title: 'Save failed',
				body: _escHtml(err.message || 'Could not save the new position.'),
				actions: [
					{ label: 'Retry', id: 'cal-retry', primary: true },
					{ label: 'Undo',  id: 'cal-undo' },
				],
			}));
			errEl.hidden = false;
		}
	}
}

function showCalibrateDenied() {
	const el = document.getElementById('irl-cal-denied');
	if (!el) { setStatus('Only the owner can calibrate this agent', { error: true }); return; }
	el.replaceChildren(errorStateEl({
		title: 'Calibration locked',
		body: 'Only the owner can calibrate this agent’s position.',
		actions: [{ label: 'Got it', id: 'cal-denied-ok', primary: true }],
	}));
	el.hidden = false;
	requestAnimationFrame(() => el.classList.add('is-open'));
	clearTimeout(showCalibrateDenied._t);
	showCalibrateDenied._t = setTimeout(() => {
		el.classList.remove('is-open');
		setTimeout(() => { el.hidden = true; }, 220);
	}, 4200);
}

// — Wiring —
canvas.addEventListener('pointermove',   cancelLongPressIfMoved);
canvas.addEventListener('pointercancel', cancelLongPress);
// Capture phase so a calibrate gesture beats the orbit / tap handlers; no-op when
// calibration isn't active, so normal orbiting / tapping is untouched.
canvas.addEventListener('pointerdown',   calPointerDown, true);
canvas.addEventListener('pointermove',   calPointerMove, true);
canvas.addEventListener('pointerup',     calPointerUp,   true);
canvas.addEventListener('pointercancel', calPointerUp,   true);

document.getElementById('irl-cal-save')?.addEventListener('click', saveCalibrate);
document.getElementById('irl-cal-cancel')?.addEventListener('click', () => exitCalibrate(true));
document.getElementById('irl-cal-up')?.addEventListener('click', () => nudgeHeight(0.05));
document.getElementById('irl-cal-down')?.addEventListener('click', () => nudgeHeight(-0.05));
document.getElementById('irl-cal-error')?.addEventListener('click', (e) => {
	const a = e.target.closest('[data-sk-action]');
	if (!a) return;
	if (a.dataset.skAction === 'cal-retry') saveCalibrate();
	else if (a.dataset.skAction === 'cal-undo') exitCalibrate(true);
});
document.getElementById('irl-cal-denied')?.addEventListener('click', (e) => {
	if (!e.target.closest('[data-sk-action]')) return;
	const el = document.getElementById('irl-cal-denied');
	el.classList.remove('is-open');
	setTimeout(() => { el.hidden = true; }, 220);
});
window.addEventListener('keydown', (e) => { if (e.key === 'Escape' && calibrateActive) exitCalibrate(true); });

// ── Boot ──────────────────────────────────────────────────────────────────
initGPS();

// Reveal My pins on load if this device already owns pins — management must
// survive a reload (and a denied GPS prompt). The GPS-ready path reveals it too.
loadMyPins().then(pins => { if (pins.length) revealMyPinsBtn(); });

// URL ?avatar= wins over the saved session (an explicit link is intentional);
// otherwise fall back to whatever avatar was active last visit.
const _targetAvatarId = avatarIdParam || _savedSession?.avatarId || null;
loadAvatar(_targetAvatarId)
	.then(() => {
		_restoreSession();
		startTick();
	})
	.catch(err => {
		log.error('[irl] avatar load failed:', err);
		nameEl.textContent = 'Avatar';
		setStatus(`Couldn't load avatar: ${err?.message ?? err}`, { error: true, sticky: true });
		cameraBtn.disabled = false;
		cameraBtn.removeAttribute('aria-busy');
		startTick();
	});

// Detect WebXR floor-anchoring support and reveal the entry once ready. iOS
// Safari (no immersive-ar) never sees the button and stays on the gyro+GPS Pin
// path; desktop Chrome reports false and adds no console noise.
detectFloorAnchorSupport();

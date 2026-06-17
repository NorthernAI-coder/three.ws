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
import { log } from './shared/log.js';
import { createAvatarPicker } from './avatar-picker.js';

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
const NEARBY_FACE_LERP   = 0.025; // speed at which nearby agents rotate to face camera

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

// ── Status helpers ────────────────────────────────────────────────────────
function setStatus(msg, { error = false, loading = false, sticky = false } = {}) {
	clearTimeout(setStatus._t);
	if (!msg) { statusEl.classList.add('is-hidden'); return; }
	statusTxt.textContent = msg;
	statusEl.classList.remove('is-hidden');
	statusEl.classList.toggle('is-error', error);
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

canvas.addEventListener('pointerdown', e => { tapDownX = e.clientX; tapDownY = e.clientY; });
canvas.addEventListener('pointerup', e => {
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
		// ── Tap on a nearby agent's 3D model ─────────────────────────────
		const agentGroups = nearbyPins.map(p => p.group).filter(Boolean);
		if (agentGroups.length) {
			const hits = raycaster.intersectObjects(agentGroups, true);
			if (hits.length) {
				// Traverse up the scene graph to find which pin owns the hit mesh
				const pin = _pinForObject(hits[0].object);
				if (pin) { openPinSheet(pin); return; }
			}
		}
	}
});

function _pinForObject(obj) {
	let node = obj;
	while (node) {
		const found = nearbyPins.find(p => p.group === node);
		if (found) return found;
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
		if (placeModeActive) return;
		const r = joystickEl.getBoundingClientRect();
		if (e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom) return;
		dragging = true; downId = e.pointerId; lastX = e.clientX; lastY = e.clientY;
		canvas.setPointerCapture?.(e.pointerId);
	});
	const onMove = e => {
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
	// iOS 13+ requires a user-gesture permission for DeviceOrientationEvent
	if (next && typeof DeviceOrientationEvent?.requestPermission === 'function') {
		try {
			const perm = await DeviceOrientationEvent.requestPermission();
			if (perm !== 'granted') {
				setStatus('Motion sensor access denied', { error: true });
				return;
			}
		} catch (err) {
			log.error('[irl] orientation permission:', err);
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

			// GPS: anchor the avatar to real-world coordinates
			if (gpsState.ready) {
				const mLat = 110540;
				const mLng = 111320 * Math.cos(gpsState.lat * (Math.PI / 180));
				const pinLat = gpsState.lat + (-avatarRig.position.z / mLat);
				const pinLng = gpsState.lng + ( avatarRig.position.x / mLng);
				gpsModeActive = true;
				document.body.classList.add('gps-mode');
				const headingDeg = ((cameraYaw * 180 / Math.PI) % 360 + 360) % 360;
				// Snap the avatar to face the heading we're about to store so it
				// matches how nearby users will see it — spawnNearbyPin() rotates
				// foreign avatars with the same -(heading) → Y mapping. Keeping
				// avatarYaw in sync means a later unlock+walk lerps from here too.
				avatarYaw = -(headingDeg * Math.PI / 180);
				avatarRig.quaternion.setFromAxisAngle(upY, avatarYaw);
				openCaptionPanel(pinLat, pinLng, headingDeg);
			}
		} else {
			devOrientBaseAlpha = null;
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
	const gpsNote = gpsState.ready ? ' · others nearby can see you' : '';
	setStatus(next
		? (arActive ? `Pinned in real space${gpsNote} — move phone to look around` : 'Agent pinned — drag to orbit')
		: 'Agent unpinned');
	_saveSession();
}

if (lockBtn) {
	lockBtn.addEventListener('click', () => setLocked(!avatarLocked));
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

const gpsState = { lat: null, lng: null, ready: false, watchId: null };
let gpsPin = null;        // { lat, lng, id? } — the user's own anchored pin
let gpsModeActive = false;

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

let _lastNearbyFetch = 0;
const NEARBY_RADIUS   = 150; // metres
const NEARBY_INTERVAL = 15000; // ms

function onGPSPosition(pos) {
	const wasReady = gpsState.ready;
	gpsState.lat   = pos.coords.latitude;
	gpsState.lng   = pos.coords.longitude;
	gpsState.ready = true;

	// First fix: GPS is live, so the user can place + manage pins from here.
	if (!wasReady) revealMyPinsBtn();

	// Move pinned avatar to its GPS-anchored world position
	if (gpsPin) {
		const wp = gpsToWorld(gpsPin.lat, gpsPin.lng);
		avatarRig.position.set(wp.x, 0, wp.z);
	}

	// Update world positions of all nearby agents
	for (const p of nearbyPins) {
		if (p.group) {
			const wp = gpsToWorld(p.lat, p.lng);
			p.group.position.set(wp.x, 0, wp.z);
		}
	}

	const now = Date.now();
	if (now - _lastNearbyFetch > NEARBY_INTERVAL) {
		_lastNearbyFetch = now;
		loadNearbyPins();
	}
}

function initGPS() {
	if (!navigator.geolocation) return;
	gpsState.watchId = navigator.geolocation.watchPosition(
		onGPSPosition,
		() => {},
		{ enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 },
	);
}

function compassLabel(deg) {
	const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
	return dirs[Math.round(((deg % 360) + 360) % 360 / 45) % 8];
}

async function savePin(lat, lng, heading = 0, caption = '') {
	try {
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

function openCaptionPanel(pinLat, pinLng, headingDeg) {
	if (!captionPanel) {
		commitPin(pinLat, pinLng, headingDeg, '');
		return;
	}
	captionInput.value = '';
	captionPanel.classList.add('is-open');
	setTimeout(() => captionInput.focus(), 300);
	captionConfirm.onclick = () => {
		captionPanel.classList.remove('is-open');
		commitPin(pinLat, pinLng, headingDeg, captionInput.value.trim());
	};
	captionCancel.onclick = () => {
		captionPanel.classList.remove('is-open');
		setLocked(false);
	};
}

function commitPin(pinLat, pinLng, headingDeg, caption) {
	gpsPin = { lat: pinLat, lng: pinLng };
	savePin(pinLat, pinLng, headingDeg, caption).then(result => {
		if (result && gpsPin) {
			gpsPin.id = result.id;
			const dir = compassLabel(headingDeg);
			setStatus(result.permanent
				? `Pinned facing ${dir} — permanently visible to nearby users`
				: `Pinned facing ${dir} — others nearby can see you for 7 days`);
			revealMyPinsBtn();
		}
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

		// Remove disappeared pins
		nearbyPins = nearbyPins.filter(p => {
			if (inIds.has(p.id)) return true;
			if (p.group)   scene.remove(p.group);
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

function spawnNearbyPin(pin) {
	const g  = new Group();
	const wp = gpsToWorld(pin.lat, pin.lng);
	g.position.set(wp.x, 0, wp.z);
	// Three.js Y rotation is CCW; compass heading is CW from north — negate
	if (pin.heading != null) g.rotation.y = -(pin.heading * Math.PI / 180);

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
	scene.add(g);

	// Floating HTML name label — gold border if this is the owner's own pin
	const el = document.createElement('div');
	el.className   = 'irl-agent-label';
	// Mark own pin (matched by device_token on anonymous OR user_id on authenticated)
	if (pin.device_token === _deviceToken || (gpsPin?.id && pin.id === gpsPin.id)) {
		el.classList.add('is-own');
	}
	el.style.display = 'none';
	el.innerHTML = `<span class="irl-agent-label-name">${_escHtml(pin.avatar_name || 'Agent')}</span>`;
	el.addEventListener('click', () => openPinSheet(pin));
	document.body.appendChild(el);
	pin.labelEl = el;

	// Load real GLB if nearby
	const loadedCount = nearbyPins.filter(p => p.glbLoaded).length;
	if (pin.distance_m < 80 && loadedCount < 5 && pin.avatar_url) loadPinGLB(pin);
}

function _escHtml(s) {
	return String(s ?? '').replace(/[&<>"']/g, c =>
		({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

async function loadPinGLB(pin) {
	try {
		const gltf  = await new GLTFLoader().loadAsync(pin.avatar_url);
		if (!pin.group) return;
		const model = gltf.scene;
		model.traverse(n => { if (n.isMesh) n.castShadow = true; });
		const box = new Box3().setFromObject(model);
		model.position.y -= box.min.y;
		while (pin.group.children.length) pin.group.remove(pin.group.children[0]);
		pin.group.add(model);
		pin.glbLoaded = true;
		// Re-apply heading — GLTFLoader can reset the group transform
		if (pin.heading != null) pin.group.rotation.y = -(pin.heading * Math.PI / 180);
	} catch {}
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
		return (await r.json()).pins ?? [];
	} catch {
		return [];
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

// ── Interaction sheet ─────────────────────────────────────────────────────
async function openPinSheet(pin) {
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

	// Clear any previously loaded enriched content
	const descEl  = document.getElementById('irl-sheet-description');
	const skillsEl = document.getElementById('irl-sheet-skills');
	const viewsEl  = document.getElementById('irl-sheet-views');
	const multiEl  = document.getElementById('irl-sheet-multiplayer');
	const repEl    = document.getElementById('irl-sheet-rep');
	const servicesEl = document.getElementById('irl-sheet-services');
	if (descEl)   { descEl.textContent = ''; descEl.hidden = true; }
	if (skillsEl) { skillsEl.innerHTML = ''; skillsEl.hidden = true; }
	if (viewsEl)  { viewsEl.hidden = true; }
	if (multiEl)  { multiEl.hidden = true; }
	if (repEl)    { repEl.hidden = true; }
	if (servicesEl) { servicesEl.hidden = true; }

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
	sheet.classList.add('is-open');

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

	// Async: enrich with the public agent card — description, skills, reputation,
	// and the paid services this agent offers. One cached call resolves by pin so
	// anonymous placements still return a usable card.
	if (pin.id) {
		try {
			const r = await fetch(`/api/irl/agent-card?pin=${encodeURIComponent(pin.id)}`);
			if (r.ok) {
				const { card } = await r.json();
				if (card) {
					if (card.description && descEl) {
						descEl.textContent = card.description;
						descEl.hidden = false;
					}
					if (card.skills?.length && skillsEl) {
						skillsEl.innerHTML = card.skills.slice(0, 6).map(s =>
							`<span class="irl-skill-badge">${_escHtml(s)}</span>`,
						).join('');
						skillsEl.hidden = false;
					}
					// Reputation — score is 0–100; show it as a bar + label.
					const score = card.reputation?.score ?? 0;
					if (score > 0 && repEl) {
						const fill = document.getElementById('irl-rep-fill');
						const text = document.getElementById('irl-rep-text');
						if (fill) fill.style.width = `${Math.min(100, score)}%`;
						if (text) {
							const chats = card.reputation?.chats ?? 0;
							text.textContent = chats > 0
								? `Reputation ${score}/100 · ${chats} chat${chats === 1 ? '' : 's'}`
								: `Reputation ${score}/100`;
						}
						repEl.hidden = false;
					}
					// Services the agent offers, with prices.
					if (card.services?.length && servicesEl) {
						const listEl = document.getElementById('irl-services-list');
						if (listEl) {
							listEl.innerHTML = card.services.slice(0, 6).map(s => {
								const price = s.price_usdc != null
									? `$${Number(s.price_usdc).toFixed(2)} ${(s.network || 'base').toUpperCase()}`
									: 'Free';
								return `<div class="irl-service-row"><span class="irl-service-name">${_escHtml(s.name || s.slug)}</span><span class="irl-service-price">${_escHtml(price)}</span></div>`;
							}).join('');
							servicesEl.hidden = false;
						}
					}
					// Surface a pay button if the card resolved an x402 endpoint.
					if (card.x402_endpoint && payBtn) {
						payBtn.hidden = false;
						payBtn.dataset.endpoint = card.x402_endpoint;
					}
				}
			}
		} catch {}
	}
}

document.getElementById('irl-sheet-close')?.addEventListener('click', () => {
	document.getElementById('irl-sheet')?.classList.remove('is-open');
});

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
	sheet?.classList.remove('is-open');
	if (agentId) {
		window.open(`/agents/${agentId}`, '_blank', 'noopener');
	} else {
		window.open(`/walk?agent=${encodeURIComponent(name)}`, '_blank', 'noopener');
	}
});

document.getElementById('irl-sheet-pay')?.addEventListener('click', async (e) => {
	const btn      = e.currentTarget;
	const endpoint = btn.dataset.endpoint;
	if (!endpoint) return;

	if (!window.ethereum) {
		setStatus('Connect an Ethereum wallet (MetaMask) to pay via x402', { error: true });
		return;
	}

	btn.disabled = true;
	const origText = btn.textContent;

	// Gate on an authorized wallet before signing. The x402 adapter would prompt
	// lazily on first sign, but doing it up front gives the user a clear connect
	// step and lets us bail cleanly (button re-enabled) if they decline.
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
function updateLabels() {
	for (const pin of nearbyPins) {
		if (!pin.labelEl || !pin.group) continue;
		_lblVec.set(
			pin.group.position.x,
			pin.group.position.y + 2.5,
			pin.group.position.z,
		);
		_lblVec.project(camera);
		if (_lblVec.z > 1) { pin.labelEl.style.display = 'none'; continue; }
		const sx = (_lblVec.x * 0.5 + 0.5) * window.innerWidth;
		const sy = (-_lblVec.y * 0.5 + 0.5) * window.innerHeight;
		const offscreen = sx < -80 || sx > window.innerWidth + 80 || sy < -80 || sy > window.innerHeight + 80;
		pin.labelEl.style.display = offscreen ? 'none' : 'block';
		pin.labelEl.style.left    = `${sx}px`;
		pin.labelEl.style.top     = `${sy}px`;
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
		// GPS mode: camera fixed at the user's physical eye level.
		// The avatar (and nearby agents) are at GPS-derived world positions.
		// Gyro delta continues to drive cameraYaw/cameraPitch so pointing the
		// phone at the real spot where the agent was placed reveals it there.
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

	// Project nearby agent labels to screen space
	updateLabels();
	updateRadar();

	// ── Camera-aware agents: each nearby agent slowly faces the camera ────────
	// This creates the "mouse hover" effect the user knows from 2D — but in 3D:
	// agents turn toward whoever is looking at them via gyro/camera rotation.
	camera.getWorldDirection(_camWorldDir);
	_camDirH.set(_camWorldDir.x, 0, _camWorldDir.z);
	const camDirHLen = _camDirH.length();
	if (camDirHLen > 0.001) _camDirH.divideScalar(camDirHLen);

	for (const pin of nearbyPins) {
		if (!pin.glbLoaded || !pin.group) continue;

		// Rotate the agent on Y-axis to face the camera (horizontal only so feet
		// stay on the ground). Uses the same lerpAngle used for the player avatar.
		const dx = camera.position.x - pin.group.position.x;
		const dz = camera.position.z - pin.group.position.z;
		const targetYaw = Math.atan2(dx, dz);
		pin.group.rotation.y = lerpAngle(pin.group.rotation.y, targetYaw, NEARBY_FACE_LERP);

		// "Awareness" detection: is the camera currently aimed at this agent?
		// Dot product between camera forward vector and camera→agent vector.
		_toAgentH.set(
			pin.group.position.x - camera.position.x,
			0,
			pin.group.position.z - camera.position.z,
		);
		const dist2D = _toAgentH.length();
		if (dist2D > 0.001) _toAgentH.divideScalar(dist2D);
		const dot = _camDirH.dot(_toAgentH);
		// Within ~25° of camera center (dot > 0.9) and within 30 m → aware
		const inView = camDirHLen > 0.001 && dot > 0.9 && dist2D < 30;
		pin.labelEl?.classList.toggle('is-aware', inView);
	}

	renderer.render(scene, camera);
	requestAnimationFrame(tick);
}

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
		requestAnimationFrame(tick);
	})
	.catch(err => {
		log.error('[irl] avatar load failed:', err);
		nameEl.textContent = 'Avatar';
		setStatus(`Couldn't load avatar: ${err?.message ?? err}`, { error: true, sticky: true });
		cameraBtn.disabled = false;
		cameraBtn.removeAttribute('aria-busy');
		requestAnimationFrame(tick);
	});

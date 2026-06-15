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

// ── URL params ────────────────────────────────────────────────────────────
const params = new URLSearchParams(location.search);
const avatarIdParam = params.get('avatar') || '';

function resolveAvatarUrl(id) {
	if (!id) return AVATAR_URL_DEFAULT;
	if (/^https?:\/\//i.test(id) || id.startsWith('/')) return id;
	return `/api/avatars/${encodeURIComponent(id)}/glb`;
}

// ── DOM refs ──────────────────────────────────────────────────────────────
const $  = (id) => document.getElementById(id);
const canvas      = $('irl-canvas');
const videoEl     = $('irl-camera');
const joystickEl  = $('irl-joystick');
const nameEl      = $('irl-avatar-name');
const subtitleEl  = $('irl-subtitle');
const statusEl    = $('irl-status');
const statusTxt   = $('irl-status-text');
const spinner     = $('irl-spinner');
const cameraBtn   = $('irl-camera-btn');
const cameraLabel = $('irl-camera-label');
const placeBtn    = $('irl-place-btn');
const clearBtn    = $('irl-clear-btn');
const pickerEl    = $('irl-picker');

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
const renderer = new WebGLRenderer({ canvas, antialias: true, alpha: true });
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
const placedObjects = []; // { mesh, spawnT }

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
});

// ── Tap-to-place raycasting ───────────────────────────────────────────────
const raycaster  = new Raycaster();
const pointerNDC = new Vector2();
let tapDownX = 0, tapDownY = 0;

canvas.addEventListener('pointerdown', e => { tapDownX = e.clientX; tapDownY = e.clientY; });
canvas.addEventListener('pointerup', e => {
	if (!placeModeActive) return;
	if (Math.hypot(e.clientX - tapDownX, e.clientY - tapDownY) > TAP_THRESHOLD) return;

	pointerNDC.set(
		(e.clientX  / window.innerWidth)  * 2 - 1,
		-(e.clientY / window.innerHeight) * 2 + 1,
	);
	raycaster.setFromCamera(pointerNDC, camera);
	const hits = raycaster.intersectObject(rayPlane);
	if (!hits.length) return;

	const def  = OBJ_DEFS[selectedType];
	if (!def) return;
	const mesh = def.create();
	mesh.position.x = hits[0].point.x;
	mesh.position.z = hits[0].point.z;
	mesh.scale.setScalar(0.001);
	scene.add(mesh);
	placedObjects.push({ mesh, spawnT: 0 });
	clearBtn.hidden = false;
});

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

async function loadAvatar() {
	// If we have an ID, fetch metadata first to get the name for the bottom panel.
	let avatarName  = 'Your Avatar';
	let glbUrl      = resolveAvatarUrl(avatarIdParam);

	if (avatarIdParam && !/^https?:\/\//.test(avatarIdParam) && !avatarIdParam.startsWith('/')) {
		try {
			const res = await fetch(`/api/avatars/${encodeURIComponent(avatarIdParam)}`);
			if (res.ok) {
				const { avatar: meta } = await res.json();
				if (meta?.name) avatarName = meta.name;
				if (meta?.url)  glbUrl     = meta.url;
			}
		} catch {}
	}

	nameEl.textContent = avatarName;
	document.title     = `${avatarName} IRL · three.ws`;

	setStatus('Loading avatar…', { loading: true, sticky: true });

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

	if (mag > 0.01 && avatar) {
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

	// Camera — frozen when AR is active so background stays anchored
	if (arFrozenCamPos) {
		camera.position.copy(arFrozenCamPos);
		camera.lookAt(arFrozenCamLook);
	} else {
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

	renderer.render(scene, camera);
	requestAnimationFrame(tick);
}

// ── Boot ──────────────────────────────────────────────────────────────────
loadAvatar()
	.then(() => requestAnimationFrame(tick))
	.catch(err => {
		log.error('[irl] avatar load failed:', err);
		nameEl.textContent = 'Avatar';
		setStatus(`Couldn't load avatar: ${err?.message ?? err}`, { error: true, sticky: true });
		cameraBtn.disabled = false;
		cameraBtn.removeAttribute('aria-busy');
		requestAnimationFrame(tick);
	});

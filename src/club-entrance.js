// /club entrance — walk up to the club as your own 3D avatar.
//
// You don't drop onto the pole floor. You spawn outside in the alley as a
// third-person avatar and you're in control: move (WASD / arrows / touch
// joystick), look around (drag), and walk up to the neon door at the end of
// the alley. Step into range and a prompt appears — press E, tap, or click the
// door — and only then does the cover-charge card (src/club-gate.js) ask you
// to pay. Pay the cover and your avatar walks through the Space Smugglers club
// house interior while the anthem plays (wired in src/club.js), and the room
// with the poles opens up around you (src/club.js, booting behind it all).
//
// Everything renders into one full-screen canvas (#club-door-canvas) layered
// above the pole stage and below the cover card. Two ~1.6 MB Meshopt+WebP
// environments (built by scripts/build-club-entrance-venue.mjs) plus the
// shared avatar GLB; the interior is prefetched while you walk so the
// transition never stalls. Already paid tonight? The door is gone on load and
// we skip the whole thing. Any load failure degrades silently — the cover card
// and the room behind it still work.

import {
	AmbientLight,
	Box3,
	BoxGeometry,
	Fog,
	Group,
	HemisphereLight,
	Mesh,
	MeshStandardMaterial,
	PerspectiveCamera,
	PointLight,
	Raycaster,
	Scene,
	SpotLight,
	SRGBColorSpace,
	Vector2,
	Vector3,
	WebGLRenderer,
	ACESFilmicToneMapping,
} from 'three';
import { gltfLoader } from './loaders/gltf.js';
import { AnimationManager } from './animation-manager.js';
import { log } from './shared/log.js';

const ALLEYWAY_URL = '/club/venue/alleyway.glb';
const CLUBHOUSE_URL = '/club/venue/space-smugglers-clubhouse.glb';
const AVATAR_URL = '/avatars/default.glb';
const MANIFEST_URL = '/animations/manifest.json';
const PASS_KEY = 'club:pass:v1';
const MOVE_CLIPS = new Set(['idle', 'walk']);

const ROOM_HEIGHT = 7.0; // environments normalised to this Y so the avatar reads human
const AVATAR_HEIGHT = 1.75;
const MOVE_SPEED = 2.6; // metres / second
const DOOR_RANGE = 2.6; // how close you stand before the prompt shows
const CAM_DIST = 3.6;
const CAM_HEIGHT = 1.55;
const HEAD_Y = 1.2;

// Walk-through timeline (seconds), once the cover settles.
const LEAVE = 1.3; // walk forward through the alley door
const ENTER = 0.6; // fade the interior in
const WALK = 4.4; // walk forward through the interior
const ARRIVE = 0.9; // fade out, revealing the pole stage

const isTouch = typeof window !== 'undefined' &&
	('ontouchstart' in window || (navigator.maxTouchPoints || 0) > 0);

const canvas = document.getElementById('club-door-canvas');
const door = document.getElementById('club-door');

// The bouncer admits via a one-shot event; capture it at module scope so an
// admit that fires before the scene loads is never missed.
let admitted = false;
let onAdmit = null;
window.addEventListener('club:admitted', () => {
	admitted = true;
	if (onAdmit) onAdmit();
}, { once: true });

if (canvas && door && !hasValidPass()) {
	start(canvas).catch((err) => {
		log.warn('[club-entrance] scene failed', err);
		// Scene is dead — let the player into the cover flow directly so they're
		// never stuck in a broken alley.
		try { canvas.remove(); } catch {}
		window.dispatchEvent(new CustomEvent('club:enter-door'));
	});
} else {
	canvas?.remove();
}

function hasValidPass() {
	try {
		const raw = localStorage.getItem(PASS_KEY);
		if (!raw) return false;
		const p = JSON.parse(raw);
		return p?.expiresAt && Date.parse(p.expiresAt) > Date.now();
	} catch {
		return false;
	}
}

async function start(canvasEl) {
	const renderer = new WebGLRenderer({ canvas: canvasEl, antialias: true, alpha: true });
	renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
	renderer.setSize(window.innerWidth, window.innerHeight, false);
	renderer.outputColorSpace = SRGBColorSpace;
	renderer.toneMapping = ACESFilmicToneMapping;
	renderer.toneMappingExposure = 1.12;

	const scene = new Scene();
	scene.background = null;
	scene.fog = new Fog(0x05030a, 8, 34);

	const camera = new PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.05, 200);

	// ── Light rig — moody, works for the alley and the interior ──────────────
	scene.add(new AmbientLight(0x241433, 0.7));
	const hemi = new HemisphereLight(0xff6abf, 0x0a0512, 0.45);
	hemi.position.set(0, ROOM_HEIGHT, 0);
	scene.add(hemi);
	const pink = new PointLight(0xff3bd6, 7, 26, 1.4);
	pink.position.set(-3, 3.2, -3);
	scene.add(pink);
	const cyan = new PointLight(0x4ad6ff, 5, 24, 1.5);
	cyan.position.set(3, 2.4, 2);
	scene.add(cyan);
	// A soft key that tracks the avatar so it never falls into shadow.
	const key = new SpotLight(0xffe6c2, 10, 26, Math.PI / 5, 0.6, 1.2);
	key.position.set(0, 5, 0);
	scene.add(key, key.target);

	const loader = gltfLoader(renderer);

	// Land in the alley + the avatar first; prefetch the interior so the
	// walk-through after the cover settles never waits on a download.
	const [alleyGltf, avatarGltf, manifest] = await Promise.all([
		loader.loadAsync(ALLEYWAY_URL),
		loader.loadAsync(AVATAR_URL),
		fetch(MANIFEST_URL, { cache: 'force-cache' }).then((r) => (r.ok ? r.json() : [])).catch(() => []),
	]);
	const clubhousePromise = loader.loadAsync(CLUBHOUSE_URL);

	// ── Environment ──────────────────────────────────────────────────────────
	let env = mountEnvironment(scene, alleyGltf.scene);
	let path = walkPath(env.box);

	// ── Avatar ─────────────────────────────────────────────────────────────
	const avatar = avatarGltf.scene;
	scaleToHeight(avatar, AVATAR_HEIGHT);
	placeOnFloor(avatar);
	const rig = new Group(); // yaw the rig; the model sits at the rig origin
	rig.add(avatar);
	scene.add(rig);

	const anim = new AnimationManager();
	anim.attach(avatar);
	anim.setAnimationDefs((Array.isArray(manifest) ? manifest : []).filter((d) => MOVE_CLIPS.has(d.name)));
	anim.play('idle').catch(() => {});

	// ── Door marker — a neon frame at the end of the alley you walk up to ────
	const doorMarker = buildDoorMarker();
	scene.add(doorMarker.group);
	const doorGlow = new PointLight(0xff4fd8, 0, 9, 1.6);
	scene.add(doorGlow);

	// ── Camera + controller state ────────────────────────────────────────────
	let camYaw = Math.atan2(path.dir.x, path.dir.z); // start looking down the alley toward the door
	let camPitch = 0.12;
	let inputEnabled = true;
	let autoWalk = false; // forced forward motion during the walk-through

	placeSpawn();

	function placeSpawn() {
		rig.position.copy(path.spawn);
		// Face the door (opposite the walk axis).
		rig.rotation.y = Math.atan2(-path.dir.x, -path.dir.z);
		doorMarker.group.position.copy(path.door);
		doorMarker.group.rotation.y = Math.atan2(path.dir.x, path.dir.z);
		doorGlow.position.copy(path.door).setY(1.6);
		camYaw = Math.atan2(path.dir.x, path.dir.z);
		updateCamera(1);
	}

	// ── Input ──────────────────────────────────────────────────────────────
	const keys = new Set();
	const joy = { active: false, id: null, ox: 0, oy: 0, nx: 0, ny: 0 };
	const look = { id: null, x: 0, y: 0, moved: false };

	const onKeyDown = (e) => {
		const k = e.key.toLowerCase();
		if (k === 'e') { tryEnter(); return; }
		if (['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(k)) {
			keys.add(k);
			e.preventDefault();
		}
	};
	const onKeyUp = (e) => keys.delete(e.key.toLowerCase());
	window.addEventListener('keydown', onKeyDown);
	window.addEventListener('keyup', onKeyUp);

	// Pointer: a drag on the left third of the screen drives the joystick (touch
	// only); anything else orbits the camera.
	const joyBase = document.getElementById('club-joystick');
	const joyKnob = document.getElementById('club-joystick-knob');

	const onPointerDown = (e) => {
		if (!inputEnabled) return;
		const leftZone = isTouch && e.clientX < window.innerWidth * 0.4;
		if (leftZone && !joy.active) {
			joy.active = true; joy.id = e.pointerId; joy.ox = e.clientX; joy.oy = e.clientY;
			joy.nx = 0; joy.ny = 0;
			if (joyBase) { joyBase.style.left = `${e.clientX}px`; joyBase.style.top = `${e.clientY}px`; joyBase.classList.add('is-active'); }
		} else if (look.id === null) {
			look.id = e.pointerId; look.x = e.clientX; look.y = e.clientY; look.moved = false;
		}
		canvasEl.setPointerCapture?.(e.pointerId);
	};
	const onPointerMove = (e) => {
		if (joy.active && e.pointerId === joy.id) {
			const dx = e.clientX - joy.ox, dy = e.clientY - joy.oy;
			const max = 56;
			const len = Math.hypot(dx, dy) || 1;
			const cl = Math.min(len, max);
			joy.nx = (dx / len) * (cl / max);
			joy.ny = (dy / len) * (cl / max);
			if (joyKnob) joyKnob.style.transform = `translate(${(dx / len) * cl}px, ${(dy / len) * cl}px)`;
		} else if (e.pointerId === look.id) {
			const dx = e.clientX - look.x, dy = e.clientY - look.y;
			if (Math.abs(dx) + Math.abs(dy) > 3) look.moved = true;
			camYaw -= dx * 0.005;
			camPitch = clamp(camPitch + dy * 0.004, -0.12, 0.6);
			look.x = e.clientX; look.y = e.clientY;
		}
	};
	const endPointer = (e) => {
		if (e.pointerId === joy.id) {
			joy.active = false; joy.id = null; joy.nx = 0; joy.ny = 0;
			if (joyBase) joyBase.classList.remove('is-active');
			if (joyKnob) joyKnob.style.transform = 'translate(0,0)';
		}
		if (e.pointerId === look.id) look.id = null;
	};
	canvasEl.addEventListener('pointerdown', onPointerDown);
	canvasEl.addEventListener('pointermove', onPointerMove);
	canvasEl.addEventListener('pointerup', endPointer);
	canvasEl.addEventListener('pointercancel', endPointer);

	// Click the neon door directly to enter.
	const raycaster = new Raycaster();
	const onClick = (e) => {
		if (!inputEnabled || look.moved) return;
		const ndc = new Vector2((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
		raycaster.setFromCamera(ndc, camera);
		if (raycaster.intersectObject(doorMarker.group, true).length) tryEnter();
	};
	canvasEl.addEventListener('click', onClick);

	// The on-screen prompt button (also the mobile tap target).
	const promptEl = document.getElementById('club-door-prompt');
	const hintEl = document.getElementById('club-controls-hint');
	promptEl?.addEventListener('click', tryEnter);
	if (hintEl) hintEl.textContent = isTouch
		? 'Drag to move and look · walk to the door to enter'
		: 'WASD / arrows to move · drag to look · press E at the door';
	showHint(true);
	showJoystick(isTouch);

	let nearDoor = false;
	function tryEnter() {
		if (!inputEnabled || !nearDoor) return;
		inputEnabled = false;
		showPrompt(false);
		showHint(false);
		showJoystick(false);
		// Hand off to the cover-charge card.
		window.dispatchEvent(new CustomEvent('club:enter-door'));
	}

	// Backed out of the cover card without paying — resume walking the alley.
	window.addEventListener('club:leave-door', () => {
		if (phase !== 'alley') return;
		inputEnabled = true;
		showHint(true);
		showJoystick(isTouch);
	});

	// ── State + render loop ──────────────────────────────────────────────────
	let phase = 'alley'; // alley → leaving → swapping → entering → walking → arriving → done
	let phaseStart = performance.now();
	let raf = 0;
	let last = performance.now();

	function setPhase(p) { phase = p; phaseStart = performance.now(); }

	function frame(now) {
		// Cap at 0.1s so a single hitch (or a backgrounded tab) never teleports
		// the avatar, while keeping movement full-speed down to ~10 fps.
		const dt = Math.min((now - last) / 1000, 0.1);
		last = now;
		const elapsed = (now - phaseStart) / 1000;

		// Movement input (manual in the alley, forced during the walk-through).
		let ix = 0, iz = 0;
		if (autoWalk) {
			iz = 1;
		} else if (inputEnabled) {
			if (keys.has('w') || keys.has('arrowup')) iz += 1;
			if (keys.has('s') || keys.has('arrowdown')) iz -= 1;
			if (keys.has('a') || keys.has('arrowleft')) ix -= 1;
			if (keys.has('d') || keys.has('arrowright')) ix += 1;
			if (joy.active) { ix += joy.nx; iz += -joy.ny; }
		}
		stepAvatar(ix, iz, dt);
		anim.update(dt);
		updateCamera(dt);

		// Key light + proximity prompt follow the avatar in the alley.
		key.position.set(rig.position.x, 5, rig.position.z + 1);
		key.target.position.copy(rig.position).setY(1);

		if (phase === 'alley') {
			const d = Math.hypot(rig.position.x - path.door.x, rig.position.z - path.door.z);
			const inRange = d < DOOR_RANGE;
			if (inRange !== nearDoor) { nearDoor = inRange; showPrompt(inRange && inputEnabled); }
			doorGlow.intensity = inRange ? 3.2 : 1.4;
			doorMarker.pulse(now / 1000, inRange);
		}

		switch (phase) {
			case 'leaving': {
				const k = Math.min(1, elapsed / LEAVE);
				canvasEl.style.opacity = String(1 - k);
				if (k >= 1) doSwap();
				break;
			}
			case 'entering': {
				const k = Math.min(1, elapsed / ENTER);
				canvasEl.style.opacity = String(k);
				if (k >= 1) setPhase('walking');
				break;
			}
			case 'walking':
				if (elapsed >= WALK) setPhase('arriving');
				break;
			case 'arriving': {
				const k = Math.min(1, elapsed / ARRIVE);
				canvasEl.style.opacity = String(1 - k);
				if (k >= 1) return dispose();
				break;
			}
		}

		renderer.render(scene, camera);
		raf = requestAnimationFrame(frame);
	}
	raf = requestAnimationFrame(frame);

	// Move + face the avatar, clamp to the corridor, and drive the walk clip.
	function stepAvatar(ix, iz, dt) {
		const len = Math.hypot(ix, iz);
		if (len < 0.04) {
			anim.crossfadeTo('idle', 0.25).catch(() => {});
			return;
		}
		const nx = ix / len, nz = iz / len;
		const sinY = Math.sin(camYaw), cosY = Math.cos(camYaw);
		// forward (into screen) = (-sinY, 0, -cosY); right = (cosY, 0, -sinY)
		const wx = -sinY * nz + cosY * nx;
		const wz = -cosY * nz - sinY * nx;
		const speed = MOVE_SPEED * Math.min(1, len);
		rig.position.x = clamp(rig.position.x + wx * speed * dt, env.bounds.minX, env.bounds.maxX);
		rig.position.z = clamp(rig.position.z + wz * speed * dt, env.bounds.minZ, env.bounds.maxZ);
		// Face travel direction (shortest-arc yaw lerp).
		const targetYaw = Math.atan2(wx, wz);
		rig.rotation.y = lerpAngle(rig.rotation.y, targetYaw, 1 - Math.exp(-12 * dt));
		anim.crossfadeTo('walk', 0.2).catch(() => {});
	}

	function updateCamera(dt) {
		const cosP = Math.cos(camPitch);
		const off = new Vector3(Math.sin(camYaw) * cosP, Math.sin(camPitch) + 0.0, Math.cos(camYaw) * cosP);
		const target = new Vector3(rig.position.x, HEAD_Y, rig.position.z);
		const desired = target.clone().addScaledVector(off, CAM_DIST).setY(CAM_HEIGHT + Math.sin(camPitch) * CAM_DIST);
		const a = 1 - Math.exp(-9 * dt);
		camera.position.lerp(desired, a);
		camera.lookAt(target);
	}

	function beginWalk() {
		if (phase !== 'alley') return;
		inputEnabled = false;
		autoWalk = true;
		showPrompt(false); showHint(false); showJoystick(false);
		setPhase('leaving');
	}
	onAdmit = beginWalk;
	if (admitted) beginWalk();

	async function doSwap() {
		setPhase('swapping');
		canvasEl.style.opacity = '0';
		let clubScene = null;
		try {
			clubScene = (await clubhousePromise).scene;
		} catch (err) {
			log.warn('[club-entrance] club house load failed', err);
			return dispose();
		}
		scene.remove(doorMarker.group);
		disposeObject(doorMarker.group);
		doorGlow.intensity = 0;
		disposeObject(env.root);
		scene.remove(env.root);
		env = mountEnvironment(scene, clubScene);
		path = walkPath(env.box);
		placeSpawn();
		setPhase('entering');
	}

	function onResize() {
		renderer.setSize(window.innerWidth, window.innerHeight, false);
		camera.aspect = window.innerWidth / window.innerHeight;
		camera.updateProjectionMatrix();
	}
	window.addEventListener('resize', onResize);

	function dispose() {
		cancelAnimationFrame(raf);
		window.removeEventListener('resize', onResize);
		window.removeEventListener('keydown', onKeyDown);
		window.removeEventListener('keyup', onKeyUp);
		onAdmit = null;
		try { anim.dispose?.(); } catch {}
		disposeObject(scene);
		renderer.dispose();
		try { canvasEl.remove(); } catch {}
		showHint(false); showJoystick(false); showPrompt(false);
	}
}

// ── UI helpers ─────────────────────────────────────────────────────────────
function showPrompt(v) { toggle('club-door-prompt', v); }
function showHint(v) { toggle('club-controls-hint', v); }
function showJoystick(v) { toggle('club-joystick', v); }
function toggle(id, v) {
	const el = document.getElementById(id);
	if (el) el.classList.toggle('is-visible', !!v);
}

// ── Scene helpers ────────────────────────────────────────────────────────────

// Normalise an environment to a human-scaled room (height = ROOM_HEIGHT),
// recentre on the floor at the origin, add it, and return its box + the
// movement bounds (a margin inside the footprint so you don't clip walls).
function mountEnvironment(scene, root) {
	const box = new Box3().setFromObject(root);
	const size = box.getSize(new Vector3());
	root.scale.setScalar(ROOM_HEIGHT / (size.y || 1));
	const b2 = new Box3().setFromObject(root);
	const c = b2.getCenter(new Vector3());
	root.position.x -= c.x;
	root.position.z -= c.z;
	root.position.y -= b2.min.y;
	const group = new Group();
	group.add(root);
	scene.add(group);
	const wb = new Box3().setFromObject(group);
	const mx = (wb.max.x - wb.min.x) * 0.12;
	const mz = (wb.max.z - wb.min.z) * 0.12;
	return {
		root: group,
		box: wb,
		bounds: { minX: wb.min.x + mx, maxX: wb.max.x - mx, minZ: wb.min.z + mz, maxZ: wb.max.z - mz },
	};
}

// Spawn point, door point, and walk axis derived from the longer horizontal
// dimension — independent of the model's authored orientation.
function walkPath(box) {
	const size = box.getSize(new Vector3());
	const alongX = size.x > size.z;
	const span = (alongX ? size.x : size.z) / 2;
	const dir = alongX ? new Vector3(1, 0, 0) : new Vector3(0, 0, 1);
	const spawn = dir.clone().multiplyScalar(span * 0.6).setY(0);
	const doorP = dir.clone().multiplyScalar(-span * 0.82).setY(0);
	return { dir, span, spawn, door: doorP, start: spawn, end: doorP };
}

// A neon doorway: two posts, a lintel, and a glowing infill plane, with a
// gentle emissive pulse. Built from primitives so it works over any alley.
function buildDoorMarker() {
	const group = new Group();
	const frameMat = new MeshStandardMaterial({ color: 0x18121f, roughness: 0.5, metalness: 0.3, emissive: 0xff2fd0, emissiveIntensity: 0.5 });
	const glowMat = new MeshStandardMaterial({ color: 0x2a0a2a, emissive: 0xff5fe0, emissiveIntensity: 1.2, roughness: 0.4 });
	const post = (x) => {
		const m = new Mesh(new BoxGeometry(0.18, 2.7, 0.18), frameMat);
		m.position.set(x, 1.35, 0);
		return m;
	};
	const lintel = new Mesh(new BoxGeometry(1.5, 0.22, 0.2), frameMat);
	lintel.position.set(0, 2.62, 0);
	const infill = new Mesh(new BoxGeometry(1.2, 2.5, 0.04), glowMat);
	infill.position.set(0, 1.3, 0.02);
	group.add(post(-0.66), post(0.66), lintel, infill);
	return {
		group,
		pulse(t, hot) {
			const base = hot ? 2.2 : 1.0;
			glowMat.emissiveIntensity = base + Math.sin(t * 2.4) * 0.35;
			frameMat.emissiveIntensity = (hot ? 1.0 : 0.5) + Math.sin(t * 2.4) * 0.15;
		},
	};
}

function scaleToHeight(obj, h) {
	const b = new Box3().setFromObject(obj);
	const cur = b.max.y - b.min.y || 1;
	obj.scale.multiplyScalar(h / cur);
}
function placeOnFloor(obj) {
	const b = new Box3().setFromObject(obj);
	obj.position.y -= b.min.y;
}

function disposeObject(obj) {
	obj.traverse((n) => {
		if (n.isMesh) {
			n.geometry?.dispose?.();
			const mats = Array.isArray(n.material) ? n.material : [n.material];
			mats.forEach((m) => {
				if (!m) return;
				for (const k in m) { if (m[k]?.isTexture) m[k].dispose(); }
				m.dispose?.();
			});
		}
	});
}

function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
function lerpAngle(a, b, t) {
	let d = (b - a) % (Math.PI * 2);
	if (d > Math.PI) d -= Math.PI * 2;
	if (d < -Math.PI) d += Math.PI * 2;
	return a + d * t;
}

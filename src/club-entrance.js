// /club entrance — walk up to the club as your own 3D avatar.
//
// You don't drop onto the pole floor. You spawn as a third-person avatar and
// you're in control: move (WASD / arrows / touch joystick) and look around
// (drag). First you walk through a gallery tour; reach the end and you step
// out into the alley, where you walk up to the neon door. Step into range and a
// prompt appears — press E, tap, or click the door — and only then does the
// cover-charge card (src/club-gate.js) ask you to pay. Pay the cover and your
// avatar walks through the Space Smugglers club house interior while the anthem
// plays (wired in src/club.js), and the room with the poles opens up around you
// (src/club.js, booting behind it all).
//
// Everything renders into one full-screen canvas (#club-door-canvas) layered
// above the pole stage and below the cover card. Three Meshopt+WebP
// environments (built by scripts/build-club-entrance-venue.mjs) plus the shared
// avatar GLB; the alley and interior are prefetched while you walk so each
// transition never stalls. Already paid tonight? The whole approach is skipped
// on load. Any load failure degrades silently — the cover card and the room
// behind it still work.

import {
	AmbientLight,
	Box3,
	BoxGeometry,
	Color,
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

const TOUR_URL = '/club/venue/tour.glb';
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

const ARRIVE = 0.9; // final fade (seconds) that reveals the pole stage

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
	// Opaque backdrop (matches the fog) so the pole stage rendering behind this
	// canvas never shows through the alley's open edges — the club stays hidden
	// until the walk-through fades this whole canvas out via CSS opacity.
	scene.background = new Color(0x05030a);
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

	// The journey, in order. You free-walk every one of these — no auto-walk.
	// `cover` marks the venue whose door takes the cover charge (the outside
	// alley); the rest just lead you to the next place. `door` anchors the exit
	// to a modelled doorway (+ seals it) where one exists; interiors exit down
	// their longest dimension. The last venue hands off to the strip club stage.
	const SEQUENCE = [
		{ url: ALLEYWAY_URL, cover: true, door: true },   // outside — pay the cover here
		{ url: TOUR_URL, cover: false, door: false },     // gallery hall
		{ url: CLUBHOUSE_URL, cover: false, door: false }, // club interior → the poles
	];

	// Land in the alley + the avatar first; prefetch the rest so each place is
	// ready the moment you walk into it.
	const [firstGltf, avatarGltf, manifest] = await Promise.all([
		loader.loadAsync(SEQUENCE[0].url),
		loader.loadAsync(AVATAR_URL),
		fetch(MANIFEST_URL, { cache: 'force-cache' }).then((r) => (r.ok ? r.json() : [])).catch(() => []),
	]);
	const loaded = SEQUENCE.map(() => null); // index-aligned gltf cache
	loaded[0] = firstGltf;
	for (let i = 1; i < SEQUENCE.length; i++) {
		const idx = i;
		loader.loadAsync(SEQUENCE[idx].url)
			.then((g) => { loaded[idx] = g; })
			.catch((err) => { log.warn(`[club-entrance] venue ${idx} load failed`, err); loaded[idx] = 'error'; });
	}

	// ── Environment ──────────────────────────────────────────────────────────
	let venueIndex = 0;
	let paid = false;
	let currentCover = false;
	let env = null, doorAnchor = null, path = null, occluder = null;
	mountVenue(0);

	function mountVenue(i) {
		const v = SEQUENCE[i];
		if (occluder) { scene.remove(occluder); disposeObject(occluder); occluder = null; }
		if (env) { disposeObject(env.root); scene.remove(env.root); }
		env = mountEnvironment(scene, loaded[i].scene);
		// Anchor to the modelled door so the prompt + neon frame land on the real
		// doorway; interiors skip this and exit down their longest dimension.
		doorAnchor = v.door ? findDoorAnchor(env.root) : null;
		path = walkPath(env.box, doorAnchor);
		// Seal the doorway so the lit interior never reads from outside.
		occluder = doorAnchor ? buildDoorOccluder(doorAnchor, path.dir) : null;
		if (occluder) scene.add(occluder);
		currentCover = v.cover && !paid;
		venueIndex = i;
	}

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

	// The pavement surface sits above the environment's y=0 origin, so stand the
	// avatar on the sampled floor rather than the box bottom (feet-through-floor).
	const groundRay = new Raycaster();
	const DOWN = new Vector3(0, -1, 0);
	let floorY = 0;
	// Ray for camera-wall collision (keeps its own `far`, used in updateCamera).
	const camRay = new Raycaster();

	placeSpawn();

	// Cast straight down from above to the floor at (x, z). Starts at mid-room so
	// it clears ceilings/awnings and returns the walkable surface height.
	function sampleFloor(x, z) {
		groundRay.set(new Vector3(x, ROOM_HEIGHT * 0.6, z), DOWN);
		groundRay.far = ROOM_HEIGHT;
		const hit = groundRay.intersectObject(env.root, true)[0];
		return hit ? hit.point.y : 0;
	}

	function placeSpawn() {
		rig.position.copy(path.spawn);
		floorY = sampleFloor(path.spawn.x, path.spawn.z);
		rig.position.y = floorY;
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
	setHint();
	showHint(true);
	showJoystick(isTouch);

	// Hint + prompt copy track where you are in the journey: the alley door takes
	// the cover, the final place opens the stage, the rest just lead onward.
	const isFinalVenue = () => venueIndex >= SEQUENCE.length - 1;
	function doorLabel() {
		if (currentCover) return 'Enter the club';
		if (isFinalVenue()) return 'Enter the stage';
		return 'Keep going';
	}
	function setHint() {
		if (!hintEl) return;
		const tail = currentCover ? 'walk to the door to enter'
			: isFinalVenue() ? 'walk to the doors at the end' : 'walk to the far end to keep going';
		hintEl.textContent = isTouch
			? `Drag to move and look · ${tail}`
			: `WASD / arrows to move · drag to look · ${tail}`;
	}
	function setPromptLabel() {
		if (!promptEl) return;
		const label = doorLabel();
		promptEl.innerHTML = `${label} <kbd>E</kbd>`;
		promptEl.setAttribute('aria-label', label);
	}

	let nearDoor = false;
	function tryEnter() {
		if (!inputEnabled || !nearDoor) return;
		inputEnabled = false;
		showPrompt(false);
		showHint(false);
		showJoystick(false);
		if (currentCover) {
			// Hand off to the cover-charge card; we resume on admit (onPaid).
			window.dispatchEvent(new CustomEvent('club:enter-door'));
		} else {
			advance();
		}
	}

	// Move on: the final place reveals the strip club (the pole stage); any other
	// place fades out and the next one fades in for you to keep walking.
	function advance() {
		nearDoor = false;
		setPhase(isFinalVenue() ? 'arriving' : 'swapOut');
	}

	// Backed out of the cover card without paying — resume walking the alley.
	window.addEventListener('club:leave-door', () => {
		if (phase !== 'walk') return;
		inputEnabled = true;
		showHint(true);
		showJoystick(isTouch);
	});

	// ── State + render loop ──────────────────────────────────────────────────
	let phase = 'walk'; // walk (any place) → swapOut → swapIn → walk … → arriving → done
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

		// Movement is always yours — keyboard or joystick, in every place. We
		// never walk the avatar for you.
		let ix = 0, iz = 0;
		if (inputEnabled) {
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

		if (phase === 'walk') {
			const d = Math.hypot(rig.position.x - path.door.x, rig.position.z - path.door.z);
			const inRange = d < DOOR_RANGE;
			if (inRange !== nearDoor) {
				nearDoor = inRange;
				if (inRange) setPromptLabel();
				showPrompt(inRange && inputEnabled);
			}
			doorGlow.intensity = inRange ? 3.2 : 1.4;
			doorMarker.pulse(now / 1000, inRange);
		}

		switch (phase) {
			case 'swapOut': {
				// Fade the current place out, mount the next, then fade it in.
				const k = Math.min(1, elapsed / 0.6);
				canvasEl.style.opacity = String(1 - k);
				if (k >= 1) {
					const next = loaded[venueIndex + 1];
					if (next && next !== 'error') {
						mountVenue(venueIndex + 1);
						placeSpawn();
						setHint();
						setPhase('swapIn');
					} else if (next === 'error') {
						// A place failed to load — don't strand the visitor; reveal
						// the stage rather than hang on a black frame.
						setPhase('arriving');
					}
					// else: still downloading — hold the fade until it resolves.
				}
				break;
			}
			case 'swapIn': {
				const k = Math.min(1, elapsed / 0.5);
				canvasEl.style.opacity = String(k);
				if (k >= 1) {
					setPhase('walk');
					inputEnabled = true;
					nearDoor = false;
					showHint(true);
					showJoystick(isTouch);
				}
				break;
			}
			case 'arriving': {
				// Final hand-off: fade out to reveal the strip club (src/club.js).
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
		const off = new Vector3(Math.sin(camYaw) * cosP, Math.sin(camPitch), Math.cos(camYaw) * cosP);
		const target = new Vector3(rig.position.x, rig.position.y + HEAD_Y, rig.position.z);
		const desired = target.clone().addScaledVector(off, CAM_DIST);
		desired.y = rig.position.y + CAM_HEIGHT + Math.sin(camPitch) * CAM_DIST;
		// Pull the camera in front of any wall between it and the avatar, so you
		// never see through walls or end up buried in geometry (a black frame).
		const toCam = desired.clone().sub(target);
		const dist = toCam.length();
		if (dist > 1e-3) {
			camRay.set(target, toCam.multiplyScalar(1 / dist));
			camRay.far = dist;
			const hit = camRay.intersectObject(env.root, true)[0];
			if (hit) desired.copy(target).addScaledVector(camRay.ray.direction, Math.max(0.5, hit.distance - 0.2));
		}
		const a = 1 - Math.exp(-9 * dt);
		camera.position.lerp(desired, a);
		camera.lookAt(target);
	}

	// Cover settled — the door is now just a doorway. Keep walking: fade out the
	// alley and into the next place. (Input is already disabled from tryEnter.)
	function onPaid() {
		if (phase !== 'walk') return;
		paid = true;
		currentCover = false;
		showPrompt(false); showHint(false); showJoystick(false);
		advance();
	}
	onAdmit = onPaid;
	if (admitted) onPaid();

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

// Where you spawn, where the door is, and which way you face. When the
// environment ships a modelled door (the alley does — `metal_door`), anchor to
// it: the approach axis runs from the door toward the room's interior, you
// spawn back down that axis, and you stand just in front of the door to enter.
// Otherwise fall back to the longer horizontal dimension so any unlabelled
// environment (e.g. the club interior) still gets a sane walk path.
function walkPath(box, anchor) {
	const size = box.getSize(new Vector3());
	const center = box.getCenter(new Vector3());

	if (anchor) {
		const door = anchor.center.clone().setY(0);
		let dir = new Vector3(center.x - door.x, 0, center.z - door.z);
		if (dir.lengthSq() < 1e-4) dir.set(0, 0, 1);
		dir.normalize();
		const reach = Math.abs(dir.x) * size.x + Math.abs(dir.z) * size.z;
		// Spawn a few steps from the door — close enough that the chase camera
		// stays well inside the alley (never behind the back wall) on load.
		const spawn = door.clone().addScaledVector(dir, clamp(reach * 0.32, 3.0, 5.0)).setY(0);
		// Stand just in front of the door (alley side), not inside the wall.
		const doorP = door.clone().addScaledVector(dir, 0.35).setY(0);
		return { dir, span: reach / 2, spawn, door: doorP, start: spawn, end: doorP };
	}

	const alongX = size.x > size.z;
	const span = (alongX ? size.x : size.z) / 2;
	const dir = alongX ? new Vector3(1, 0, 0) : new Vector3(0, 0, 1);
	const spawn = dir.clone().multiplyScalar(span * 0.6).setY(0);
	const doorP = dir.clone().multiplyScalar(-span * 0.82).setY(0);
	return { dir, span, spawn, door: doorP, start: spawn, end: doorP };
}

// Locate the modelled door in an environment by name (matches the alley's
// `metal_door*` meshes). Returns the largest match's world-space centre + size,
// or null when the environment has no labelled door.
function findDoorAnchor(root) {
	root.updateMatrixWorld(true);
	let best = null;
	root.traverse((n) => {
		if (!n.isMesh) return;
		if (!/door/i.test(n.name || '') && !/door/i.test(n.parent?.name || '')) return;
		const box = new Box3().setFromObject(n);
		if (box.isEmpty()) return;
		const size = box.getSize(new Vector3());
		const score = size.x * size.y * size.z;
		if (!best || score > best.score) best = { center: box.getCenter(new Vector3()), size, score };
	});
	return best;
}

// A dark slab set just inside the doorway, sized to the opening and turned to
// face the alley. Blocks the line of sight into the lit interior so the club is
// never visible from outside — paired with the neon frame in front of it, the
// entrance reads as a shut, glowing door.
function buildDoorOccluder(anchor, dir) {
	const { size } = anchor;
	const widthPerp = Math.abs(dir.z) * size.x + Math.abs(dir.x) * size.z;
	const geo = new BoxGeometry(Math.max(widthPerp, 1.4) * 1.2 + 0.3, size.y * 1.2, 0.3);
	const mat = new MeshStandardMaterial({ color: 0x06040b, roughness: 1, metalness: 0 });
	const mesh = new Mesh(geo, mat);
	mesh.position.copy(anchor.center);
	mesh.rotation.y = Math.atan2(dir.x, dir.z);
	// Nudge to the interior side of the door plane, hiding the recess behind it.
	mesh.position.addScaledVector(dir, -0.2);
	return mesh;
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

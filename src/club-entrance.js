// /club entrance — a first-person spatial journey into the club.
//
// You don't drop straight onto the pole floor. You arrive in the alley
// outside, pay the cover at the door, then walk through the Space Smugglers
// club house before the room with the poles opens up. Three beats, rendered
// into one full-screen canvas (#club-door-canvas) layered under the cover
// door card and above the pole stage (src/club.js, which boots in parallel):
//
//   1. ALLEY      — you stand in alleyway.glb. The cover door (src/club-gate.js)
//                   floats over the scene as the line outside.
//   2. WALK-THROUGH — on `club:admitted` the canvas dips, swaps to the club
//                   house interior, and the camera walks forward through it
//                   while the walk-in anthem plays (wired in src/club.js).
//   3. ARRIVE     — the canvas fades out and disposes, revealing the pole
//                   stage that has been warming behind it the whole time.
//
// Deliberately light: two ~1.6 MB Meshopt+WebP environments (built by
// scripts/build-club-entrance-venue.mjs), a moody light rig, no avatar rig
// and no postprocessing. The club house is prefetched during the queue so the
// walk-through never stalls. If a wallet already holds a pass for the night,
// the door is gone on load and we skip the journey entirely. Any scene failure
// degrades silently — the cover door and the room behind it still work.

import {
	AmbientLight,
	Box3,
	Fog,
	Group,
	HemisphereLight,
	PerspectiveCamera,
	PointLight,
	Scene,
	SpotLight,
	SRGBColorSpace,
	Vector3,
	WebGLRenderer,
	ACESFilmicToneMapping,
} from 'three';
import { gltfLoader } from './loaders/gltf.js';
import { log } from './shared/log.js';

const ALLEYWAY_URL = '/club/venue/alleyway.glb';
const CLUBHOUSE_URL = '/club/venue/space-smugglers-clubhouse.glb';
const PASS_KEY = 'club:pass:v1';

const EYE = 1.62; // camera eye height, metres
const ROOM_HEIGHT = 7.0; // environments are normalised to this Y so eye height reads human

// Walk-through timeline (seconds).
const LEAVE = 0.7; // fade the alley out as you step through the door
const ENTER = 0.7; // fade the club house interior in
const WALK = 4.2; // camera dolly forward through the interior
const ARRIVE = 0.9; // fade out, revealing the pole stage

const canvas = document.getElementById('club-door-canvas');
const door = document.getElementById('club-door');

// The bouncer admits via a one-shot event. Capture it at module scope so an
// admit that fires before the scene finishes its first load is never missed.
let admitted = false;
let onAdmit = null;
window.addEventListener('club:admitted', () => {
	admitted = true;
	if (onAdmit) onAdmit();
}, { once: true });

// No canvas, or the wallet already paid cover tonight (door auto-dismissed) —
// nothing to render. Drop the canvas so it never sits dead over the stage.
if (canvas && door && !hasValidPass()) {
	start(canvas).catch((err) => {
		log.warn('[club-entrance] scene failed', err);
		try { canvas.remove(); } catch {}
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
	scene.background = null; // canvas alpha — the page's dark bg shows at the edges
	scene.fog = new Fog(0x05030a, 7, 30);

	const camera = new PerspectiveCamera(52, window.innerWidth / window.innerHeight, 0.05, 200);

	// ── Light rig — moody, works for both the alley and the interior ─────────
	scene.add(new AmbientLight(0x241433, 0.65));
	const hemi = new HemisphereLight(0xff6abf, 0x0a0512, 0.4);
	hemi.position.set(0, ROOM_HEIGHT, 0);
	scene.add(hemi);
	// Neon accents — the club signature.
	const pink = new PointLight(0xff3bd6, 7, 22, 1.4);
	pink.position.set(-3, 3.2, -3);
	scene.add(pink);
	const cyan = new PointLight(0x4ad6ff, 5, 20, 1.5);
	cyan.position.set(3, 2.4, 2);
	scene.add(cyan);
	// A soft forward "lantern" parented to the camera so whatever you walk
	// toward is always lit — reads like carrying your gaze through the dark.
	const lantern = new SpotLight(0xffe6c2, 9, 22, Math.PI / 5, 0.6, 1.2);
	lantern.position.set(0, 0.2, 0.4);
	lantern.target.position.set(0, 0, -6);
	camera.add(lantern, lantern.target);
	scene.add(camera);

	const loader = gltfLoader(renderer);

	// Land in the alley first; prefetch the interior so the walk-through after
	// the cover settles never has to wait on a download.
	const alleyGltf = await loader.loadAsync(ALLEYWAY_URL);
	const clubhousePromise = loader.loadAsync(CLUBHOUSE_URL);

	let env = mountEnvironment(scene, alleyGltf.scene);
	let path = walkPath(env.box);
	camera.position.copy(path.start);
	camera.lookAt(path.look);

	// ── State machine ────────────────────────────────────────────────────────
	// Segments are driven by wall-clock elapsed time, not accumulated frame
	// deltas, so the journey always runs its authored duration even when the
	// GPU is slow — low fps just means a choppier walk, never slow-motion.
	let phase = 'alley'; // alley → leaving → swapping → entering → walking → arriving → done
	let phaseStart = performance.now();
	let raf = 0;

	function setPhase(p) {
		phase = p;
		phaseStart = performance.now();
	}

	function frame(now) {
		const t = now / 1000;
		const elapsed = (now - phaseStart) / 1000;

		switch (phase) {
			case 'alley':
				// Stand in the alley with a slow handheld sway.
				idleSway(camera, path, t);
				break;
			case 'leaving': {
				const k = Math.min(1, elapsed / LEAVE);
				idleSway(camera, path, t);
				canvasEl.style.opacity = String(1 - k);
				if (k >= 1) doSwap();
				break;
			}
			case 'swapping':
				// Held at black while the interior finishes loading.
				break;
			case 'entering': {
				const k = Math.min(1, elapsed / ENTER);
				camera.position.copy(path.start);
				camera.lookAt(path.look);
				canvasEl.style.opacity = String(k);
				if (k >= 1) setPhase('walking');
				break;
			}
			case 'walking': {
				const k = Math.min(1, elapsed / WALK);
				camera.position.lerpVectors(path.start, path.end, easeInOut(k));
				camera.position.y = EYE + Math.sin(t * 5.2) * 0.025; // a little life in the step
				camera.lookAt(path.look);
				if (k >= 1) setPhase('arriving');
				break;
			}
			case 'arriving': {
				const k = Math.min(1, elapsed / ARRIVE);
				camera.lookAt(path.look);
				canvasEl.style.opacity = String(1 - k);
				if (k >= 1) return dispose();
				break;
			}
		}

		renderer.render(scene, camera);
		raf = requestAnimationFrame(frame);
	}
	raf = requestAnimationFrame(frame);

	function beginWalk() {
		if (phase !== 'alley') return;
		setPhase('leaving');
	}
	// If the admit already fired during load, start immediately; otherwise the
	// module-scope listener calls us when it does.
	onAdmit = beginWalk;
	if (admitted) beginWalk();

	async function doSwap() {
		setPhase('swapping');
		canvasEl.style.opacity = '0';
		let clubScene = null;
		try {
			clubScene = (await clubhousePromise).scene;
		} catch (err) {
			// Interior failed — skip the walk-through and reveal the stage.
			log.warn('[club-entrance] club house load failed', err);
			return dispose();
		}
		disposeObject(env.root);
		scene.remove(env.root);
		env = mountEnvironment(scene, clubScene);
		path = walkPath(env.box);
		camera.position.copy(path.start);
		camera.lookAt(path.look);
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
		onAdmit = null;
		disposeObject(scene);
		renderer.dispose();
		try { canvasEl.remove(); } catch {}
	}
}

// Normalise an environment to a human-scaled room (height = ROOM_HEIGHT),
// recentre it on the floor at the origin, add it, and return its world box.
function mountEnvironment(scene, root) {
	const box = new Box3().setFromObject(root);
	const size = box.getSize(new Vector3());
	const s = ROOM_HEIGHT / (size.y || 1);
	root.scale.setScalar(s);
	const box2 = new Box3().setFromObject(root);
	const center = box2.getCenter(new Vector3());
	root.position.x -= center.x;
	root.position.z -= center.z;
	root.position.y -= box2.min.y; // floor at y = 0
	const group = new Group();
	group.add(root);
	scene.add(group);
	return { root: group, box: new Box3().setFromObject(group) };
}

// Build a forward dolly along the environment's longer horizontal axis — the
// "depth" you walk down — independent of the model's authored orientation.
function walkPath(box) {
	const size = box.getSize(new Vector3());
	const alongX = size.x > size.z;
	const span = (alongX ? size.x : size.z) / 2;
	const dir = alongX ? new Vector3(1, 0, 0) : new Vector3(0, 0, 1);
	// Start just inside the near end, walk most of the way toward the far end.
	const start = dir.clone().multiplyScalar(span * 0.85).setY(EYE);
	const end = dir.clone().multiplyScalar(-span * 0.35).setY(EYE);
	// Always look further down the axis you're walking.
	const look = dir.clone().multiplyScalar(-span).setY(EYE * 0.92);
	return { start, end, look, dir };
}

// Subtle standing sway: a slow lateral/vertical drift while you wait.
function idleSway(camera, path, t) {
	const lateral = new Vector3(-path.dir.z, 0, path.dir.x); // perpendicular, on the floor plane
	camera.position.copy(path.start)
		.addScaledVector(lateral, Math.sin(t * 0.35) * 0.18)
		.setY(EYE + Math.sin(t * 0.5) * 0.03);
	camera.lookAt(path.look);
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

function easeInOut(x) {
	return x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2;
}

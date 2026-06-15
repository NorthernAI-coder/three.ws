// /club entrance — a real 3D scene behind the cover-charge door.
//
// Our avatar stands in the Space Smugglers club house while you wait in line.
// It renders into its own canvas (#club-door-canvas) layered under the door
// card, so the door (src/club-gate.js) is a panel floating over a live scene
// rather than a flat screen. When the bouncer admits you (`club:admitted`),
// the camera dollies in toward the avatar as the rope drops, then the scene
// disposes and the pole stage (src/club.js) takes over.
//
// Kept deliberately light: one model (~1.6 MB Meshopt+WebP clubhouse, built by
// scripts/build-club-entrance-venue.mjs), the shared avatar GLB (already
// cached for the stage), a few accent lights, no postprocessing. If a wallet
// already holds a pass for the night the door is gone on load, so we skip the
// scene entirely.

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
import { AnimationManager } from './animation-manager.js';
import { log } from './shared/log.js';

const CLUBHOUSE_URL = '/club/venue/space-smugglers-clubhouse.glb';
const AVATAR_URL = '/avatars/default.glb';
const MANIFEST_URL = '/animations/manifest.json';
const PASS_KEY = 'club:pass:v1';
const IDLE_CLIPS = new Set(['idle', 'walk']);

const canvas = document.getElementById('club-door-canvas');
const door = document.getElementById('club-door');

// No canvas, or the wallet already paid cover tonight (door auto-dismissed) —
// nothing to render.
if (canvas && door && !hasValidPass()) {
	start(canvas).catch((err) => {
		// A scene failure must never block entry — the cover door still works
		// on its own. Just leave the canvas dark.
		log.warn('[club-entrance] scene failed', err);
	});
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
	renderer.toneMappingExposure = 1.15;

	const scene = new Scene();
	scene.background = null; // canvas alpha — the CSS gradient shows through edges
	scene.fog = new Fog(0x05030a, 8, 26);

	const camera = new PerspectiveCamera(42, window.innerWidth / window.innerHeight, 0.05, 100);
	const camStart = new Vector3(1.7, 1.65, 4.0);
	const camLook = new Vector3(0, 1.0, 0);
	camera.position.copy(camStart);
	camera.lookAt(camLook);

	// ── Lighting — moody club palette, keyed on the avatar ──────────────────
	scene.add(new AmbientLight(0x241433, 0.7));
	const hemi = new HemisphereLight(0xff6abf, 0x0a0512, 0.4);
	hemi.position.set(0, 6, 0);
	scene.add(hemi);

	// Warm key spot from the doorway side, raking across the avatar.
	const key = new SpotLight(0xffd6a0, 18, 16, Math.PI / 6, 0.5, 1.4);
	key.position.set(2.4, 4.2, 3.2);
	key.target.position.set(0, 1.0, 0);
	scene.add(key, key.target);

	// Neon rim accents — pink behind, cyan side — the club signature.
	const pink = new PointLight(0xff3bd6, 6, 14, 1.5);
	pink.position.set(-2.2, 2.4, -2.0);
	scene.add(pink);
	const cyan = new PointLight(0x4ad6ff, 4, 12, 1.6);
	cyan.position.set(2.6, 1.6, -1.2);
	scene.add(cyan);

	const loader = gltfLoader(renderer);

	// Load the clubhouse + avatar + animation manifest together.
	const [houseGltf, avatarGltf, manifest] = await Promise.all([
		loader.loadAsync(CLUBHOUSE_URL),
		loader.loadAsync(AVATAR_URL),
		fetch(MANIFEST_URL, { cache: 'force-cache' }).then((r) => (r.ok ? r.json() : [])).catch(() => []),
	]);

	// ── Clubhouse: normalize the authored export to a room-sized backdrop and
	// drop it to the floor, pushed back so the avatar reads clearly in front.
	// normalizeToHeight scales the largest dimension, so the source units are
	// irrelevant. ─────────────────────────────────────────────────────────────
	const house = houseGltf.scene;
	normalizeToHeight(house, 8.5);
	const houseBox = new Box3().setFromObject(house);
	house.position.y -= houseBox.min.y; // feet of the room on the floor
	house.position.z -= 2.0; // set the avatar forward of the interior
	house.traverse((n) => {
		if (n.isMesh && n.material && 'envMapIntensity' in n.material) n.material.envMapIntensity = 0.8;
	});
	scene.add(house);

	// ── Avatar: our default, standing front-and-center, idling ──────────────
	const avatar = avatarGltf.scene;
	const aBox = new Box3().setFromObject(avatar);
	avatar.position.y -= aBox.min.y;
	const rig = new Group();
	rig.add(avatar);
	rig.rotation.y = Math.PI * 0.04; // a hair off-axis so it's not flat-on
	scene.add(rig);

	const anim = new AnimationManager();
	anim.attach(avatar);
	anim.setAnimationDefs((Array.isArray(manifest) ? manifest : []).filter((d) => IDLE_CLIPS.has(d.name)));
	anim.play('idle').catch(() => {});

	// ── Render loop ─────────────────────────────────────────────────────────
	let raf = 0;
	let last = performance.now();
	let t = 0;
	let admitted = false;
	let admitT = 0;

	function frame(now) {
		const dt = Math.min((now - last) / 1000, 0.05);
		last = now;
		t += dt;
		anim.update(dt);

		if (!admitted) {
			// Slow idle orbit drift around the avatar.
			const a = Math.sin(t * 0.18) * 0.18;
			camera.position.x = Math.sin(a) * 4.0 + Math.cos(a) * 1.7;
			camera.position.z = Math.cos(a) * 4.0;
			camera.position.y = 1.62 + Math.sin(t * 0.5) * 0.04;
			camera.lookAt(camLook);
		} else {
			// Dolly in toward the avatar / doorway, then fade the canvas out.
			admitT = Math.min(1, admitT + dt / 1.2);
			const e = easeInOut(admitT);
			camera.position.lerpVectors(camStart, new Vector3(0.2, 1.2, 1.5), e);
			camera.lookAt(0, 1.15, 0);
			canvasEl.style.opacity = String(1 - e);
			if (admitT >= 1) return dispose();
		}

		renderer.render(scene, camera);
		raf = requestAnimationFrame(frame);
	}
	raf = requestAnimationFrame(frame);

	function onResize() {
		renderer.setSize(window.innerWidth, window.innerHeight, false);
		camera.aspect = window.innerWidth / window.innerHeight;
		camera.updateProjectionMatrix();
	}
	window.addEventListener('resize', onResize);

	// Bouncer admitted the wallet — start the push-in.
	window.addEventListener('club:admitted', () => { admitted = true; admitT = 0; }, { once: true });

	function dispose() {
		cancelAnimationFrame(raf);
		window.removeEventListener('resize', onResize);
		try { anim.dispose?.(); } catch {}
		scene.traverse((n) => {
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
		renderer.dispose();
		canvasEl.remove();
	}
}

// Scale an object uniformly so its largest dimension equals `target` units.
function normalizeToHeight(obj, target) {
	const box = new Box3().setFromObject(obj);
	const size = box.getSize(new Vector3());
	const largest = Math.max(size.x, size.y, size.z) || 1;
	const s = target / largest;
	obj.scale.setScalar(s);
	// Recenter on X/Z around the origin after scaling.
	const box2 = new Box3().setFromObject(obj);
	const center = box2.getCenter(new Vector3());
	obj.position.x -= center.x;
	obj.position.z -= center.z;
}

function easeInOut(x) {
	return x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2;
}

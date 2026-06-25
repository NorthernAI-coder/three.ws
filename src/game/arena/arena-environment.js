// Omniology Arena — venue environment loader + mount.
//
// This is the heart of prompt 02: it turns the authored venue GLB + HDRI into
// a lit, bounded, post-processed room and hands back the resolved anchor
// contract the bootstrap (and prompts 03/04) build on. It is deliberately
// decoupled from the bootstrap so the multiplayer/camera/movement layer can
// stay in src/game/arena/arena.js and call this once.
//
// What it does, mirroring /club's proven pipeline (src/club.js):
//   1. Pick a perf profile from real capability signals (src/club-perf.js) and
//      apply it to the renderer (pixel ratio, shadow map).
//   2. Load venue.glb + hdri.hdr IN PARALLEL, forwarding real load progress to
//      the caller's overlay (no fake timers).
//   3. Pre-filter the HDRI through PMREMGenerator → scene.environment for PBR
//      reflections (background stays the dark arena fog colour).
//   4. Opt meshes into shadow casting/receiving and add the venue to the scene.
//   5. Run collectArenaEmpties + resolveArenaAnchors (throws loudly on a
//      missing anchor — no silent fallback) and derive the walkable bounds.
//   6. Build the lighting rig from the light anchors (one shadow key, the rest
//      cheap) and a bloom + ACES + vignette post pipeline gated by the profile.
//
// Returns everything the bootstrap needs and nothing it doesn't.

import {
	Color,
	Fog,
	Vector3,
	AmbientLight,
	HemisphereLight,
	DirectionalLight,
	PointLight,
	EquirectangularReflectionMapping,
	PMREMGenerator,
	SRGBColorSpace,
	NoToneMapping,
	ACESFilmicToneMapping,
} from 'three';
import {
	EffectComposer,
	RenderPass,
	EffectPass,
	BloomEffect,
	ToneMappingEffect,
	ToneMappingMode,
	VignetteEffect,
	SMAAEffect,
} from 'postprocessing';
import { HDRLoader } from 'three/addons/loaders/HDRLoader.js';

import { gltfLoader } from '../../loaders/gltf.js';
import { detectProfile, PROFILES } from '../../club-perf.js';
import {
	ARENA_REQUIRED_EMPTIES,
	collectArenaEmpties,
	resolveArenaAnchors,
	arenaBounds,
} from './arena-venue.js';
import { log } from '../../shared/log.js';

const VENUE_GLB_URL = '/arena/omniology/venue.glb';
const VENUE_HDRI_URL = '/arena/omniology/hdri.hdr';

// The dark hall colour: scene.background + fog. Reflections come from the HDRI.
const ARENA_BG = 0x05060a;

// Approx interior height — used to seat the hemisphere/fill lights when the
// anchors don't dictate it. Kept in sync with ROOM_HEIGHT in the build script.
const ROOM_TOP = 7;

// Meshes whose names match this cast shadows (props that read in silhouette).
// Everything receives shadows; only this small set casts, to protect the
// single key light's shadow budget — same discipline as /club.
const CASTS_SHADOW = /desk|bezel|bay|panel/i;
const NO_RECEIVE = /ceiling/i; // the ceiling needn't catch the floor's shadow

/**
 * Promise wrapper around a three loader's callback `.load()` that forwards
 * progress as a 0..1 fraction. `loadAsync` swallows progress, leaving the user
 * staring at a frozen overlay for a multi-hundred-kB venue.
 */
function loadWithProgress(loader, url, onFraction) {
	return new Promise((resolve, reject) => {
		loader.load(
			url,
			resolve,
			(e) => {
				if (e && e.total > 0) onFraction?.(Math.min(1, e.loaded / e.total));
			},
			(err) => reject(new Error(`Failed to load ${url}: ${err?.message || err?.statusText || err}`)),
		);
	});
}

/**
 * Load + mount the arena environment.
 *
 * @param {import('three').Scene} scene
 * @param {import('three').WebGLRenderer} renderer
 * @param {import('three').Camera} camera
 * @param {object} [opts]
 * @param {(fraction: number, label: string) => void} [opts.onProgress] — 0..1 progress.
 * @returns {Promise<{
 *   anchors: ReturnType<typeof resolveArenaAnchors>,
 *   bounds: ReturnType<typeof arenaBounds>,
 *   profile: typeof PROFILES['high'],
 *   composer: import('postprocessing').EffectComposer | null,
 *   lights: import('three').Light[],
 *   venue: import('three').Object3D,
 *   dispose: () => void,
 * }>}
 */
export async function createArenaEnvironment(scene, renderer, camera, { onProgress } = {}) {
	const profile = PROFILES[detectProfile()];

	// ── Renderer ──────────────────────────────────────────────────────────
	renderer.setPixelRatio(profile.pixelRatio);
	renderer.outputColorSpace = SRGBColorSpace;
	// Tone mapping happens in the post pipeline (ACES) when bloom is on; the
	// renderer itself stays neutral so we don't double-map. On the low tier
	// (no composer) we let the renderer do ACES so colour still reads right.
	renderer.toneMapping = NoToneMapping;
	renderer.shadowMap.enabled = profile.shadows;

	// ── Scene shell ───────────────────────────────────────────────────────
	scene.background = new Color(ARENA_BG);
	scene.fog = new Fog(ARENA_BG, 12, 46);
	// Low ambient + hemisphere so nothing is pitch black before the rig loads;
	// the authored lights do the real shaping.
	scene.add(new AmbientLight(0x141a26, 0.6));
	const hemi = new HemisphereLight(0x6f8cff, 0x0a0a12, 0.4);
	hemi.position.set(0, ROOM_TOP, 0);
	scene.add(hemi);

	// ── Load venue + HDRI in parallel with real progress ──────────────────
	const loader = gltfLoader(renderer);
	const rgbe = new HDRLoader();
	let venueFrac = 0;
	let hdriFrac = 0;
	const report = () => onProgress?.((venueFrac + hdriFrac) / 2, 'Loading arena…');

	const [venueGltf, hdrTexture] = await Promise.all([
		loadWithProgress(loader, VENUE_GLB_URL, (f) => {
			venueFrac = f;
			report();
		}),
		loadWithProgress(rgbe, VENUE_HDRI_URL, (f) => {
			hdriFrac = f;
			report();
		}),
	]);
	onProgress?.(1, 'Loading arena…');

	// ── HDRI → pre-filtered env map for PBR reflections ───────────────────
	hdrTexture.mapping = EquirectangularReflectionMapping;
	const pmrem = new PMREMGenerator(renderer);
	pmrem.compileEquirectangularShader();
	const envRT = pmrem.fromEquirectangular(hdrTexture);
	scene.environment = envRT.texture;
	hdrTexture.dispose();
	pmrem.dispose();

	// ── Venue geometry — shadow opt-in, then add to the scene ─────────────
	const venue = venueGltf.scene;
	venue.traverse((n) => {
		if (!n.isMesh) return;
		n.receiveShadow = profile.shadows && !NO_RECEIVE.test(n.name);
		n.castShadow = profile.shadows && CASTS_SHADOW.test(n.name);
	});
	scene.add(venue);

	// ── Anchors (throws a named error if any are missing) ─────────────────
	venue.updateMatrixWorld(true);
	const empties = collectArenaEmpties(venue, ARENA_REQUIRED_EMPTIES);
	const anchors = resolveArenaAnchors(empties);
	const bounds = arenaBounds(anchors);

	// ── Lighting rig from the light anchors ───────────────────────────────
	const lights = buildLightingRig(scene, anchors, bounds, profile);

	// ── Post pipeline (bloom + ACES + vignette), gated by perf ────────────
	let composer = null;
	if (profile.bloom) {
		composer = new EffectComposer(renderer);
		composer.addPass(new RenderPass(scene, camera));
		const bloom = new BloomEffect({
			intensity: 1.0,
			luminanceThreshold: 0.35,
			luminanceSmoothing: 0.1,
			mipmapBlur: true,
		});
		const tone = new ToneMappingEffect({ mode: ToneMappingMode.ACES_FILMIC });
		const vignette = new VignetteEffect({ darkness: 0.5, offset: 0.32 });
		composer.addPass(new EffectPass(camera, bloom, tone, vignette));
		// SMAA only where there's budget for a second full-screen pass.
		if (profile.tier === 'high') composer.addPass(new EffectPass(camera, new SMAAEffect()));
	} else {
		// No composer on the low tier — let the renderer apply ACES directly so
		// the room doesn't render washed-out without the tone-mapping pass.
		renderer.toneMapping = ACESFilmicToneMapping;
		renderer.toneMappingExposure = 1.0;
	}

	const dispose = () => {
		composer?.dispose?.();
		envRT?.dispose?.();
		venue.traverse((n) => {
			if (n.isMesh) {
				n.geometry?.dispose?.();
				const m = n.material;
				if (Array.isArray(m)) m.forEach((mm) => mm.dispose?.());
				else m?.dispose?.();
			}
		});
		scene.environment = null;
	};

	log.info?.('[arena] venue mounted', {
		tier: profile.tier,
		screens: anchors.screens.length,
		lights: lights.length,
		bounds: { halfX: +bounds.halfX.toFixed(1), halfZ: +bounds.halfZ.toFixed(1) },
	});

	return { anchors, bounds, profile, composer, lights, venue, dispose };
}

/**
 * Build the authored lighting rig: one shadow-casting key (DirectionalLight,
 * aimed at room centre), a soft non-shadow fill, and cheap PointLight rims for
 * the contest-wall colour wash. Reads each light's color/intensity/distance/
 * shadow from the resolved anchor (which itself reads the GLB extras).
 */
function buildLightingRig(scene, anchors, bounds, profile) {
	const out = [];
	const centre = new Vector3(bounds.center.x, 1.2, bounds.center.z);

	for (const a of anchors.lights) {
		if (a.kind === 'rim') {
			const p = new PointLight(a.color, a.intensity, a.distance || 0, 1.6);
			p.position.copy(a.pos);
			scene.add(p);
			out.push(p);
			continue;
		}

		// key + fill are directional so they shape the whole room evenly.
		const d = new DirectionalLight(a.color, a.intensity);
		d.position.copy(a.pos);
		d.target.position.copy(centre);
		scene.add(d.target);

		if (a.kind === 'key' && profile.shadows && a.castShadow) {
			d.castShadow = true;
			const s = profile.shadowMapSize || 1024;
			d.shadow.mapSize.set(s, s);
			d.shadow.bias = -0.0009;
			d.shadow.normalBias = 0.02;
			const cam = d.shadow.camera;
			cam.near = 0.5;
			cam.far = 40;
			cam.left = -14;
			cam.right = 14;
			cam.top = 14;
			cam.bottom = -14;
			cam.updateProjectionMatrix();
		}
		scene.add(d);
		out.push(d);
	}
	return out;
}

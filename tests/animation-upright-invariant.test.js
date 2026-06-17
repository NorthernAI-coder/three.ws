/**
 * Cross-rig upright-invariant corpus — the "stays shipped" regression lock.
 *
 * The lying-down bug shipped because nothing asserted that an animated avatar
 * stays upright. michelle.glb (a Mixamo export) rendered flat on its back the
 * moment it played `celebrate`, because the retargeter copied the clip's Hips
 * rotation verbatim and wiped the rig's −90°X up-axis convention. This suite
 * locks the invariant — the Hips world up-axis stays within tolerance of
 * vertical at EVERY keyframe — across a corpus of rig conventions × the
 * FEATURED clips, using the same world-matrix reconstruction the bug was
 * diagnosed with, in plain Node (raw GLB JSON-chunk parse, no GLTFLoader, no
 * network) so it gates every Vercel build.
 *
 * Empirical tilt data (measured on the committed real avatars during
 * development; re-derive by logging `max` below):
 *
 *   max Hips tilt across all keyframes, retargeted WITH the bind correction:
 *     cz:        idle 7.2°  walk 6.7°  jump 14.0°  wave 15.4°  dance 30.0°  celebrate 14.0°
 *     michelle:  idle 7.3°  walk 6.7°  jump 14.1°  wave 15.4°  dance 29.9°  celebrate 14.1°
 *   same clips retargeted WITHOUT the correction (the pre-fix, verbatim path):
 *     cz:        identical (cz IS the authoring convention → byte-for-byte no-op)
 *     michelle:  idle 92°  walk 93°  jump 94°  wave 89°  dance 115°  celebrate 94°
 *
 * `dance` legitimately leans the hips to ~30° at peak — that's choreography, not
 * a fault — so the corpus tolerance must clear it. We use 40°: comfortably above
 * the worst healthy clip (dance 30°) yet far below the catastrophe floor (the
 * verbatim michelle case never drops below ~89°). The runtime guard fires at
 * >45° but only samples the at-rest pose, where healthy clips peak at ~18°.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import {
	Bone,
	Object3D,
	SkinnedMesh,
	Skeleton,
	BufferGeometry,
	Quaternion,
	Vector3,
} from 'three';
import {
	canonicalNodeMapFromObject,
	canonicalRestMapFromObject,
	retargetClip,
	parseClipJSON,
	MIN_COVERAGE,
} from '../src/animation-retarget.js';
import { FEATURED } from '../src/animation-presets.js';
import { loadBoneGraph, hipsTiltAcrossClip } from './_helpers/glb-bone-graph.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..');
const avatar = (name) => resolve(repoRoot, 'public/avatars', name);
const clipPath = (name) => resolve(repoRoot, 'public/animations/clips', `${name}.json`);

// Tolerance for the upright invariant: see the empirical table in the module
// header. 40° clears the worst healthy clip (dance ~30°) with margin and sits
// well below the catastrophe floor (~89°), so a regression that tips a rig flat
// cannot pass.
const UPRIGHT_TOLERANCE_DEG = 40;
// A retarget that produces a fallen pose lands near 90°. The "this test has
// teeth" assertions prove the pre-fix path crosses this; the runtime guard uses
// 45° (CATASTROPHE_TILT_DEG in src/animation-manager.js) for the same reason.
const CATASTROPHE_DEG = 80;

// Load the featured clips once.
/** @type {Map<string, import('three').AnimationClip>} */
const CLIPS = new Map();
beforeAll(() => {
	for (const name of FEATURED) {
		const json = JSON.parse(readFileSync(clipPath(name), 'utf8'));
		CLIPS.set(name, parseClipJSON(json, name));
	}
});

// Retarget a featured clip onto a reconstructed rig the way AnimationManager
// does, then return the Hips tilt scan. `withFix=false` drops the bind
// correction (the pre-fix verbatim path) to prove the fix is load-bearing.
function scanClip(root, clipName, { withFix = true } = {}) {
	const map = canonicalNodeMapFromObject(root);
	const targetRest = withFix ? canonicalRestMapFromObject(root) : new Map();
	const { clip } = retargetClip(CLIPS.get(clipName), map, { targetRest });
	const hipsName = map.get('Hips');
	if (!hipsName) return null;
	return hipsTiltAcrossClip(root, hipsName, clip);
}

// ── Real committed avatars ──────────────────────────────────────────────────

describe('upright invariant — real avatars (cz Avaturn, michelle Mixamo)', () => {
	for (const [label, file] of [
		['cz.glb (Avaturn, identity convention)', 'cz.glb'],
		['michelle.glb (Mixamo, −90°X Hips)', 'michelle.glb'],
	]) {
		describe(label, () => {
			for (const clip of FEATURED) {
				it(`${clip} keeps Hips within ${UPRIGHT_TOLERANCE_DEG}° of vertical at every keyframe`, () => {
					const { root } = loadBoneGraph(avatar(file));
					const scan = scanClip(root, clip);
					expect(scan).not.toBeNull();
					expect(scan.samples).toBeGreaterThan(0);
					expect(scan.max).toBeLessThan(UPRIGHT_TOLERANCE_DEG);
				});
			}
		});
	}
});

// ── Named regression lock: the exact bug ────────────────────────────────────

describe('regression lock — the michelle lying-down bug', () => {
	it('michelle + celebrate stays upright (regression lock for the lying-down bug)', () => {
		const { root } = loadBoneGraph(avatar('michelle.glb'));
		const scan = scanClip(root, 'celebrate');
		expect(scan).not.toBeNull();
		expect(scan.max).toBeLessThan(UPRIGHT_TOLERANCE_DEG);
	});

	it('the test has teeth: WITHOUT the bind correction, michelle + celebrate falls flat', () => {
		// Prove the fix is load-bearing — the verbatim path (no targetRest) must
		// reproduce the catastrophe, so this suite would have caught the bug and
		// will catch any regression that removes the correction.
		const { root } = loadBoneGraph(avatar('michelle.glb'));
		const verbatim = scanClip(root, 'celebrate', { withFix: false });
		expect(verbatim).not.toBeNull();
		expect(verbatim.max).toBeGreaterThan(CATASTROPHE_DEG);
	});
});

// ── Synthetic rigs (Bone graph built by hand — no GLB needed) ───────────────

// Build a synthetic rig: an armature root carrying `armatureRot`, a Hips
// carrying `hipsRot`, and a full enough canonical skeleton under it that a
// featured clip clears MIN_COVERAGE. Bone names come from `nameFor` so the same
// builder exercises canonical, DEF-/snake_case, and partial-coverage rigs.
const CANONICAL_LIMBS = [
	'Spine', 'Spine1', 'Spine2', 'Neck', 'Head',
	'LeftShoulder', 'LeftArm', 'LeftForeArm', 'LeftHand',
	'RightShoulder', 'RightArm', 'RightForeArm', 'RightHand',
	'LeftUpLeg', 'LeftLeg', 'LeftFoot', 'LeftToeBase',
	'RightUpLeg', 'RightLeg', 'RightFoot', 'RightToeBase',
	'LeftHandThumb1', 'LeftHandIndex1', 'LeftHandMiddle1',
	'RightHandThumb1', 'RightHandIndex1', 'RightHandMiddle1',
];

function buildSyntheticRig({ armatureRot, hipsRot, nameFor, limbs = CANONICAL_LIMBS }) {
	const root = new Object3D();
	const armature = new Bone();
	armature.name = 'Armature';
	if (armatureRot) armature.quaternion.copy(armatureRot);

	const hips = new Bone();
	hips.name = nameFor('Hips');
	if (hipsRot) hips.quaternion.copy(hipsRot);
	armature.add(hips);

	const bones = [armature, hips];
	for (const canonical of limbs) {
		const b = new Bone();
		b.name = nameFor(canonical);
		// Slight non-identity rest so limb rest capture is exercised, not all-zero.
		b.quaternion.setFromAxisAngle(new Vector3(0, 0, 1), 0.05);
		hips.add(b);
		bones.push(b);
	}

	root.add(armature);
	const mesh = new SkinnedMesh(new BufferGeometry());
	root.add(mesh);
	mesh.bind(new Skeleton(bones));
	root.updateMatrixWorld(true);
	return root;
}

const identityName = (canonical) => canonical;
// DEF-/snake_case vendor names that canonicalizeBoneName still resolves.
const SNAKE = {
	Hips: 'DEF-hips', Spine: 'DEF-spine', Spine1: 'DEF-spine1', Spine2: 'DEF-spine2',
	Neck: 'DEF-neck', Head: 'DEF-head',
	LeftShoulder: 'left_shoulder', LeftArm: 'left_arm', LeftForeArm: 'left_forearm', LeftHand: 'left_hand',
	RightShoulder: 'right_shoulder', RightArm: 'right_arm', RightForeArm: 'right_forearm', RightHand: 'right_hand',
	LeftUpLeg: 'left_upleg', LeftLeg: 'left_leg', LeftFoot: 'left_foot', LeftToeBase: 'left_toebase',
	RightUpLeg: 'right_upleg', RightLeg: 'right_leg', RightFoot: 'right_foot', RightToeBase: 'right_toebase',
	LeftHandThumb1: 'left_handthumb1', LeftHandIndex1: 'left_handindex1', LeftHandMiddle1: 'left_handmiddle1',
	RightHandThumb1: 'right_handthumb1', RightHandIndex1: 'right_handindex1', RightHandMiddle1: 'right_handmiddle1',
};
const snakeName = (canonical) => SNAKE[canonical] || canonical;

const rotX = (deg) => new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), (deg * Math.PI) / 180);
const rotZ = (deg) => new Quaternion().setFromAxisAngle(new Vector3(0, 0, 1), (deg * Math.PI) / 180);

describe('upright invariant — synthetic rig conventions', () => {
	// A non-±90 / non-X convention: +90°Z armature, compensating −90°Z Hips.
	// Proves the correction generalises beyond the michelle (−90°X) case.
	describe('non-±90X convention (+90°Z armature / −90°Z Hips)', () => {
		for (const clip of FEATURED) {
			it(`${clip} stays upright`, () => {
				const root = buildSyntheticRig({
					armatureRot: rotZ(90),
					hipsRot: rotZ(-90),
					nameFor: identityName,
				});
				const scan = scanClip(root, clip);
				expect(scan).not.toBeNull();
				expect(scan.max).toBeLessThan(UPRIGHT_TOLERANCE_DEG);
			});
		}

		it('has teeth: the same rig without the correction tips over', () => {
			const root = buildSyntheticRig({
				armatureRot: rotZ(90),
				hipsRot: rotZ(-90),
				nameFor: identityName,
			});
			const verbatim = scanClip(root, 'celebrate', { withFix: false });
			expect(verbatim).not.toBeNull();
			expect(verbatim.max).toBeGreaterThan(CATASTROPHE_DEG);
		});
	});

	// DEF-/snake_case bone names (Rigify / Blender exports) that still retarget.
	describe('DEF-/snake_case bone names with a −90°X Hips', () => {
		for (const clip of FEATURED) {
			it(`${clip} maps the vendor names and stays upright`, () => {
				const root = buildSyntheticRig({
					armatureRot: rotX(90),
					hipsRot: rotX(-90),
					nameFor: snakeName,
				});
				const scan = scanClip(root, clip);
				expect(scan).not.toBeNull();
				expect(scan.max).toBeLessThan(UPRIGHT_TOLERANCE_DEG);
			});
		}
	});

	// A rig sharing too few canonical bones to perform the motion: retargetClip
	// returns a null clip (coverage below MIN_COVERAGE). That means "this rig
	// can't be driven", NOT a fallen pose — the corpus must handle it gracefully
	// (no throw) and skip it.
	describe('missing-bones rig (coverage below MIN_COVERAGE)', () => {
		const FEW = ['Spine', 'Head', 'LeftArm']; // 4 of 52 canonical tracks map → < 0.5

		it('retargets to a null clip rather than throwing or producing a fallen pose', () => {
			const root = buildSyntheticRig({
				armatureRot: rotX(90),
				hipsRot: rotX(-90),
				nameFor: identityName,
				limbs: FEW,
			});
			const map = canonicalNodeMapFromObject(root);
			const targetRest = canonicalRestMapFromObject(root);
			const { clip, coverage } = retargetClip(CLIPS.get('celebrate'), map, { targetRest });
			expect(coverage).toBeLessThan(MIN_COVERAGE);
			expect(clip).toBeNull();
		});

		it('the corpus scan treats a null clip as skip (returns null, no tilt)', () => {
			const root = buildSyntheticRig({
				armatureRot: rotX(90),
				hipsRot: rotX(-90),
				nameFor: identityName,
				limbs: FEW,
			});
			expect(() => scanClip(root, 'celebrate')).not.toThrow();
			expect(scanClip(root, 'celebrate')).toBeNull();
		});
	});
});

// ── No-regression: cz.glb round-trips byte-for-byte ─────────────────────────

describe('no-regression — cz.glb retarget is byte-for-byte the verbatim path', () => {
	// cz IS the authoring convention (its Hips rest is identity), so the bind
	// correction must be a no-op: every track's values must equal the verbatim
	// path's. This is the shipped `cz: 1.7° → 1.7°` invariant in test form.
	for (const clip of FEATURED) {
		it(`${clip}: bind-correction output equals no-correction output, track for track`, () => {
			const { root: r1 } = loadBoneGraph(avatar('cz.glb'));
			const map = canonicalNodeMapFromObject(r1);
			const targetRest = canonicalRestMapFromObject(r1);

			const corrected = retargetClip(CLIPS.get(clip), map, { targetRest }).clip;
			const verbatim = retargetClip(CLIPS.get(clip), map, { targetRest: new Map() }).clip;

			expect(corrected).not.toBeNull();
			expect(verbatim).not.toBeNull();

			const names = corrected.tracks.map((t) => t.name);
			expect(names).toEqual(verbatim.tracks.map((t) => t.name));

			for (let i = 0; i < corrected.tracks.length; i++) {
				expect(Array.from(corrected.tracks[i].values)).toEqual(
					Array.from(verbatim.tracks[i].values),
				);
			}
		});
	}
});

// ── Runtime guard helper stays silent on healthy rigs ───────────────────────

// Mirror of the runtime guard's pure measurement in src/animation-manager.js:
// the at-rest (keyframe 0) Hips tilt, which is what the guard samples once per
// clip. Proves the guard's >45° threshold never fires on a healthy retarget.
describe('runtime guard is silent on healthy rigs (at-rest Hips tilt < 45°)', () => {
	for (const [label, file] of [
		['cz.glb', 'cz.glb'],
		['michelle.glb (post-fix)', 'michelle.glb'],
	]) {
		for (const clip of FEATURED) {
			it(`${label} + ${clip}: at-rest tilt stays well under the 45° guard threshold`, () => {
				const { root } = loadBoneGraph(avatar(file));
				const scan = scanClip(root, clip);
				expect(scan).not.toBeNull();
				expect(scan.atKeyframe0).toBeLessThan(45);
			});
		}
	}
});

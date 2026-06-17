/**
 * Runtime animation retargeting — unit tests.
 *
 * Builds synthetic skeletons and clips in-memory (no GLB fixtures), so the
 * suite is fast and deterministic. Covers the contract that lets a canonical
 * preset clip drive an arbitrarily-named, arbitrarily-proportioned rig:
 *   - track bone names rewritten to the target's actual node names,
 *   - vendor-prefixed rigs (mixamorig:, DEF-, snake_case) still map,
 *   - tracks for bones the rig lacks are dropped + reported,
 *   - coverage gating returns a null clip below MIN_COVERAGE,
 *   - hip translation scaling and speed resampling are applied.
 */

import { describe, it, expect } from 'vitest';
import {
	Bone,
	SkinnedMesh,
	Skeleton,
	BufferGeometry,
	QuaternionKeyframeTrack,
	VectorKeyframeTrack,
	AnimationClip,
	Object3D,
	Quaternion,
} from 'three';
import {
	canonicalNodeMapFromObject,
	canonicalRestMapFromObject,
	retargetClip,
	retargetClipToObject,
	scaleClipSpeed,
	MIN_COVERAGE,
} from '../src/animation-retarget.js';
import { CANONICAL_REST } from '../src/animation-canonical-rest.js';

// Build a SkinnedMesh-rooted skeleton from a list of bone names so
// canonicalNodeMapFromObject finds it the way it would in a real GLB.
function makeRig(boneNames) {
	const root = new Object3D();
	const bones = boneNames.map((name) => {
		const b = new Bone();
		b.name = name;
		return b;
	});
	// Parent them all under root (flat is fine for name-mapping tests).
	for (const b of bones) root.add(b);
	const mesh = new SkinnedMesh(new BufferGeometry());
	mesh.add(bones[0]);
	mesh.bind(new Skeleton(bones));
	root.add(mesh);
	return root;
}

// A canonical clip: quaternion tracks on a few bones + a Hips position track.
function makeCanonicalClip() {
	const q = new QuaternionKeyframeTrack('Hips.quaternion', [0, 1], [0, 0, 0, 1, 0, 0, 0, 1]);
	const spine = new QuaternionKeyframeTrack('Spine.quaternion', [0, 1], [0, 0, 0, 1, 0, 0, 0, 1]);
	const arm = new QuaternionKeyframeTrack('LeftArm.quaternion', [0, 1], [0, 0, 0, 1, 0, 0, 0, 1]);
	// Hips at world Y = 1.0 (authoring rig height).
	const pos = new VectorKeyframeTrack('Hips.position', [0, 1], [0, 1, 0, 0, 1.1, 0]);
	return new AnimationClip('test', 1, [q, spine, arm, pos]);
}

const CANONICAL_RIG = ['Hips', 'Spine', 'LeftArm', 'RightArm', 'Head'];

describe('canonicalNodeMapFromObject', () => {
	it('maps canonical bone names to themselves', () => {
		const map = canonicalNodeMapFromObject(makeRig(CANONICAL_RIG));
		expect(map.get('Hips')).toBe('Hips');
		expect(map.get('LeftArm')).toBe('LeftArm');
	});

	it('maps vendor-prefixed and separator variants to canonical → real node name', () => {
		const map = canonicalNodeMapFromObject(
			makeRig(['mixamorig:Hips', 'DEF-spine', 'left_arm', 'Armature_Head']),
		);
		expect(map.get('Hips')).toBe('mixamorig:Hips');
		expect(map.get('Spine')).toBe('DEF-spine');
		expect(map.get('LeftArm')).toBe('left_arm');
		expect(map.get('Head')).toBe('Armature_Head');
	});

	it('returns an empty map for a rig with no recognizable humanoid bones', () => {
		const map = canonicalNodeMapFromObject(makeRig(['root', 'wheel_fl', 'wheel_fr']));
		expect(map.size).toBe(0);
	});
});

describe('retargetClip', () => {
	it('rewrites track bone names onto an identically-named rig (100% coverage)', () => {
		const clip = makeCanonicalClip();
		const map = canonicalNodeMapFromObject(makeRig(CANONICAL_RIG));
		const r = retargetClip(clip, map, { hipScale: 1 });
		expect(r.coverage).toBe(1);
		expect(r.matched).toBe(4);
		expect(r.clip.tracks.map((t) => t.name).sort()).toEqual(
			['Hips.position', 'Hips.quaternion', 'LeftArm.quaternion', 'Spine.quaternion'].sort(),
		);
	});

	it('rewrites onto a differently-named (Mixamo) rig', () => {
		const clip = makeCanonicalClip();
		const map = canonicalNodeMapFromObject(
			makeRig([
				'mixamorig:Hips',
				'mixamorig:Spine',
				'mixamorig:LeftArm',
				'mixamorig:RightArm',
			]),
		);
		const r = retargetClip(clip, map, { hipScale: 1 });
		const names = r.clip.tracks.map((t) => t.name);
		expect(names).toContain('mixamorig:Hips.quaternion');
		expect(names).toContain('mixamorig:LeftArm.quaternion');
		expect(names).toContain('mixamorig:Hips.position');
	});

	it('drops tracks for bones the rig lacks and reports them', () => {
		const clip = makeCanonicalClip(); // addresses Hips, Spine, LeftArm
		const map = canonicalNodeMapFromObject(makeRig(['Hips', 'Spine'])); // no LeftArm
		const r = retargetClip(clip, map, { hipScale: 1, minCoverage: 0.1 });
		expect(r.dropped).toContain('LeftArm');
		expect(r.clip.tracks.find((t) => t.name.includes('LeftArm'))).toBeUndefined();
	});

	it('returns a null clip when coverage is below the threshold', () => {
		const clip = makeCanonicalClip(); // 4 tracks (Hips ×2, Spine, LeftArm)
		const map = canonicalNodeMapFromObject(makeRig(['Spine'])); // only 1 of 4 maps
		const r = retargetClip(clip, map);
		expect(r.coverage).toBeLessThan(MIN_COVERAGE);
		expect(r.clip).toBeNull();
	});

	it('scales the hip position track by hipScale', () => {
		const clip = makeCanonicalClip();
		const map = canonicalNodeMapFromObject(makeRig(CANONICAL_RIG));
		const r = retargetClip(clip, map, { hipScale: 2 });
		const pos = r.clip.tracks.find((t) => t.name === 'Hips.position');
		// Original Y values were 1 and 1.1 → doubled.
		expect(pos.values[1]).toBeCloseTo(2, 5);
		expect(pos.values[4]).toBeCloseTo(2.2, 5);
	});

	it('does not mutate the source clip', () => {
		const clip = makeCanonicalClip();
		const before = clip.tracks.map((t) => t.name);
		const map = canonicalNodeMapFromObject(
			makeRig(['mixamorig:Hips', 'mixamorig:Spine', 'mixamorig:LeftArm']),
		);
		retargetClip(clip, map, { hipScale: 3 });
		expect(clip.tracks.map((t) => t.name)).toEqual(before);
		expect(clip.tracks.find((t) => t.name === 'Hips.position').values[1]).toBe(1);
	});
});

describe('bind-rotation correction', () => {
	// A −90°X rest, the up-axis convention Mixamo/FBX bakes onto Hips.
	const MINUS_90X = new Quaternion().setFromAxisAngle({ x: 1, y: 0, z: 0 }, -Math.PI / 2);

	// Pose a synthetic rig in the canonical authoring rest (cz's rest pose), so it
	// matches the convention the clip library was baked against.
	function applyAuthoringRest(rig, names) {
		for (const n of names) {
			const b = rig.getObjectByName(n);
			if (b && CANONICAL_REST[n]) b.quaternion.fromArray(CANONICAL_REST[n]);
		}
	}

	it('round-trips byte-for-byte when the rig matches the canonical authoring rest', () => {
		const clip = makeCanonicalClip();
		const rig = makeRig(CANONICAL_RIG);
		applyAuthoringRest(rig, CANONICAL_RIG);
		const map = canonicalNodeMapFromObject(rig);
		const targetRest = canonicalRestMapFromObject(rig);
		const corrected = retargetClip(clip, map, { hipScale: 1, targetRest }).clip;
		const verbatim = retargetClip(clip, map, { hipScale: 1 }).clip; // no targetRest → no correction
		// Every correction is identity (target rest == authoring rest) → skipped.
		corrected.tracks.forEach((t, i) => {
			expect(Array.from(t.values)).toEqual(Array.from(verbatim.tracks[i].values));
		});
	});

	it('re-applies a Hips up-axis rest the clip would otherwise overwrite (stays upright)', () => {
		const clip = makeCanonicalClip(); // Hips.quaternion identity at every key
		const rig = makeRig(CANONICAL_RIG);
		applyAuthoringRest(rig, CANONICAL_RIG);
		// Bake a Mixamo-style −90°X onto Hips: Tr = (−90X)·Sr ⇒ C = Tr·Sr⁻¹ = −90X.
		const sr = new Quaternion().fromArray(CANONICAL_REST.Hips);
		rig.getObjectByName('Hips').quaternion.copy(MINUS_90X.clone().multiply(sr));
		const map = canonicalNodeMapFromObject(rig);
		const targetRest = canonicalRestMapFromObject(rig);
		const r = retargetClip(clip, map, { hipScale: 1, targetRest }).clip;

		// C · identity = C = −90X exactly, restoring the rig's upright convention.
		const hipsQ = r.tracks.find((t) => t.name === 'Hips.quaternion');
		expect(hipsQ.values[0]).toBeCloseTo(MINUS_90X.x, 5);
		expect(hipsQ.values[3]).toBeCloseTo(MINUS_90X.w, 5);

		// Root-motion keyframes rotate by the same correction: (0,1,0) → (0,0,−1).
		const hipsP = r.tracks.find((t) => t.name === 'Hips.position');
		expect(hipsP.values[2]).toBeCloseTo(-1, 5);
	});

	it('corrects limb bones too — a T-pose (identity) arm rest is not copied verbatim', () => {
		const clip = makeCanonicalClip();
		const rig = makeRig(CANONICAL_RIG); // identity rests ≠ cz's A-pose authoring rest
		const map = canonicalNodeMapFromObject(rig);
		const targetRest = canonicalRestMapFromObject(rig);
		const corrected = retargetClip(clip, map, { hipScale: 1, targetRest }).clip;
		const verbatim = retargetClip(clip, map, { hipScale: 1 }).clip;
		const armC = corrected.tracks.find((t) => t.name === 'LeftArm.quaternion');
		const armV = verbatim.tracks.find((t) => t.name === 'LeftArm.quaternion');
		// cz rests its arms in an A-pose, so an identity-rest arm gets a real correction.
		expect(Array.from(armC.values)).not.toEqual(Array.from(armV.values));
	});

	it('hip scaling and rotation compose on the position track', () => {
		const clip = makeCanonicalClip();
		const rig = makeRig(CANONICAL_RIG);
		applyAuthoringRest(rig, CANONICAL_RIG);
		const sr = new Quaternion().fromArray(CANONICAL_REST.Hips);
		rig.getObjectByName('Hips').quaternion.copy(MINUS_90X.clone().multiply(sr));
		const map = canonicalNodeMapFromObject(rig);
		const targetRest = canonicalRestMapFromObject(rig);
		const r = retargetClip(clip, map, { hipScale: 2, targetRest }).clip;
		const hipsP = r.tracks.find((t) => t.name === 'Hips.position');
		// (0,1,0) rotated → (0,0,−1), then ×2 → (0,0,−2).
		expect(hipsP.values[2]).toBeCloseTo(-2, 5);
	});
});

describe('retargetClipToObject', () => {
	it('retargets straight onto an Object3D graph', () => {
		const clip = makeCanonicalClip();
		const rig = makeRig([
			'mixamorig:Hips',
			'mixamorig:Spine',
			'mixamorig:LeftArm',
			'mixamorig:RightArm',
		]);
		const r = retargetClipToObject(clip, rig, { minCoverage: 0.5 });
		expect(r.clip).not.toBeNull();
		expect(r.clip.tracks.some((t) => t.name === 'mixamorig:LeftArm.quaternion')).toBe(true);
	});
});

describe('scaleClipSpeed', () => {
	it('1.8× shortens duration and times proportionally', () => {
		const clip = makeCanonicalClip(); // duration 1
		const fast = scaleClipSpeed(clip, 1.8);
		expect(fast.duration).toBeCloseTo(1 / 1.8, 5);
		const t = fast.tracks[0].times;
		expect(t[t.length - 1]).toBeCloseTo(1 / 1.8, 5);
	});

	it('factor of 1 returns the clip unchanged', () => {
		const clip = makeCanonicalClip();
		expect(scaleClipSpeed(clip, 1)).toBe(clip);
	});

	it('does not mutate the source clip', () => {
		const clip = makeCanonicalClip();
		const origDur = clip.duration;
		scaleClipSpeed(clip, 2);
		expect(clip.duration).toBe(origDur);
	});
});

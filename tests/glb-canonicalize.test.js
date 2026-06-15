/**
 * GLB bone-name canonicalizer — unit tests.
 *
 * Covers both the name-mapping helper and the full GLB rewrite. The GLB tests
 * build synthetic v2 GLB ArrayBuffers in-memory (no fixtures on disk), which
 * keeps the suite fast and lets us assert exact byte-level behaviour: header
 * checks, chunk-length update, BIN-chunk preservation, 4-byte padding.
 */

import { describe, it, expect } from 'vitest';
import {
	canonicalizeBoneName,
	canonicalizeJointNodes,
	canonicalizeGLBBones,
	CANONICAL_BONES,
} from '../src/glb-canonicalize.js';

const GLB_MAGIC      = 0x46546c67;
const CHUNK_TYPE_JSON = 0x4e4f534a;
const CHUNK_TYPE_BIN  = 0x004e4942;

// Build a synthetic GLB v2 from a JS object (JSON chunk) and an optional
// Uint8Array (BIN chunk).
function buildGLB(jsonObj, bin = null) {
	let jsonBytes = new TextEncoder().encode(JSON.stringify(jsonObj));
	const jPad = (4 - (jsonBytes.length % 4)) % 4;
	if (jPad) {
		const padded = new Uint8Array(jsonBytes.length + jPad);
		padded.set(jsonBytes);
		for (let i = 0; i < jPad; i++) padded[jsonBytes.length + i] = 0x20;
		jsonBytes = padded;
	}
	let binBytes = null;
	if (bin) {
		const bPad = (4 - (bin.length % 4)) % 4;
		if (bPad) {
			binBytes = new Uint8Array(bin.length + bPad);
			binBytes.set(bin);
		} else {
			binBytes = bin;
		}
	}
	const total = 12 + 8 + jsonBytes.length + (binBytes ? 8 + binBytes.length : 0);
	const ab = new ArrayBuffer(total);
	const dv = new DataView(ab);
	const u8 = new Uint8Array(ab);
	dv.setUint32(0, GLB_MAGIC, true);
	dv.setUint32(4, 2, true);
	dv.setUint32(8, total, true);
	dv.setUint32(12, jsonBytes.length, true);
	dv.setUint32(16, CHUNK_TYPE_JSON, true);
	u8.set(jsonBytes, 20);
	if (binBytes) {
		const binOff = 20 + jsonBytes.length;
		dv.setUint32(binOff, binBytes.length, true);
		dv.setUint32(binOff + 4, CHUNK_TYPE_BIN, true);
		u8.set(binBytes, binOff + 8);
	}
	return ab;
}

// Re-parse the JSON chunk out of a GLB ArrayBuffer.
function readGLBJson(ab) {
	const dv = new DataView(ab);
	const jLen = dv.getUint32(12, true);
	const jsonBytes = new Uint8Array(ab, 20, jLen);
	return JSON.parse(new TextDecoder().decode(jsonBytes).replace(/\s+$/, ''));
}

// Mixamo-style skinned humanoid skeleton for round-trip tests.
const MIXAMO_NODES = [
	{ name: 'mixamorig:Hips',          children: [1, 30, 38] },
	{ name: 'mixamorig:Spine' },
	{ name: 'mixamorig:LeftArm' },
	{ name: 'mixamorig:LeftForeArm' },
	{ name: 'mixamorig:LeftHand' },
	{ name: 'mixamorig:RightArm' },
	// A non-joint mesh node intentionally has a bone-shaped name to confirm
	// it is NOT renamed (we only touch skins[].joints[]).
	{ name: 'mixamorig:LeftLeg_collision_mesh', mesh: 0 },
];
const MIXAMO_SKINS = [{ joints: [0, 1, 2, 3, 4, 5] }];

describe('canonicalizeBoneName', () => {
	it('returns null for non-strings, empties, and unknown names', () => {
		expect(canonicalizeBoneName(null)).toBeNull();
		expect(canonicalizeBoneName(undefined)).toBeNull();
		expect(canonicalizeBoneName('')).toBeNull();
		expect(canonicalizeBoneName(42)).toBeNull();
		expect(canonicalizeBoneName('Tail_01')).toBeNull();
		expect(canonicalizeBoneName('J_Bip_L_UpperArm')).toBeNull(); // VRM — unmapped
	});

	it('returns canonical exact-match names unchanged', () => {
		for (const name of CANONICAL_BONES) {
			expect(canonicalizeBoneName(name)).toBe(name);
		}
	});

	it.each([
		['mixamorig:LeftArm',          'LeftArm'],
		['mixamorig1:LeftForeArm',     'LeftForeArm'],
		['mixamorigHead',              'Head'],
		['mixamorig_LeftHandThumb3',   'LeftHandThumb3'],
		['MIXAMORIG:LeftHand',         'LeftHand'],
	])('strips Mixamo prefix: %s → %s', (input, expected) => {
		expect(canonicalizeBoneName(input)).toBe(expected);
	});

	it.each([
		['Armature_Hips',     'Hips'],
		['Armature/LeftLeg',  'LeftLeg'],
		['armature_RightArm', 'RightArm'],
	])('strips Armature prefix: %s → %s', (input, expected) => {
		expect(canonicalizeBoneName(input)).toBe(expected);
	});

	it.each([
		['DEF-LeftArm',  'LeftArm'],
		['ORG-Hips',     'Hips'],
		['MCH-RightLeg', 'RightLeg'],
		['DEF_Spine1',   'Spine1'],
	])('strips Rigify prefix: %s → %s', (input, expected) => {
		expect(canonicalizeBoneName(input)).toBe(expected);
	});

	it.each([
		['left_arm',         'LeftArm'],
		['Left_Arm',         'LeftArm'],
		['left-arm',         'LeftArm'],
		['LEFT_ARM',         'LeftArm'],
		['right hand',       'RightHand'],
		['lefttoebase',      'LeftToeBase'],
		['left_hand_index1', 'LeftHandIndex1'],
	])('canonicalizes separator / case variants: %s → %s', (input, expected) => {
		expect(canonicalizeBoneName(input)).toBe(expected);
	});

	it('combines vendor prefix + separator variant: mixamorig:left_arm → LeftArm', () => {
		expect(canonicalizeBoneName('mixamorig:left_arm')).toBe('LeftArm');
		expect(canonicalizeBoneName('DEF-left_fore_arm')).toBe('LeftForeArm');
	});

	// CharacterStudio prefixes every joint `CH_`; the stems are otherwise
	// canonical, so stripping the prefix makes the whole rig drivable.
	it.each([
		['CH_Hips',        'Hips'],
		['CH_LeftUpLeg',   'LeftUpLeg'],
		['CH_RightFoot',   'RightFoot'],
		['CH_Hips_01',     'Hips'],          // CH_ prefix + glTF de-dup suffix
		['CH_LeftLeg_03',  'LeftLeg'],
	])('strips the CharacterStudio CH_ prefix: %s → %s', (input, expected) => {
		expect(canonicalizeBoneName(input)).toBe(expected);
	});

	// Unreal Engine mannequin joint names map onto canonical bones via the
	// alias table. The `_l`/`_r` side suffix is preserved through the collapse.
	it.each([
		['pelvis',      'Hips'],
		['pelvis_09',   'Hips'],            // UE name + de-dup suffix
		['clavicle_l',  'LeftShoulder'],
		['upperarm_l',  'LeftArm'],
		['lowerarm_r',  'RightForeArm'],
		['hand_r',      'RightHand'],
		['thigh_l',     'LeftUpLeg'],
		['calf_l',      'LeftLeg'],
		['foot_r',      'RightFoot'],
		['ball_l',      'LeftToeBase'],
		['thigh_l_010', 'LeftUpLeg'],       // UE name + de-dup suffix
	])('maps Unreal mannequin bones: %s → %s', (input, expected) => {
		expect(canonicalizeBoneName(input)).toBe(expected);
	});

	// The Unreal spine chain is intentionally NOT aliased — `spine_02`'s
	// stripped form collides with Mixamo's `Spine` + `_02` de-dup, which must
	// keep resolving to `Spine` (asserted in the de-dup suite above). Guard it
	// here so a future alias addition can't silently break that.
	it('does not alias the Unreal spine chain (avoids Mixamo de-dup collision)', () => {
		expect(canonicalizeBoneName('mixamorig:Spine_02')).toBe('Spine');
		expect(canonicalizeBoneName('mixamorig:Spine_03')).toBe('Spine');
	});

	// glTF/FBX exporters (CharacterStudio, Blender, FBX2glTF) append a `_NN`
	// node-de-dup index to keep names unique. These are the bone names that ship
	// in real uploaded avatars — without stripping the suffix the whole animation
	// library silently fails to bind to them.
	it.each([
		['mixamorig:Hips_01',        'Hips'],
		['mixamorig:Spine_02',       'Spine'],
		['mixamorig:Spine1_03',      'Spine1'],  // base name itself ends in a digit
		['mixamorig:Spine2_04',      'Spine2'],
		['mixamorig:Neck_05',        'Neck'],
		['mixamorig:LeftForeArm_010','LeftForeArm'],
		['mixamorig:LeftToeBase_058','LeftToeBase'],
		['mixamorig:RightUpLeg_060', 'RightUpLeg'],
		['Hips_01',                  'Hips'],
		['LeftHandIndex1_016',       'LeftHandIndex1'], // digit base + dedup suffix
	])('strips the glTF node-de-dup suffix: %s → %s', (input, expected) => {
		expect(canonicalizeBoneName(input)).toBe(expected);
	});

	it('only strips the suffix when the plain form does not already resolve', () => {
		// A genuinely numbered finger bone must keep its index — the un-stripped
		// form resolves first, so we never reach the suffix strip.
		expect(canonicalizeBoneName('left_hand_index_1')).toBe('LeftHandIndex1');
		expect(canonicalizeBoneName('LeftHandIndex1')).toBe('LeftHandIndex1');
		// End-effector / non-bone nodes still fall through to null after stripping.
		expect(canonicalizeBoneName('mixamorig:HeadTop_End_07')).toBeNull();
		expect(canonicalizeBoneName('mixamorig:LeftToe_End_059')).toBeNull();
		expect(canonicalizeBoneName('Tail_01')).toBeNull();
	});
});

describe('canonicalizeJointNodes (in-place rewrite)', () => {
	it('only touches nodes referenced by skins[].joints', () => {
		const json = {
			nodes: [
				{ name: 'mixamorig:Hips' },
				{ name: 'mixamorig:Spine' },
				{ name: 'mixamorig:left_arm' },
				{ name: 'mixamorig:Decoration_NotABone' }, // not a joint — left alone
			],
			skins: [{ joints: [0, 1, 2] }],
		};
		const { renamed, samples } = canonicalizeJointNodes(json);
		expect(renamed).toBe(3);
		expect(json.nodes[0].name).toBe('Hips');
		expect(json.nodes[1].name).toBe('Spine');
		expect(json.nodes[2].name).toBe('LeftArm');
		expect(json.nodes[3].name).toBe('mixamorig:Decoration_NotABone');
		expect(samples).toHaveLength(3);
		expect(samples[0]).toEqual({ from: 'mixamorig:Hips', to: 'Hips' });
	});

	it('returns 0 when the rig is already canonical', () => {
		const json = {
			nodes: [{ name: 'Hips' }, { name: 'Spine' }, { name: 'LeftArm' }],
			skins: [{ joints: [0, 1, 2] }],
		};
		const { renamed } = canonicalizeJointNodes(json);
		expect(renamed).toBe(0);
		expect(json.nodes[0].name).toBe('Hips');
	});

	it('returns 0 and never throws on a buffer-less GLB JSON (no skins / no nodes)', () => {
		expect(canonicalizeJointNodes({}).renamed).toBe(0);
		expect(canonicalizeJointNodes({ nodes: [] }).renamed).toBe(0);
		expect(canonicalizeJointNodes({ nodes: [{ name: 'mixamorig:Hips' }] }).renamed).toBe(0);
	});

	it('skips joints whose names are not recognised humanoid bones', () => {
		const json = {
			nodes: [{ name: 'mixamorig:Hips' }, { name: 'mixamorig:Tail_01' }, { name: 'J_Bip_L_UpperArm' }],
			skins: [{ joints: [0, 1, 2] }],
		};
		const { renamed } = canonicalizeJointNodes(json);
		expect(renamed).toBe(1); // only Hips
		expect(json.nodes[0].name).toBe('Hips');
		expect(json.nodes[1].name).toBe('mixamorig:Tail_01');
		expect(json.nodes[2].name).toBe('J_Bip_L_UpperArm');
	});
});

describe('canonicalizeGLBBones (full GLB rewrite)', () => {
	it('throws clearly on a non-ArrayBuffer or truncated buffer', () => {
		expect(() => canonicalizeGLBBones(null)).toThrow(/ArrayBuffer required/);
		expect(() => canonicalizeGLBBones(new ArrayBuffer(8))).toThrow(/too small/);
	});

	it('throws on a bad magic number', () => {
		const ab = new ArrayBuffer(40);
		new DataView(ab).setUint32(0, 0xdeadbeef, true);
		expect(() => canonicalizeGLBBones(ab)).toThrow(/bad magic/);
	});

	it('throws on GLB version != 2', () => {
		const ab = new ArrayBuffer(40);
		const dv = new DataView(ab);
		dv.setUint32(0, GLB_MAGIC, true);
		dv.setUint32(4, 1, true);
		expect(() => canonicalizeGLBBones(ab)).toThrow(/v2 is supported/);
	});

	it('returns the original buffer by reference when no renames were needed', () => {
		const ab = buildGLB({
			nodes: [{ name: 'Hips' }, { name: 'LeftArm' }],
			skins: [{ joints: [0, 1] }],
		});
		const out = canonicalizeGLBBones(ab);
		expect(out.renamed).toBe(0);
		expect(out.buffer).toBe(ab); // same reference — caller can skip re-upload
	});

	it('rewrites Mixamo-prefixed joint names and produces a valid GLB', () => {
		const bin = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);
		const ab = buildGLB({ nodes: MIXAMO_NODES, skins: MIXAMO_SKINS }, bin);
		const { buffer, renamed, samples } = canonicalizeGLBBones(ab);
		expect(renamed).toBe(6);
		expect(buffer).not.toBe(ab);

		const dv = new DataView(buffer);
		expect(dv.getUint32(0, true)).toBe(GLB_MAGIC);
		expect(dv.getUint32(4, true)).toBe(2);
		expect(dv.getUint32(8, true)).toBe(buffer.byteLength);

		const json = readGLBJson(buffer);
		expect(json.nodes[0].name).toBe('Hips');
		expect(json.nodes[1].name).toBe('Spine');
		expect(json.nodes[2].name).toBe('LeftArm');
		expect(json.nodes[3].name).toBe('LeftForeArm');
		expect(json.nodes[4].name).toBe('LeftHand');
		expect(json.nodes[5].name).toBe('RightArm');
		// Non-joint preserved verbatim.
		expect(json.nodes[6].name).toBe('mixamorig:LeftLeg_collision_mesh');

		// Samples are stable, used by the dashboard to surface "X bones retargeted".
		expect(samples.length).toBeGreaterThan(0);
		expect(samples[0].from).toMatch(/^mixamorig:/);
	});

	it('preserves the BIN chunk byte-for-byte', () => {
		const bin = new Uint8Array(64);
		for (let i = 0; i < bin.length; i++) bin[i] = (i * 7 + 13) & 0xff;
		const ab = buildGLB({ nodes: MIXAMO_NODES, skins: MIXAMO_SKINS }, bin);
		const { buffer } = canonicalizeGLBBones(ab);

		// Find BIN chunk in the rewritten buffer.
		const dv = new DataView(buffer);
		const jLen = dv.getUint32(12, true);
		const binOffset = 20 + jLen;
		expect(dv.getUint32(binOffset + 4, true)).toBe(CHUNK_TYPE_BIN);
		const binLen = dv.getUint32(binOffset, true);
		expect(binLen).toBe(bin.length);
		const recoveredBin = new Uint8Array(buffer, binOffset + 8, binLen);
		expect(Array.from(recoveredBin)).toEqual(Array.from(bin));
	});

	it('JSON chunk in the output is 4-byte aligned', () => {
		const ab = buildGLB({ nodes: MIXAMO_NODES, skins: MIXAMO_SKINS });
		const { buffer } = canonicalizeGLBBones(ab);
		const jLen = new DataView(buffer).getUint32(12, true);
		expect(jLen % 4).toBe(0);
	});

	it('round-trips a buffer-less GLB (no BIN chunk)', () => {
		const ab = buildGLB({ nodes: MIXAMO_NODES, skins: MIXAMO_SKINS });
		const { buffer, renamed } = canonicalizeGLBBones(ab);
		expect(renamed).toBe(6);
		// Header `total` matches actual byte length and there's no chunk 1.
		const dv = new DataView(buffer);
		expect(dv.getUint32(8, true)).toBe(buffer.byteLength);
		const jLen = dv.getUint32(12, true);
		expect(20 + jLen).toBe(buffer.byteLength);
	});
});

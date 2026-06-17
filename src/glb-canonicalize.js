// GLB bone-name canonicalizer — rewrites joint node names in an uploaded
// humanoid GLB so they match the three.ws canonical bone set, letting the
// pre-baked Mixamo animation library play on any rig variant.
//
// Handled name variants:
//   • Mixamo:          `mixamorig:LeftArm`, `mixamorig1:LeftArm`, `mixamorigLeftArm`
//   • Blender:         `Armature_LeftArm`, `Armature/LeftArm`
//   • Rigify:          `DEF-LeftArm`, `ORG-LeftArm`, `MCH-LeftArm`
//   • CharacterStudio: `CH_Hips`, `CH_LeftUpLeg` (CH_ prefix stripped)
//   • Unreal mannequin: `pelvis`, `clavicle_l`, `upperarm_l`, `thigh_l`, `calf_l`, … (alias map)
//   • snake_case:      `left_arm`, `Left_Arm`
//   • kebab-case:      `left-arm`
//   • lowercase:       `leftarm`, `lefthand`
//
// VRM-style names (`J_Bip_L_UpperArm`) and skeletons that aren't humanoid
// (quadrupeds, custom rigs) deliberately fall through unchanged — there's no
// safe automatic mapping for those.
//
// This module is pure JS — works in Node (vitest) and in the browser. It
// rewrites the GLB JSON chunk in-place and repacks the binary container so
// the result is a valid GLB that swaps in 1:1 at the same R2 storage key.

import { Matrix4, Quaternion, Vector3 } from 'three';

const GLB_MAGIC      = 0x46546c67; // 'glTF' little-endian
const CHUNK_TYPE_JSON = 0x4e4f534a; // 'JSON'

// Quaternion is "axis-aligned enough" / scale is "uniform enough" below this.
const ORIENT_EPS = 1e-5;
// Joint world-matrix elements must match within this before/after the fold, or
// the fold is reverted (it would have altered the mesh).
const ORIENT_WORLD_EPS = 1e-4;

// Canonical humanoid bone set. Mirrors the rig used by scripts/build-animations.mjs
// (cz.glb / Avaturn reference rig) — every animation clip in /public/animations/clips
// addresses tracks by these exact names.
export const CANONICAL_BONES = Object.freeze([
	'Hips', 'Spine', 'Spine1', 'Spine2', 'Neck', 'Head',
	'LeftShoulder', 'LeftArm', 'LeftForeArm', 'LeftHand',
	'LeftHandIndex1', 'LeftHandIndex2', 'LeftHandIndex3',
	'LeftHandMiddle1', 'LeftHandMiddle2', 'LeftHandMiddle3',
	'LeftHandPinky1', 'LeftHandPinky2', 'LeftHandPinky3',
	'LeftHandRing1', 'LeftHandRing2', 'LeftHandRing3',
	'LeftHandThumb1', 'LeftHandThumb2', 'LeftHandThumb3',
	'RightShoulder', 'RightArm', 'RightForeArm', 'RightHand',
	'RightHandIndex1', 'RightHandIndex2', 'RightHandIndex3',
	'RightHandMiddle1', 'RightHandMiddle2', 'RightHandMiddle3',
	'RightHandPinky1', 'RightHandPinky2', 'RightHandPinky3',
	'RightHandRing1', 'RightHandRing2', 'RightHandRing3',
	'RightHandThumb1', 'RightHandThumb2', 'RightHandThumb3',
	'LeftUpLeg', 'LeftLeg', 'LeftFoot', 'LeftToeBase',
	'RightUpLeg', 'RightLeg', 'RightFoot', 'RightToeBase',
]);

// Lookup map: separator-stripped, lowercased variant → canonical name.
// Built once at module load so canonicalizeBoneName() runs in O(1).
const LOOKUP = (() => {
	const m = new Map();
	for (const canonical of CANONICAL_BONES) {
		m.set(canonical.toLowerCase(), canonical);
	}
	return m;
})();

// Unreal Engine mannequin skeleton → canonical aliases. UE names the same
// joints `pelvis`, `clavicle_l`, `upperarm_l`, `thigh_l`, `calf_l`, `ball_l`,
// … which share no spelling with the canonical/Mixamo set. Keyed by the same
// separator-stripped lowercase form `_lookupBone` produces (`clavicle_l` →
// `claviclel`). The spine chain (`spine_01/02/03`) is deliberately OMITTED:
// its stripped form `spine02` collides with Mixamo's `Spine` + `_02` de-dup
// suffix, which canonicalizeBoneName already resolves to `Spine`. The torso
// then rides on `Hips` while every limb, foot, and the neck retarget cleanly —
// well above the 8-bone floor a readable performance needs.
const UNREAL_ALIASES = new Map(Object.entries({
	pelvis: 'Hips',
	neck01: 'Neck',
	claviclel: 'LeftShoulder', upperarml: 'LeftArm', lowerarml: 'LeftForeArm', handl: 'LeftHand',
	clavicler: 'RightShoulder', upperarmr: 'RightArm', lowerarmr: 'RightForeArm', handr: 'RightHand',
	thighl: 'LeftUpLeg', calfl: 'LeftLeg', footl: 'LeftFoot', balll: 'LeftToeBase',
	thighr: 'RightUpLeg', calfr: 'RightLeg', footr: 'RightFoot', ballr: 'RightToeBase',
}));

/**
 * Reduce a bone name to its canonical three.ws form, or null if it doesn't
 * correspond to a recognised humanoid bone.
 *
 * @param {string} name
 * @returns {string|null}
 */
export function canonicalizeBoneName(name) {
	if (typeof name !== 'string' || !name) return null;
	const direct = _lookupBone(name);
	if (direct) return direct;
	// glTF/FBX node de-dup suffix: exporters (CharacterStudio, Blender's glTF
	// writer, FBX2glTF) append `_NN` to keep node names unique, producing
	// `mixamorig:Hips_01`, `Spine1_03`, `LeftForeArm_010`. The plain lookup
	// can't see past the suffix, so retry once with a trailing `_<digits>`
	// removed — but only when the un-stripped form didn't already resolve, so a
	// genuinely numbered bone like `left_hand_index_1` still maps to
	// `LeftHandIndex1` before we'd ever strip its index.
	const deduped = name.replace(/_\d+$/, '');
	if (deduped !== name) return _lookupBone(deduped);
	return null;
}

// Reduce a single bone-name variant to canonical form via the lookup table.
// Strips vendor prefixes and separators; returns null on no match.
function _lookupBone(name) {
	let s = name;
	// Strip well-known vendor prefixes (case-insensitive, in priority order).
	s = s.replace(/^mixamorig\d*[_:]?/i, '');
	s = s.replace(/^Armature[_/]?/i, '');
	s = s.replace(/^(DEF|ORG|MCH)[-_]/i, '');
	// CharacterStudio exports prefix every joint `CH_` (`CH_Hips`, `CH_LeftUpLeg`),
	// whose stems are otherwise canonical — strip it like any other vendor prefix.
	s = s.replace(/^CH[_:]/i, '');
	// Collapse separators so `Left_Arm`, `left-arm`, `left arm`, `LeftArm` all
	// reach the same lookup key.
	const key = s.replace(/[-_\s]+/g, '').toLowerCase();
	// Canonical/Mixamo/Rigify spellings first, then the Unreal-mannequin aliases.
	return LOOKUP.get(key) ?? UNREAL_ALIASES.get(key) ?? null;
}

/**
 * Walk a parsed glTF JSON object and canonicalize joint-node names in place.
 * Only nodes referenced from `skins[].joints[]` are touched — non-bone nodes
 * (meshes, cameras, lights) keep their original names.
 *
 * @param {object} json - parsed glTF JSON
 * @returns {{ renamed: number, samples: Array<{ from: string, to: string }> }}
 */
export function canonicalizeJointNodes(json) {
	if (!json || !Array.isArray(json.nodes) || !Array.isArray(json.skins)) {
		return { renamed: 0, samples: [] };
	}
	const jointIndices = new Set();
	for (const skin of json.skins) {
		if (Array.isArray(skin.joints)) {
			for (const idx of skin.joints) jointIndices.add(idx);
		}
	}
	let renamed = 0;
	const samples = [];
	for (const idx of jointIndices) {
		const node = json.nodes[idx];
		if (!node || typeof node.name !== 'string') continue;
		const canonical = canonicalizeBoneName(node.name);
		if (canonical && canonical !== node.name) {
			if (samples.length < 5) samples.push({ from: node.name, to: canonical });
			node.name = canonical;
			renamed++;
		}
	}
	return { renamed, samples };
}

// Local TRS → Matrix4 for a glTF node.
function nodeLocalMatrix(node) {
	const t = new Vector3();
	const r = new Quaternion();
	const s = new Vector3(1, 1, 1);
	if (node.translation) t.fromArray(node.translation);
	if (node.rotation) r.fromArray(node.rotation);
	if (node.scale) s.fromArray(node.scale);
	return new Matrix4().compose(t, r, s);
}

// World matrices for a set of node indices, each walked to its scene root.
function worldMatricesFor(json, indices, parentOf) {
	const local = json.nodes.map(nodeLocalMatrix);
	const cache = new Map();
	const world = (idx) => {
		if (cache.has(idx)) return cache.get(idx);
		const p = parentOf.get(idx);
		const m = p == null ? local[idx].clone() : world(p).clone().multiply(local[idx]);
		cache.set(idx, m);
		return m;
	};
	const out = new Map();
	for (const idx of indices) out.set(idx, world(idx));
	return out;
}

/**
 * Fold a Mixamo/FBX up-axis bake out of the rig. Mixamo exports put a +90°X on
 * the armature node and a −90°X on Hips; the net is upright, but a clip authored
 * for an identity-Hips rig overwrites the −90°X and tips the body over (the
 * "lying down" bug). The runtime retargeter (animation-retarget.js) corrects for
 * this on the fly, but normalizing at ingest means stored avatars are already
 * axis-aligned and need no correction.
 *
 * The fold pushes the armature's rotation down into each child (rotating its
 * translation, pre-multiplying its rotation) and zeroes the armature's rotation.
 * Bone *world* matrices are preserved exactly — provided the armature's scale is
 * uniform, so rotation commutes with it — which means the skinned mesh and its
 * inverse-bind matrices (in the untouched BIN chunk) still resolve to the same
 * bind pose. A counter-rotated Hips collapses to identity. Verified by comparing
 * world matrices before/after; reverts on any mismatch. Mutates `json` in place.
 *
 * @param {object} json parsed glTF JSON
 * @returns {{ corrected: boolean, hipsIdentity?: boolean }}
 */
export function canonicalizeArmatureOrientation(json) {
	if (!json || !Array.isArray(json.nodes) || !Array.isArray(json.skins)) {
		return { corrected: false };
	}
	const parentOf = new Map();
	json.nodes.forEach((n, i) => {
		if (Array.isArray(n.children)) for (const c of n.children) parentOf.set(c, i);
	});
	const jointIdx = new Set();
	for (const skin of json.skins) {
		if (Array.isArray(skin.joints)) for (const j of skin.joints) jointIdx.add(j);
	}
	if (jointIdx.size === 0) return { corrected: false };

	let hips = -1;
	for (const idx of jointIdx) {
		const n = json.nodes[idx];
		if (n && typeof n.name === 'string' && canonicalizeBoneName(n.name) === 'Hips') {
			hips = idx;
			break;
		}
	}
	if (hips < 0) return { corrected: false };
	const pIdx = parentOf.get(hips);
	if (pIdx == null) return { corrected: false };
	const parent = json.nodes[pIdx];

	const r = new Quaternion();
	if (parent.rotation) r.fromArray(parent.rotation);
	if (1 - Math.abs(r.w) < ORIENT_EPS) return { corrected: false }; // already axis-aligned

	// Rotation only commutes with the parent's scale when that scale is uniform.
	const s = parent.scale;
	if (s && (Math.abs(s[0] - s[1]) > ORIENT_EPS || Math.abs(s[1] - s[2]) > ORIENT_EPS)) {
		return { corrected: false };
	}

	const children = Array.isArray(parent.children) ? parent.children : [];
	if (children.length === 0) return { corrected: false };

	// Snapshot the children (for revert) and all affected world matrices (to verify
	// the fold didn't move anything the mesh depends on).
	const checkSet = new Set([...jointIdx, ...children]);
	const before = worldMatricesFor(json, checkSet, parentOf);
	const snapshot = children.map((c) => ({
		idx: c,
		translation: json.nodes[c].translation ? json.nodes[c].translation.slice() : null,
		rotation: json.nodes[c].rotation ? json.nodes[c].rotation.slice() : null,
	}));
	const parentRotBefore = parent.rotation ? parent.rotation.slice() : null;

	for (const c of children) {
		const node = json.nodes[c];
		const t = new Vector3();
		if (node.translation) t.fromArray(node.translation);
		t.applyQuaternion(r);
		node.translation = [t.x, t.y, t.z];
		const cr = new Quaternion();
		if (node.rotation) cr.fromArray(node.rotation);
		cr.premultiply(r);
		node.rotation = [cr.x, cr.y, cr.z, cr.w];
	}
	parent.rotation = [0, 0, 0, 1];

	const after = worldMatricesFor(json, checkSet, parentOf);
	let ok = true;
	for (const idx of checkSet) {
		const a = before.get(idx).elements;
		const b = after.get(idx).elements;
		for (let k = 0; k < 16; k++) {
			if (Math.abs(a[k] - b[k]) > ORIENT_WORLD_EPS) {
				ok = false;
				break;
			}
		}
		if (!ok) break;
	}
	if (!ok) {
		for (const snap of snapshot) {
			const node = json.nodes[snap.idx];
			if (snap.translation) node.translation = snap.translation;
			else delete node.translation;
			if (snap.rotation) node.rotation = snap.rotation;
			else delete node.rotation;
		}
		if (parentRotBefore) parent.rotation = parentRotBefore;
		else delete parent.rotation;
		return { corrected: false };
	}

	const hipsQ = new Quaternion();
	if (json.nodes[hips].rotation) hipsQ.fromArray(json.nodes[hips].rotation);
	return { corrected: true, hipsIdentity: 1 - Math.abs(hipsQ.w) < ORIENT_EPS };
}

/**
 * Canonicalize joint bone names in a GLB ArrayBuffer. Returns a new buffer
 * with renamed nodes (and the count of bones rewritten); the original buffer
 * is left untouched. If no bones needed renaming the original buffer is
 * returned by reference so callers can skip a redundant re-upload.
 *
 * Throws on a malformed GLB header so upload code can surface a clear error.
 *
 * @param {ArrayBuffer} arrayBuffer
 * @returns {{ buffer: ArrayBuffer, renamed: number, samples: Array<{from:string,to:string}> }}
 */
export function canonicalizeGLBBones(arrayBuffer) {
	if (!(arrayBuffer instanceof ArrayBuffer)) {
		throw new TypeError('canonicalizeGLBBones: ArrayBuffer required');
	}
	if (arrayBuffer.byteLength < 20) {
		throw new Error('canonicalizeGLBBones: buffer too small to be a GLB');
	}
	const view = new DataView(arrayBuffer);
	if (view.getUint32(0, true) !== GLB_MAGIC) {
		throw new Error('canonicalizeGLBBones: not a GLB (bad magic number)');
	}
	if (view.getUint32(4, true) !== 2) {
		throw new Error('canonicalizeGLBBones: only GLB v2 is supported');
	}

	// Parse chunk 0 (JSON, required by spec).
	const c0Len  = view.getUint32(12, true);
	const c0Type = view.getUint32(16, true);
	if (c0Type !== CHUNK_TYPE_JSON) {
		throw new Error('canonicalizeGLBBones: chunk 0 must be JSON');
	}
	const jsonBytes = new Uint8Array(arrayBuffer, 20, c0Len);
	let json;
	try {
		json = JSON.parse(new TextDecoder().decode(jsonBytes));
	} catch (err) {
		throw new Error('canonicalizeGLBBones: JSON chunk parse failed: ' + err.message);
	}

	const { renamed, samples } = canonicalizeJointNodes(json);
	const orientation = canonicalizeArmatureOrientation(json);
	if (renamed === 0 && !orientation.corrected) {
		return { buffer: arrayBuffer, renamed: 0, samples: [], orientationCorrected: false };
	}

	// Repack. Chunk 1 (BIN) is optional — preserve it verbatim if present.
	const c1Offset = 20 + c0Len;
	let c1Len = 0, c1Type = 0, binBytes = null;
	if (c1Offset + 8 <= arrayBuffer.byteLength) {
		c1Len  = view.getUint32(c1Offset, true);
		c1Type = view.getUint32(c1Offset + 4, true);
		binBytes = new Uint8Array(arrayBuffer, c1Offset + 8, c1Len);
	}

	// Re-serialise JSON; GLB requires each chunk's data to be 4-byte aligned,
	// padded with 0x20 (space) for the JSON chunk per the glTF 2.0 spec.
	let newJsonBytes = new TextEncoder().encode(JSON.stringify(json));
	const jsonPad = (4 - (newJsonBytes.length % 4)) % 4;
	if (jsonPad) {
		const padded = new Uint8Array(newJsonBytes.length + jsonPad);
		padded.set(newJsonBytes);
		for (let i = 0; i < jsonPad; i++) padded[newJsonBytes.length + i] = 0x20;
		newJsonBytes = padded;
	}

	const totalLen = 12 + 8 + newJsonBytes.length + (binBytes ? 8 + binBytes.length : 0);
	const out = new ArrayBuffer(totalLen);
	const outView = new DataView(out);
	const outU8   = new Uint8Array(out);

	outView.setUint32(0, GLB_MAGIC, true);
	outView.setUint32(4, 2, true);
	outView.setUint32(8, totalLen, true);

	outView.setUint32(12, newJsonBytes.length, true);
	outView.setUint32(16, CHUNK_TYPE_JSON, true);
	outU8.set(newJsonBytes, 20);

	if (binBytes) {
		const binOffset = 20 + newJsonBytes.length;
		outView.setUint32(binOffset,     c1Len, true);
		outView.setUint32(binOffset + 4, c1Type, true);
		outU8.set(binBytes, binOffset + 8);
	}

	return { buffer: out, renamed, samples, orientationCorrected: orientation.corrected };
}

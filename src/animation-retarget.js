// Runtime animation retargeting — apply a canonical-skeleton clip to an
// arbitrary rigged model whose bones may be named differently (Mixamo, Blender,
// Rigify, snake_case, …) and proportioned differently (tall, short, chunky).
//
// The pre-baked library in /public/animations/clips addresses tracks by the
// canonical Avaturn bone names (Hips, Spine, LeftArm, …). A loaded GLB rig might
// name the same bones `mixamorig:Hips`, `DEF-spine`, `left_arm`, etc. To drive
// (and export) that rig we rewrite each track's bone name to the *actual* node
// name on the target, drop tracks the rig has no bone for, and rescale the hip
// translation so root motion lands at the new rig's height instead of the
// authoring rig's. The result binds cleanly in both THREE.AnimationMixer
// (preview) and THREE.GLTFExporter (animated-GLB export).
//
// Pure module — three + the canonicalizer only — so it runs unchanged in the
// browser (the /pose gallery) and in Node (the apply_animation MCP tool, vitest).

import { AnimationClip, Vector3 } from 'three';
import { canonicalizeBoneName } from './glb-canonicalize.js';

// A clip retargets cleanly only when enough of its tracks find a home on the
// target rig. Below this the motion would read as a few twitching joints rather
// than a performance, so callers surface an actionable "can't retarget" error.
export const MIN_COVERAGE = 0.5;

const _v = new Vector3();

/**
 * @typedef {Object} RetargetResult
 * @property {AnimationClip|null} clip   Retargeted clip (track names rewritten to
 *   the target's bone names), or null when coverage is below MIN_COVERAGE.
 * @property {number} matched   Tracks successfully mapped onto the target.
 * @property {number} total     Tracks in the source clip.
 * @property {number} coverage  matched / total (0–1).
 * @property {string[]} dropped Canonical bone names the target rig lacks.
 * @property {number} hipScale  Factor applied to hip translation (1 = none).
 */

/**
 * Build a `canonical bone → target node name` map by walking an Object3D graph.
 * Used server-side (apply_animation) where there's no GltfRig wrapper. Prefers
 * SkinnedMesh skeleton bones, falls back to any named Bone nodes.
 *
 * @param {import('three').Object3D} root
 * @returns {Map<string,string>}
 */
export function canonicalNodeMapFromObject(root) {
	const map = new Map();
	const consider = (node) => {
		if (!node?.name) return;
		const canonical = canonicalizeBoneName(node.name);
		if (canonical && !map.has(canonical)) map.set(canonical, node.name);
	};
	const skinned = [];
	root.traverse((node) => {
		if (node.isSkinnedMesh) skinned.push(node);
		if (node.isBone) consider(node);
	});
	for (const sm of skinned) {
		for (const bone of sm.skeleton?.bones || []) consider(bone);
	}
	return map;
}

/**
 * Build the same map from a GltfRig/MannequinRig (src/pose-rig.js), which has
 * already resolved canonical → node. We read each node's live `.name` so the
 * rewritten track binds to the real graph node.
 *
 * @param {{ getBones: () => Array<{key:string,node:import('three').Object3D}> }} rig
 * @returns {Map<string,string>}
 */
export function canonicalNodeMapFromRig(rig) {
	const map = new Map();
	for (const { key, node } of rig.getBones?.() || []) {
		if (node?.name) map.set(key, node.name);
	}
	return map;
}

/**
 * World-space rest height of the target's hips, used to scale root translation
 * onto a differently-sized rig. Returns 0 if it can't be determined (callers
 * then skip hip scaling). Requires world matrices to be current.
 *
 * @param {{ getNode: (k:string) => import('three').Object3D|null }} rig
 * @returns {number}
 */
export function hipRestHeight(rig) {
	const hips = rig.getNode?.('Hips');
	if (!hips) return 0;
	hips.updateWorldMatrix(true, false);
	hips.getWorldPosition(_v);
	return _v.y;
}

// First Y value of a `Hips.position` track — the height the clip's root motion
// was authored around. The retarget scales other-height rigs by target/source.
function clipHipBaselineY(clip) {
	const track = clip.tracks.find(
		(t) => t.name.endsWith('.position') && canonicalizeBoneName(t.name.split('.')[0]) === 'Hips',
	);
	if (!track || track.values.length < 3) return 0;
	return track.values[1]; // [x, y, z, …] — Y of the first keyframe
}

/**
 * Core rewrite. Splits each track into `bone.property`, canonicalizes the bone,
 * looks up the target's node name, and emits a renamed track. Hip position
 * tracks are scaled by `hipScale`. Returns null clip when coverage is too low.
 *
 * @param {AnimationClip} clip
 * @param {Map<string,string>} canonicalToNode
 * @param {{ hipScale?: number, minCoverage?: number }} [opts]
 * @returns {RetargetResult}
 */
export function retargetClip(clip, canonicalToNode, opts = {}) {
	const hipScale = Number.isFinite(opts.hipScale) && opts.hipScale > 0 ? opts.hipScale : 1;
	const minCoverage = opts.minCoverage ?? MIN_COVERAGE;
	const total = clip.tracks.length;
	const dropped = [];
	const tracks = [];

	for (const track of clip.tracks) {
		const dot = track.name.indexOf('.');
		if (dot === -1) continue;
		const boneRaw = track.name.slice(0, dot);
		const property = track.name.slice(dot + 1);
		const canonical = canonicalizeBoneName(boneRaw) || boneRaw;
		const nodeName = canonicalToNode.get(canonical);
		if (!nodeName) {
			dropped.push(canonical);
			continue;
		}
		const next = track.clone();
		next.name = `${nodeName}.${property}`;
		if (hipScale !== 1 && canonical === 'Hips' && property === 'position') {
			for (let i = 0; i < next.values.length; i++) next.values[i] *= hipScale;
		}
		tracks.push(next);
	}

	const matched = tracks.length;
	const coverage = total > 0 ? matched / total : 0;
	if (coverage < minCoverage) {
		return { clip: null, matched, total, coverage, dropped, hipScale };
	}
	const out = clip.clone();
	out.tracks = tracks;
	return { clip: out, matched, total, coverage, dropped, hipScale };
}

/**
 * High-level: retarget a canonical clip onto a rig (GltfRig/MannequinRig),
 * computing hip scaling from the rig's actual proportions. Mutates nothing.
 *
 * @param {AnimationClip} clip
 * @param {object} rig
 * @param {{ scaleHips?: boolean, minCoverage?: number }} [opts]
 * @returns {RetargetResult}
 */
export function retargetClipToRig(clip, rig, opts = {}) {
	const map = canonicalNodeMapFromRig(rig);
	let hipScale = 1;
	if (opts.scaleHips !== false) {
		const targetY = hipRestHeight(rig);
		const sourceY = clipHipBaselineY(clip);
		if (targetY > 0.05 && sourceY > 0.05) {
			// Clamp so a wildly off baseline (or a near-zero in-place clip) can't
			// fling the root metres away.
			hipScale = Math.min(5, Math.max(0.2, targetY / sourceY));
		}
	}
	return retargetClip(clip, map, { hipScale, minCoverage: opts.minCoverage });
}

/**
 * Retarget onto a raw Object3D graph (server-side apply_animation). No hip
 * scaling by default — the caller may pass an explicit factor.
 *
 * @param {AnimationClip} clip
 * @param {import('three').Object3D} root
 * @param {{ hipScale?: number, minCoverage?: number }} [opts]
 * @returns {RetargetResult}
 */
export function retargetClipToObject(clip, root, opts = {}) {
	const map = canonicalNodeMapFromObject(root);
	return retargetClip(clip, map, opts);
}

/**
 * Resample a clip's timing to play at `factor`× speed (1.8 turns a walk into a
 * run). Used so an exported GLB carries the tempo the user previewed, not just
 * a mixer timeScale that doesn't survive the file. Pure — returns a clone.
 *
 * @param {AnimationClip} clip
 * @param {number} factor  >1 faster, <1 slower
 * @returns {AnimationClip}
 */
export function scaleClipSpeed(clip, factor) {
	if (!(factor > 0) || factor === 1) return clip;
	const out = clip.clone();
	const inv = 1 / factor;
	for (const track of out.tracks) {
		for (let i = 0; i < track.times.length; i++) track.times[i] *= inv;
	}
	out.duration = clip.duration * inv;
	return out;
}

/**
 * Convenience: parse a clip from its three.js JSON (the on-disk clip format),
 * naming it. Centralised so browser and server load clips identically.
 *
 * @param {object} json
 * @param {string} name
 * @returns {AnimationClip}
 */
export function parseClipJSON(json, name) {
	const clip = AnimationClip.parse(json);
	if (name) clip.name = name;
	return clip;
}

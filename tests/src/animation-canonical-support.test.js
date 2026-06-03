import { describe, it, expect } from 'vitest';
import { AnimationManager } from '../../src/animation-manager.js';
import { CANONICAL_BONES } from '../../src/glb-canonicalize.js';

// AnimationManager.attach() builds a three AnimationMixer over the model but
// only ever reads `.traverse`, `.isSkinnedMesh`, and `.name` for the canonical
// support check — so a lightweight fake tree exercises the logic without
// loading real GLB assets.
function fakeModel(nodes) {
	const all = [{ name: 'root' }, ...nodes];
	return {
		name: 'root',
		traverse(cb) {
			for (const n of all) cb(n);
		},
	};
}

function boneNodes(names, { skinned = true } = {}) {
	const nodes = names.map((name) => ({ name }));
	if (skinned) nodes.push({ name: 'Body', isSkinnedMesh: true });
	return nodes;
}

describe('AnimationManager.supportsCanonicalClips', () => {
	it('is false before any model is attached', () => {
		const mgr = new AnimationManager();
		expect(mgr.supportsCanonicalClips()).toBe(false);
	});

	it('is true for a skinned humanoid matching the canonical rig', () => {
		const mgr = new AnimationManager();
		mgr.attach(fakeModel(boneNodes(CANONICAL_BONES.slice())));
		expect(mgr.supportsCanonicalClips()).toBe(true);
	});

	it('is true for a Mixamo-prefixed humanoid (names canonicalize)', () => {
		const mgr = new AnimationManager();
		const mixamo = CANONICAL_BONES.slice(0, 12).map((b) => `mixamorig:${b}`);
		mgr.attach(fakeModel(boneNodes(mixamo)));
		expect(mgr.supportsCanonicalClips()).toBe(true);
	});

	it('is false for a static mesh with no skeleton', () => {
		const mgr = new AnimationManager();
		// Canonical bone *names* present, but nothing is a SkinnedMesh.
		mgr.attach(fakeModel(boneNodes(CANONICAL_BONES.slice(), { skinned: false })));
		expect(mgr.supportsCanonicalClips()).toBe(false);
	});

	it('is false for a skinned non-humanoid rig (few canonical bones)', () => {
		const mgr = new AnimationManager();
		mgr.attach(fakeModel(boneNodes(['tail_01', 'tail_02', 'wing_L', 'wing_R', 'jaw'])));
		expect(mgr.supportsCanonicalClips()).toBe(false);
	});

	it('resets to false after detach', () => {
		const mgr = new AnimationManager();
		mgr.attach(fakeModel(boneNodes(CANONICAL_BONES.slice())));
		expect(mgr.supportsCanonicalClips()).toBe(true);
		mgr.detach();
		expect(mgr.supportsCanonicalClips()).toBe(false);
	});
});

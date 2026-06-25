// Tests for the named-empty contract between the authored Omniology Arena
// venue GLB and the runtime. We don't boot the bootstrap here — that pulls in
// a WebGLRenderer + the live DOM — instead we exercise the pure helpers in
// src/game/arena/arena-venue.js against a synthetic three.js scene graph.
//
// Locks in the guarantees the prompt 02 spec demands:
//   1. When the venue exposes every required empty, the runtime reads spawn /
//      screen / desk / light / camera transforms FROM those empties (world
//      space), so moving an empty in the build script moves the runtime
//      feature with it.
//   2. When ANY required empty is missing, the load fails loudly and the error
//      names which empty is absent — so the author can fix it without guessing.

import { describe, it, expect } from 'vitest';
import { Group, Object3D, Vector3 } from 'three';

import {
	ARENA_REQUIRED_EMPTIES,
	ARENA_SCREEN_SLOTS,
	ARENA_RIM_LIGHTS,
	DEFAULT_SCREEN_WIDTH_M,
	collectArenaEmpties,
	resolveArenaAnchors,
	arenaBounds,
} from '../src/game/arena/arena-venue.js';

/**
 * Build a synthetic scene that satisfies ARENA_REQUIRED_EMPTIES. Each named
 * empty gets a deterministic world position (and, where it matters, a yaw,
 * scale, or extras) so the tests can assert on exact values.
 *
 * @param {object} [opts]
 * @param {Set<string>} [opts.omit] — names to skip (sad-path test).
 */
function makeSyntheticArena({ omit = new Set() } = {}) {
	const root = new Group();
	root.name = 'arena';

	const positions = {
		spawn_01: [0, 0, 6],
		screen_01: [-8, 3, -8],
		screen_02: [0, 3, -10],
		screen_03: [8, 3, -8],
		desk_01: [0, 0, 4],
		light_key: [4, 7, 4],
		light_fill: [-4, 6, 2],
		light_rim_01: [-9, 5, -9],
		light_rim_02: [0, 5, -11],
		light_rim_03: [9, 5, -9],
		camera_intro: [0, 2.2, 12],
	};

	const nodes = {};
	for (const [name, [x, y, z]] of Object.entries(positions)) {
		if (omit.has(name)) continue;
		const obj = new Object3D();
		obj.name = name;
		obj.position.set(x, y, z);
		root.add(obj);
		nodes[name] = obj;
	}

	// Author a known yaw + width on screen_01 and an intro-camera yaw so the
	// resolver's world-transform reads are exercised, not just positions.
	if (nodes.screen_01) {
		nodes.screen_01.rotation.y = Math.PI / 2;
		nodes.screen_01.scale.set(9, 1, 1); // width = 9 m
	}
	if (nodes.spawn_01) nodes.spawn_01.rotation.y = Math.PI;
	if (nodes.camera_intro) nodes.camera_intro.rotation.y = Math.PI; // faces +Z toward spawn
	// Author light extras (glTF extras → userData) on the key light.
	if (nodes.light_key) nodes.light_key.userData = { color: '#ff8800', intensity: 5, castShadow: true };

	root.updateMatrixWorld(true);
	return { root, positions, nodes };
}

describe('ARENA_REQUIRED_EMPTIES', () => {
	it('enumerates spawn, every screen + rim slot, desk, key/fill, and intro camera', () => {
		expect(ARENA_REQUIRED_EMPTIES).toContain('spawn_01');
		expect(ARENA_REQUIRED_EMPTIES).toContain('desk_01');
		expect(ARENA_REQUIRED_EMPTIES).toContain('light_key');
		expect(ARENA_REQUIRED_EMPTIES).toContain('light_fill');
		expect(ARENA_REQUIRED_EMPTIES).toContain('camera_intro');

		const screens = ARENA_REQUIRED_EMPTIES.filter((n) => /^screen_\d{2}$/.test(n));
		const rims = ARENA_REQUIRED_EMPTIES.filter((n) => /^light_rim_\d{2}$/.test(n));
		expect(screens).toHaveLength(ARENA_SCREEN_SLOTS);
		expect(rims).toHaveLength(ARENA_RIM_LIGHTS);
	});
});

describe('collectArenaEmpties', () => {
	it('returns a Map keyed by name covering every required empty', () => {
		const { root } = makeSyntheticArena();
		const empties = collectArenaEmpties(root, ARENA_REQUIRED_EMPTIES);

		expect(empties.size).toBe(ARENA_REQUIRED_EMPTIES.length);
		for (const name of ARENA_REQUIRED_EMPTIES) {
			expect(empties.has(name)).toBe(true);
			expect(empties.get(name).name).toBe(name);
		}
	});

	it('throws naming every missing empty when the venue is incomplete', () => {
		const { root } = makeSyntheticArena({ omit: new Set(['screen_02', 'light_key']) });
		expect(() => collectArenaEmpties(root, ARENA_REQUIRED_EMPTIES)).toThrow(/screen_02/);
		expect(() => collectArenaEmpties(root, ARENA_REQUIRED_EMPTIES)).toThrow(/light_key/);
	});

	it('rejects a non-Object3D root with a clear error', () => {
		expect(() => collectArenaEmpties(null)).toThrow(/Object3D/);
		expect(() => collectArenaEmpties({})).toThrow(/Object3D/);
	});
});

describe('resolveArenaAnchors', () => {
	it('reads spawn / screen / desk transforms from the empties (world space)', () => {
		const { root, positions } = makeSyntheticArena();
		const empties = collectArenaEmpties(root, ARENA_REQUIRED_EMPTIES);
		const anchors = resolveArenaAnchors(empties);

		expect(anchors.spawn.position).toBeInstanceOf(Vector3);
		expect(anchors.spawn.position.toArray()).toEqual(positions.spawn_01);
		expect(anchors.spawn.rotationY).toBeCloseTo(Math.PI, 5);

		expect(anchors.screens).toHaveLength(ARENA_SCREEN_SLOTS);
		expect(anchors.screens[0].position.toArray()).toEqual(positions.screen_01);
		expect(anchors.screens[0].rotationY).toBeCloseTo(Math.PI / 2, 5);
		expect(anchors.screens[0].width).toBe(9); // from scale.x
		// Unscaled screens fall back to the default width.
		expect(anchors.screens[1].width).toBe(DEFAULT_SCREEN_WIDTH_M);

		expect(anchors.desk.position.toArray()).toEqual(positions.desk_01);
		expect(anchors.desk.node.name).toBe('desk_01');
	});

	it('resolves the lighting rig with per-role defaults and authored extras', () => {
		const { root } = makeSyntheticArena();
		const empties = collectArenaEmpties(root, ARENA_REQUIRED_EMPTIES);
		const anchors = resolveArenaAnchors(empties);

		const key = anchors.lights.find((l) => l.name === 'light_key');
		expect(key.kind).toBe('key');
		expect(key.castShadow).toBe(true);
		expect(key.color).toBe(0xff8800); // authored via extras '#ff8800'
		expect(key.intensity).toBe(5); // authored via extras

		const fill = anchors.lights.find((l) => l.name === 'light_fill');
		expect(fill.kind).toBe('fill');
		expect(fill.castShadow).toBe(false); // default — fill never shadows

		const rims = anchors.lights.filter((l) => l.kind === 'rim');
		expect(rims).toHaveLength(ARENA_RIM_LIGHTS);
		for (const rim of rims) expect(rim.castShadow).toBe(false);
	});

	it('aims the intro camera by the empty facing (rotating it re-aims lookAt)', () => {
		const { root, positions } = makeSyntheticArena();
		const empties = collectArenaEmpties(root, ARENA_REQUIRED_EMPTIES);
		const anchors = resolveArenaAnchors(empties);

		expect(anchors.camera_intro.position.toArray()).toEqual(positions.camera_intro);
		// camera_intro is rotated 180° about Y, so its forward (-Z) points +Z;
		// lookAt sits ahead of the camera at greater Z than the camera itself.
		expect(anchors.camera_intro.lookAt.z).toBeGreaterThan(anchors.camera_intro.position.z);
		expect(anchors.camera_intro.lookAt.x).toBeCloseTo(anchors.camera_intro.position.x, 5);
	});

	it('honors a parent transform when computing world positions', () => {
		const { root } = makeSyntheticArena();
		root.position.set(10, 0, -2);
		root.updateMatrixWorld(true);

		const empties = collectArenaEmpties(root, ARENA_REQUIRED_EMPTIES);
		const anchors = resolveArenaAnchors(empties);
		// spawn_01 local (0,0,6) + parent (10,0,-2) → world (10,0,4).
		expect(anchors.spawn.position.toArray()).toEqual([10, 0, 4]);
	});
});

describe('arenaBounds', () => {
	it('derives a walkable footprint that contains the spawn and clamps outside it', () => {
		const { root } = makeSyntheticArena();
		const empties = collectArenaEmpties(root, ARENA_REQUIRED_EMPTIES);
		const anchors = resolveArenaAnchors(empties);
		const bounds = arenaBounds(anchors);

		// Spawn must be reachable (inside the clamp).
		const s = anchors.spawn.position;
		const clampedSpawn = bounds.clamp(s.x, s.z);
		expect(clampedSpawn.x).toBeCloseTo(s.x, 5);
		expect(clampedSpawn.z).toBeCloseTo(s.z, 5);

		// A point far outside the room is pulled back onto the bound.
		const far = bounds.clamp(999, 999);
		expect(far.x).toBeLessThanOrEqual(bounds.center.x + bounds.halfX + 1e-6);
		expect(far.z).toBeLessThanOrEqual(bounds.center.z + bounds.halfZ + 1e-6);
	});
});

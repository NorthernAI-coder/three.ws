#!/usr/bin/env node
/**
 * Authors public/arena/omniology/venue.glb — the Omniology Arena interior the
 * /arena/omniology bootstrap parents the rest of its world to. Composed at
 * build time from procedural geometry via @gltf-transform/core so the runtime
 * gets a real .glb (no primitives stamped at runtime) and the named-empty
 * contract in src/game/arena/arena-venue.js + LICENSES.md is satisfied without
 * depending on a third-party asset drop.
 *
 * Run via: npm run build:arena-venue
 *
 * Design intent — a premium, screenshot-worthy contest hall, NOT a gray box:
 *   - A hexagon-ish wide room: dark polished floor with a glowing inlay ring,
 *     a back wall canted into three angled bays that each frame a contest
 *     screen, side walls, and a sealed ceiling with a recessed light cove.
 *   - An illuminated entry desk facing the spawn, where prompt 04 mounts the
 *     submission interactable.
 *   - Emissive accent strips (floor ring, screen bezels, desk lip) so the
 *     bloom pass has something to grab and the room reads as a venue under
 *     the HDRI + lighting rig.
 *
 * The visual richness comes from the HDRI environment + the lighting rig +
 * the bloom/ACES post pipeline — the geometry stays low-poly so the room holds
 * 60fps on a mid-tier laptop and runs on mobile.
 *
 * Underscore separators are deliberate: three.js's GLTFLoader runs
 * PropertyBinding.sanitizeNodeName on every node and strips `[ ] . : /`, so an
 * empty authored as `screen.01` would arrive as `screen01` and the contract in
 * arena-venue.js would fail to resolve it. Keep mesh node names underscored too
 * so the loader + any e2e traversal can rely on one convention.
 *
 * Move/rotate/scale any anchor empty below and re-run — the runtime reads the
 * GLB world transforms, so the spawn, screens, desk, lights, and intro camera
 * all follow. (Acceptance criterion: move an anchor, see the runtime follow.)
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import { Document, NodeIO } from '@gltf-transform/core';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const OUT_DIR = resolve(ROOT, 'public/arena/omniology');

// ─── Room layout constants ───────────────────────────────────────────────────
// The room is a wide rectangle. The back wall (−Z) carries the three contest
// screens; the entry desk + spawn sit on the +Z side. Keep walls beyond the
// outermost anchors so arenaBounds()'s outward margin lands on real geometry.
const ROOM_HALF_X = 11; // walls at x = ±11
const ROOM_HALF_Z = 10; // walls at z = ±10
const ROOM_HEIGHT = 7;
const SCREEN_Y = 2.7; // centre height of the contest screens
const SCREEN_WIDTH = 6.2; // metres — read back at runtime via the empty's scale.x

// ─── Geometry primitives (positions / normals / indices, no UVs) ─────────────

function boxGeom(sx, sy, sz) {
	const x = sx / 2;
	const y = sy / 2;
	const z = sz / 2;
	const faces = [
		{ n: [1, 0, 0], v: [[x, -y, -z], [x, y, -z], [x, y, z], [x, -y, z]] },
		{ n: [-1, 0, 0], v: [[-x, -y, z], [-x, y, z], [-x, y, -z], [-x, -y, -z]] },
		{ n: [0, 1, 0], v: [[-x, y, -z], [-x, y, z], [x, y, z], [x, y, -z]] },
		{ n: [0, -1, 0], v: [[-x, -y, z], [-x, -y, -z], [x, -y, -z], [x, -y, z]] },
		{ n: [0, 0, 1], v: [[-x, -y, z], [x, -y, z], [x, y, z], [-x, y, z]] },
		{ n: [0, 0, -1], v: [[x, -y, -z], [-x, -y, -z], [-x, y, -z], [x, y, -z]] },
	];
	const positions = [];
	const normals = [];
	const indices = [];
	for (const face of faces) {
		const start = positions.length / 3;
		for (const p of face.v) {
			positions.push(...p);
			normals.push(...face.n);
		}
		indices.push(start, start + 1, start + 2, start, start + 2, start + 3);
	}
	return {
		positions: new Float32Array(positions),
		normals: new Float32Array(normals),
		indices: new Uint32Array(indices),
	};
}

function planeGeom(width, depth, normalY = 1) {
	const x = width / 2;
	const z = depth / 2;
	const positions =
		normalY > 0
			? [-x, 0, z, x, 0, z, x, 0, -z, -x, 0, -z]
			: [-x, 0, -z, x, 0, -z, x, 0, z, -x, 0, z];
	const normals = [];
	for (let i = 0; i < 4; i += 1) normals.push(0, normalY, 0);
	const indices = [0, 1, 2, 0, 2, 3];
	return {
		positions: new Float32Array(positions),
		normals: new Float32Array(normals),
		indices: new Uint32Array(indices),
	};
}

// A flat ring (annulus) lying in the XZ plane — the glowing floor inlay.
function ringGeom(inner, outer, segments = 96) {
	const positions = [];
	const normals = [];
	const indices = [];
	for (let i = 0; i <= segments; i += 1) {
		const t = (i / segments) * Math.PI * 2;
		const c = Math.cos(t);
		const s = Math.sin(t);
		positions.push(outer * c, 0, outer * s);
		normals.push(0, 1, 0);
		positions.push(inner * c, 0, inner * s);
		normals.push(0, 1, 0);
	}
	for (let i = 0; i < segments; i += 1) {
		const a = i * 2;
		indices.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
	}
	return {
		positions: new Float32Array(positions),
		normals: new Float32Array(normals),
		indices: new Uint32Array(indices),
	};
}

// ─── glTF helpers ────────────────────────────────────────────────────────────

function addPrim(doc, buffer, mat, name, { positions, normals, indices }) {
	const posAcc = doc.createAccessor(`${name}.pos`).setType('VEC3').setArray(positions).setBuffer(buffer);
	const normAcc = doc.createAccessor(`${name}.norm`).setType('VEC3').setArray(normals).setBuffer(buffer);
	const idxAcc = doc.createAccessor(`${name}.idx`).setType('SCALAR').setArray(indices).setBuffer(buffer);
	const prim = doc
		.createPrimitive()
		.setAttribute('POSITION', posAcc)
		.setAttribute('NORMAL', normAcc)
		.setIndices(idxAcc)
		.setMaterial(mat);
	return doc.createMesh(name).addPrimitive(prim);
}

function addMesh(doc, scene, buffer, mat, name, geom, translation = [0, 0, 0], rotation = null) {
	const mesh = addPrim(doc, buffer, mat, name, geom);
	const node = doc.createNode(name).setMesh(mesh).setTranslation(translation);
	if (rotation) node.setRotation(rotation);
	scene.addChild(node);
	return node;
}

function addEmpty(doc, scene, name, translation, { rotationY = 0, scale = null, extras = null } = {}) {
	// Named empty = glTF Node with no mesh. Three.js exposes these as Object3D
	// instances which collectArenaEmpties() picks up by .name.
	const node = doc.createNode(name).setTranslation(translation);
	if (rotationY) {
		// Quaternion for a rotation about world Y by rotationY radians.
		node.setRotation([0, Math.sin(rotationY / 2), 0, Math.cos(rotationY / 2)]);
	}
	if (scale) node.setScale(scale);
	if (extras) node.setExtras(extras);
	scene.addChild(node);
	return node;
}

// ─── Materials ───────────────────────────────────────────────────────────────

const mat = {};
function buildMaterials(doc) {
	mat.floor = doc
		.createMaterial('ArenaFloor')
		.setBaseColorFactor([0.03, 0.035, 0.05, 1])
		.setMetallicFactor(0.55)
		.setRoughnessFactor(0.32);
	mat.floorRing = doc
		.createMaterial('ArenaFloorRing')
		.setBaseColorFactor([0.04, 0.06, 0.09, 1])
		.setMetallicFactor(0.2)
		.setRoughnessFactor(0.4)
		.setEmissiveFactor([0.05, 0.45, 0.62]);
	mat.wall = doc
		.createMaterial('ArenaWall')
		.setBaseColorFactor([0.022, 0.025, 0.038, 1])
		.setMetallicFactor(0.1)
		.setRoughnessFactor(0.78);
	mat.bay = doc
		.createMaterial('ArenaScreenBay')
		.setBaseColorFactor([0.015, 0.017, 0.027, 1])
		.setMetallicFactor(0.25)
		.setRoughnessFactor(0.55);
	mat.ceiling = doc
		.createMaterial('ArenaCeiling')
		.setBaseColorFactor([0.016, 0.018, 0.026, 1])
		.setMetallicFactor(0.1)
		.setRoughnessFactor(0.85);
	mat.cove = doc
		.createMaterial('ArenaCove')
		.setBaseColorFactor([0.1, 0.12, 0.16, 1])
		.setMetallicFactor(0.1)
		.setRoughnessFactor(0.5)
		.setEmissiveFactor([0.18, 0.26, 0.4]);
	mat.bezel = doc
		.createMaterial('ArenaBezel')
		.setBaseColorFactor([0.05, 0.07, 0.1, 1])
		.setMetallicFactor(0.6)
		.setRoughnessFactor(0.3)
		.setEmissiveFactor([0.06, 0.5, 0.7]);
	mat.screenPanel = doc
		.createMaterial('ArenaScreenPanel')
		.setBaseColorFactor([0.01, 0.012, 0.02, 1])
		.setMetallicFactor(0.0)
		.setRoughnessFactor(0.18)
		.setEmissiveFactor([0.03, 0.05, 0.08]);
	mat.desk = doc
		.createMaterial('ArenaDesk')
		.setBaseColorFactor([0.05, 0.055, 0.07, 1])
		.setMetallicFactor(0.5)
		.setRoughnessFactor(0.35);
	mat.deskLip = doc
		.createMaterial('ArenaDeskLip')
		.setBaseColorFactor([0.06, 0.08, 0.12, 1])
		.setMetallicFactor(0.3)
		.setRoughnessFactor(0.4)
		.setEmissiveFactor([0.5, 0.32, 0.05]);
}

// ─── Screen bay layout ───────────────────────────────────────────────────────
// Three screens across the back wall: a centre screen flat on −Z, and two
// flanking screens canted ~22° inward so the trio wraps the viewer. Each bay
// has a recessed housing, an emissive bezel, a dark panel the runtime screen
// renders over, and the `screen_NN` anchor at panel centre (scaled to width).
const SCREEN_BAYS = [
	{ id: '01', x: -7.4, z: -8.4, yaw: 0.38 },
	{ id: '02', x: 0, z: -9.6, yaw: 0 },
	{ id: '03', x: 7.4, z: -8.4, yaw: -0.38 },
];

function addScreenBay(doc, scene, buffer, bay) {
	const { id, x, z, yaw } = bay;
	const rot = [0, Math.sin(yaw / 2), 0, Math.cos(yaw / 2)];
	// Housing slab behind the panel.
	addMesh(doc, scene, buffer, mat.bay, `screen_bay_${id}`, boxGeom(SCREEN_WIDTH + 1.1, 4.5, 0.4), [x, SCREEN_Y, z], rot);
	// Emissive bezel frame (slightly proud of the housing toward the room).
	const fwdX = Math.sin(yaw);
	const fwdZ = Math.cos(yaw);
	addMesh(doc, scene, buffer, mat.bezel, `screen_bezel_${id}`, boxGeom(SCREEN_WIDTH + 0.5, 3.9, 0.12), [
		x + fwdX * 0.22,
		SCREEN_Y,
		z + fwdZ * 0.22,
	], rot);
	// Dark display panel the runtime mounts the live screen over.
	addMesh(doc, scene, buffer, mat.screenPanel, `screen_panel_${id}`, boxGeom(SCREEN_WIDTH, 3.5, 0.06), [
		x + fwdX * 0.3,
		SCREEN_Y,
		z + fwdZ * 0.3,
	], rot);
	// Anchor empty at panel centre, facing the room. scale.x encodes the
	// screen width the runtime reads back via resolveArenaAnchors().
	addEmpty(doc, scene, `screen_${id}`, [x + fwdX * 0.34, SCREEN_Y, z + fwdZ * 0.34], {
		rotationY: yaw,
		scale: [SCREEN_WIDTH, 1, 1],
	});
}

// ─── Document build ──────────────────────────────────────────────────────────

function buildVenueDoc() {
	const doc = new Document();
	doc.createBuffer();
	const buffer = doc.getRoot().listBuffers()[0];
	const scene = doc.createScene('ArenaScene');
	buildMaterials(doc);

	// Floor + glowing inlay ring.
	addMesh(doc, scene, buffer, mat.floor, 'arena_floor', planeGeom(ROOM_HALF_X * 2, ROOM_HALF_Z * 2, 1), [0, 0, 0]);
	addMesh(doc, scene, buffer, mat.floorRing, 'arena_floor_ring', ringGeom(4.3, 4.7, 96), [0, 0.01, -1.5]);
	addMesh(doc, scene, buffer, mat.floorRing, 'arena_floor_ring_inner', ringGeom(2.0, 2.18, 80), [0, 0.01, -1.5]);

	// Ceiling (downward normal) + recessed emissive cove ring.
	addMesh(doc, scene, buffer, mat.ceiling, 'arena_ceiling', planeGeom(ROOM_HALF_X * 2, ROOM_HALF_Z * 2, -1), [0, ROOM_HEIGHT, 0]);
	addMesh(doc, scene, buffer, mat.cove, 'arena_ceiling_cove', ringGeom(5.6, 6.4, 80), [0, ROOM_HEIGHT - 0.05, -1.5]);

	// Four perimeter walls (boxes — cheap, sealed, double-sided not needed since
	// the camera stays inside and inner faces point inward by box normals).
	addMesh(doc, scene, buffer, mat.wall, 'arena_wall_back', boxGeom(ROOM_HALF_X * 2, ROOM_HEIGHT, 0.4), [0, ROOM_HEIGHT / 2, -ROOM_HALF_Z]);
	addMesh(doc, scene, buffer, mat.wall, 'arena_wall_front', boxGeom(ROOM_HALF_X * 2, ROOM_HEIGHT, 0.4), [0, ROOM_HEIGHT / 2, ROOM_HALF_Z]);
	addMesh(doc, scene, buffer, mat.wall, 'arena_wall_left', boxGeom(0.4, ROOM_HEIGHT, ROOM_HALF_Z * 2), [-ROOM_HALF_X, ROOM_HEIGHT / 2, 0]);
	addMesh(doc, scene, buffer, mat.wall, 'arena_wall_right', boxGeom(0.4, ROOM_HEIGHT, ROOM_HALF_Z * 2), [ROOM_HALF_X, ROOM_HEIGHT / 2, 0]);

	// Three contest-screen bays across the back.
	for (const bay of SCREEN_BAYS) addScreenBay(doc, scene, buffer, bay);

	// Entry desk facing the spawn (+Z side), with an emissive front lip.
	const deskZ = 5.4;
	addMesh(doc, scene, buffer, mat.desk, 'arena_desk_body', boxGeom(3.4, 1.1, 1.0), [0, 0.55, deskZ]);
	addMesh(doc, scene, buffer, mat.desk, 'arena_desk_top', boxGeom(3.7, 0.12, 1.2), [0, 1.16, deskZ]);
	addMesh(doc, scene, buffer, mat.deskLip, 'arena_desk_lip', boxGeom(3.4, 0.14, 0.05), [0, 0.95, deskZ - 0.5]);

	// ─── Named anchor empties (the contract in src/game/arena/arena-venue.js) ──

	// Spawn — on the entry (+Z) side, facing the screens (−Z ⇒ yaw = π).
	addEmpty(doc, scene, 'spawn_01', [0, 0, 7.0], { rotationY: Math.PI });

	// Entry desk anchor — at the desk top, facing the spawn (+Z ⇒ yaw 0).
	addEmpty(doc, scene, 'desk_01', [0, 1.16, deskZ], { rotationY: 0 });

	// Lighting rig anchors. Colors/intensity/distance/shadow are authored as
	// glTF extras → read back as node.userData by resolveArenaAnchors(). One
	// shadow-casting key, a soft fill, three cheap rims hugging the screens.
	addEmpty(doc, scene, 'light_key', [3.5, 6.2, 5.0], {
		extras: { color: '#fff1e0', intensity: 3.4, castShadow: true },
	});
	addEmpty(doc, scene, 'light_fill', [-4.5, 5.4, 3.0], {
		extras: { color: '#8fb4ff', intensity: 1.2, castShadow: false },
	});
	addEmpty(doc, scene, 'light_rim_01', [-7.4, 4.4, -6.8], {
		extras: { color: '#ff3bd6', intensity: 2.6, distance: 22, castShadow: false },
	});
	addEmpty(doc, scene, 'light_rim_02', [0, 4.8, -8.2], {
		extras: { color: '#35e0ff', intensity: 2.8, distance: 24, castShadow: false },
	});
	addEmpty(doc, scene, 'light_rim_03', [7.4, 4.4, -6.8], {
		extras: { color: '#ffb13b', intensity: 2.6, distance: 22, castShadow: false },
	});

	// Intro camera — a cinematic high entry pose at the front-left corner,
	// aimed across the room toward the contest screens. `focal` (extras) sets
	// how far ahead the lookAt target sits; the negative yaw turns the empty's
	// forward (−Z) to point toward room centre/−Z (toward the screens) rather
	// than back out the entry. The bootstrap dollies from here to the player.
	addEmpty(doc, scene, 'camera_intro', [-6.5, 3.4, 8.5], {
		rotationY: -0.55,
		extras: { focal: 11 },
	});

	return doc;
}

async function main() {
	mkdirSync(OUT_DIR, { recursive: true });
	const io = new NodeIO();
	const doc = buildVenueDoc();
	const bytes = await io.writeBinary(doc);
	const outPath = resolve(OUT_DIR, 'venue.glb');
	writeFileSync(outPath, Buffer.from(bytes));
	console.log(`[arena-venue] wrote venue.glb ${(bytes.length / 1024).toFixed(1)} kB`);
}

main().catch((err) => {
	console.error('[arena-venue] build failed:', err);
	process.exit(1);
});

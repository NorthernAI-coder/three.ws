// Pure helpers for resolving named empties inside the authored Omniology
// Arena venue GLB. Modeled on src/club-venue.js so the two venues share one
// proven contract: the GLB is the single source of truth for where things
// mount, the runtime reads named empties (never analytical fallbacks), and a
// missing anchor is a loud, named authoring error — not a silent shrug.
//
// Lifted out of the bootstrap so it can be unit-tested without booting a
// WebGLRenderer or the DOM (see tests/arena-venue.test.js). The runtime
// imports every symbol from here.
//
// Names use underscores rather than dots because three.js's GLTFLoader runs
// `PropertyBinding.sanitizeNodeName` on every loaded node and strips the
// characters `[ ] . : /`. A node authored as `screen.01` in Blender would
// arrive at runtime as `screen01` and fail to resolve. Author every empty
// with underscores; the build script in scripts/build-arena-venue.mjs mirrors
// this convention.

import { Vector3, Quaternion, Euler } from 'three';

/** How many contest-wall screens the venue authors (screen_01..screen_03). */
export const ARENA_SCREEN_SLOTS = 3;

/** How many rim lights the lighting rig authors (light_rim_01..light_rim_03). */
export const ARENA_RIM_LIGHTS = 3;

/**
 * Default screen width (metres) used when an artist leaves a screen empty at
 * unit scale. Authors size a screen by scaling its empty on X; the runtime
 * reads that world scale as the panel width so prompts 03/04 mount a screen
 * that fills the authored wall. Anything at (or below) unit scale is treated
 * as "unset" and falls back to this.
 */
export const DEFAULT_SCREEN_WIDTH_M = 6;

/** How far ahead of the intro camera its lookAt target sits when unauthored. */
const DEFAULT_CAMERA_FOCAL_M = 7;

/**
 * Named empties the venue GLB MUST expose. Missing any of these is a
 * load-time error (see collectArenaEmpties). Grouped by role:
 *
 *  - spawn_01          local player drop-in (position + facing)
 *  - screen_01..03     the three contest walls (prompts 03/04 mount screens)
 *  - desk_01           the entry desk (prompt 04 mounts the interactable)
 *  - light_key         the single shadow-casting key light
 *  - light_fill        a soft, cheap fill light (no shadows)
 *  - light_rim_01..03  cheap accent rims around the room
 *  - camera_intro      the cinematic intro camera pose (position + aim)
 *
 * The per-role suffixes are zero-padded two-digit strings so the venue can be
 * re-authored (re-order screens, add/remove a rim) by changing the slot
 * constants above + this list together, without renaming unrelated empties.
 */
export const ARENA_REQUIRED_EMPTIES = [
	'spawn_01',
	...Array.from({ length: ARENA_SCREEN_SLOTS }, (_, i) => `screen_${pad(i + 1)}`),
	'desk_01',
	'light_key',
	'light_fill',
	...Array.from({ length: ARENA_RIM_LIGHTS }, (_, i) => `light_rim_${pad(i + 1)}`),
	'camera_intro',
];

function pad(n) {
	return String(n).padStart(2, '0');
}

/**
 * Yaw (rotation about world Y, radians) of a node, extracted from its world
 * quaternion. Uses 'YXZ' order so the Y component is the heading even when the
 * node also carries pitch/roll. Matches how /play and /club read facing.
 *
 * @param {import('three').Object3D} node
 * @returns {number}
 */
function worldYaw(node) {
	const q = node.getWorldQuaternion(new Quaternion());
	return new Euler().setFromQuaternion(q, 'YXZ').y;
}

/**
 * The node's forward direction in world space (local -Z, the glTF/three.js
 * "look" axis), normalized. Lets the intro camera aim by rotating its empty in
 * Blender rather than hardcoding a target.
 *
 * @param {import('three').Object3D} node
 * @returns {Vector3}
 */
function worldForward(node) {
	const q = node.getWorldQuaternion(new Quaternion());
	return new Vector3(0, 0, -1).applyQuaternion(q).normalize();
}

/**
 * Walk the venue scene graph and return every required named empty as a Map
 * keyed by name. Throws with the missing-empty list if anything from
 * `required` is absent — the contract is explicit that we surface the error
 * rather than silently falling back to analytical positions.
 *
 * @param {import('three').Object3D} root
 * @param {string[]} [required] — defaults to ARENA_REQUIRED_EMPTIES.
 * @returns {Map<string, import('three').Object3D>}
 */
export function collectArenaEmpties(root, required = ARENA_REQUIRED_EMPTIES) {
	if (!root || typeof root.traverse !== 'function') {
		throw new Error('collectArenaEmpties: expected an Object3D with .traverse()');
	}
	const requiredSet = new Set(required);
	const found = new Map();
	root.traverse((n) => {
		if (n && typeof n.name === 'string' && requiredSet.has(n.name)) {
			found.set(n.name, n);
		}
	});
	const missing = required.filter((name) => !found.has(name));
	if (missing.length) {
		throw new Error(
			`Arena venue GLB is missing required named empties: ${missing.join(', ')}. ` +
				'Author them (underscore names) in scripts/build-arena-venue.mjs or your ' +
				'.blend and re-export — the runtime has no fallback.',
		);
	}
	return found;
}

/**
 * Resolve the typed anchor object the bootstrap binds the venue to. Every
 * field is read from the GLB world transforms so moving/rotating/scaling an
 * empty in the build script moves the runtime feature with it.
 *
 * Light color / intensity / distance / shadow are authored as glTF node
 * `extras` (exposed by GLTFLoader as `node.userData`); each falls back to a
 * sensible per-role default so a hand-placed empty still lights the room.
 *
 * Field names mirror the bootstrap anchor contract (`position` / `rotationY` /
 * `width`) that src/game/arena/arena.js exposes via `setAnchors()` and that the
 * screen (03) + desk (04) consumers read — so the resolved set drops straight
 * into `setAnchors(resolveArenaAnchors(...))` with no remapping.
 *
 * @param {Map<string, import('three').Object3D>} empties
 * @returns {{
 *   spawn: { position: Vector3, rotationY: number },
 *   screens: Array<{ position: Vector3, rotationY: number, width: number, node: import('three').Object3D }>,
 *   desk: { position: Vector3, rotationY: number, node: import('three').Object3D },
 *   lights: Array<{ name: string, kind: 'key'|'fill'|'rim', position: Vector3, color: number, intensity: number, distance: number, castShadow: boolean }>,
 *   camera_intro: { position: Vector3, lookAt: Vector3 },
 * }}
 */
export function resolveArenaAnchors(empties) {
	const get = (name) => {
		const node = empties.get(name);
		if (!node) {
			throw new Error(`resolveArenaAnchors: anchor "${name}" was not collected first`);
		}
		return node;
	};

	const spawnNode = get('spawn_01');
	const spawn = {
		position: spawnNode.getWorldPosition(new Vector3()),
		rotationY: worldYaw(spawnNode),
	};

	const screens = [];
	for (let i = 0; i < ARENA_SCREEN_SLOTS; i += 1) {
		const node = get(`screen_${pad(i + 1)}`);
		const scaleX = node.getWorldScale(new Vector3()).x;
		screens.push({
			position: node.getWorldPosition(new Vector3()),
			rotationY: worldYaw(node),
			width: scaleX > 1.001 ? scaleX : DEFAULT_SCREEN_WIDTH_M,
			node,
		});
	}

	const deskNode = get('desk_01');
	const desk = {
		position: deskNode.getWorldPosition(new Vector3()),
		rotationY: worldYaw(deskNode),
		node: deskNode,
	};

	const lights = [];
	const lightDefaults = {
		key: { color: 0xfff1e0, intensity: 3.2, distance: 0, castShadow: true },
		fill: { color: 0x8fb4ff, intensity: 1.1, distance: 0, castShadow: false },
		rim: { color: 0x35e0ff, intensity: 2.4, distance: 26, castShadow: false },
	};
	const lightNames = ['light_key', 'light_fill', ...Array.from({ length: ARENA_RIM_LIGHTS }, (_, i) => `light_rim_${pad(i + 1)}`)];
	for (const name of lightNames) {
		const node = get(name);
		const kind = name.includes('key') ? 'key' : name.includes('fill') ? 'fill' : 'rim';
		const def = lightDefaults[kind];
		const extras = node.userData || {};
		lights.push({
			name,
			kind,
			position: node.getWorldPosition(new Vector3()),
			color: parseColor(extras.color, def.color),
			intensity: numberOr(extras.intensity, def.intensity),
			distance: numberOr(extras.distance, def.distance),
			castShadow: extras.castShadow != null ? !!extras.castShadow : def.castShadow,
		});
	}

	const camNode = get('camera_intro');
	const camPos = camNode.getWorldPosition(new Vector3());
	const focal = numberOr(camNode.userData?.focal, DEFAULT_CAMERA_FOCAL_M);
	const lookAt = camPos.clone().add(worldForward(camNode).multiplyScalar(focal));
	const camera_intro = { position: camPos, lookAt };

	return { spawn, screens, desk, lights, camera_intro };
}

/**
 * Axis-aligned walkable footprint for the venue, derived from the spawn, desk,
 * and screen anchors so the player clamp follows the authored room without a
 * second source of truth. The clamp box is the anchor bounding box grown
 * outward by `margin`: the venue's walls are authored to sit beyond the
 * outermost anchors (the screens mount ON the walls, the player floor reaches
 * up to them), so every anchor — including the entry-side spawn — stays inside
 * the walkable region. Mirrors /play's square WORLD_BOUND clamp shape.
 *
 * @param {ReturnType<typeof resolveArenaAnchors>} anchors
 * @param {number} [margin] — metres of interior floor past the outermost anchor.
 * @returns {{ center: { x: number, z: number }, halfX: number, halfZ: number,
 *   clamp: (x: number, z: number) => { x: number, z: number } }}
 */
export function arenaBounds(anchors, margin = 1.2) {
	const pts = [
		anchors.spawn.position,
		anchors.desk.position,
		...anchors.screens.map((s) => s.position),
	];
	let minX = Infinity;
	let maxX = -Infinity;
	let minZ = Infinity;
	let maxZ = -Infinity;
	for (const p of pts) {
		minX = Math.min(minX, p.x);
		maxX = Math.max(maxX, p.x);
		minZ = Math.min(minZ, p.z);
		maxZ = Math.max(maxZ, p.z);
	}
	const center = { x: (minX + maxX) / 2, z: (minZ + maxZ) / 2 };
	const halfX = (maxX - minX) / 2 + margin;
	const halfZ = (maxZ - minZ) / 2 + margin;
	const clamp = (x, z) => ({
		x: Math.max(center.x - halfX, Math.min(center.x + halfX, x)),
		z: Math.max(center.z - halfZ, Math.min(center.z + halfZ, z)),
	});
	return { center, halfX, halfZ, clamp };
}

function numberOr(value, fallback) {
	const n = Number(value);
	return Number.isFinite(n) ? n : fallback;
}

/**
 * Accept a color as a hex number (0xrrggbb), a '#rrggbb' string, or fall back.
 * Kept tiny so the module has no THREE.Color dependency for parsing extras.
 */
function parseColor(value, fallback) {
	if (typeof value === 'number' && Number.isFinite(value)) return value;
	if (typeof value === 'string') {
		const hex = value.trim().replace(/^#/, '');
		if (/^[0-9a-fA-F]{6}$/.test(hex)) return parseInt(hex, 16);
	}
	return fallback;
}

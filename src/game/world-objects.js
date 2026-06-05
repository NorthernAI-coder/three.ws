// world-objects.js — generic networked world-object manager for /play (R02).
//
// Mirrors the server's authoritative `objects` MapSchema (R01) into the 3D scene:
// one Three.js node per object, interpolated smoothly each frame (the same
// REMOTE_LERP feel as remote avatars), disposed cleanly on remove/teardown.
//
// The manager is deliberately FEATURE-AGNOSTIC. It knows nothing about balls,
// props or pickups — a feature registers a mesh factory for its `kind` via
// `WorldObjects.registerKind(kind, factory)` and this file just instantiates,
// lerps and disposes. R18 (build props) registers the 'block'/'prop' factory
// from PROP_CATALOG below; R05 (the physics ball) registers 'ball' the same way.
//
// Wire protocol (R01, see multiplayer/src/rooms/WalkRoom.js):
//   obj:spawn  { id?, type?, kind?, x, y, z, yaw?, scale?, vx?, vy?, vz? }
//   obj:update { id, x?, y?, z?, yaw?, scale?, vx?, vy?, vz? }
//   obj:remove { id }
// The server assigns ownerId, clamps bounds/scale, mints ids and persists durable
// props; the client only sends intents and renders what the state echoes back.

import {
	Group, Vector3, Box3,
	Mesh, BoxGeometry, CylinderGeometry, ConeGeometry, SphereGeometry,
	MeshStandardMaterial, MeshBasicMaterial,
	EdgesGeometry, LineSegments, LineBasicMaterial, Color,
} from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { log } from '../shared/log.js';

// Same lerp constant RemotePlayer uses, so objects glide between server updates
// with exactly the same feel as the avatars around them.
const REMOTE_LERP = 0.18;
const YAW_LERP = 0.25;

// ── kind registry ──────────────────────────────────────────────────────────
// kind → factory(obj) ⇒ Object3D. A feature owns its factory; the manager owns
// the lifecycle. Unknown kinds fall back to a neutral box so an object always
// renders something real rather than vanishing.
const KIND_FACTORIES = new Map();

function neutralBox() {
	const m = new Mesh(new BoxGeometry(1, 1, 1), new MeshStandardMaterial({ color: 0x8b93a7, roughness: 0.85 }));
	m.castShadow = true; m.receiveShadow = true;
	m.position.y = 0.5; // base at origin
	m.userData.ownGeo = true;
	return m;
}

// ── prop catalog (R18) ───────────────────────────────────────────────────────
// The placeable build palette: procedural primitives built from real three.js
// geometry (no external asset, no async) plus a couple of real GLB props reused
// from the club set. Every prop is authored with its BASE at the origin (y=0) so
// a placement snaps flush onto the ground. `foot` is the half-extent (metres)
// used for the snap grid and the GLB ghost proxy; `glb` props load + clone a
// shared template. Order is the palette order.
export const PROP_CATALOG = [
	{ id: 'crate', name: 'Crate', icon: '📦', foot: 0.75, build: () => propCrate() },
	{ id: 'barrel', name: 'Barrel', icon: '🛢️', foot: 0.55, build: () => propBarrel() },
	{ id: 'planter', name: 'Planter', icon: '🪴', foot: 0.6, build: () => propPlanter() },
	{ id: 'lamp', name: 'Lamp', icon: '💡', foot: 0.35, build: () => propLamp() },
	{ id: 'bench', name: 'Bench', icon: '🪑', foot: 1.0, build: () => propBench() },
	{ id: 'pillar', name: 'Pillar', icon: '🏛️', foot: 0.5, build: () => propPillar() },
	{ id: 'arch', name: 'Arch', icon: '🚪', foot: 1.1, build: () => propArch() },
	{ id: 'ramp', name: 'Ramp', icon: '📐', foot: 1.0, build: () => propRamp() },
	{ id: 'sign', name: 'Sign', icon: '🪧', foot: 0.6, build: () => propSign() },
	{ id: 'crystal', name: 'Crystal', icon: '🔮', foot: 0.5, build: () => propCrystal() },
	{ id: 'stage', name: 'Stage', icon: '🎤', foot: 1.6, glb: '/club/props/stage.glb', fitH: 1.1 },
	{ id: 'pole', name: 'Pole', icon: '🎚️', foot: 0.35, glb: '/club/props/pole.glb', fitH: 3.0 },
];
const PROP_BY_ID = new Map(PROP_CATALOG.map((p) => [p.id, p]));
export function propDef(type) { return PROP_BY_ID.get(type) || GALLERY_PROPS.get(type) || null; }
export const DEFAULT_PROP = PROP_CATALOG[0].id;

// ── gallery props ────────────────────────────────────────────────────────────
// Any public gallery model can be placed into a world as a prop. It rides the
// EXACT same networking as a built-in prop: a placed object's `type` is the
// gallery avatar id prefixed with `g:` (a UUID → 38 chars, comfortably inside the
// server's 48-char `type` budget), so no schema or server change is needed. The
// model's GLB url is resolved client-side — registered up-front when the user
// picks it from the palette, and lazily fetched from /api/avatars/<id> when a
// peer's placement (or a build restored from disk) references a model this client
// hasn't loaded yet. Gallery defs share the same shape as GLB catalog props
// (`glb` + `fitH` + `foot`), so the ghost, instancing and disposal paths all work
// unchanged — gallery models are just props the catalog learns about at runtime.
export const GALLERY_PROP_PREFIX = 'g:';
const DEFAULT_GALLERY_FIT = 1.8;   // a human-height avatar standing on the floor
const DEFAULT_GALLERY_FOOT = 0.5;  // snap-grid + ghost footprint half-extent
const GALLERY_PROPS = new Map();   // 'g:<id>' → def

export function isGalleryType(type) {
	return typeof type === 'string' && type.startsWith(GALLERY_PROP_PREFIX);
}

// Register (or refresh the url of) a gallery model so it can be placed + rendered
// as a prop. Idempotent — returns the shared def either way so callers can rely on
// `propDef('g:'+id)` immediately after.
export function registerGalleryProp(id, { url, name, thumbnail, fitH, foot } = {}) {
	const type = isGalleryType(id) ? id : GALLERY_PROP_PREFIX + id;
	let def = GALLERY_PROPS.get(type);
	if (def) { if (url) def.glb = url; return def; }
	def = {
		id: type, name: name || 'Model', icon: '🧍', gallery: true,
		glb: url || null, fitH: fitH || DEFAULT_GALLERY_FIT, foot: foot || DEFAULT_GALLERY_FOOT,
		thumbnail: thumbnail || null,
	};
	GALLERY_PROPS.set(type, def);
	return def;
}

// Resolve a gallery model we don't have registered yet (a peer placed it, or it was
// restored from a saved build) by fetching its public avatar record for the GLB url.
async function resolveGalleryDef(type) {
	const id = type.slice(GALLERY_PROP_PREFIX.length);
	const r = await fetch(`/api/avatars/${encodeURIComponent(id)}`, { headers: { accept: 'application/json' } });
	if (!r.ok) throw new Error(`avatar ${id} → ${r.status}`);
	const data = await r.json();
	const a = data?.avatar || data || {};
	const url = a.model_url || a.base_model_url || a.url;
	if (!url) throw new Error(`avatar ${id} has no model url`);
	return registerGalleryProp(id, { url, name: a.name, thumbnail: a.thumbnail_url });
}

// ── procedural prop builders (base at y=0) ───────────────────────────────────
function std(color, opts = {}) {
	const m = new MeshStandardMaterial({ color, roughness: opts.roughness ?? 0.85, metalness: opts.metalness ?? 0 });
	if (opts.emissive !== undefined) { m.emissive = new Color(opts.emissive); m.emissiveIntensity = opts.emissiveIntensity ?? 0.6; }
	return m;
}
// Build a mesh with its geometry shifted so `baseY` (default the box's bottom)
// rests on y=0, tag it for shadows + disposal, and return it.
function part(geometry, material, y = 0) {
	const m = new Mesh(geometry, material);
	m.position.y = y;
	m.castShadow = true; m.receiveShadow = true;
	m.userData.ownGeo = true;
	return m;
}
function groupOf(...parts) {
	const g = new Group();
	for (const p of parts) g.add(p);
	return g;
}

function propCrate() {
	const body = part(new BoxGeometry(1.4, 1.4, 1.4), std(0xb07f43, { roughness: 0.9 }), 0.7);
	const trim = part(new BoxGeometry(1.45, 0.16, 1.45), std(0x7a5226), 1.42);
	return groupOf(body, trim);
}
function propBarrel() {
	const body = part(new CylinderGeometry(0.52, 0.52, 1.2, 18), std(0x9a6a3c), 0.6);
	const band1 = part(new CylinderGeometry(0.55, 0.55, 0.1, 18), std(0x53381f), 0.32);
	const band2 = part(new CylinderGeometry(0.55, 0.55, 0.1, 18), std(0x53381f), 0.88);
	return groupOf(body, band1, band2);
}
function propPlanter() {
	const pot = part(new CylinderGeometry(0.55, 0.42, 0.6, 16), std(0x8a5a36), 0.3);
	const soil = part(new CylinderGeometry(0.5, 0.5, 0.08, 16), std(0x2e1f12), 0.6);
	const bush = part(new SphereGeometry(0.55, 14, 12), std(0x4f9a45, { roughness: 1 }), 1.05);
	return groupOf(pot, soil, bush);
}
function propLamp() {
	const base = part(new CylinderGeometry(0.28, 0.32, 0.18, 16), std(0x2b2f38, { metalness: 0.4, roughness: 0.5 }), 0.09);
	const post = part(new CylinderGeometry(0.07, 0.08, 2.6, 12), std(0x33373f, { metalness: 0.5, roughness: 0.4 }), 1.4);
	const head = part(new SphereGeometry(0.26, 16, 14), std(0xffe7a8, { emissive: 0xffcf5c, emissiveIntensity: 1.1 }), 2.7);
	return groupOf(base, post, head);
}
function propBench() {
	const seat = part(new BoxGeometry(2.0, 0.14, 0.6), std(0xb07f43), 0.55);
	const back = part(new BoxGeometry(2.0, 0.5, 0.12), std(0xb07f43), 0.85);
	const l1 = part(new BoxGeometry(0.14, 0.55, 0.55), std(0x4a4f59, { metalness: 0.4 }), 0.28);
	const l2 = l1.clone(); l2.position.x = 0.85; l1.position.x = -0.85;
	l2.userData.ownGeo = false; // clone shares l1's geometry/material — dispose once
	return groupOf(seat, back, l1, l2);
}
function propPillar() {
	const base = part(new BoxGeometry(1.0, 0.2, 1.0), std(0xcfd3da), 0.1);
	const shaft = part(new CylinderGeometry(0.34, 0.4, 2.6, 20), std(0xe2e5ea, { roughness: 0.7 }), 1.5);
	const cap = part(new BoxGeometry(0.95, 0.2, 0.95), std(0xcfd3da), 2.9);
	return groupOf(base, shaft, cap);
}
function propArch() {
	const left = part(new BoxGeometry(0.4, 2.6, 0.5), std(0xb5483a), 1.3); left.position.x = -1.0;
	const right = left.clone(); right.position.x = 1.0; right.userData.ownGeo = false;
	const top = part(new BoxGeometry(2.4, 0.45, 0.5), std(0xb5483a), 2.82);
	return groupOf(left, right, top);
}
function propRamp() {
	const m = part(new BoxGeometry(1.8, 0.16, 1.8), std(0x9aa0a8), 0); // pivot handled below
	// Tilt the slab into a ramp and lift it so the low edge meets the ground.
	m.rotation.x = -Math.PI / 9;
	m.position.y = 0.45;
	return groupOf(m);
}
function propSign() {
	const post = part(new CylinderGeometry(0.08, 0.08, 2.0, 10), std(0x6b4a2c), 1.0);
	const board = part(new BoxGeometry(1.1, 0.7, 0.1), std(0xf0e6cf, { roughness: 0.8 }), 1.7);
	const arrow = part(new ConeGeometry(0.18, 0.3, 4), std(0x2af0e0, { emissive: 0x2af0e0, emissiveIntensity: 0.7 }), 1.7);
	arrow.rotation.z = -Math.PI / 2; arrow.position.x = 0.7;
	return groupOf(post, board, arrow);
}
function propCrystal() {
	const c = part(new ConeGeometry(0.45, 1.6, 6), std(0x9ad8ff, { emissive: 0x2af0e0, emissiveIntensity: 0.9, roughness: 0.2, metalness: 0.1 }), 0.8);
	const c2 = part(new ConeGeometry(0.22, 0.9, 6), std(0x9ad8ff, { emissive: 0x2af0e0, emissiveIntensity: 0.9, roughness: 0.2 }), 0.45);
	c2.position.set(0.4, 0, 0.2);
	return groupOf(c, c2);
}

// ── GLB template cache (shared geometry/materials across instances) ──────────
const _gltf = new GLTFLoader();
const _glbCache = new Map(); // url → { template, waiters:[] }

function loadTemplate(url) {
	let rec = _glbCache.get(url);
	if (rec) return rec;
	rec = { template: null, waiters: [] };
	_glbCache.set(url, rec);
	_gltf.load(url, (gltf) => {
		const root = gltf.scene;
		root.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
		rec.template = root;
		for (const w of rec.waiters.splice(0)) { try { w(root); } catch (e) { log.warn('[world-objects] glb waiter threw', e); } }
	}, undefined, (err) => log.warn('[world-objects] GLB load failed', url, err?.message || err));
	return rec;
}

// Fit a node so it stands `fitH` metres tall with its base on y=0 and centred in
// xz — GLB authoring varies wildly, so normalise every prop to a predictable size.
function fitNode(node, fitH) {
	const box = new Box3().setFromObject(node);
	if (!box.isEmpty()) {
		const size = box.getSize(new Vector3());
		const s = size.y > 1e-4 ? fitH / size.y : 1;
		node.scale.setScalar(s);
		const box2 = new Box3().setFromObject(node);
		const c = box2.getCenter(new Vector3());
		node.position.x -= c.x;
		node.position.z -= c.z;
		node.position.y -= box2.min.y;
	}
	return node;
}

// Instance a GLB prop into `holder`. Shares the template's geometry/materials via
// clone(true), so the meshes are tagged shared (never disposed — they belong to
// the cached template). If the template is still loading, attaches when it lands.
function instanceGLB(def, holder) {
	const place = (tpl) => {
		const inst = tpl.clone(true);
		fitNode(inst, def.fitH || 1.5);
		inst.traverse((o) => { o.userData.shared = true; });
		holder.add(inst);
	};
	const rec = loadTemplate(def.glb);
	if (rec.template) place(rec.template);
	else rec.waiters.push(place);
}

// Build the scene node for a prop `type` (the catalog id). Procedural props are
// synchronous; GLB props attach a placeholder-free holder that populates on load.
function buildProp(type) {
	const def = propDef(type);
	if (def && (def.build || def.glb)) {
		if (def.build) return def.build();
		const holder = new Group();
		instanceGLB(def, holder);
		return holder;
	}
	// A gallery model we haven't loaded yet (a peer's placement or a restored build):
	// hold the slot now and resolve the GLB url from the API, then instance it in place
	// so the object renders for real rather than vanishing.
	if (isGalleryType(type)) {
		const holder = new Group();
		resolveGalleryDef(type)
			.then((d) => instanceGLB(d, holder))
			.catch((e) => { log.warn('[world-objects] gallery resolve failed', type, e?.message || e); holder.add(neutralBox()); });
		return holder;
	}
	return neutralBox();
}

// Register the build-prop factory for the durable kinds R18 places. Both 'block'
// and 'prop' persist server-side (R17); the factory reads obj.type to pick the
// catalog entry, so one factory covers the whole palette.
function buildPropFactory(obj) { return buildProp(obj.type); }
KIND_FACTORIES.set('block', buildPropFactory);
KIND_FACTORIES.set('prop', buildPropFactory);

// Recursively dispose a node's owned resources. GLB-clone meshes (userData.shared)
// share the cached template's geometry/materials and are skipped; procedural
// meshes (userData.ownGeo) own theirs and are freed.
function disposeNode(node) {
	node.traverse((o) => {
		if (!o.isMesh) return;
		if (o.userData.shared || o.userData.ownGeo === false) return;
		o.geometry?.dispose?.();
		const mat = o.material;
		if (Array.isArray(mat)) mat.forEach((m) => m?.dispose?.());
		else mat?.dispose?.();
	});
}

// ── manager ──────────────────────────────────────────────────────────────────
export class WorldObjects {
	static registerKind(kind, factory) { KIND_FACTORIES.set(kind, factory); }

	/**
	 * @param {THREE.Scene} scene
	 * @param {import('./community-net.js').CommunityNet} net
	 * @param {object} [opts]
	 * @param {(obj)=>boolean} [opts.isMine] does this client own the object? (delete-own)
	 */
	constructor(scene, net, opts = {}) {
		this.scene = scene;
		this.net = net;
		this._isMine = typeof opts.isMine === 'function' ? opts.isMine : () => false;
		this.entries = new Map(); // id → { node, tx,ty,tz,tyaw,tscale, ownerId, kind, type, mine }
		this._offs = [
			net.on('objectAdd', (obj, id) => this._add(obj, id)),
			net.on('objectChange', (obj, id) => this._change(obj, id)),
			net.on('objectRemove', (id) => this._remove(id)),
		];
	}

	get count() { return this.entries.size; }
	ownedCount() { let n = 0; for (const e of this.entries.values()) if (e.mine) n++; return n; }

	_factory(kind) { return KIND_FACTORIES.get(kind) || neutralBox; }

	_add(obj, id) {
		if (this.entries.has(id)) { this._change(obj, id); return; }
		const holder = new Group();
		holder.name = `wo:${id}`;
		let node;
		try { node = this._factory(obj.kind)(obj) || neutralBox(); }
		catch (e) { log.warn('[world-objects] factory threw for kind', obj.kind, e); node = neutralBox(); }
		holder.add(node);
		const mine = !!this._isMine(obj);
		// Tag the whole subtree so a raycast hit maps back to this object's id/owner.
		holder.traverse((o) => { o.userData.objId = id; o.userData.objOwner = obj.ownerId; });
		holder.position.set(obj.x, obj.y, obj.z);
		holder.rotation.y = obj.yaw || 0;
		const scale = obj.scale || 1;
		holder.scale.setScalar(scale);
		this.scene.add(holder);
		this.entries.set(id, {
			node: holder,
			tx: obj.x, ty: obj.y, tz: obj.z, tyaw: obj.yaw || 0, tscale: scale,
			ownerId: obj.ownerId, kind: obj.kind, type: obj.type, mine,
		});
	}

	_change(obj, id) {
		const e = this.entries.get(id);
		if (!e) { this._add(obj, id); return; }
		e.tx = obj.x; e.ty = obj.y; e.tz = obj.z; e.tyaw = obj.yaw || 0; e.tscale = obj.scale || 1;
		if (obj.ownerId !== e.ownerId) {
			e.ownerId = obj.ownerId;
			e.mine = !!this._isMine(obj);
			e.node.traverse((o) => { o.userData.objOwner = obj.ownerId; });
		}
	}

	_remove(id) {
		const e = this.entries.get(id);
		if (!e) return;
		this.scene.remove(e.node);
		disposeNode(e.node);
		this.entries.delete(id);
	}

	// Frame interpolation — same fixed-factor glide as RemotePlayer (dt unused, the
	// factor is tuned for the ~60fps render loop and the server's update cadence).
	update() {
		for (const e of this.entries.values()) {
			const n = e.node;
			n.position.x += (e.tx - n.position.x) * REMOTE_LERP;
			n.position.y += (e.ty - n.position.y) * REMOTE_LERP;
			n.position.z += (e.tz - n.position.z) * REMOTE_LERP;
			let d = e.tyaw - n.rotation.y;
			while (d > Math.PI) d -= Math.PI * 2;
			while (d < -Math.PI) d += Math.PI * 2;
			n.rotation.y += d * YAW_LERP;
			const s = n.scale.x + (e.tscale - n.scale.x) * REMOTE_LERP;
			n.scale.setScalar(s);
		}
	}

	// Scene nodes of objects THIS client owns — the only ones delete-own may target
	// (full server-side ownership is enforced in R19; this is the client-side offer).
	ownedNodes(out = []) {
		out.length = 0;
		for (const e of this.entries.values()) if (e.mine) out.push(e.node);
		return out;
	}

	// Resolve a raycast hit object back to its world-object id (walks up to the
	// tagged subtree root), or null if the hit isn't one of our objects.
	idForHit(object) {
		let o = object;
		while (o) { if (o.userData && o.userData.objId) return o.userData.objId; o = o.parent; }
		return null;
	}

	dispose() {
		for (const off of this._offs) { try { off(); } catch { /* already detached */ } }
		this._offs = [];
		for (const e of this.entries.values()) { this.scene.remove(e.node); disposeNode(e.node); }
		this.entries.clear();
	}
}

// ── prop placement ghost (R18) ───────────────────────────────────────────────
// A translucent preview of the selected prop at the snapped placement pose, tinted
// green (valid) or red (blocked). Procedural props ghost full-fidelity; GLB props
// ghost as a translucent footprint box (sized from the catalog) so the preview is
// always immediate and never waits on an async load mid-aim.
const GHOST_GOOD = 0x66ff8c;
const GHOST_BAD = 0xff5a5a;

export class PropGhost {
	constructor(scene) {
		this.scene = scene;
		this.group = new Group();
		this.group.visible = false;
		scene.add(this.group);
		this._type = null;
		this._valid = true;
		this._fill = new MeshBasicMaterial({ color: GHOST_GOOD, transparent: true, opacity: 0.34, depthWrite: false });
		this._lineMat = new LineBasicMaterial({ color: GHOST_GOOD, transparent: true, opacity: 0.95 });
	}

	setType(type) {
		if (type === this._type) return;
		this._type = type;
		this._clearChildren();
		if (!type) { this.hide(); return; }
		const def = propDef(type);
		if (def && def.build) {
			// Full-fidelity translucent clone of the procedural prop.
			const node = def.build();
			node.traverse((o) => { if (o.isMesh) o.material = this._fill; });
			this.group.add(node);
		} else if (def) {
			// GLB prop → a translucent footprint box + wire outline, sized from `foot`.
			const f = def.foot || 0.6;
			const h = def.fitH || 1.5;
			const geo = new BoxGeometry(f * 2, h, f * 2);
			const box = new Mesh(geo, this._fill);
			box.position.y = h / 2;
			box.userData.ownGeo = true;
			const edges = new LineSegments(new EdgesGeometry(geo), this._lineMat);
			edges.position.y = h / 2;
			edges.userData.ownGeo = true;
			this.group.add(box, edges);
		}
	}

	setPose(x, y, z, yaw, scale = 1) {
		this.group.position.set(x, y, z);
		this.group.rotation.y = yaw;
		this.group.scale.setScalar(scale);
	}

	setValid(valid) {
		if (valid === this._valid) return;
		this._valid = valid;
		const hex = valid ? GHOST_GOOD : GHOST_BAD;
		this._fill.color.setHex(hex);
		this._lineMat.color.setHex(hex);
	}

	show() { this.group.visible = true; }
	hide() { this.group.visible = false; }

	_clearChildren() {
		for (const child of this.group.children.slice()) {
			this.group.remove(child);
			child.traverse?.((o) => {
				if (o.isMesh && o.userData.ownGeo) o.geometry?.dispose?.();
				if (o.isLineSegments && o.userData.ownGeo) o.geometry?.dispose?.();
			});
		}
	}

	dispose() {
		this._clearChildren();
		this.scene.remove(this.group);
		this._fill.dispose();
		this._lineMat.dispose();
	}
}

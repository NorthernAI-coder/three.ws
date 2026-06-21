/**
 * Mesh → Gaussian-splat conversion — three.ws's own splat-generation lane.
 *
 * Instead of renting a text-to-splat API, we own the format both ways: any mesh
 * the platform can produce (a Lab generator, a forged GLB, an uploaded model)
 * gets resampled into a Gaussian-splat radiance field entirely in the browser.
 *
 * Approach: area-weighted surface sampling. We walk every triangle, sample N
 * points proportional to triangle area, read colour from vertex colours (or the
 * material base colour as a fallback), and emit each point as one Gaussian in
 * the antimatter15 `.splat` layout (32 bytes/splat: center f32×3, scale f32×3,
 * colour u8×4, rotation u8×4). The result loads straight into the splat viewer
 * and downloads as a real `.splat` file.
 */

import * as THREE from 'three';

const _v = {
	a: new THREE.Vector3(), b: new THREE.Vector3(), c: new THREE.Vector3(),
	ab: new THREE.Vector3(), ac: new THREE.Vector3(), cross: new THREE.Vector3(),
	p: new THREE.Vector3(),
	ca: new THREE.Color(), cb: new THREE.Color(), cc: new THREE.Color(), cp: new THREE.Color(),
};

function collectMeshes(object3d) {
	const meshes = [];
	object3d.updateMatrixWorld(true);
	object3d.traverse((o) => { if (o.isMesh && o.geometry?.attributes?.position) meshes.push(o); });
	return meshes;
}

// Build a flat list of triangles with world-space positions + per-vertex colours.
function gatherTriangles(meshes) {
	const tris = [];
	for (const mesh of meshes) {
		const geo = mesh.geometry;
		const pos = geo.attributes.position;
		const colAttr = geo.attributes.color || null;
		const matColor = new THREE.Color(1, 1, 1);
		const m = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
		if (m?.color) matColor.copy(m.color);
		const index = geo.index;
		const triCount = index ? index.count / 3 : pos.count / 3;
		for (let t = 0; t < triCount; t++) {
			const i0 = index ? index.getX(t * 3) : t * 3;
			const i1 = index ? index.getX(t * 3 + 1) : t * 3 + 1;
			const i2 = index ? index.getX(t * 3 + 2) : t * 3 + 2;
			const a = _v.a.fromBufferAttribute(pos, i0).applyMatrix4(mesh.matrixWorld).clone();
			const b = _v.b.fromBufferAttribute(pos, i1).applyMatrix4(mesh.matrixWorld).clone();
			const c = _v.c.fromBufferAttribute(pos, i2).applyMatrix4(mesh.matrixWorld).clone();
			const ca = colAttr ? new THREE.Color().fromBufferAttribute(colAttr, i0) : matColor.clone();
			const cb = colAttr ? new THREE.Color().fromBufferAttribute(colAttr, i1) : matColor.clone();
			const cc = colAttr ? new THREE.Color().fromBufferAttribute(colAttr, i2) : matColor.clone();
			const area = _v.ab.subVectors(b, a).cross(_v.ac.subVectors(c, a)).length() * 0.5;
			tris.push({ a, b, c, ca, cb, cc, area });
		}
	}
	return tris;
}

// Deterministic PRNG so the same model + seed always yields the same splat cloud.
function mulberry32(seed) {
	let s = seed >>> 0;
	return () => {
		s |= 0; s = (s + 0x6d2b79f5) | 0;
		let t = Math.imul(s ^ (s >>> 15), 1 | s);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

/**
 * Convert a THREE.Object3D into a `.splat` ArrayBuffer.
 * @param {THREE.Object3D} object3d
 * @param {{count?:number, seed?:number, scale?:number}} [opts]
 * @returns {{buffer: ArrayBuffer, count: number}}
 */
export function meshToSplatBuffer(object3d, opts = {}) {
	const count = Math.max(500, Math.min(200000, Math.floor(opts.count ?? 30000)));
	const seed = Math.floor(opts.seed ?? 1);
	const meshes = collectMeshes(object3d);
	if (!meshes.length) throw new Error('No mesh geometry to convert.');
	const tris = gatherTriangles(meshes);
	if (!tris.length) throw new Error('No triangles found in the model.');

	// Cumulative area table for weighted sampling.
	const cum = new Float64Array(tris.length);
	let total = 0;
	for (let i = 0; i < tris.length; i++) { total += tris[i].area; cum[i] = total; }
	if (total <= 0) throw new Error('Model has zero surface area.');

	// Splat scale ~ a fraction of the model's size so the shell reads as solid.
	const box = new THREE.Box3().setFromObject(object3d);
	const diag = box.getSize(new THREE.Vector3()).length() || 1;
	const splatScale = (opts.scale ?? 0.004) * diag;

	const rnd = mulberry32(seed);
	const buf = new ArrayBuffer(count * 32);
	const dv = new DataView(buf);

	const pickTri = (r) => {
		// binary search the cumulative area table
		let lo = 0, hi = tris.length - 1;
		const target = r * total;
		while (lo < hi) {
			const mid = (lo + hi) >> 1;
			if (cum[mid] < target) lo = mid + 1; else hi = mid;
		}
		return tris[lo];
	};

	for (let i = 0; i < count; i++) {
		const tri = pickTri(rnd());
		// Uniform barycentric sample.
		let u = rnd(), v = rnd();
		if (u + v > 1) { u = 1 - u; v = 1 - v; }
		const w = 1 - u - v;
		_v.p.set(0, 0, 0)
			.addScaledVector(tri.a, w)
			.addScaledVector(tri.b, u)
			.addScaledVector(tri.c, v);
		_v.cp.setRGB(
			tri.ca.r * w + tri.cb.r * u + tri.cc.r * v,
			tri.ca.g * w + tri.cb.g * u + tri.cc.g * v,
			tri.ca.b * w + tri.cb.b * u + tri.cc.b * v,
		);

		const base = i * 32;
		dv.setFloat32(base, _v.p.x, true);
		dv.setFloat32(base + 4, _v.p.y, true);
		dv.setFloat32(base + 8, _v.p.z, true);
		dv.setFloat32(base + 12, splatScale, true);
		dv.setFloat32(base + 16, splatScale, true);
		dv.setFloat32(base + 20, splatScale, true);
		dv.setUint8(base + 24, Math.round(THREE.MathUtils.clamp(_v.cp.r, 0, 1) * 255));
		dv.setUint8(base + 25, Math.round(THREE.MathUtils.clamp(_v.cp.g, 0, 1) * 255));
		dv.setUint8(base + 26, Math.round(THREE.MathUtils.clamp(_v.cp.b, 0, 1) * 255));
		dv.setUint8(base + 27, 255);
		// identity rotation (w,x,y,z) → bytes
		dv.setUint8(base + 28, 255);
		dv.setUint8(base + 29, 128);
		dv.setUint8(base + 30, 128);
		dv.setUint8(base + 31, 128);
	}

	return { buffer: buf, count };
}

// PointCloudViewer — render a coloured 3D point cloud (.ply) in the browser.
//
// The output format of the Scene Capture pipeline (workers/model-video2scene,
// LingBot-Map): a binary PLY of world-space points with per-vertex RGB. This is a
// plain point cloud, NOT a Gaussian splat — so it renders with THREE.Points, not
// the splat engine. Render-on-demand (no idle rAF) keeps it efficient: the loop
// only paints while the user is interacting or an animation is settling.

import {
	Scene,
	PerspectiveCamera,
	WebGLRenderer,
	Points,
	BufferGeometry,
	BufferAttribute,
	PointsMaterial,
	Color,
	Box3,
	Sphere,
	Vector3,
} from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { PLYLoader } from 'three/examples/jsm/loaders/PLYLoader.js';

export class PointCloudViewer {
	constructor(host, { background = '#0a0a0a' } = {}) {
		this.host = host;
		this._disposed = false;
		this._needsRender = true;
		this._settleUntil = 0;

		this.scene = new Scene();
		this.scene.background = new Color(background);

		this.camera = new PerspectiveCamera(55, 1, 0.01, 5000);
		this.camera.position.set(0, 0, 4);

		this.renderer = new WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
		this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
		host.appendChild(this.renderer.domElement);

		this.controls = new OrbitControls(this.camera, this.renderer.domElement);
		this.controls.enableDamping = true;
		this.controls.dampingFactor = 0.08;
		this.controls.rotateSpeed = 0.7;
		this.controls.addEventListener('change', () => { this._needsRender = true; });

		this.points = null;
		this.material = new PointsMaterial({ size: 0.012, sizeAttenuation: true, vertexColors: true });
		this._home = { position: new Vector3(0, 0, 4), target: new Vector3(0, 0, 0) };
		this._radius = 1;

		this._onResize = this._resize.bind(this);
		window.addEventListener('resize', this._onResize);
		this._resize();
		this._loop = this._tick.bind(this);
		requestAnimationFrame(this._loop);
	}

	_resize() {
		const w = this.host.clientWidth || 1;
		const h = this.host.clientHeight || 1;
		this.renderer.setSize(w, h, false);
		this.camera.aspect = w / h;
		this.camera.updateProjectionMatrix();
		this._needsRender = true;
	}

	_tick() {
		if (this._disposed) return;
		requestAnimationFrame(this._loop);
		const damping = this.controls.enableDamping && performance.now() < this._settleUntil;
		if (this._needsRender || damping) {
			this.controls.update();
			this.renderer.render(this.scene, this.camera);
			this._needsRender = false;
		}
	}

	// Parse a PLY ArrayBuffer into a Points cloud and frame it. Returns { count }.
	loadBuffer(buffer) {
		const geom = new PLYLoader().parse(buffer);
		return this._setGeometry(geom);
	}

	setGeometryFromArrays(positions, colors) {
		const geom = new BufferGeometry();
		geom.setAttribute('position', new BufferAttribute(positions, 3));
		if (colors) geom.setAttribute('color', new BufferAttribute(colors, 3, true));
		return this._setGeometry(geom);
	}

	_setGeometry(geom) {
		if (this.points) {
			this.scene.remove(this.points);
			this.points.geometry.dispose();
		}
		if (!geom.getAttribute('color')) {
			// No per-vertex colour (rare) — fall back to a neutral monochrome grey so
			// the cloud is still legible against the dark stage.
			const n = geom.getAttribute('position').count;
			const grey = new Float32Array(n * 3).fill(0.78);
			geom.setAttribute('color', new BufferAttribute(grey, 3));
		}
		geom.computeBoundingBox();
		const box = geom.boundingBox || new Box3();
		const sphere = box.getBoundingSphere(new Sphere());
		const center = sphere.center.clone();
		// Recenter the cloud on the origin so orbit pivots feel natural regardless
		// of where the reconstruction placed its world frame.
		geom.translate(-center.x, -center.y, -center.z);
		this._radius = Math.max(sphere.radius, 0.001);

		// Scale point size to the scene extent so dense and sparse clouds both read.
		this.material.size = this._radius * 0.006;
		this._baseSize = this.material.size;

		this.points = new Points(geom, this.material);
		this.scene.add(this.points);

		this._frame();
		return { count: geom.getAttribute('position').count };
	}

	_frame() {
		const r = this._radius;
		const dist = r * 2.6;
		this._home.position.set(dist * 0.5, dist * 0.35, dist);
		this._home.target.set(0, 0, 0);
		this.camera.position.copy(this._home.position);
		this.controls.target.copy(this._home.target);
		this.camera.near = Math.max(r / 1000, 0.001);
		this.camera.far = r * 100;
		this.camera.updateProjectionMatrix();
		this.controls.update();
		this._settle();
	}

	recenter() {
		if (!this.points) return;
		this.camera.position.copy(this._home.position);
		this.controls.target.copy(this._home.target);
		this._settle();
	}

	// Multiplier (0.25–4) on the auto-scaled base point size.
	setPointScale(mult) {
		if (!this._baseSize) return;
		this.material.size = this._baseSize * mult;
		this._needsRender = true;
	}

	_settle() {
		this._settleUntil = performance.now() + 600;
		this._needsRender = true;
	}

	dispose() {
		this._disposed = true;
		window.removeEventListener('resize', this._onResize);
		this.controls.dispose();
		if (this.points) this.points.geometry.dispose();
		this.material.dispose();
		this.renderer.dispose();
		if (this.renderer.domElement?.parentNode) {
			this.renderer.domElement.parentNode.removeChild(this.renderer.domElement);
		}
	}
}

// ── Synthetic sample cloud ────────────────────────────────────────────────────
// Procedurally exercises the renderer with a recognisable interior — a floor,
// two walls, and a centre object — in monochrome greys. Clearly synthetic, not a
// real capture; mirrors the labelled-sample convention used by the splat viewer.
export function sampleRoomCloud(count = 90_000) {
	const positions = new Float32Array(count * 3);
	const colors = new Float32Array(count * 3);
	const c = new Color();
	let i = 0;
	const put = (x, y, z, shade) => {
		positions[i * 3] = x; positions[i * 3 + 1] = y; positions[i * 3 + 2] = z;
		c.setHSL(0, 0, shade);
		colors[i * 3] = c.r; colors[i * 3 + 1] = c.g; colors[i * 3 + 2] = c.b;
		i++;
	};
	const rnd = (seed) => {
		// Deterministic hash-based pseudo-random — no Math.random (keeps samples stable).
		const s = Math.sin(seed * 12.9898) * 43758.5453;
		return s - Math.floor(s);
	};
	for (let k = 0; k < count; k++) {
		const r = rnd(k + 1);
		const region = rnd(k * 1.7 + 3);
		const jitter = (rnd(k * 2.3 + 7) - 0.5) * 0.04;
		if (region < 0.34) {
			// floor
			put((rnd(k * 3.1 + 1) - 0.5) * 4, -1 + jitter, (rnd(k * 4.7 + 2) - 0.5) * 4, 0.22 + r * 0.12);
		} else if (region < 0.56) {
			// back wall
			put((rnd(k * 5.3 + 4) - 0.5) * 4, (rnd(k * 6.1 + 5)) * 2.4 - 1, -2 + jitter, 0.38 + r * 0.14);
		} else if (region < 0.78) {
			// side wall
			put(-2 + jitter, (rnd(k * 7.9 + 6)) * 2.4 - 1, (rnd(k * 8.3 + 7) - 0.5) * 4, 0.32 + r * 0.14);
		} else {
			// centre object — a rounded column
			const t = rnd(k * 9.1 + 8);
			const theta = rnd(k * 10.7 + 9) * Math.PI * 2;
			const rad = 0.5 + 0.12 * Math.sin(t * 9);
			put(Math.cos(theta) * rad, t * 1.8 - 1, Math.sin(theta) * rad - 0.2, 0.55 + r * 0.2);
		}
	}
	return { positions, colors, count: i };
}

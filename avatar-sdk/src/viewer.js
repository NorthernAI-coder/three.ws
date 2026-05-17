// Minimal <three-ws-viewer> web component.
//
// Pure visual: loads a GLB at `src`, renders it with OrbitControls and a
// two-light setup. No chat, no voice, no skills — for sites that just want a
// 3D preview without pulling in the full <agent-3d> runtime.
//
// Peer-depends on `three` (>=0.150.0). Import paths use `three/addons/*`,
// which resolves through your bundler's normal three.js entry. Consumers
// that bundle this file get tree-shaking for free; the heavy <agent-3d>
// runtime in `./agent` is never touched.

import {
	Scene,
	PerspectiveCamera,
	WebGLRenderer,
	AmbientLight,
	DirectionalLight,
	Box3,
	Vector3,
	Color,
	PMREMGenerator,
	ACESFilmicToneMapping,
	SRGBColorSpace,
} from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

const TAG = 'three-ws-viewer';

class ThreeWsViewerElement extends HTMLElement {
	static get observedAttributes() {
		return ['src', 'alt', 'background'];
	}

	constructor() {
		super();
		this._shadow = this.attachShadow({ mode: 'open' });
		this._shadow.innerHTML = `<style>
			:host { display: block; position: relative; width: 100%; height: 100%; min-height: 320px; }
			canvas { display: block; width: 100%; height: 100%; outline: none; }
			.label { position: absolute; inset: auto 0 8px 0; text-align: center; font: 12px system-ui, sans-serif; color: rgba(255,255,255,0.65); pointer-events: none; text-shadow: 0 1px 2px rgba(0,0,0,0.6); }
		</style>`;
		this._canvas = document.createElement('canvas');
		this._shadow.appendChild(this._canvas);
		this._label = null;

		this._scene = null;
		this._camera = null;
		this._renderer = null;
		this._controls = null;
		this._model = null;
		this._raf = 0;
		this._resizeObs = null;
		this._loadToken = 0;
	}

	connectedCallback() {
		this._init();
		this._render = this._render.bind(this);
		this._raf = requestAnimationFrame(this._render);
		const src = this.getAttribute('src');
		if (src) this._loadModel(src);
		this._applyAlt(this.getAttribute('alt'));
	}

	disconnectedCallback() {
		cancelAnimationFrame(this._raf);
		this._raf = 0;
		if (this._resizeObs) {
			this._resizeObs.disconnect();
			this._resizeObs = null;
		}
		if (this._controls) {
			this._controls.dispose();
			this._controls = null;
		}
		if (this._renderer) {
			this._renderer.dispose();
			this._renderer.forceContextLoss?.();
			this._renderer = null;
		}
		this._scene = null;
		this._camera = null;
		this._model = null;
	}

	attributeChangedCallback(name, _old, value) {
		if (!this._scene) return;
		if (name === 'src') this._loadModel(value);
		else if (name === 'alt') this._applyAlt(value);
		else if (name === 'background') this._applyBackground(value);
	}

	_init() {
		this._scene = new Scene();
		this._applyBackground(this.getAttribute('background'));

		const width = this.clientWidth || 320;
		const height = this.clientHeight || 320;

		this._camera = new PerspectiveCamera(35, width / height, 0.05, 200);
		this._camera.position.set(0, 1.3, 3);

		this._renderer = new WebGLRenderer({
			canvas: this._canvas,
			antialias: true,
			alpha: true,
			powerPreference: 'high-performance',
		});
		this._renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
		this._renderer.setSize(width, height, false);
		this._renderer.outputColorSpace = SRGBColorSpace;
		this._renderer.toneMapping = ACESFilmicToneMapping;
		this._renderer.toneMappingExposure = 1.0;

		const pmrem = new PMREMGenerator(this._renderer);
		this._scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

		this._scene.add(new AmbientLight(0xffffff, 0.55));
		const key = new DirectionalLight(0xffffff, 1.1);
		key.position.set(2, 4, 3);
		this._scene.add(key);

		this._controls = new OrbitControls(this._camera, this._canvas);
		this._controls.enableDamping = true;
		this._controls.dampingFactor = 0.08;
		this._controls.target.set(0, 1.0, 0);
		this._controls.update();

		this._resizeObs = new ResizeObserver(() => this._handleResize());
		this._resizeObs.observe(this);
	}

	_handleResize() {
		if (!this._renderer || !this._camera) return;
		const w = this.clientWidth || 1;
		const h = this.clientHeight || 1;
		this._renderer.setSize(w, h, false);
		this._camera.aspect = w / h;
		this._camera.updateProjectionMatrix();
	}

	async _loadModel(url) {
		if (!url) return;
		const token = ++this._loadToken;
		const loader = new GLTFLoader();
		try {
			const gltf = await loader.loadAsync(url);
			if (token !== this._loadToken || !this._scene) return;
			if (this._model) this._scene.remove(this._model);
			this._model = gltf.scene;
			this._scene.add(this._model);
			this._frameModel(this._model);
			this.dispatchEvent(new CustomEvent('load', { detail: { url } }));
		} catch (err) {
			if (token !== this._loadToken) return;
			this.dispatchEvent(new CustomEvent('error', { detail: { url, error: err } }));
		}
	}

	_frameModel(obj) {
		const box = new Box3().setFromObject(obj);
		const size = new Vector3();
		const center = new Vector3();
		box.getSize(size);
		box.getCenter(center);

		const maxDim = Math.max(size.x, size.y, size.z) || 1;
		const fov = (this._camera.fov * Math.PI) / 180;
		const dist = (maxDim / 2) / Math.tan(fov / 2) * 1.6;

		this._camera.position.set(center.x, center.y + size.y * 0.05, center.z + dist);
		this._camera.near = Math.max(0.01, dist / 100);
		this._camera.far = dist * 50;
		this._camera.updateProjectionMatrix();
		this._controls.target.copy(center);
		this._controls.update();
	}

	_applyBackground(value) {
		if (!this._scene) return;
		if (!value || value === 'transparent') {
			this._scene.background = null;
			return;
		}
		try {
			this._scene.background = new Color(value);
		} catch {
			this._scene.background = null;
		}
	}

	_applyAlt(value) {
		const text = (value || '').trim();
		if (!text) {
			if (this._label) {
				this._label.remove();
				this._label = null;
			}
			this.removeAttribute('aria-label');
			return;
		}
		this.setAttribute('aria-label', text);
		if (!this._label) {
			this._label = document.createElement('div');
			this._label.className = 'label';
			this._shadow.appendChild(this._label);
		}
		this._label.textContent = text;
	}

	_render() {
		if (!this._renderer) return;
		this._raf = requestAnimationFrame(this._render);
		this._controls?.update();
		this._renderer.render(this._scene, this._camera);
	}
}

if (typeof customElements !== 'undefined' && !customElements.get(TAG)) {
	customElements.define(TAG, ThreeWsViewerElement);
}

export { ThreeWsViewerElement };
export default ThreeWsViewerElement;

// three.ws 3D Studio — OpenAI Apps SDK viewer component.
//
// Renders the GLB produced by the 3D Studio generation tools (forge_free,
// text_to_avatar, mesh_forge, rig_mesh, forge_avatar, …) as an interactive,
// orbitable 3D preview inline in ChatGPT. Bundled to a single self-contained
// IIFE by scripts/build-apps-sdk-viewer.mjs and inlined verbatim into the
// `ui://widget/studio-viewer.html` skybridge resource — so the component needs
// no external <script>. The ONLY network call it makes is fetching the GLB
// asset itself (allowed via the resource's openai/widgetCSP connectDomains).
//
// Reuses the same Three.js GLB-rendering approach as the Claude.ai artifact
// viewer (scripts/artifact-viewer/src.js) and the Forge chat preview
// (public/chat/forge-viewer.html): PMREM RoomEnvironment lighting, auto-framing,
// contact shadow, and AnimationMixer-driven idle playback for rigged models.
//
// Host contract (OpenAI Apps SDK):
//   • window.openai.toolOutput  → the tool's structuredContent.
//   • the GLB URL lives under the documented `glb_url` key (camelCase `glbUrl`
//     and a few other aliases are tolerated for forward-compat).
//   • the `openai:set_globals` event fires when toolOutput / theme / layout
//     change; we re-read on it.
// Standalone fallback: opened directly in a browser (no window.openai), it reads
// ?glb=<url>&viewer=<url>&name=<text> from the query string — used for local
// verification and the "open in a normal browser" path.

import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';

const REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const THEMES = {
	dark: { bg: 0x0a0c10, css: '#0a0c10', text: '#e8eaed', muted: '#9aa3ad', panel: 'rgba(13,16,21,0.72)', stroke: 'rgba(255,255,255,0.12)' },
	light: { bg: 0xeef1f5, css: '#eef1f5', text: '#15181d', muted: '#5b636d', panel: 'rgba(255,255,255,0.78)', stroke: 'rgba(0,0,0,0.10)' },
};

// ── Host payload resolution ──────────────────────────────────────────────
// The structured content the generation tools return uses `glb_url`; the free
// forge_free tool returns `glbUrl`. Accept both plus a couple of generic
// aliases so any GLB-bearing tool result renders.
function pickUrl(obj, keys) {
	if (!obj || typeof obj !== 'object') return '';
	for (const k of keys) {
		const v = obj[k];
		if (typeof v === 'string' && /^https?:\/\//i.test(v)) return v;
	}
	return '';
}

function readPayload() {
	const out = (typeof window.openai === 'object' && window.openai && window.openai.toolOutput) || null;
	if (out) {
		return {
			glb: pickUrl(out, ['glb_url', 'glbUrl', 'model_url', 'modelUrl', 'url']),
			viewer: pickUrl(out, ['viewer_url', 'viewerUrl', 'view_url', 'viewUrl', 'preview']),
			name: typeof out.name === 'string' ? out.name : typeof out.prompt === 'string' ? out.prompt : '',
			source: 'host',
		};
	}
	// Standalone / local-verification fallback.
	const q = new URLSearchParams(location.search);
	const hashUrl = location.hash.length > 1 ? decodeURIComponent(location.hash.slice(1)) : '';
	return {
		glb: pickUrl({ u: q.get('glb') || hashUrl }, ['u']),
		viewer: pickUrl({ u: q.get('viewer') || '' }, ['u']),
		name: q.get('name') || '',
		source: 'standalone',
	};
}

function currentTheme() {
	const t = (typeof window.openai === 'object' && window.openai && window.openai.theme) || '';
	const mode = (typeof t === 'string' ? t : t?.mode) || '';
	if (mode === 'light' || mode === 'dark') return mode;
	return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

// ── DOM scaffold (built in JS so the resource HTML stays a bare stage div) ──
const ICONS = {
	download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>',
	external: '<path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>',
	reset: '<polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/>',
	rotate: '<path d="M23 4v6h-6"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>',
	warn: '<circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>',
	cube: '<path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/>',
};
function svg(name) {
	return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (ICONS[name] || '') + '</svg>';
}

const STYLE = `
:root{color-scheme:dark light}
*{box-sizing:border-box}
html,body{margin:0;height:100%;overflow:hidden;font-family:ui-sans-serif,system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;-webkit-font-smoothing:antialiased}
#studio-stage{position:fixed;inset:0}
#studio-stage canvas{display:block;width:100%;height:100%;outline:none}
.sv-hud{position:fixed;left:12px;top:12px;right:12px;display:flex;gap:8px;pointer-events:none;opacity:0;transition:opacity .5s ease}
.sv-hud.on{opacity:1}
.sv-title{max-width:70%;padding:6px 11px;font-size:12.5px;line-height:1.35;border-radius:9px;border:1px solid var(--sv-stroke);background:var(--sv-panel);color:var(--sv-text);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.sv-bar{position:fixed;left:50%;bottom:12px;transform:translateX(-50%) translateY(8px);display:flex;gap:5px;padding:5px;border-radius:13px;border:1px solid var(--sv-stroke);background:var(--sv-panel);backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);box-shadow:0 10px 30px rgba(0,0,0,.34);opacity:0;transition:opacity .5s ease,transform .5s ease;max-width:calc(100vw - 24px);flex-wrap:wrap;justify-content:center}
.sv-bar.on{opacity:1;transform:translateX(-50%) translateY(0)}
.sv-btn{appearance:none;border:1px solid transparent;background:transparent;color:var(--sv-text);font:inherit;font-size:12.5px;font-weight:600;display:inline-flex;align-items:center;gap:6px;padding:8px 12px;border-radius:9px;cursor:pointer;text-decoration:none;white-space:nowrap;transition:background .15s ease,border-color .15s ease}
.sv-btn:hover{background:var(--sv-hover)}
.sv-btn:active{background:var(--sv-active)}
.sv-btn:focus-visible{outline:none;border-color:#18e0c8;box-shadow:0 0 0 2px rgba(24,224,200,.4)}
.sv-btn[aria-pressed=true]{background:rgba(124,92,255,.22);border-color:rgba(124,92,255,.5)}
.sv-btn.primary{background:linear-gradient(90deg,#7c5cff,#6b8bff);color:#fff;border-color:transparent}
.sv-btn.primary:hover{filter:brightness(1.08);background:linear-gradient(90deg,#7c5cff,#6b8bff)}
.sv-btn svg{width:15px;height:15px;flex:0 0 auto}
@media (max-width:540px){.sv-btn .lbl{display:none}.sv-btn{padding:9px 10px}}
.sv-overlay{position:fixed;inset:0;display:flex;align-items:center;justify-content:center;padding:20px;transition:opacity .4s ease}
.sv-overlay.hidden{opacity:0;pointer-events:none}
.sv-card{width:min(420px,90%);padding:24px;border-radius:16px;border:1px solid var(--sv-stroke);background:var(--sv-panel);backdrop-filter:blur(16px);-webkit-backdrop-filter:blur(16px);text-align:center;box-shadow:0 20px 50px rgba(0,0,0,.4)}
.sv-spinner{width:30px;height:30px;margin:0 auto 14px}
.sv-spinner circle{fill:none;stroke:#18e0c8;stroke-width:4;stroke-linecap:round;stroke-dasharray:90 150;transform-origin:center;animation:sv-spin 1s linear infinite}
@keyframes sv-spin{to{transform:rotate(360deg)}}
.sv-ic{width:44px;height:44px;margin:0 auto 14px;display:grid;place-items:center;border-radius:50%;color:#18e0c8}
.sv-ic.err{color:#ff6b6b;background:rgba(255,107,107,.13)}
.sv-ic.empty{color:var(--sv-muted);background:var(--sv-hover)}
.sv-ic svg{width:24px;height:24px}
.sv-ttl{font-size:16px;font-weight:700;color:var(--sv-text);margin-bottom:7px}
.sv-msg{font-size:13px;line-height:1.5;color:var(--sv-muted);margin-bottom:18px}
.sv-acts{display:flex;gap:8px;justify-content:center;flex-wrap:wrap}
.sv-sr{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}
`;

const el = (id) => document.getElementById(id);

class StudioViewer {
	constructor(host) {
		this.host = host;
		this.theme = THEMES[currentTheme()] || THEMES.dark;
		this.autoRotate = !REDUCED;
		this.disposed = false;
		this.frameInfo = null;
		this.glbUrl = null;
		this.objectUrl = null;
		this._applyThemeVars();
		this._buildChrome();
	}

	_applyThemeVars() {
		const t = this.theme;
		const isLight = t === THEMES.light;
		document.documentElement.style.setProperty('--sv-text', t.text);
		document.documentElement.style.setProperty('--sv-muted', t.muted);
		document.documentElement.style.setProperty('--sv-panel', t.panel);
		document.documentElement.style.setProperty('--sv-stroke', t.stroke);
		document.documentElement.style.setProperty('--sv-hover', isLight ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.08)');
		document.documentElement.style.setProperty('--sv-active', isLight ? 'rgba(0,0,0,0.12)' : 'rgba(255,255,255,0.14)');
		document.body.style.background = t.css;
	}

	_buildChrome() {
		const hud = document.createElement('header');
		hud.className = 'sv-hud';
		hud.id = 'sv-hud';
		hud.innerHTML = '<div class="sv-title" id="sv-title"></div>';

		const bar = document.createElement('nav');
		bar.className = 'sv-bar';
		bar.id = 'sv-bar';
		bar.setAttribute('aria-label', 'Model controls');

		const overlay = document.createElement('div');
		overlay.className = 'sv-overlay';
		overlay.id = 'sv-overlay';
		overlay.setAttribute('role', 'status');
		overlay.setAttribute('aria-live', 'polite');

		this.host.append(hud, bar, overlay);
		this.hud = hud;
		this.bar = bar;
		this.overlay = overlay;
	}

	// ── Overlay states ───────────────────────────────────────────────────
	showLoading(label) {
		this.overlay.classList.remove('hidden');
		this.overlay.innerHTML =
			'<div class="sv-card">' +
			'<svg class="sv-spinner" viewBox="0 0 50 50" aria-hidden="true"><circle cx="25" cy="25" r="20"/></svg>' +
			'<div class="sv-ttl">' + escHtml(label || 'Loading 3D model…') + '</div>' +
			'<div class="sv-msg">Rendering your generated model</div>' +
			'</div>';
	}

	hideOverlay() {
		this.overlay.classList.add('hidden');
	}

	showState({ kind, title, msg, actions }) {
		this.overlay.classList.remove('hidden');
		const card = document.createElement('div');
		card.className = 'sv-card';
		const ic = document.createElement('div');
		ic.className = 'sv-ic ' + (kind === 'error' ? 'err' : 'empty');
		ic.innerHTML = svg(kind === 'error' ? 'warn' : 'cube');
		const h = document.createElement('div');
		h.className = 'sv-ttl';
		h.textContent = title;
		const m = document.createElement('div');
		m.className = 'sv-msg';
		m.textContent = msg;
		const acts = document.createElement('div');
		acts.className = 'sv-acts';
		for (const a of actions || []) acts.appendChild(this._mkBtn(a));
		card.append(ic, h, m, acts);
		this.overlay.replaceChildren(card);
	}

	_mkBtn({ icon, label, onClick, href, primary, pressed, aria }) {
		const node = document.createElement(href ? 'a' : 'button');
		node.className = 'sv-btn' + (primary ? ' primary' : '');
		node.innerHTML = (icon ? svg(icon) : '') + '<span class="lbl">' + escHtml(label) + '</span>';
		node.setAttribute('aria-label', aria || label);
		if (pressed !== undefined) node.setAttribute('aria-pressed', String(pressed));
		if (href) {
			node.href = href;
			node.target = '_blank';
			node.rel = 'noopener noreferrer';
		} else if (onClick) {
			node.type = 'button';
			node.addEventListener('click', onClick);
		}
		return node;
	}

	// ── Three.js scene ───────────────────────────────────────────────────
	initThree() {
		const canvas = document.createElement('canvas');
		canvas.setAttribute('aria-label', '3D model viewer — drag to orbit');
		canvas.tabIndex = 0;
		this.host.insertBefore(canvas, this.host.firstChild);
		try {
			this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
		} catch {
			return false;
		}
		const r = this.renderer;
		r.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
		r.setSize(this.w(), this.h(), false);
		r.outputColorSpace = THREE.SRGBColorSpace;
		r.toneMapping = THREE.ACESFilmicToneMapping;
		r.toneMappingExposure = 1.05;
		r.shadowMap.enabled = true;
		r.shadowMap.type = THREE.PCFSoftShadowMap;

		this.scene = new THREE.Scene();
		this.scene.background = new THREE.Color(this.theme.bg);

		this.pmrem = new THREE.PMREMGenerator(r);
		this.scene.environment = this.pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

		this.camera = new THREE.PerspectiveCamera(45, this.w() / this.h(), 0.01, 2000);
		this.camera.position.set(0, 1.1, 3.2);

		this.controls = new OrbitControls(this.camera, canvas);
		this.controls.enableDamping = true;
		this.controls.dampingFactor = 0.07;
		this.controls.autoRotate = this.autoRotate;
		this.controls.autoRotateSpeed = 1.3;
		this.controls.listenToKeyEvents(canvas); // arrow-key orbit
		this.controls.addEventListener('start', () => {
			if (this.autoRotate) {
				this.autoRotate = false;
				this.controls.autoRotate = false;
				this._syncRotate();
			}
		});

		const key = new THREE.DirectionalLight(0xffffff, 2.0);
		key.position.set(4, 7, 5);
		key.castShadow = true;
		key.shadow.mapSize.set(2048, 2048);
		key.shadow.bias = -0.0004;
		key.shadow.normalBias = 0.02;
		this.scene.add(key);
		this.scene.add(new THREE.HemisphereLight(0xbfd4ff, 0x10131a, 0.35));

		this.clock = new THREE.Clock();
		this._onResize = () => this.resize();
		window.addEventListener('resize', this._onResize);
		this._ro = new ResizeObserver(() => this.resize());
		this._ro.observe(document.body);
		r.setAnimationLoop(() => this.render());
		return true;
	}

	w() { return Math.max(1, window.innerWidth); }
	h() {
		const cap = Number(typeof window.openai === 'object' && window.openai && window.openai.maxHeight) || 0;
		return Math.max(1, cap > 0 ? Math.min(window.innerHeight, cap) : window.innerHeight);
	}

	resize() {
		if (this.disposed || !this.renderer) return;
		this.renderer.setSize(this.w(), this.h(), false);
		this.camera.aspect = this.w() / this.h();
		this.camera.updateProjectionMatrix();
	}

	render() {
		if (this.disposed) return;
		const dt = this.clock.getDelta();
		if (this.mixer) this.mixer.update(dt);
		if (this.controls) this.controls.update();
		this.renderer.render(this.scene, this.camera);
	}

	frame(obj) {
		const box = new THREE.Box3().setFromObject(obj);
		const size = box.getSize(new THREE.Vector3());
		const center = box.getCenter(new THREE.Vector3());
		const maxDim = Math.max(size.x, size.y, size.z) || 1;
		obj.position.sub(center);

		const fitDist = (maxDim / 2 / Math.tan((this.camera.fov * Math.PI) / 360)) * 1.5;
		this.camera.near = maxDim / 100;
		this.camera.far = maxDim * 100;
		this.camera.updateProjectionMatrix();
		this.controls.minDistance = maxDim * 0.4;
		this.controls.maxDistance = maxDim * 6;
		this.frameInfo = { dist: fitDist, height: maxDim * 0.18 };
		this.resetView(true);

		const ground = new THREE.Mesh(
			new THREE.PlaneGeometry(maxDim * 12, maxDim * 12),
			new THREE.ShadowMaterial({ opacity: 0.26 }),
		);
		ground.rotation.x = -Math.PI / 2;
		ground.position.y = -size.y / 2;
		ground.receiveShadow = true;
		this.scene.add(ground);
		this.ground = ground;
	}

	resetView(instant) {
		if (!this.frameInfo) return;
		const { dist, height } = this.frameInfo;
		const target = new THREE.Vector3(0, height, dist);
		this.controls.target.set(0, 0, 0);
		if (instant || REDUCED) {
			this.camera.position.copy(target);
			return;
		}
		const from = this.camera.position.clone();
		const t0 = performance.now();
		const ease = () => {
			if (this.disposed) return;
			const k = Math.min(1, (performance.now() - t0) / 450);
			this.camera.position.lerpVectors(from, target, 1 - Math.pow(1 - k, 3));
			if (k < 1) requestAnimationFrame(ease);
		};
		ease();
	}

	fadeIn(obj) {
		const mats = [];
		obj.traverse((n) => {
			if (!n.isMesh) return;
			n.castShadow = true;
			n.receiveShadow = true;
			for (const m of Array.isArray(n.material) ? n.material : [n.material]) {
				if (!m) continue;
				m.userData._t = m.transparent;
				m.userData._o = m.opacity;
				m.transparent = true;
				m.opacity = 0;
				mats.push(m);
			}
		});
		if (REDUCED) {
			for (const m of mats) { m.transparent = m.userData._t ?? false; m.opacity = m.userData._o ?? 1; m.needsUpdate = true; }
			return;
		}
		const t0 = performance.now();
		const step = () => {
			if (this.disposed) return;
			const k = Math.min(1, (performance.now() - t0) / 550);
			for (const m of mats) m.opacity = (m.userData._o ?? 1) * k;
			if (k < 1) requestAnimationFrame(step);
			else for (const m of mats) { m.transparent = m.userData._t ?? false; m.opacity = m.userData._o ?? 1; m.needsUpdate = true; }
		};
		step();
	}

	pickIdle(clips) {
		if (!clips || !clips.length) return null;
		return clips.find((c) => /idle|breath|stand|loop|rest/i.test(c.name || '')) || clips[0];
	}

	// ── GLB loading ──────────────────────────────────────────────────────
	async load(payload) {
		this.glbUrl = payload.glb;
		this.viewerUrl = payload.viewer || (payload.glb ? 'https://three.ws/viewer?src=' + encodeURIComponent(payload.glb) : 'https://three.ws/forge');
		this.modelName = (payload.name || '').trim();

		if (!this.glbUrl) {
			return this.showState({
				kind: 'empty',
				title: 'No model yet',
				msg: 'Ask three.ws 3D Studio to generate a 3D model — e.g. “make a friendly robot mascot” — and it will appear here.',
				actions: [{ label: 'Open three.ws Studio', href: 'https://three.ws/forge', primary: true, icon: 'external' }],
			});
		}

		if (!this.renderer && !this.initThree()) {
			return this.showState({
				kind: 'error',
				title: '3D not supported here',
				msg: 'This device or browser can’t render WebGL. You can still download the model or open it on three.ws.',
				actions: [
					{ label: 'Download GLB', href: this.glbUrl, primary: true, icon: 'download' },
					{ label: 'Open on three.ws', href: this.viewerUrl, icon: 'external' },
				],
			});
		}

		this.showLoading('Loading 3D model…');

		const loader = new GLTFLoader();
		if (MeshoptDecoder) {
			try { loader.setMeshoptDecoder(MeshoptDecoder); } catch { /* vanilla GLBs load without it */ }
		}

		let src = this.glbUrl;
		try {
			const res = await fetch(this.glbUrl, { mode: 'cors', credentials: 'omit' });
			if (res.ok) {
				const blob = await res.blob();
				this.objectUrl = URL.createObjectURL(blob);
				src = this.objectUrl;
			}
		} catch {
			/* CORS/network — fall back to letting GLTFLoader fetch the URL directly */
		}

		loader.load(
			src,
			(gltf) => {
				if (this.disposed) return;
				this.disposeModel();
				const root = gltf.scene || gltf.scenes?.[0];
				if (!root) return this.failLoad();
				this.model = root;
				this.scene.add(root);
				this.frame(root);
				this.fadeIn(root);
				const clip = this.pickIdle(gltf.animations);
				if (clip) {
					this.mixer = new THREE.AnimationMixer(root);
					this.mixer.clipAction(clip).play();
					this.rigged = true;
				}
				this.reveal();
			},
			undefined,
			() => { if (!this.disposed) this.failLoad(); },
		);
	}

	failLoad() {
		this.showState({
			kind: 'error',
			title: 'Couldn’t load the model',
			msg: 'The generated file didn’t load — it may have expired. Generate it again, or open it on three.ws.',
			actions: [
				{ label: 'Download GLB', href: this.glbUrl, primary: true, icon: 'download' },
				{ label: 'Open on three.ws', href: this.viewerUrl, icon: 'external' },
			],
		});
	}

	reveal() {
		this.hideOverlay();
		this.buildHud();
		this.buildBar();
		requestAnimationFrame(() => {
			this.hud.classList.add('on');
			this.bar.classList.add('on');
		});
	}

	buildHud() {
		const title = el('sv-title');
		if (this.modelName) {
			title.textContent = this.modelName;
		} else {
			title.style.display = 'none';
		}
	}

	_syncRotate() {
		if (this._rotBtn) this._rotBtn.setAttribute('aria-pressed', String(this.autoRotate));
	}

	buildBar() {
		this.bar.replaceChildren();
		this.bar.appendChild(this._mkBtn({ icon: 'download', label: 'Download', aria: 'Download GLB', onClick: () => this.download() }));

		this._rotBtn = this._mkBtn({
			icon: 'rotate',
			label: 'Spin',
			pressed: this.autoRotate,
			onClick: () => {
				this.autoRotate = !this.autoRotate;
				this.controls.autoRotate = this.autoRotate;
				this._syncRotate();
			},
		});
		this.bar.appendChild(this._rotBtn);

		this.bar.appendChild(this._mkBtn({ icon: 'reset', label: 'Recenter', aria: 'Recenter camera', onClick: () => this.resetView(false) }));
		this.bar.appendChild(this._mkBtn({ icon: 'external', label: 'Open in three.ws', aria: 'Open in three.ws', href: this.viewerUrl, primary: true }));
	}

	async download() {
		const name = (this.modelName ? this.modelName.slice(0, 40).replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '') : 'studio-model') || 'studio-model';
		try {
			let url = this.objectUrl;
			if (!url) {
				const res = await fetch(this.glbUrl, { mode: 'cors', credentials: 'omit' });
				if (!res.ok) throw new Error('fetch failed');
				url = URL.createObjectURL(await res.blob());
			}
			const a = document.createElement('a');
			a.href = url;
			a.download = name + '.glb';
			document.body.appendChild(a);
			a.click();
			a.remove();
			if (url !== this.objectUrl) setTimeout(() => URL.revokeObjectURL(url), 4000);
		} catch {
			window.open(this.glbUrl, '_blank', 'noopener,noreferrer');
		}
	}

	disposeModel() {
		if (this.mixer) { this.mixer.stopAllAction(); this.mixer = null; }
		if (this.model) {
			this.scene.remove(this.model);
			this.model.traverse((n) => {
				if (n.isMesh) {
					n.geometry?.dispose?.();
					for (const m of Array.isArray(n.material) ? n.material : [n.material]) disposeMaterial(m);
				}
			});
			this.model = null;
		}
		if (this.objectUrl) { URL.revokeObjectURL(this.objectUrl); this.objectUrl = null; }
	}

	dispose() {
		if (this.disposed) return;
		this.disposed = true;
		window.removeEventListener('resize', this._onResize);
		this._ro?.disconnect();
		this.disposeModel();
		this.ground?.geometry?.dispose?.();
		this.ground?.material?.dispose?.();
		this.controls?.dispose?.();
		this.pmrem?.dispose?.();
		if (this.scene?.environment) this.scene.environment.dispose?.();
		if (this.renderer) { this.renderer.setAnimationLoop(null); this.renderer.dispose(); }
	}
}

function disposeMaterial(m) {
	if (!m) return;
	for (const k of Object.keys(m)) {
		const v = m[k];
		if (v && v.isTexture) v.dispose();
	}
	m.dispose?.();
}

function escHtml(s) {
	return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

// ── Boot ─────────────────────────────────────────────────────────────────
function boot() {
	const style = document.createElement('style');
	style.textContent = STYLE;
	document.head.appendChild(style);

	let host = el('studio-stage');
	if (!host) {
		host = document.createElement('div');
		host.id = 'studio-stage';
		document.body.appendChild(host);
	}

	const viewer = new StudioViewer(host);
	viewer.showLoading('Preparing viewer…');

	let lastGlb = null;
	const sync = () => {
		const payload = readPayload();
		if (payload.glb === lastGlb && lastGlb !== null) return; // already showing this model
		lastGlb = payload.glb;
		viewer.load(payload);
	};

	sync();
	// Re-render when the host hands us toolOutput / theme / layout.
	window.addEventListener('openai:set_globals', sync);
	window.addEventListener('pagehide', () => viewer.dispose(), { once: true });
}

if (document.readyState === 'loading') {
	document.addEventListener('DOMContentLoaded', boot);
} else {
	boot();
}

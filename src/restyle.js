// restyle.js — Restyle Studio: apply PBR material presets and seeded colorway
// variants to any GLB, fine-tune metalness/roughness/color/emissive live, and
// export a validated GLB — non-destructively (the original is always one click
// away). Consumes the framework-agnostic PBR preset library shipped in
// @three-ws/viewer-presets and the shared GLB optimize/validate path used by
// Avatar Studio, so it reuses the platform's material vocabulary rather than
// inventing a parallel one.
//
// Roadmap prompt 06 (material, restyle & variant tools), client surface.

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import {
	MATERIAL_PRESETS,
	MATERIAL_PRESET_NAMES,
	applyMaterialPreset,
	materialVariants,
} from '../packages/viewer-presets/src/materials.js';
import { optimizeAndValidateGlb } from './avatar-studio-optimize.js';

// A small, always-present local sample so the page is never an empty void — the
// platform's default humanoid, served from /avatars.
const DEFAULT_MODEL = '/avatars/realistic-female.glb';

const state = {
	renderer: null,
	scene: null,
	camera: null,
	controls: null,
	root: null, // the loaded glTF scene graph
	originals: new Map(), // material → captured original PBR params (for Reset)
	lineage: [], // ordered list of applied steps, for the history strip
	baseName: 'chrome', // which preset variants fan out from
	manual: { metalness: null, roughness: null, emissiveIntensity: 0 },
	sourceLabel: '',
	raf: 0,
};

const el = {};

document.addEventListener('DOMContentLoaded', init);

function init() {
	cache();
	buildScene();
	buildPresetButtons();
	wireControls();
	const url = new URL(location.href).searchParams.get('url');
	loadModel(url || DEFAULT_MODEL, url ? 'from URL' : 'sample');
	window.addEventListener('resize', onResize);
}

function cache() {
	for (const id of [
		'stage', 'canvas-wrap', 'presets', 'variants', 'variant-strip', 'history',
		'metalness', 'roughness', 'emissive', 'basecolor', 'emissivecolor',
		'seed', 'variant-count', 'gen-variants', 'reset', 'export', 'export-note',
		'file', 'url-input', 'load-url', 'status', 'error', 'error-msg', 'retry',
	]) {
		el[id] = document.getElementById(id);
	}
}

// ── scene ────────────────────────────────────────────────────────────────────
function buildScene() {
	const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
	renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
	renderer.toneMapping = THREE.ACESFilmicToneMapping;
	renderer.toneMappingExposure = 1.05;
	renderer.outputColorSpace = THREE.SRGBColorSpace;
	el['canvas-wrap'].appendChild(renderer.domElement);
	state.renderer = renderer;

	const scene = new THREE.Scene();
	state.scene = scene;
	// RoomEnvironment gives metals/glass something real to reflect — chrome and
	// gold read as metal, not flat grey, without shipping an HDRI asset.
	const pmrem = new THREE.PMREMGenerator(renderer);
	scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

	const key = new THREE.DirectionalLight(0xffffff, 2.2);
	key.position.set(3, 5, 4);
	scene.add(key);
	const rim = new THREE.DirectionalLight(0x99bbff, 0.8);
	rim.position.set(-4, 2, -3);
	scene.add(rim);
	scene.add(new THREE.AmbientLight(0xffffff, 0.4));

	const camera = new THREE.PerspectiveCamera(35, 1, 0.05, 200);
	camera.position.set(0, 1.4, 4);
	state.camera = camera;

	const controls = new OrbitControls(camera, renderer.domElement);
	controls.enableDamping = true;
	controls.dampingFactor = 0.08;
	controls.target.set(0, 1, 0);
	state.controls = controls;

	onResize();
	const tick = () => {
		state.raf = requestAnimationFrame(tick);
		controls.update();
		renderer.render(scene, camera);
	};
	tick();
}

function onResize() {
	const wrap = el['canvas-wrap'];
	if (!wrap || !state.renderer) return;
	const w = wrap.clientWidth || 640;
	const h = wrap.clientHeight || 480;
	state.renderer.setSize(w, h, false);
	state.renderer.domElement.style.width = '100%';
	state.renderer.domElement.style.height = '100%';
	state.camera.aspect = w / h;
	state.camera.updateProjectionMatrix();
}

// ── model loading ──────────────────────────────────────────────────────────────
function makeLoader() {
	const loader = new GLTFLoader();
	loader.setMeshoptDecoder(MeshoptDecoder); // platform GLBs are often meshopt-packed
	return loader;
}

function loadModel(src, label) {
	showState('loading');
	const onLoaded = (gltf) => {
		try {
			mountModel(gltf.scene, label);
			showState('ready');
		} catch (err) {
			fail(err);
		}
	};
	const onError = (err) => fail(err);
	const loader = makeLoader();
	if (src instanceof File) {
		const reader = new FileReader();
		reader.onload = () => loader.parse(reader.result, '', onLoaded, onError);
		reader.onerror = () => fail(new Error('could not read the file'));
		reader.readAsArrayBuffer(src);
	} else {
		loader.load(src, onLoaded, undefined, onError);
	}
}

function mountModel(newRoot, label) {
	if (state.root) {
		state.scene.remove(state.root);
		disposeTree(state.root);
	}
	state.root = newRoot;
	state.originals.clear();
	state.lineage = [];
	state.manual = { metalness: null, roughness: null, emissiveIntensity: 0 };
	state.sourceLabel = label || '';
	captureOriginals(newRoot);
	frameModel(newRoot);
	state.scene.add(newRoot);
	pushHistory('Original');
	syncSlidersFromModel();
}

function captureOriginals(root) {
	root.traverse((n) => {
		for (const m of materialsOf(n)) {
			if (!isStandardLike(m) || state.originals.has(m)) continue;
			state.originals.set(m, {
				color: m.color.getHex(),
				metalness: m.metalness,
				roughness: m.roughness,
				emissive: m.emissive ? m.emissive.getHex() : null,
				emissiveIntensity: m.emissiveIntensity,
				envMapIntensity: m.envMapIntensity,
				transparent: m.transparent,
				opacity: m.opacity,
			});
		}
	});
}

function frameModel(root) {
	const box = new THREE.Box3().setFromObject(root);
	const size = box.getSize(new THREE.Vector3());
	const center = box.getCenter(new THREE.Vector3());
	root.position.sub(center);
	root.position.y += size.y / 2; // rest feet near y=0
	const radius = Math.max(size.x, size.y, size.z) * 0.5 || 1;
	const dist = radius / Math.sin((state.camera.fov * Math.PI) / 180 / 2) * 1.3;
	state.camera.position.set(0, size.y * 0.55, dist);
	state.controls.target.set(0, size.y * 0.5, 0);
	state.controls.update();
}

// ── material operations ────────────────────────────────────────────────────────
function applyPreset(name) {
	if (!state.root) return;
	applyMaterialPreset(THREE, state.root, name);
	state.baseName = name;
	state.manual = {
		metalness: MATERIAL_PRESETS[name].metalness ?? null,
		roughness: MATERIAL_PRESETS[name].roughness ?? null,
		emissiveIntensity: MATERIAL_PRESETS[name].emissiveIntensity ?? 0,
	};
	markPresetActive(name);
	pushHistory(MATERIAL_PRESETS[name].label || name);
	syncSlidersFromModel();
}

function applyVariant(config, label) {
	if (!state.root) return;
	applyMaterialPreset(THREE, state.root, config);
	pushHistory(label);
	syncSlidersFromModel();
}

// Live manual overrides — set the same property across every standard material.
function setManual(prop, value) {
	if (!state.root) return;
	state.manual[prop] = value;
	state.root.traverse((n) => {
		for (const m of materialsOf(n)) {
			if (!isStandardLike(m)) continue;
			if (prop === 'metalness') m.metalness = value;
			else if (prop === 'roughness') m.roughness = value;
			else if (prop === 'emissiveIntensity') {
				if (m.emissive) m.emissiveIntensity = value;
			} else if (prop === 'color') m.color.set(value);
			else if (prop === 'emissive' && m.emissive) m.emissive.set(value);
			m.needsUpdate = true;
		}
	});
}

function resetModel() {
	if (!state.root) return;
	for (const [m, o] of state.originals) {
		m.color.setHex(o.color);
		m.metalness = o.metalness;
		m.roughness = o.roughness;
		if (m.emissive && o.emissive != null) m.emissive.setHex(o.emissive);
		m.emissiveIntensity = o.emissiveIntensity;
		m.envMapIntensity = o.envMapIntensity;
		m.transparent = o.transparent;
		m.opacity = o.opacity;
		m.needsUpdate = true;
	}
	state.lineage = [];
	state.manual = { metalness: null, roughness: null, emissiveIntensity: 0 };
	markPresetActive(null);
	pushHistory('Original');
	syncSlidersFromModel();
}

// ── variants ─────────────────────────────────────────────────────────────────
function generateVariants() {
	if (!state.root) return;
	const seed = parseInt(el.seed.value, 10) || 0;
	const count = clampInt(parseInt(el['variant-count'].value, 10) || 6, 1, 12);
	const variants = materialVariants(state.baseName, { seed, count });
	el['variant-strip'].innerHTML = '';
	for (const v of variants) {
		const b = document.createElement('button');
		b.className = 'rs-swatch';
		b.style.background = v.config.color;
		b.title = `${v.label} · seed ${v.seed}`;
		b.setAttribute('aria-label', `Apply ${v.label}`);
		b.addEventListener('click', () => applyVariant(v.config, v.label));
		el['variant-strip'].appendChild(b);
	}
	el.variants.hidden = false;
}

// ── export ─────────────────────────────────────────────────────────────────────
async function exportModel() {
	if (!state.root) return;
	el.export.disabled = true;
	setNote(el['export-note'], 'Exporting…');
	try {
		const exporter = new GLTFExporter();
		const glb = await new Promise((res, rej) => {
			exporter.parse(state.root, (result) => res(result), (err) => rej(err), { binary: true });
		});
		const rawBlob = new Blob([glb], { type: 'model/gltf-binary' });
		const { blob, optimized, outputBytes, report } = await optimizeAndValidateGlb(rawBlob, {
			onStatus: (s) => setNote(el['export-note'], s),
		});
		const valid = !report || report.issues?.numErrors === 0;
		download(blob, 'restyled.glb');
		setNote(
			el['export-note'],
			`Saved restyled.glb · ${fmtBytes(outputBytes)}${optimized ? ' · optimized' : ''}${valid ? ' · valid glTF ✓' : ' · exported'}`,
		);
	} catch (err) {
		setNote(el['export-note'], `Export failed: ${err?.message || err}`);
	} finally {
		el.export.disabled = false;
	}
}

// ── UI wiring ───────────────────────────────────────────────────────────────────
function buildPresetButtons() {
	el.presets.innerHTML = '';
	for (const name of MATERIAL_PRESET_NAMES) {
		const preset = MATERIAL_PRESETS[name];
		const b = document.createElement('button');
		b.className = 'rs-preset';
		b.dataset.preset = name;
		b.innerHTML = `<span class="rs-preset__swatch" style="background:${swatchCss(preset)}"></span><span>${preset.label || name}</span>`;
		b.addEventListener('click', () => applyPreset(name));
		el.presets.appendChild(b);
	}
}

function wireControls() {
	el.metalness.addEventListener('input', () => setManual('metalness', +el.metalness.value));
	el.roughness.addEventListener('input', () => setManual('roughness', +el.roughness.value));
	el.emissive.addEventListener('input', () => setManual('emissiveIntensity', +el.emissive.value));
	el.basecolor.addEventListener('input', () => setManual('color', el.basecolor.value));
	el.emissivecolor.addEventListener('input', () => setManual('emissive', el.emissivecolor.value));
	el['gen-variants'].addEventListener('click', generateVariants);
	el.reset.addEventListener('click', resetModel);
	el.export.addEventListener('click', exportModel);
	el.retry.addEventListener('click', () => loadModel(DEFAULT_MODEL, 'sample'));

	el.file.addEventListener('change', (e) => {
		const f = e.target.files?.[0];
		if (f) loadModel(f, f.name);
	});
	el['load-url'].addEventListener('click', () => {
		const u = (el['url-input'].value || '').trim();
		if (!u) return;
		const next = new URL(location.href);
		next.searchParams.set('url', u);
		location.href = next.toString();
	});
	// Drag & drop onto the stage.
	const stage = el.stage;
	['dragover', 'drop'].forEach((ev) =>
		stage.addEventListener(ev, (e) => {
			e.preventDefault();
			if (ev === 'drop') {
				const f = e.dataTransfer?.files?.[0];
				if (f && /\.(glb|gltf)$/i.test(f.name)) loadModel(f, f.name);
			}
		}),
	);
}

function syncSlidersFromModel() {
	// Reflect the first standard material's values back into the sliders.
	let first = null;
	state.root?.traverse((n) => {
		if (first) return;
		for (const m of materialsOf(n)) if (isStandardLike(m)) { first = m; break; }
	});
	if (!first) return;
	el.metalness.value = first.metalness;
	el.roughness.value = first.roughness;
	el.emissive.value = first.emissiveIntensity || 0;
	el.basecolor.value = '#' + first.color.getHexString();
	if (first.emissive) el.emissivecolor.value = '#' + first.emissive.getHexString();
}

function markPresetActive(name) {
	el.presets.querySelectorAll('.rs-preset').forEach((b) => {
		b.classList.toggle('is-active', b.dataset.preset === name);
	});
}

function pushHistory(label) {
	state.lineage.push(label);
	el.history.innerHTML = state.lineage
		.map((s, i) => `<span class="rs-step${i === state.lineage.length - 1 ? ' is-current' : ''}">${escapeHtml(s)}</span>`)
		.join('<span class="rs-arrow">→</span>');
}

function showState(kind) {
	el.status.hidden = kind !== 'loading';
	el.error.hidden = kind !== 'error';
	el['canvas-wrap'].classList.toggle('is-hidden', kind === 'error');
}

function fail(err) {
	console.warn('[restyle] load failed:', err?.message || err);
	el['error-msg'].textContent =
		'That model could not be loaded. Check the URL is a public .glb/.gltf, or upload a file.';
	showState('error');
}

// ── small helpers ────────────────────────────────────────────────────────────
function materialsOf(node) {
	if (!node || !node.material) return [];
	return Array.isArray(node.material) ? node.material.filter(Boolean) : [node.material];
}
function isStandardLike(m) {
	return !!m && 'metalness' in m && 'roughness' in m && !!m.color && typeof m.color.getHex === 'function';
}
function disposeTree(root) {
	root.traverse((n) => {
		if (n.geometry) n.geometry.dispose?.();
		for (const m of materialsOf(n)) {
			for (const v of Object.values(m)) if (v && v.isTexture) v.dispose?.();
			m.dispose?.();
		}
	});
}
function swatchCss(p) {
	if (p.emissive && (p.emissiveIntensity || 0) > 0.5) return p.emissive;
	if (p.transparent) return `${p.color}88`;
	return p.color || '#888';
}
function download(blob, name) {
	const a = document.createElement('a');
	a.href = URL.createObjectURL(blob);
	a.download = name;
	a.click();
	setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}
function setNote(node, text) {
	if (node) node.textContent = text;
}
function fmtBytes(n) {
	return n > 1e6 ? (n / 1e6).toFixed(1) + ' MB' : Math.round(n / 1024) + ' KB';
}
function clampInt(n, lo, hi) {
	return Math.min(hi, Math.max(lo, Math.round(n)));
}
function escapeHtml(s) {
	return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

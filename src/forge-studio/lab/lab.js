/**
 * Studio Lab controller — the "every type of 3D" tab.
 *
 * Hosts a set of free, client-side 3D tools:
 *   - Five mesh generators (parametric, 3D text, SVG→3D, lithophane, terrain)
 *     from npm `three` + its github examples/jsm addons. Each builds a real
 *     THREE.Object3D, which we export to a binary GLB (GLTFExporter) and preview
 *     in <model-viewer> with a working Download GLB button.
 *   - A Gaussian-splat / radiance-field viewer from the npm package
 *     `@mkkellogg/gaussian-splats-3d` — a 3D representation the platform didn't
 *     have. Loads a .splat/.ply (or a generated sample) into its own renderer.
 *
 * Nothing here calls a paid API or the network; every model is computed in the
 * browser, so it is fully self-contained and testable.
 */

import * as THREE from 'three';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { GENERATORS } from './generators.js';

let _inited = false;
let _activeId = null;
let _lastGlbUrl = null;
let _splat = null; // lazy { viewer, dispose }

const SPLAT_TOOL = {
	id: 'splat',
	label: 'Gaussian Splats',
	blurb: 'View a Gaussian-splat / radiance-field capture (.splat or .ply) — the photoreal 3D format. Drop a file, or render the built-in sample.',
	kind: 'splat',
	controls: [
		{ key: 'file', label: 'Splat file (.splat / .ply / .ksplat)', type: 'splatfile', default: null },
	],
};

const TOOLS = [...GENERATORS.map((g) => ({ ...g, kind: 'mesh' })), SPLAT_TOOL];

// ── DOM helpers ───────────────────────────────────────────────────────────────

const root = () => document.getElementById('studio-lab');
const $ = (sel) => root()?.querySelector(sel);

function el(tag, attrs = {}, children = []) {
	const node = document.createElement(tag);
	for (const [k, v] of Object.entries(attrs)) {
		if (k === 'class') node.className = v;
		else if (k === 'text') node.textContent = v;
		else if (v != null) node.setAttribute(k, v);
	}
	for (const c of [].concat(children)) if (c) node.appendChild(c);
	return node;
}

function status(msg, kind = '') {
	const s = $('#lab-status');
	if (!s) return;
	s.textContent = msg || '';
	s.dataset.kind = kind;
}

// ── Tool picker + controls ────────────────────────────────────────────────────

function renderToolPicker() {
	const host = $('#lab-tools');
	host.innerHTML = '';
	for (const tool of TOOLS) {
		const btn = el('button', {
			type: 'button',
			class: 'lab-tool',
			'data-tool': tool.id,
			'aria-pressed': tool.id === _activeId ? 'true' : 'false',
		});
		btn.appendChild(el('span', { class: 'lab-tool-name', text: tool.label }));
		btn.appendChild(el('span', { class: 'lab-tool-blurb', text: tool.blurb }));
		btn.addEventListener('click', () => selectTool(tool.id));
		host.appendChild(btn);
	}
}

function controlVisible(field, values) {
	if (!field.when) return true;
	return Object.entries(field.when).every(([k, v]) => values[k] === v);
}

function currentValues() {
	const tool = TOOLS.find((t) => t.id === _activeId);
	const values = {};
	for (const f of tool.controls) {
		const node = $(`#lab-field-${f.key}`);
		if (!node) {
			values[f.key] = f.default;
			continue;
		}
		if (f.type === 'checkbox') values[f.key] = node.checked;
		else if (f.type === 'image' || f.type === 'splatfile') values[f.key] = node._fileData ?? f.default;
		else values[f.key] = node.value;
	}
	return values;
}

function renderControls() {
	const tool = TOOLS.find((t) => t.id === _activeId);
	const host = $('#lab-controls');
	host.innerHTML = '';
	const values = {};
	for (const f of tool.controls) values[f.key] = f.default;

	for (const f of tool.controls) {
		const wrap = el('div', { class: 'lab-field', id: `lab-field-wrap-${f.key}` });
		const labelRow = el('label', { class: 'lab-field-label', for: `lab-field-${f.key}`, text: f.label });
		let input;

		if (f.type === 'range') {
			input = el('input', { type: 'range', id: `lab-field-${f.key}`, min: f.min, max: f.max, step: f.step, value: f.default });
			const out = el('output', { class: 'lab-field-out', text: String(f.default) });
			input.addEventListener('input', () => { out.textContent = input.value; });
			wrap.appendChild(labelRow);
			labelRow.appendChild(out);
			wrap.appendChild(input);
		} else if (f.type === 'select') {
			input = el('select', { id: `lab-field-${f.key}` });
			for (const o of f.options) {
				const opt = el('option', { value: o.value, text: o.label });
				if (o.value === f.default) opt.selected = true;
				input.appendChild(opt);
			}
			input.addEventListener('change', () => syncConditional());
			wrap.appendChild(labelRow);
			wrap.appendChild(input);
		} else if (f.type === 'color') {
			input = el('input', { type: 'color', id: `lab-field-${f.key}`, value: f.default });
			wrap.appendChild(labelRow);
			wrap.appendChild(input);
		} else if (f.type === 'checkbox') {
			input = el('input', { type: 'checkbox', id: `lab-field-${f.key}` });
			input.checked = !!f.default;
			const inline = el('label', { class: 'lab-field-check' });
			inline.appendChild(input);
			inline.appendChild(el('span', { text: f.label }));
			wrap.appendChild(inline);
		} else if (f.type === 'text') {
			input = el('input', { type: 'text', id: `lab-field-${f.key}`, value: f.default, maxlength: f.maxlength, placeholder: f.placeholder });
			wrap.appendChild(labelRow);
			wrap.appendChild(input);
		} else if (f.type === 'textarea') {
			input = el('textarea', { id: `lab-field-${f.key}`, rows: '4', placeholder: f.placeholder });
			input.value = f.default || '';
			wrap.appendChild(labelRow);
			wrap.appendChild(input);
		} else if (f.type === 'image' || f.type === 'splatfile') {
			const accept = f.type === 'image' ? 'image/*' : '.splat,.ply,.ksplat';
			input = el('input', { type: 'file', id: `lab-field-${f.key}`, accept });
			const hint = el('span', { class: 'lab-field-out', text: f.type === 'image' ? 'optional — uses a sample if empty' : 'optional — renders a sample if empty' });
			input.addEventListener('change', async () => {
				const file = input.files?.[0];
				if (!file) { input._fileData = null; return; }
				if (f.type === 'image') {
					input._fileData = await fileToDataURL(file);
				} else {
					input._fileData = { buffer: await file.arrayBuffer(), name: file.name };
				}
				hint.textContent = file.name;
			});
			wrap.appendChild(labelRow);
			labelRow.appendChild(hint);
			wrap.appendChild(input);
		}

		host.appendChild(wrap);
	}
	syncConditional();
}

function syncConditional() {
	const tool = TOOLS.find((t) => t.id === _activeId);
	const values = currentValues();
	for (const f of tool.controls) {
		const wrap = $(`#lab-field-wrap-${f.key}`);
		if (wrap) wrap.hidden = !controlVisible(f, values);
	}
}

function selectTool(id) {
	_activeId = id;
	for (const b of root().querySelectorAll('.lab-tool')) {
		b.setAttribute('aria-pressed', b.dataset.tool === id ? 'true' : 'false');
	}
	const tool = TOOLS.find((t) => t.id === id);
	renderControls();
	const isSplat = tool.kind === 'splat';
	$('#lab-viewer').hidden = isSplat;
	$('#lab-splat').hidden = !isSplat;
	$('#lab-download').classList.toggle('is-hidden', isSplat);
	$('#lab-generate').textContent = isSplat ? 'Render splats' : 'Generate model';
	status('');
	if (!isSplat) teardownSplat();
}

// ── Generate (mesh → GLB) ─────────────────────────────────────────────────────

async function exportGlb(object3d) {
	const exporter = new GLTFExporter();
	const result = await exporter.parseAsync(object3d, { binary: true, onlyVisible: true });
	return new Blob([result], { type: 'model/gltf-binary' });
}

async function generate() {
	const tool = TOOLS.find((t) => t.id === _activeId);
	const btn = $('#lab-generate');
	btn.disabled = true;
	try {
		if (tool.kind === 'splat') {
			await renderSplats();
			return;
		}
		status('Building geometry…');
		const params = currentValues();
		const object = await tool.build(params);
		object.name = tool.label;
		status('Exporting GLB…');
		const blob = await exportGlb(object);
		if (_lastGlbUrl) URL.revokeObjectURL(_lastGlbUrl);
		_lastGlbUrl = URL.createObjectURL(blob);
		const viewer = $('#lab-viewer');
		viewer.setAttribute('src', _lastGlbUrl);
		const dl = $('#lab-download');
		dl.href = _lastGlbUrl;
		dl.setAttribute('download', `${tool.id}-${Date.now()}.glb`);
		dl.classList.remove('is-disabled');
		// Free the geometry/material we just exported.
		object.traverse((o) => { o.geometry?.dispose?.(); o.material?.dispose?.(); });
		status(`${tool.label} ready · ${(blob.size / 1024).toFixed(0)} KB GLB`, 'ok');
	} catch (err) {
		status(err.message || 'Generation failed.', 'err');
		// eslint-disable-next-line no-console
		console.error('[studio-lab]', err);
	} finally {
		btn.disabled = false;
	}
}

// ── Gaussian splats ───────────────────────────────────────────────────────────

// Build a sample .splat cloud (antimatter15 format: 32 bytes/splat —
// center f32×3, scale f32×3, color u8×4, rotation u8×4). A rainbow sphere shell.
function sampleSplatBuffer(count = 4000) {
	const buf = new ArrayBuffer(count * 32);
	const f = new DataView(buf);
	const col = new THREE.Color();
	for (let i = 0; i < count; i++) {
		const base = i * 32;
		// Fibonacci sphere for even coverage.
		const t = i / count;
		const phi = Math.acos(1 - 2 * t);
		const theta = Math.PI * (1 + Math.sqrt(5)) * i;
		const r = 1;
		const x = r * Math.sin(phi) * Math.cos(theta);
		const y = r * Math.cos(phi);
		const z = r * Math.sin(phi) * Math.sin(theta);
		f.setFloat32(base, x, true);
		f.setFloat32(base + 4, y, true);
		f.setFloat32(base + 8, z, true);
		// scale (log-free world units for .splat)
		f.setFloat32(base + 12, 0.03, true);
		f.setFloat32(base + 16, 0.03, true);
		f.setFloat32(base + 20, 0.03, true);
		col.setHSL((y + 1) / 2, 0.7, 0.55);
		f.setUint8(base + 24, Math.round(col.r * 255));
		f.setUint8(base + 25, Math.round(col.g * 255));
		f.setUint8(base + 26, Math.round(col.b * 255));
		f.setUint8(base + 27, 255);
		// identity rotation: (w,x,y,z) bytes
		f.setUint8(base + 28, 255);
		f.setUint8(base + 29, 128);
		f.setUint8(base + 30, 128);
		f.setUint8(base + 31, 128);
	}
	return buf;
}

async function renderSplats() {
	status('Loading splat engine…');
	const GS = await import('@mkkellogg/gaussian-splats-3d');
	teardownSplat();
	const host = $('#lab-splat');
	host.innerHTML = '';

	const fileField = $('#lab-field-file');
	const uploaded = fileField?._fileData || null;
	let url, format;
	if (uploaded) {
		url = URL.createObjectURL(new Blob([uploaded.buffer]));
		format =
			uploaded.name.endsWith('.ply') ? GS.SceneFormat.Ply :
			uploaded.name.endsWith('.ksplat') ? GS.SceneFormat.KSplat :
			GS.SceneFormat.Splat;
	} else {
		url = URL.createObjectURL(new Blob([sampleSplatBuffer()]));
		format = GS.SceneFormat.Splat;
	}

	const viewer = new GS.Viewer({
		rootElement: host,
		sharedMemoryForWorkers: false,
		dynamicScene: false,
		useBuiltInControls: true,
		gpuAcceleratedSort: false,
		cameraUp: [0, 1, 0],
		initialCameraPosition: [0, 0, 4],
		initialCameraLookAt: [0, 0, 0],
	});
	_splat = { viewer, url };
	status('Rendering splats…');
	await viewer.addSplatScene(url, { format, showLoadingUI: false, progressiveLoad: false });
	viewer.start();
	const total = viewer.getSplatCount ? viewer.getSplatCount() : null;
	status(uploaded ? `Loaded ${uploaded.name}${total ? ` · ${total.toLocaleString()} splats` : ''}` : `Sample radiance field · ${total ? total.toLocaleString() : '4,000'} splats`, 'ok');
}

function teardownSplat() {
	if (!_splat) return;
	try {
		_splat.viewer.stop?.();
		_splat.viewer.dispose?.();
	} catch { /* viewer may already be torn down */ }
	if (_splat.url) URL.revokeObjectURL(_splat.url);
	_splat = null;
	const host = document.getElementById('lab-splat');
	if (host) host.innerHTML = '';
}

// ── Misc ──────────────────────────────────────────────────────────────────────

function fileToDataURL(file) {
	return new Promise((resolve, reject) => {
		const r = new FileReader();
		r.onload = () => resolve(r.result);
		r.onerror = () => reject(new Error('Could not read that file.'));
		r.readAsDataURL(file);
	});
}

export function initLab() {
	if (_inited) return;
	if (!root()) return;
	_inited = true;
	renderToolPicker();
	$('#lab-generate').addEventListener('click', generate);
	selectTool(TOOLS[0].id);
}

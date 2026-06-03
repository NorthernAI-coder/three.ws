// ── ibm-galaxy.js ───────────────────────────────────────────────────────────
// The IBM Granite Agent Galaxy: an explorable 3D constellation where every
// three.ws agent is a star positioned by its IBM Granite embedding. Agents that
// mean similar things sit near each other; k-means themes (named by Granite)
// colour the clusters; natural-language search embeds the query on Granite and
// flies the camera to whatever the words actually mean.
//
// Data comes from /api/ibm/galaxy (GET = layout, POST = semantic search). There
// is no client-side mock: when watsonx is unconfigured or there are too few
// agents, the page shows a designed, honest state instead of inventing stars.

import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

const RADIUS = 100; // matches the server's projection half-width

// ── DOM ──────────────────────────────────────────────────────────────────────
const $ = (id) => document.getElementById(id);
const canvas = $('scene');
const els = {
	searchWrap: $('searchWrap'), searchBox: $('searchBox'), searchInput: $('searchInput'),
	searchClear: $('searchClear'), searchHint: $('searchHint'), results: $('results'),
	legend: $('legend'), legendRows: $('legendRows'), legendFoot: $('legendFoot'),
	stats: $('stats'), tooltip: $('tooltip'), clusterLabels: $('clusterLabels'),
	panel: $('panel'), panelHead: $('panelHead'), panelBody: $('panelBody'), panelClose: $('panelClose'),
	loading: $('loadingState'), empty: $('emptyState'), unavailable: $('unavailableState'),
	error: $('errorState'), errorMsg: $('errorMsg'), emptyTitle: $('emptyTitle'), emptyMsg: $('emptyMsg'),
	unavailableMsg: $('unavailableMsg'), loadSteps: $('loadSteps'), retryBtn: $('retryBtn'),
	resetView: $('resetView'), hudHint: $('hudHint'),
};

// ── State ─────────────────────────────────────────────────────────────────────
const state = {
	data: null,            // galaxy payload
	agents: [],            // [{...agent, vec3:THREE.Vector3}]
	clusters: [],
	byId: new Map(),
	hovered: -1,
	selected: -1,
	isolatedCluster: null, // legend isolation
	searchActive: false,
	lastResults: [],
};

// ── Three.js core ─────────────────────────────────────────────────────────────
let renderer, scene, camera, controls, raycaster, points, geometry, material, starfield;
let aDim, aHi, aSize, positions, colors; // attribute backing arrays
const pointer = new THREE.Vector2(-2, -2);
let pointerDown = null; // {x,y} to distinguish click from drag
const fly = { active: false, camFrom: new THREE.Vector3(), camTo: new THREE.Vector3(), tgtFrom: new THREE.Vector3(), tgtTo: new THREE.Vector3(), t: 0, dur: 1 };
let idleTimer = 0;
const clock = new THREE.Clock();
const EXAMPLES = [
	'a witty crypto trading assistant',
	'helpful customer support agent',
	'a creative storyteller for kids',
	'on-chain data analyst',
	'a calm meditation guide',
];

function initThree() {
	renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
	renderer.setClearColor(0x05070d, 1);
	renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
	renderer.setSize(window.innerWidth, window.innerHeight, false);

	scene = new THREE.Scene();
	scene.fog = new THREE.FogExp2(0x05070d, 0.0016);

	camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 4000);
	camera.position.set(0, 48, RADIUS * 2.7);

	controls = new OrbitControls(camera, renderer.domElement);
	controls.enableDamping = true;
	controls.dampingFactor = 0.08;
	controls.rotateSpeed = 0.6;
	controls.minDistance = 30;
	controls.maxDistance = RADIUS * 6;
	controls.autoRotate = true;
	controls.autoRotateSpeed = 0.35;
	controls.target.set(0, 0, 0);
	controls.addEventListener('start', () => { controls.autoRotate = false; idleTimer = 0; });

	raycaster = new THREE.Raycaster();
	raycaster.params.Points.threshold = 3.2;

	buildStarfield();
	window.addEventListener('resize', onResize, { passive: true });
	renderer.domElement.addEventListener('pointermove', onPointerMove, { passive: true });
	renderer.domElement.addEventListener('pointerdown', (e) => { pointerDown = { x: e.clientX, y: e.clientY }; });
	renderer.domElement.addEventListener('pointerup', onPointerUp);
	renderer.domElement.addEventListener('pointerleave', () => { setHover(-1); });
	renderer.setAnimationLoop(animate);
}

// Faint, slowly-drifting background stars for depth — purely decorative.
function buildStarfield() {
	const N = 1600;
	const g = new THREE.BufferGeometry();
	const pos = new Float32Array(N * 3);
	for (let i = 0; i < N; i++) {
		const r = 600 + Math.pow(Math.random(), 0.5) * 1400;
		const theta = Math.random() * Math.PI * 2;
		const phi = Math.acos(2 * Math.random() - 1);
		pos[i * 3] = r * Math.sin(phi) * Math.cos(theta);
		pos[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
		pos[i * 3 + 2] = r * Math.cos(phi);
	}
	g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
	const m = new THREE.PointsMaterial({ color: 0x66708a, size: 1.6, sizeAttenuation: true, transparent: true, opacity: 0.55, depthWrite: false });
	starfield = new THREE.Points(g, m);
	scene.add(starfield);
}

// ── Star shader (glowing, twinkling, dimmable, highlightable) ─────────────────
const VERT = `
	attribute float aSize;
	attribute float aDim;
	attribute float aHi;
	varying vec3 vColor;
	varying float vDim;
	varying float vHi;
	uniform float uPixelRatio;
	uniform float uTime;
	void main() {
		vColor = color;
		vDim = aDim;
		vHi = aHi;
		vec4 mv = modelViewMatrix * vec4(position, 1.0);
		float tw = 0.85 + 0.15 * sin(uTime * 1.6 + position.x * 0.4 + position.y * 0.7);
		float size = aSize * (1.0 + aHi * 1.6) * tw;
		gl_PointSize = size * uPixelRatio * (320.0 / -mv.z);
		gl_Position = projectionMatrix * mv;
	}
`;
const FRAG = `
	varying vec3 vColor;
	varying float vDim;
	varying float vHi;
	void main() {
		vec2 uv = gl_PointCoord - vec2(0.5);
		float d = length(uv);
		if (d > 0.5) discard;
		float core = smoothstep(0.5, 0.0, d);
		float glow = pow(core, 1.7);
		float alpha = glow * vDim;
		vec3 col = mix(vColor, vec3(1.0), vHi * 0.45 + glow * 0.18);
		gl_FragColor = vec4(col * (0.55 + 0.9 * glow), alpha);
	}
`;

function buildPoints() {
	if (points) { scene.remove(points); geometry.dispose(); material.dispose(); }
	const n = state.agents.length;
	positions = new Float32Array(n * 3);
	colors = new Float32Array(n * 3);
	aSize = new Float32Array(n);
	aDim = new Float32Array(n);
	aHi = new Float32Array(n);
	const col = new THREE.Color();
	for (let i = 0; i < n; i++) {
		const a = state.agents[i];
		positions[i * 3] = a.x; positions[i * 3 + 1] = a.y; positions[i * 3 + 2] = a.z;
		col.set(a.color);
		colors[i * 3] = col.r; colors[i * 3 + 1] = col.g; colors[i * 3 + 2] = col.b;
		// Deterministic mild size variation for life (seeded by id char codes).
		const seed = (a.id.charCodeAt(0) + a.id.charCodeAt(a.id.length - 1)) % 10;
		aSize[i] = 20 + seed * 0.9;
		aDim[i] = 1; aHi[i] = 0;
	}
	geometry = new THREE.BufferGeometry();
	geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
	geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
	geometry.setAttribute('aSize', new THREE.BufferAttribute(aSize, 1));
	geometry.setAttribute('aDim', new THREE.BufferAttribute(aDim, 1));
	geometry.setAttribute('aHi', new THREE.BufferAttribute(aHi, 1));
	material = new THREE.ShaderMaterial({
		uniforms: { uPixelRatio: { value: renderer.getPixelRatio() }, uTime: { value: 0 } },
		vertexShader: VERT, fragmentShader: FRAG,
		transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, vertexColors: true,
	});
	points = new THREE.Points(geometry, material);
	scene.add(points);
}

// ── Animation loop ────────────────────────────────────────────────────────────
function animate() {
	const dt = clock.getDelta();
	const t = clock.elapsedTime;
	if (material) material.uniforms.uTime.value = t;
	if (starfield) starfield.rotation.y += dt * 0.006;

	// Idle → resume gentle auto-rotate after a few seconds of no interaction.
	if (!controls.autoRotate && !fly.active) {
		idleTimer += dt;
		if (idleTimer > 4) controls.autoRotate = true;
	}

	if (fly.active) {
		fly.t += dt / fly.dur;
		const k = fly.t >= 1 ? 1 : easeInOut(fly.t);
		camera.position.lerpVectors(fly.camFrom, fly.camTo, k);
		controls.target.lerpVectors(fly.tgtFrom, fly.tgtTo, k);
		if (fly.t >= 1) fly.active = false;
	}

	controls.update();
	updateClusterLabels();
	renderer.render(scene, camera);
}

function easeInOut(x) { return x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2; }

// ── Cluster labels projected to screen ────────────────────────────────────────
const labelEls = [];
function buildClusterLabels() {
	els.clusterLabels.innerHTML = '';
	labelEls.length = 0;
	for (const c of state.clusters) {
		if (!c.size) continue;
		const el = document.createElement('div');
		el.className = 'clabel';
		el.textContent = c.label;
		el.style.color = c.color;
		el.style.borderColor = hexA(c.color, 0.4);
		labelEls.push({ el, c, v: new THREE.Vector3(c.x, c.y, c.z) });
		els.clusterLabels.appendChild(el);
	}
}
const _proj = new THREE.Vector3();
function updateClusterLabels() {
	if (!labelEls.length) return;
	const w = window.innerWidth, h = window.innerHeight;
	for (const { el, c, v } of labelEls) {
		_proj.copy(v).project(camera);
		const visible = _proj.z < 1 && (state.isolatedCluster === null || state.isolatedCluster === c.id) && !state.searchActive;
		if (!visible) { el.style.opacity = '0'; continue; }
		const x = (_proj.x * 0.5 + 0.5) * w;
		const y = (-_proj.y * 0.5 + 0.5) * h;
		el.style.left = x + 'px';
		el.style.top = y + 'px';
		el.style.opacity = '0.92';
	}
}

// ── Hover & selection ─────────────────────────────────────────────────────────
function onPointerMove(e) {
	pointer.x = (e.clientX / window.innerWidth) * 2 - 1;
	pointer.y = -(e.clientY / window.innerHeight) * 2 + 1;
	if (!points) return;
	raycaster.setFromCamera(pointer, camera);
	const hits = raycaster.intersectObject(points);
	const idx = pickVisible(hits);
	setHover(idx);
	if (idx >= 0) positionTooltip(e.clientX, e.clientY, idx);
}

// Nearest hit that isn't dimmed away by isolation/search.
function pickVisible(hits) {
	for (const hit of hits) {
		const i = hit.index;
		if (aDim[i] > 0.5) return i;
	}
	return -1;
}

function setHover(idx) {
	if (idx === state.hovered) return;
	if (state.hovered >= 0 && state.hovered !== state.selected) aHi[state.hovered] = 0;
	state.hovered = idx;
	if (idx >= 0) {
		aHi[idx] = Math.max(aHi[idx], 0.8);
		canvas.style.cursor = 'pointer';
		els.tooltip.classList.add('show');
	} else {
		canvas.style.cursor = 'grab';
		els.tooltip.classList.remove('show');
	}
	geometry.attributes.aHi.needsUpdate = true;
}

function positionTooltip(px, py, idx) {
	const a = state.agents[idx];
	const c = state.clusters[a.cluster];
	const match = state.searchActive && a._score != null ? `<div class="tt-match">${Math.round(a._score * 100)}% match</div>` : '';
	els.tooltip.innerHTML =
		`<div class="tt-theme" style="color:${c?.color || '#fff'}">${escapeHtml(c?.label || 'Agent')}</div>` +
		`<div class="tt-name">${escapeHtml(a.name)}</div>` +
		(a.description ? `<div class="tt-desc">${escapeHtml(a.description)}</div>` : '') + match;
	const tw = 280, gap = 16;
	let x = px + gap, y = py + gap;
	if (x + tw > window.innerWidth) x = px - tw - gap;
	if (y + 120 > window.innerHeight) y = py - 120 - gap;
	els.tooltip.style.left = Math.max(8, x) + 'px';
	els.tooltip.style.top = Math.max(8, y) + 'px';
}

function onPointerUp(e) {
	if (!pointerDown) return;
	const moved = Math.abs(e.clientX - pointerDown.x) + Math.abs(e.clientY - pointerDown.y);
	pointerDown = null;
	if (moved > 6) return; // a drag, not a click
	if (!points) return;
	raycaster.setFromCamera(pointer, camera);
	const idx = pickVisible(raycaster.intersectObject(points));
	if (idx >= 0) selectAgent(idx, true);
}

// ── Camera fly-to ─────────────────────────────────────────────────────────────
function flyTo(target, distance = 70) {
	controls.autoRotate = false;
	idleTimer = -3; // hold off auto-rotate a little longer after a fly
	const dir = new THREE.Vector3().subVectors(camera.position, controls.target).normalize();
	fly.camFrom.copy(camera.position);
	fly.tgtFrom.copy(controls.target);
	fly.tgtTo.copy(target);
	fly.camTo.copy(target).addScaledVector(dir, distance);
	fly.t = 0; fly.dur = 1.05; fly.active = true;
}

function resetView() {
	flyTo(new THREE.Vector3(0, 0, 0), RADIUS * 2.7);
	fly.camTo.set(0, 48, RADIUS * 2.7);
}

// ── Detail panel ──────────────────────────────────────────────────────────────
function selectAgent(idx, doFly) {
	if (state.selected >= 0) aHi[state.selected] = 0;
	state.selected = idx;
	aHi[idx] = 1;
	geometry.attributes.aHi.needsUpdate = true;
	const a = state.agents[idx];
	const c = state.clusters[a.cluster];
	if (doFly) flyTo(new THREE.Vector3(a.x, a.y, a.z), 60);

	els.panelHead.innerHTML =
		avatarMarkup(a, 'p-avatar') +
		`<div class="p-theme" style="color:${c?.color || '#fff'}"><span class="swatch" style="background:${c?.color}"></span>${escapeHtml(c?.label || 'Agent')}</div>` +
		`<div class="p-name">${escapeHtml(a.name)}</div>`;

	const neighbors = nearestNeighbors(idx, 4);
	const nbMarkup = neighbors.map((nb) => {
		const na = state.agents[nb.idx];
		return `<div class="nb" data-idx="${nb.idx}">${avatarMarkup(na, 'nb-av')}` +
			`<div class="nb-meta"><div class="nb-name">${escapeHtml(na.name)}</div>` +
			`<div class="nb-sim">${escapeHtml(state.clusters[na.cluster]?.label || '')}</div></div></div>`;
	}).join('');

	els.panelBody.innerHTML =
		`<div class="p-desc">${escapeHtml(a.description || 'No description provided.')}</div>` +
		(neighbors.length ? `<div class="p-section neighbors"><h4>Nearest in meaning</h4>${nbMarkup}</div>` : '') +
		`<a class="p-cta" href="${escapeAttr(a.url)}">Open agent →</a>`;

	els.panelBody.querySelectorAll('.nb').forEach((row) => {
		row.addEventListener('click', () => selectAgent(Number(row.dataset.idx), true));
	});

	els.panel.classList.add('open');
	els.panel.setAttribute('aria-hidden', 'false');
}

function closePanel() {
	els.panel.classList.remove('open');
	els.panel.setAttribute('aria-hidden', 'true');
	if (state.selected >= 0 && state.selected !== state.hovered) aHi[state.selected] = 0;
	state.selected = -1;
	geometry.attributes.aHi.needsUpdate = true;
}

// Nearest neighbours by 3D distance — the same proximity the eye sees, a faithful
// proxy for embedding similarity in the projected space.
function nearestNeighbors(idx, k) {
	const a = state.agents[idx];
	const out = [];
	for (let i = 0; i < state.agents.length; i++) {
		if (i === idx) continue;
		const b = state.agents[i];
		const d = (a.x - b.x) ** 2 + (a.y - b.y) ** 2 + (a.z - b.z) ** 2;
		out.push({ idx: i, d });
	}
	out.sort((p, q) => p.d - q.d);
	return out.slice(0, k);
}

// ── Legend ────────────────────────────────────────────────────────────────────
function buildLegend() {
	els.legendRows.innerHTML = '';
	for (const c of state.clusters) {
		if (!c.size) continue;
		const row = document.createElement('div');
		row.className = 'row';
		row.innerHTML = `<span class="swatch" style="background:${c.color};color:${c.color}"></span>` +
			`<span class="name">${escapeHtml(c.label)}</span><span class="cnt">${c.size}</span>`;
		row.addEventListener('click', () => toggleIsolate(c.id));
		row.dataset.cluster = c.id;
		els.legendRows.appendChild(row);
	}
	const src = state.clusters.filter((c) => c.labelSource === 'granite').length;
	els.legendFoot.textContent = `${state.data.meta.clusterCount} themes · ${src} named by Granite. Click a theme to isolate it.`;
	els.legend.style.display = 'block';
}

function toggleIsolate(clusterId) {
	state.isolatedCluster = state.isolatedCluster === clusterId ? null : clusterId;
	if (state.searchActive) clearSearch();
	applyVisibility();
	els.legendRows.querySelectorAll('.row').forEach((row) => {
		const isMuted = state.isolatedCluster !== null && Number(row.dataset.cluster) !== state.isolatedCluster;
		row.classList.toggle('muted', isMuted);
	});
}

// Recompute per-star dimming from isolation + search state.
function applyVisibility() {
	for (let i = 0; i < state.agents.length; i++) {
		const a = state.agents[i];
		let dim = 1;
		if (state.isolatedCluster !== null && a.cluster !== state.isolatedCluster) dim = 0.12;
		if (state.searchActive) dim = a._score != null ? 0.35 + 0.65 * scoreToBrightness(a._score) : 0.08;
		aDim[i] = dim;
	}
	geometry.attributes.aDim.needsUpdate = true;
}

function scoreToBrightness(score) {
	// Stretch the typical cosine range (~0.2–0.6) to 0–1 for visual contrast.
	return Math.max(0, Math.min(1, (score - 0.18) / 0.42));
}

// ── Stats ─────────────────────────────────────────────────────────────────────
function buildStats() {
	const m = state.data.meta;
	const stat = (v, k, u = '') => `<div class="stat"><div class="v">${v}${u ? `<span class="u">${u}</span>` : ''}</div><div class="k">${k}</div></div>`;
	els.stats.innerHTML =
		stat(m.count, 'Agents') +
		stat(m.dims || '—', 'Granite dims') +
		stat(m.clusterCount, 'Themes') +
		stat('3D', 'Projection');
	els.stats.style.display = 'flex';
	els.stats.title = `Embedded with ${m.model} on IBM watsonx.ai`;
}

// ── Search ────────────────────────────────────────────────────────────────────
let searchTimer = 0;
function wireSearch() {
	els.searchInput.addEventListener('input', () => {
		els.searchClear.style.display = els.searchInput.value ? 'block' : 'none';
		clearTimeout(searchTimer);
		const q = els.searchInput.value.trim();
		if (!q) { clearSearch(); return; }
		searchTimer = setTimeout(() => runSearch(q), 420);
	});
	els.searchInput.addEventListener('keydown', (e) => {
		if (e.key === 'Enter') { clearTimeout(searchTimer); const q = els.searchInput.value.trim(); if (q) runSearch(q); }
		if (e.key === 'Escape') { els.searchInput.value = ''; clearSearch(); els.searchInput.blur(); }
	});
	els.searchClear.addEventListener('click', () => { els.searchInput.value = ''; els.searchClear.style.display = 'none'; clearSearch(); els.searchInput.focus(); });

	els.searchHint.innerHTML = EXAMPLES.map((e) => `<button class="chip">${escapeHtml(e)}</button>`).join('');
	els.searchHint.querySelectorAll('.chip').forEach((chip) => {
		chip.addEventListener('click', () => { els.searchInput.value = chip.textContent; els.searchClear.style.display = 'block'; runSearch(chip.textContent); });
	});
}

async function runSearch(query) {
	els.searchBox.classList.add('searching');
	try {
		const res = await fetch('/api/ibm/galaxy', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ query }),
		});
		if (!res.ok) throw new Error(`search ${res.status}`);
		const data = await res.json();
		applySearchResults(query, data);
	} catch (err) {
		console.error('[galaxy] search failed', err);
		els.results.innerHTML = `<div class="r-head"><span>Search unavailable right now.</span></div>`;
		els.results.classList.add('show');
	} finally {
		els.searchBox.classList.remove('searching');
	}
}

function applySearchResults(query, data) {
	state.searchActive = true;
	state.isolatedCluster = null;
	els.legendRows.querySelectorAll('.row').forEach((r) => r.classList.remove('muted'));
	const scores = new Map((data.results || []).map((r) => [r.id, r.score]));
	for (const a of state.agents) a._score = scores.has(a.id) ? scores.get(a.id) : null;
	applyVisibility();
	renderResults(query, data.results || []);

	const best = data.best && state.byId.get(data.best.id);
	if (best) {
		const idx = state.agents.indexOf(best);
		flyTo(new THREE.Vector3(best.x, best.y, best.z), 64);
		if (idx >= 0) { aHi[idx] = 1; state.selected = -1; geometry.attributes.aHi.needsUpdate = true; }
	}
}

function renderResults(query, results) {
	if (!results.length) {
		els.results.innerHTML = `<div class="r-head"><span>No semantic matches for “${escapeHtml(query)}”.</span></div>`;
		els.results.classList.add('show');
		return;
	}
	const top = results.slice(0, 8);
	const rows = top.map((r, i) => {
		const a = state.byId.get(r.id);
		if (!a) return '';
		const pct = Math.round(scoreToBrightness(r.score) * 100);
		return `<div class="ritem${i === 0 ? ' active' : ''}" data-id="${escapeAttr(r.id)}">` +
			avatarMarkup(a, 'r-av') +
			`<span class="r-name">${escapeHtml(a.name)}</span>` +
			`<span class="r-bar"><i style="width:${pct}%"></i></span>` +
			`<span class="r-score">${Math.round(r.score * 100)}%</span></div>`;
	}).join('');
	els.results.innerHTML = `<div class="r-head"><span>Ranked by <b>Granite</b> semantic similarity</span><span>${results.length} matched</span></div>${rows}`;
	els.results.classList.add('show');
	els.results.querySelectorAll('.ritem').forEach((row) => {
		row.addEventListener('click', () => {
			const a = state.byId.get(row.dataset.id);
			if (a) selectAgent(state.agents.indexOf(a), true);
		});
	});
}

function clearSearch() {
	state.searchActive = false;
	for (const a of state.agents) a._score = null;
	els.results.classList.remove('show');
	applyVisibility();
}

// ── Markup helpers ────────────────────────────────────────────────────────────
function avatarMarkup(a, cls) {
	if (a.image) return `<img class="${cls}" src="${escapeAttr(a.image)}" alt="" loading="lazy" onerror="this.replaceWith(Object.assign(document.createElement('div'),{className:'${cls} placeholder',textContent:'${escapeAttr((a.name[0] || '?').toUpperCase())}'}))" />`;
	return `<div class="${cls} placeholder">${escapeHtml((a.name[0] || '?').toUpperCase())}</div>`;
}
function escapeHtml(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function escapeAttr(s) { return escapeHtml(s); }
function hexA(hex, a) {
	const h = hex.replace('#', '');
	const n = parseInt(h.length === 3 ? h.split('').map((x) => x + x).join('') : h, 16);
	return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

// ── State machine for overlays ────────────────────────────────────────────────
function showOnly(el) {
	for (const o of [els.loading, els.empty, els.unavailable, els.error]) o.classList.toggle('show', o === el);
	const name = el === els.loading ? 'loading' : el === els.empty ? 'empty'
		: el === els.unavailable ? 'unavailable' : el === els.error ? 'error' : 'scene';
	document.body.dataset.galaxyState = name;
}
function setLoadStep(step) {
	els.loadSteps.querySelectorAll('.o-step').forEach((s) => {
		const n = Number(s.dataset.step);
		s.classList.toggle('done', n < step);
		s.classList.toggle('active', n === step);
	});
}

// ── Boot ──────────────────────────────────────────────────────────────────────
async function load() {
	showOnly(els.loading);
	setLoadStep(1); // request in flight → Granite is embedding + projecting server-side
	let data;
	try {
		const res = await fetch('/api/ibm/galaxy');
		if (!res.ok) throw new Error(`galaxy ${res.status}`);
		data = await res.json();
	} catch (err) {
		console.error('[galaxy] load failed', err);
		els.errorMsg.textContent = 'Something went wrong reaching the galaxy service. Check your connection and try again.';
		showOnly(els.error);
		return;
	}

	if (!data.available) {
		if (data.reason === 'watsonx_not_configured') {
			if (data.message) els.unavailableMsg.textContent = data.message;
			showOnly(els.unavailable);
		} else {
			showOnly(els.empty);
		}
		return;
	}
	if (!data.agents || data.agents.length < 2) {
		const reason = data.meta?.reason;
		els.emptyTitle.textContent = reason === 'too_few_agents' ? 'Not enough agents yet' : 'No agents to map yet';
		els.emptyMsg.textContent = reason === 'too_few_agents'
			? 'A galaxy needs at least a couple of public agents to map relationships. Create one and it joins the constellation.'
			: 'The galaxy lights up once public agents exist. Create one and it joins the constellation on the next rebuild.';
		showOnly(els.empty);
		return;
	}

	setLoadStep(3); // rendering
	state.data = data;
	state.clusters = data.clusters;
	state.agents = data.agents.map((a) => ({ ...a, color: data.clusters[a.cluster]?.color || '#78a9ff', _score: null }));
	state.byId = new Map(state.agents.map((a) => [a.id, a]));

	buildPoints();
	buildClusterLabels();
	buildLegend();
	buildStats();
	els.searchWrap.style.display = 'block';

	// Reveal the scene.
	showOnly(null);
	els.loading.classList.remove('show');
	flashHudHint(`Drag to orbit · scroll to zoom · click a star to explore · press <b>/</b> to search`);

	document.body.dataset.galaxyState = 'ready';
	// Read-only introspection handle for support/debugging a 3D scene that can't
	// be inspected from pixels alone (headless WebGL renders nothing screenshotable).
	window.__ibmGalaxy = {
		state,
		scene,
		camera,
		points: () => points,
		starCount: () => (points ? points.geometry.attributes.position.count : 0),
		rendererInfo: () => renderer.info.render,
	};
}

function flashHudHint(html) {
	els.hudHint.innerHTML = html;
	els.hudHint.classList.add('show');
	setTimeout(() => els.hudHint.classList.remove('show'), 6500);
}

function onResize() {
	camera.aspect = window.innerWidth / window.innerHeight;
	camera.updateProjectionMatrix();
	renderer.setSize(window.innerWidth, window.innerHeight, false);
	if (material) material.uniforms.uPixelRatio.value = renderer.getPixelRatio();
}

function wireGlobalUI() {
	els.panelClose.addEventListener('click', closePanel);
	els.resetView.addEventListener('click', () => { resetView(); state.isolatedCluster = null; if (state.searchActive) clearSearch(); applyVisibility(); els.legendRows.querySelectorAll('.row').forEach((r) => r.classList.remove('muted')); });
	els.retryBtn.addEventListener('click', () => load());
	window.addEventListener('keydown', (e) => {
		if (e.key === '/' && document.activeElement !== els.searchInput) { e.preventDefault(); els.searchInput.focus(); }
		else if (e.key === 'Escape') { if (els.panel.classList.contains('open')) closePanel(); }
		else if ((e.key === 'r' || e.key === 'R') && document.activeElement !== els.searchInput) resetView();
	});
}

// WebGL capability guard — show the error state rather than a blank canvas.
function hasWebGL() {
	try {
		const c = document.createElement('canvas');
		return !!(window.WebGLRenderingContext && (c.getContext('webgl2') || c.getContext('webgl')));
	} catch { return false; }
}

if (!hasWebGL()) {
	els.errorMsg.textContent = 'This browser or device does not support WebGL, which the Agent Galaxy needs to render.';
	showOnly(els.error);
} else {
	initThree();
	wireSearch();
	wireGlobalUI();
	load();
}

// Agent Galaxy — the interactive 3D star-map.
//
// Fetches the constellation snapshot from /api/galaxy (agents positioned by IBM
// Granite embeddings on watsonx.ai), renders it as a glowing point cloud with
// Three.js, and wires the exploration UI: hover tooltips, click-to-inspect, a
// Granite-powered semantic search that lights up matching stars, and a legend that
// flies the camera to each named constellation.
//
// All data is real (no mock path). When the backend can't build the galaxy — most
// often because watsonx isn't configured — the viewer explains rather than faking a
// universe.

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const REDUCED_MOTION =
	typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

const $ = (id) => document.getElementById(id);

// ── DOM ──────────────────────────────────────────────────────────────────────
const els = {};
function cacheEls() {
	for (const id of [
		'gxStage', 'gxCanvas', 'gxHud', 'gxStats', 'gxStatAgents', 'gxStatClusters',
		'gxSearch', 'gxSearchInput', 'gxSearchClear', 'gxSearchGo',
		'gxLegend', 'gxLegendList', 'gxLegendToggle',
		'gxTip', 'gxCard', 'gxCardClose', 'gxCardThumb', 'gxCardName', 'gxCardConstellation',
		'gxCardDesc', 'gxCardMeta', 'gxCardView', 'gxCardChat',
		'gxResults', 'gxResultsList', 'gxResultsClose', 'gxResultsLabel',
		'gxLoading', 'gxEmpty', 'gxEmptySub', 'gxError', 'gxErrorSub', 'gxRetry', 'gxHint',
	]) {
		els[id] = $(id);
	}
}

// ── State ──────────────────────────────────────────────────────────────────
const state = {
	data: null, // galaxy payload
	clusterById: new Map(),
	idToIndex: new Map(), // agent id → point index
	selected: -1,
	focusMode: null, // 'search' | 'cluster' | null
	focusCluster: -1,
};

// Three.js handles
let renderer, scene, camera, controls, points, geom, mat, labelLayer;
let raycaster, clock;
const pointer = new THREE.Vector2();
let hoverIndex = -1;
let rafPending = false;

// Camera fly-to tween
const fly = { active: false, t: 0, dur: 0.9, fromPos: new THREE.Vector3(), toPos: new THREE.Vector3(), fromTgt: new THREE.Vector3(), toTgt: new THREE.Vector3() };

// Public debug/verification surface.
const dbg = (window.__galaxy = {
	ready: false,
	status: 'loading',
	error: null,
	agentCount: 0,
	clusterCount: 0,
	pointCount: 0,
	search: (q) => runSearch(q),
	refresh: () => loadGalaxy(true),
});

// ── Boot ───────────────────────────────────────────────────────────────────
function boot() {
	cacheEls();
	setupThree();
	bindUI();
	loadGalaxy(false);
}

// ── Data ───────────────────────────────────────────────────────────────────
async function loadGalaxy(refresh) {
	showOverlay('loading');
	dbg.status = 'loading';
	try {
		const res = await fetch(`/api/galaxy${refresh ? '?refresh=1' : ''}`, {
			headers: { accept: 'application/json' },
		});
		const body = await res.json().catch(() => ({}));

		if (!res.ok) {
			if (res.status === 503 && body.error === 'watsonx_unavailable') {
				return showError(
					'IBM Granite isn’t connected',
					'The galaxy is positioned by IBM Granite embeddings on watsonx.ai. ' +
						'Once watsonx credentials are configured, the universe lights up here.',
					false,
				);
			}
			return showError('Couldn’t reach the stars', body.error_description || `Request failed (${res.status}).`);
		}

		if (!body.agents || body.agents.length === 0) {
			dbg.status = 'empty';
			return showOverlay('empty');
		}

		renderGalaxy(body);
		hideOverlays();
		dbg.status = 'ready';
		dbg.ready = true;
	} catch (err) {
		showError('Couldn’t reach the stars', err?.message || 'Network error.');
	}
}

// ── Render the constellation ─────────────────────────────────────────────────
function renderGalaxy(data) {
	state.data = data;
	state.clusterById = new Map(data.clusters.map((c) => [c.id, c]));

	disposePoints();

	const n = data.agents.length;
	const positions = new Float32Array(n * 3);
	const colors = new Float32Array(n * 3);
	const sizes = new Float32Array(n);
	const seeds = new Float32Array(n);
	const states = new Float32Array(n); // 0 normal, 1 highlit, -1 dimmed

	const color = new THREE.Color();
	const maxChats = Math.max(1, ...data.agents.map((a) => a.chat_count || 0));

	state.idToIndex.clear();
	data.agents.forEach((a, i) => {
		state.idToIndex.set(a.id, i);
		const [x, y, z] = a.coords;
		positions[i * 3] = x;
		positions[i * 3 + 1] = y;
		positions[i * 3 + 2] = z;
		const cluster = state.clusterById.get(a.cluster);
		color.set((cluster && cluster.color) || '#78a9ff');
		colors[i * 3] = color.r;
		colors[i * 3 + 1] = color.g;
		colors[i * 3 + 2] = color.b;
		// Base size grows with engagement (chat volume), gently (log scale).
		sizes[i] = 7 + 9 * (Math.log1p(a.chat_count || 0) / Math.log1p(maxChats));
		seeds[i] = Math.random();
		states[i] = 0;
	});

	geom = new THREE.BufferGeometry();
	geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
	geom.setAttribute('aColor', new THREE.BufferAttribute(colors, 3));
	geom.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
	geom.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 1));
	geom.setAttribute('aState', new THREE.BufferAttribute(states, 1));

	mat = new THREE.ShaderMaterial({
		uniforms: {
			uTime: { value: 0 },
			uPixelRatio: { value: Math.min(devicePixelRatio || 1, 2) },
			uHighlight: { value: 0 },
			uDim: { value: 0.14 },
			uTwinkle: { value: REDUCED_MOTION ? 0 : 1 },
		},
		vertexShader: POINT_VERT,
		fragmentShader: POINT_FRAG,
		transparent: true,
		depthWrite: false,
		blending: THREE.AdditiveBlending,
	});

	points = new THREE.Points(geom, mat);
	points.frustumCulled = false;
	scene.add(points);

	buildClusterLabels(data.clusters);
	buildLegend(data.clusters);

	// Stats
	els.gxStatAgents.innerHTML = `<strong>${n.toLocaleString()}</strong> agents`;
	els.gxStatClusters.innerHTML = `<strong>${data.clusters.length}</strong> constellations`;
	els.gxStats.hidden = false;
	els.gxLegend.hidden = false;

	dbg.agentCount = n;
	dbg.clusterCount = data.clusters.length;
	dbg.pointCount = n;

	// Frame the whole cloud.
	flyTo(new THREE.Vector3(0, 36, 322), new THREE.Vector3(0, 0, 0), 0.001);
}

// ── Cluster labels (DOM, projected each frame) ───────────────────────────────
let clusterLabels = [];
function buildClusterLabels(clusters) {
	if (!labelLayer) {
		labelLayer = document.createElement('div');
		labelLayer.className = 'gx-clabels';
		els.gxStage.appendChild(labelLayer);
	}
	labelLayer.innerHTML = '';
	clusterLabels = clusters.map((c) => {
		const el = document.createElement('button');
		el.className = 'gx-clabel';
		el.type = 'button';
		el.style.setProperty('--c', c.color);
		el.innerHTML = `<span class="gx-clabel-dot"></span><span class="gx-clabel-text">${escapeHtml(c.label)}</span>`;
		el.title = c.theme || c.label;
		el.addEventListener('click', () => toggleClusterFocus(c.id));
		labelLayer.appendChild(el);
		return { el, pos: new THREE.Vector3(...c.centroid), id: c.id };
	});
}

function updateClusterLabels() {
	if (!clusterLabels.length) return;
	const w = renderer.domElement.clientWidth;
	const h = renderer.domElement.clientHeight;
	const v = new THREE.Vector3();
	for (const lbl of clusterLabels) {
		v.copy(lbl.pos).project(camera);
		const behind = v.z > 1;
		const dimmed = state.focusMode === 'cluster' && state.focusCluster !== lbl.id;
		if (behind) {
			lbl.el.style.opacity = '0';
			lbl.el.style.pointerEvents = 'none';
			continue;
		}
		const x = (v.x * 0.5 + 0.5) * w;
		const y = (-v.y * 0.5 + 0.5) * h;
		lbl.el.style.transform = `translate(-50%,-50%) translate(${x.toFixed(1)}px,${y.toFixed(1)}px)`;
		lbl.el.style.opacity = dimmed ? '0.25' : '1';
		lbl.el.style.pointerEvents = 'auto';
	}
}

// ── Legend ───────────────────────────────────────────────────────────────────
function buildLegend(clusters) {
	els.gxLegendList.innerHTML = '';
	for (const c of clusters) {
		const li = document.createElement('li');
		const btn = document.createElement('button');
		btn.className = 'gx-legend-item';
		btn.type = 'button';
		btn.dataset.cluster = String(c.id);
		btn.innerHTML =
			`<span class="gx-legend-swatch" style="color:${c.color};background:${c.color}"></span>` +
			`<span class="gx-legend-name">${escapeHtml(c.label)}</span>` +
			`<span class="gx-legend-count">${c.size}</span>`;
		btn.title = c.theme || c.label;
		btn.addEventListener('click', () => toggleClusterFocus(c.id));
		li.appendChild(btn);
		els.gxLegendList.appendChild(li);
	}
}

function syncLegendActive() {
	for (const btn of els.gxLegendList.querySelectorAll('.gx-legend-item')) {
		const on = state.focusMode === 'cluster' && Number(btn.dataset.cluster) === state.focusCluster;
		btn.classList.toggle('gx-active', on);
	}
}

// ── Highlight machinery (shared by search + cluster focus) ──────────────────
function applyHighlight(indexSet) {
	const arr = geom.getAttribute('aState');
	for (let i = 0; i < arr.count; i++) arr.setX(i, indexSet.has(i) ? 1 : -1);
	arr.needsUpdate = true;
	mat.uniforms.uHighlight.value = 1;
}
function clearHighlight() {
	if (!geom) return;
	const arr = geom.getAttribute('aState');
	for (let i = 0; i < arr.count; i++) arr.setX(i, 0);
	arr.needsUpdate = true;
	mat.uniforms.uHighlight.value = 0;
	state.focusMode = null;
	state.focusCluster = -1;
	syncLegendActive();
}

function toggleClusterFocus(clusterId) {
	if (state.focusMode === 'cluster' && state.focusCluster === clusterId) {
		clearHighlight();
		return;
	}
	const members = new Set();
	state.data.agents.forEach((a, i) => {
		if (a.cluster === clusterId) members.add(i);
	});
	if (!members.size) return;
	applyHighlight(members);
	state.focusMode = 'cluster';
	state.focusCluster = clusterId;
	syncLegendActive();
	clearSearchUI();
	const c = state.clusterById.get(clusterId);
	if (c) flyToTarget(new THREE.Vector3(...c.centroid), 220);
}

// ── Semantic search (Granite) ───────────────────────────────────────────────
let searchSeq = 0;
async function runSearch(query) {
	const q = String(query || '').trim();
	if (!q) {
		clearSearch();
		return;
	}
	const seq = ++searchSeq;
	els.gxSearchGo.disabled = true;
	els.gxSearchGo.textContent = '…';
	try {
		const res = await fetch('/api/galaxy', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ query: q }),
		});
		const body = await res.json().catch(() => ({}));
		if (seq !== searchSeq) return; // a newer search superseded this one
		if (!res.ok) {
			renderResults([], q, body.error_description || 'Search failed.');
			return;
		}
		const results = (body.results || []).filter((r) => state.idToIndex.has(r.id));
		const idxSet = new Set(results.map((r) => state.idToIndex.get(r.id)));
		if (idxSet.size) {
			applyHighlight(idxSet);
			state.focusMode = 'search';
			state.focusCluster = -1;
			syncLegendActive();
			// Fly to the best match.
			const top = results[0];
			const ti = state.idToIndex.get(top.id);
			const a = state.data.agents[ti];
			flyToTarget(new THREE.Vector3(...a.coords), 150);
		} else {
			clearHighlight();
		}
		renderResults(results, q);
	} catch (err) {
		if (seq === searchSeq) renderResults([], q, err?.message || 'Network error.');
	} finally {
		if (seq === searchSeq) {
			els.gxSearchGo.disabled = false;
			els.gxSearchGo.textContent = 'Search';
		}
	}
}

function renderResults(results, query, errMsg) {
	els.gxResultsLabel.textContent = errMsg
		? 'Search'
		: results.length
			? `Closest to “${truncate(query, 40)}”`
			: `Nothing close to “${truncate(query, 40)}”`;
	els.gxResultsList.innerHTML = '';
	if (errMsg) {
		els.gxResultsList.innerHTML = `<div class="gx-results-empty">${escapeHtml(errMsg)}</div>`;
	} else if (!results.length) {
		els.gxResultsList.innerHTML =
			'<div class="gx-results-empty">No agents matched. Try a broader phrase.</div>';
	} else {
		results.forEach((r, i) => {
			const item = document.createElement('button');
			item.className = 'gx-result';
			item.type = 'button';
			item.innerHTML =
				`<span class="gx-result-rank">${i + 1}</span>` +
				`<span class="gx-result-body"><span class="gx-result-name">${escapeHtml(r.name)}</span>` +
				`<span class="gx-result-score">${Math.round(r.score * 100)}% match</span></span>`;
			item.addEventListener('click', () => {
				const idx = state.idToIndex.get(r.id);
				if (idx != null) selectAgent(idx, true);
			});
			els.gxResultsList.appendChild(item);
		});
	}
	els.gxResults.hidden = false;
	els.gxSearchClear.hidden = false;
}

function clearSearch() {
	els.gxSearchInput.value = '';
	clearSearchUI();
	clearHighlight();
}
function clearSearchUI() {
	els.gxResults.hidden = true;
	els.gxSearchClear.hidden = !els.gxSearchInput.value;
}

// ── Selection card ───────────────────────────────────────────────────────────
function selectAgent(index, fly = false) {
	const a = state.data.agents[index];
	if (!a) return;
	state.selected = index;
	const cluster = state.clusterById.get(a.cluster);

	if (a.thumbnail) {
		els.gxCardThumb.style.backgroundImage = `url("${a.thumbnail}")`;
		els.gxCardThumb.textContent = '';
	} else {
		els.gxCardThumb.style.backgroundImage = 'none';
		els.gxCardThumb.textContent = (a.name || '?').trim().charAt(0).toUpperCase();
	}
	els.gxCardName.textContent = a.name;
	els.gxCardConstellation.innerHTML = cluster
		? `<span class="gx-tip-dot" style="background:${cluster.color}"></span>${escapeHtml(cluster.label)}`
		: '';
	els.gxCardDesc.textContent = a.description || 'No description.';

	// Meta chips: engagement, on-chain identity, token.
	const chips = [];
	if (a.chat_count) chips.push(chip(`✦ ${formatCount(a.chat_count)} chats`));
	if (a.token && a.token.symbol) chips.push(chip(`$${escapeHtml(a.token.symbol)}`));
	if (a.wallet) chips.push(chip(`<code>${shortAddr(a.wallet)}</code>`));
	els.gxCardMeta.innerHTML = chips.join('');

	els.gxCardView.href = `/agents/${a.id}`;
	els.gxCardChat.href = `/agent/${a.id}`;
	els.gxCard.hidden = false;

	if (fly) flyToTarget(new THREE.Vector3(...a.coords), 120);
}
function deselect() {
	state.selected = -1;
	els.gxCard.hidden = true;
}

// ── Three.js scene ───────────────────────────────────────────────────────────
function setupThree() {
	renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
	renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
	renderer.setClearColor(0x000000, 0);
	els.gxCanvas.appendChild(renderer.domElement);

	scene = new THREE.Scene();
	scene.fog = new THREE.FogExp2(0x05060a, 0.0016);

	camera = new THREE.PerspectiveCamera(58, 1, 0.1, 4000);
	camera.position.set(0, 36, 322);

	controls = new OrbitControls(camera, renderer.domElement);
	controls.enableDamping = true;
	controls.dampingFactor = 0.08;
	controls.enablePan = false;
	controls.minDistance = 60;
	controls.maxDistance = 760;
	controls.rotateSpeed = 0.6;
	controls.zoomSpeed = 0.8;
	controls.autoRotate = !REDUCED_MOTION;
	controls.autoRotateSpeed = 0.32;
	controls.addEventListener('start', () => {
		controls.autoRotate = false;
		clearTimeout(idleTimer);
	});
	controls.addEventListener('end', scheduleIdle);

	addBackgroundStars();

	raycaster = new THREE.Raycaster();
	raycaster.params.Points.threshold = 4.2;
	clock = new THREE.Clock();

	const ro = new ResizeObserver(resize);
	ro.observe(els.gxStage);
	resize();

	renderer.domElement.addEventListener('pointermove', onPointerMove);
	renderer.domElement.addEventListener('pointerdown', onPointerDown);
	renderer.domElement.addEventListener('pointerleave', () => {
		hoverIndex = -1;
		els.gxTip.hidden = true;
		els.gxCanvas.classList.remove('gx-pointing');
	});

	renderer.setAnimationLoop(tick);
}

// A faint, deep background starfield for depth/parallax — purely decorative.
function addBackgroundStars() {
	const N = 1400;
	const pos = new Float32Array(N * 3);
	for (let i = 0; i < N; i++) {
		// Shell well outside the agent cloud so it reads as distant sky.
		const r = 700 + Math.random() * 1700;
		const th = Math.random() * Math.PI * 2;
		const ph = Math.acos(2 * Math.random() - 1);
		pos[i * 3] = r * Math.sin(ph) * Math.cos(th);
		pos[i * 3 + 1] = r * Math.sin(ph) * Math.sin(th);
		pos[i * 3 + 2] = r * Math.cos(ph);
	}
	const g = new THREE.BufferGeometry();
	g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
	const m = new THREE.PointsMaterial({
		color: 0x9fb4d6,
		size: 1.4,
		sizeAttenuation: false,
		transparent: true,
		opacity: 0.5,
		depthWrite: false,
	});
	scene.add(new THREE.Points(g, m));
}

let idleTimer;
function scheduleIdle() {
	clearTimeout(idleTimer);
	if (REDUCED_MOTION) return;
	idleTimer = setTimeout(() => {
		controls.autoRotate = true;
	}, 3500);
}

function resize() {
	const w = els.gxStage.clientWidth || window.innerWidth;
	const h = els.gxStage.clientHeight || window.innerHeight;
	renderer.setSize(w, h, false);
	camera.aspect = w / h;
	camera.updateProjectionMatrix();
}

function tick() {
	const dt = clock.getDelta();
	const t = clock.getElapsedTime();
	if (mat) mat.uniforms.uTime.value = t;

	if (fly.active) {
		fly.t = Math.min(1, fly.t + dt / fly.dur);
		const e = easeInOut(fly.t);
		camera.position.lerpVectors(fly.fromPos, fly.toPos, e);
		controls.target.lerpVectors(fly.fromTgt, fly.toTgt, e);
		if (fly.t >= 1) {
			fly.active = false;
			scheduleIdle();
		}
	}

	controls.update();
	updateClusterLabels();
	renderer.render(scene, camera);
}

// ── Camera moves ─────────────────────────────────────────────────────────────
function flyTo(toPos, toTgt, dur = 0.9) {
	fly.fromPos.copy(camera.position);
	fly.fromTgt.copy(controls.target);
	fly.toPos.copy(toPos);
	fly.toTgt.copy(toTgt);
	fly.dur = Math.max(0.001, dur);
	fly.t = 0;
	fly.active = true;
	controls.autoRotate = false;
}

// Fly so the camera looks at `target` from a comfortable standoff `dist`, keeping
// the current viewing direction so the move feels like gliding closer, not cutting.
function flyToTarget(target, dist) {
	const dir = new THREE.Vector3().subVectors(camera.position, controls.target);
	if (dir.lengthSq() < 1e-6) dir.set(0, 0, 1);
	dir.normalize().multiplyScalar(dist);
	flyTo(new THREE.Vector3().addVectors(target, dir), target.clone(), 0.9);
}

// ── Pointer interaction ──────────────────────────────────────────────────────
function onPointerMove(e) {
	const rect = renderer.domElement.getBoundingClientRect();
	pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
	pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
	els.gxTip.dataset.x = e.clientX - rect.left;
	els.gxTip.dataset.y = e.clientY - rect.top;
	if (!rafPending) {
		rafPending = true;
		requestAnimationFrame(updateHover);
	}
}

function updateHover() {
	rafPending = false;
	if (!points) return;
	raycaster.setFromCamera(pointer, camera);
	const hits = raycaster.intersectObject(points, false);
	const idx = hits.length ? hits[0].index : -1;
	if (idx === hoverIndex) {
		positionTip();
		return;
	}
	hoverIndex = idx;
	if (idx < 0) {
		els.gxTip.hidden = true;
		els.gxCanvas.classList.remove('gx-pointing');
		return;
	}
	const a = state.data.agents[idx];
	const c = state.clusterById.get(a.cluster);
	els.gxTip.innerHTML =
		`<div class="gx-tip-name">${escapeHtml(a.name)}</div>` +
		(c ? `<div class="gx-tip-cluster"><span class="gx-tip-dot" style="background:${c.color}"></span>${escapeHtml(c.label)}</div>` : '');
	els.gxTip.hidden = false;
	els.gxCanvas.classList.add('gx-pointing');
	positionTip();
}
function positionTip() {
	if (els.gxTip.hidden) return;
	els.gxTip.style.left = `${els.gxTip.dataset.x}px`;
	els.gxTip.style.top = `${els.gxTip.dataset.y}px`;
}

let downAt = null;
function onPointerDown(e) {
	downAt = { x: e.clientX, y: e.clientY, idx: hoverIndex };
	const onUp = (ev) => {
		renderer.domElement.removeEventListener('pointerup', onUp);
		if (!downAt) return;
		const moved = Math.hypot(ev.clientX - downAt.x, ev.clientY - downAt.y);
		// A click (not a drag) on a star selects it; on empty space, deselect.
		if (moved < 5) {
			if (downAt.idx >= 0) selectAgent(downAt.idx, true);
			else deselect();
		}
		downAt = null;
	};
	renderer.domElement.addEventListener('pointerup', onUp);
}

// ── UI wiring ────────────────────────────────────────────────────────────────
function bindUI() {
	els.gxSearch.addEventListener('submit', (e) => {
		e.preventDefault();
		runSearch(els.gxSearchInput.value);
	});
	els.gxSearchInput.addEventListener('input', () => {
		els.gxSearchClear.hidden = !els.gxSearchInput.value;
	});
	els.gxSearchClear.addEventListener('click', () => {
		clearSearch();
		els.gxSearchInput.focus();
	});
	els.gxResultsClose.addEventListener('click', clearSearch);
	els.gxCardClose.addEventListener('click', deselect);
	els.gxRetry.addEventListener('click', () => loadGalaxy(false));
	els.gxLegendToggle.addEventListener('click', () => {
		const collapsed = els.gxLegend.classList.toggle('gx-collapsed');
		els.gxLegendToggle.setAttribute('aria-expanded', String(!collapsed));
		els.gxLegendToggle.textContent = collapsed ? '+' : '−';
	});
	window.addEventListener('keydown', (e) => {
		if (e.key === 'Escape') {
			if (!els.gxCard.hidden) deselect();
			else if (state.focusMode) clearSearch();
		}
	});
	window.addEventListener('pagehide', dispose, { once: true });
}

// ── Overlays ─────────────────────────────────────────────────────────────────
function showOverlay(which) {
	els.gxLoading.hidden = which !== 'loading';
	els.gxEmpty.hidden = which !== 'empty';
	els.gxError.hidden = which !== 'error';
}
function hideOverlays() {
	els.gxLoading.hidden = true;
	els.gxEmpty.hidden = true;
	els.gxError.hidden = true;
}
function showError(title, sub, retryable = true) {
	dbg.status = 'error';
	dbg.error = sub;
	$('gxErrorTitle').textContent = title;
	els.gxErrorSub.textContent = sub;
	els.gxRetry.hidden = !retryable;
	showOverlay('error');
}

// ── Cleanup ──────────────────────────────────────────────────────────────────
function disposePoints() {
	if (points) {
		scene.remove(points);
		geom?.dispose();
		mat?.dispose();
		points = geom = mat = null;
	}
}
function dispose() {
	try {
		renderer?.setAnimationLoop(null);
		disposePoints();
		renderer?.dispose();
	} catch {
		/* page is unloading; best-effort */
	}
}

// ── Helpers ──────────────────────────────────────────────────────────────────
function escapeHtml(s) {
	return String(s == null ? '' : s).replace(/[&<>"']/g, (c) =>
		({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]),
	);
}
function truncate(s, n) {
	s = String(s || '');
	return s.length > n ? s.slice(0, n - 1) + '…' : s;
}
function chip(inner) {
	return `<span class="gx-chip">${inner}</span>`;
}
function formatCount(n) {
	if (n >= 1000) return (n / 1000).toFixed(n >= 10000 ? 0 : 1).replace(/\.0$/, '') + 'k';
	return String(n);
}
function shortAddr(a) {
	a = String(a);
	return a.length > 12 ? `${a.slice(0, 5)}…${a.slice(-4)}` : a;
}
function easeInOut(t) {
	return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

// ── Shaders ──────────────────────────────────────────────────────────────────
const POINT_VERT = /* glsl */ `
	attribute vec3 aColor;
	attribute float aSize;
	attribute float aSeed;
	attribute float aState;
	uniform float uTime;
	uniform float uPixelRatio;
	uniform float uTwinkle;
	varying vec3 vColor;
	varying float vState;
	void main() {
		vColor = aColor;
		vState = aState;
		vec4 mv = modelViewMatrix * vec4(position, 1.0);
		float size = aSize;
		// gentle twinkle
		size *= 1.0 + uTwinkle * 0.16 * sin(uTime * 1.6 + aSeed * 6.2831);
		// highlight pulse for matched/focused stars
		float hi = step(0.5, aState);
		size *= mix(1.0, 1.85 + 0.55 * sin(uTime * 5.0), hi);
		float dist = max(-mv.z, 1.0);
		gl_PointSize = clamp(size * (300.0 / dist), 1.0, 64.0) * uPixelRatio;
		gl_Position = projectionMatrix * mv;
	}
`;
const POINT_FRAG = /* glsl */ `
	precision mediump float;
	uniform float uHighlight;
	uniform float uDim;
	varying vec3 vColor;
	varying float vState;
	void main() {
		float d = length(gl_PointCoord - 0.5);
		if (d > 0.5) discard;
		float core = smoothstep(0.5, 0.0, d);
		float alpha = core * core;
		// When a search/focus is active, fade the non-matching stars way back.
		float dimmed = (uHighlight > 0.5 && vState < 0.5) ? uDim : 1.0;
		vec3 col = vColor * (0.55 + 0.75 * core);
		gl_FragColor = vec4(col, alpha * dimmed);
	}
`;

// ── Start ────────────────────────────────────────────────────────────────────
if (document.readyState === 'loading') {
	document.addEventListener('DOMContentLoaded', boot, { once: true });
} else {
	boot();
}

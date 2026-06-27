// Scene Capture — drive the video → 3D point-cloud pipeline and render the result.
//
// Backend: POST /api/scene-capture { video_url, … } → 202 { job_id }, then poll
// GET /api/scene-capture?job=<id> until done. The result is a .ply point cloud we
// render with PointCloudViewer. Every state is designed: idle, submitting,
// processing (with elapsed timer + stage hints), live, and error. When the
// backend isn't configured, the sample cloud still proves the renderer end-to-end.

import { PointCloudViewer, sampleRoomCloud } from './pointcloud-viewer.js';

const $ = (s, r = document) => r.querySelector(s);

let viewer = null;
let pollTimer = null;
let elapsedTimer = null;
let downloadUrl = null;

const STAGE = () => $('#pc-stage');
const HOST = () => $('#pc-host');

// ── viewer lifecycle ──────────────────────────────────────────────────────────
function ensureViewer() {
	if (!viewer) viewer = new PointCloudViewer(HOST(), { background: '#0a0a0a' });
	return viewer;
}

// ── overlay states ────────────────────────────────────────────────────────────
function showOnly(id) {
	for (const k of ['pc-idle', 'pc-loading', 'pc-error']) {
		const node = $(`#${k}`);
		if (node) node.hidden = k !== id;
	}
	if (id !== null) $('#pc-hud').hidden = true;
}
function setLoading(title, sub) {
	$('#pc-loading-title').textContent = title;
	if (sub != null) $('#pc-loading-sub').textContent = sub;
	showOnly('pc-loading');
}
function setError(title, sub) {
	$('#pc-error-title').textContent = title;
	$('#pc-error-sub').textContent = sub || '';
	showOnly('pc-error');
}
function setLive(label) {
	$('#pc-hud-label').textContent = label;
	$('#pc-hud').hidden = false;
	for (const k of ['pc-idle', 'pc-loading', 'pc-error']) $(`#${k}`).hidden = true;
}

function setDownload(url, filename) {
	const btn = $('#pc-download');
	if (downloadUrl && downloadUrl !== url) URL.revokeObjectURL(downloadUrl);
	downloadUrl = url;
	if (!url) { btn.hidden = true; return; }
	btn.href = url;
	btn.download = filename || 'scene.ply';
	btn.hidden = false;
}

function fmt(n) { return n.toLocaleString('en-US'); }

// ── render a point cloud from an ArrayBuffer ──────────────────────────────────
function renderBuffer(buffer, label, downloadName) {
	setLoading('Decoding point cloud…', `${(buffer.byteLength / 1024 / 1024).toFixed(1)} MB`);
	try {
		const v = ensureViewer();
		const { count } = v.loadBuffer(buffer);
		setLive(`${label} · ${fmt(count)} points`);
		setDownload(URL.createObjectURL(new Blob([buffer])), downloadName);
		$('#pc-size').disabled = false;
	} catch (err) {
		console.error('[scene-capture] decode failed', err);
		setError('That isn’t a valid point cloud', 'Expected a binary or ASCII .ply with xyz + rgb vertices.');
	}
}

async function loadFromUrl(url, label) {
	let parsed;
	try { parsed = new URL(url, location.href); } catch { setError('That doesn’t look like a URL', url); return; }
	setLoading('Fetching point cloud…', parsed.hostname);
	try {
		const res = await fetch(parsed.href);
		if (!res.ok) throw new Error(`HTTP ${res.status}`);
		const buffer = await res.arrayBuffer();
		renderBuffer(buffer, label || 'Point cloud', parsed.pathname.split('/').pop() || 'scene.ply');
	} catch (err) {
		console.error('[scene-capture] fetch failed', err);
		setError('Couldn’t fetch that point cloud', `${err.message}. The host may block cross-origin reads (CORS).`);
	}
}

async function loadFromFile(file) {
	setLoading('Reading file…', file.name);
	try {
		const buffer = await file.arrayBuffer();
		renderBuffer(buffer, file.name.replace(/\.ply$/i, ''), file.name);
	} catch (err) {
		setError('Couldn’t read that file', err.message);
	}
}

function loadSample() {
	setLoading('Building sample cloud…', 'Synthetic interior · monochrome');
	const v = ensureViewer();
	const { positions, colors, count } = sampleRoomCloud();
	v.setGeometryFromArrays(positions, colors);
	setLive(`Synthetic interior · ${fmt(count)} points`);
	setDownload(null);
	$('#pc-size').disabled = false;
}

// ── reconstruction job (real backend) ─────────────────────────────────────────
function stopPolling() {
	if (pollTimer) { clearTimeout(pollTimer); pollTimer = null; }
	if (elapsedTimer) { clearInterval(elapsedTimer); elapsedTimer = null; }
}

function processingCopy(seconds, eta) {
	// Honest, changing stage hints keyed to elapsed time — no fake progress bar.
	const stage = seconds < 8 ? 'Sampling frames and warming the model…'
		: seconds < 25 ? 'Streaming geometry — grounding coordinates and correcting drift…'
		: 'Fusing world points into a dense cloud…';
	const etaTxt = eta ? ` · ~${eta}s typical` : '';
	setLoading(`Reconstructing · ${seconds}s`, `${stage}${etaTxt}`);
}

async function startCapture() {
	const url = $('#pc-url').value.trim();
	if (!url) { $('#pc-url').focus(); return; }

	stopPolling();
	$('#pc-run').disabled = true;
	setDownload(null);
	$('#pc-size').disabled = true;
	setLoading('Submitting…', 'Validating the video URL.');

	const params = {
		video_url: url,
		mode: $('#pc-mode').value,
		fps: Number($('#pc-fps').value) || 8,
		keyframe_interval: Number($('#pc-kf').value) || 4,
		mask_sky: $('#pc-sky').checked,
	};

	let started;
	try {
		const res = await fetch('/api/scene-capture', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify(params),
		});
		started = await res.json().catch(() => ({}));
		if (res.status === 503) {
			setError('Scene capture isn’t live here', `${started.message || 'The reconstruction worker is not configured on this deployment.'} You can still load a .ply by URL or upload, or try the sample.`);
			$('#pc-run').disabled = false;
			return;
		}
		if (!res.ok) throw new Error(started.message || `HTTP ${res.status}`);
	} catch (err) {
		setError('Couldn’t start reconstruction', err.message);
		$('#pc-run').disabled = false;
		return;
	}

	const jobId = started.job_id;
	const eta = started.eta_seconds || 0;
	const t0 = Date.now();
	processingCopy(0, eta);
	elapsedTimer = setInterval(() => {
		processingCopy(Math.round((Date.now() - t0) / 1000), eta);
	}, 1000);

	const poll = async () => {
		let data;
		try {
			const res = await fetch(`/api/scene-capture?job=${encodeURIComponent(jobId)}`);
			data = await res.json().catch(() => ({}));
		} catch {
			pollTimer = setTimeout(poll, 3000);
			return;
		}
		if (data.status === 'done' && data.result_url) {
			stopPolling();
			$('#pc-run').disabled = false;
			const label = data.frames ? `Captured · ${fmt(data.frames)} frames` : 'Captured scene';
			await loadFromUrl(data.result_url, label);
			return;
		}
		if (data.status === 'failed') {
			stopPolling();
			$('#pc-run').disabled = false;
			setError('Reconstruction failed', data.error || 'The worker reported a failure. Try a shorter or steadier clip.');
			return;
		}
		pollTimer = setTimeout(poll, 3000);
	};
	pollTimer = setTimeout(poll, 3000);
}

// ── wiring ────────────────────────────────────────────────────────────────────
function init() {
	if (!STAGE()) return;

	$('#pc-run').addEventListener('click', startCapture);
	$('#pc-url').addEventListener('keydown', (e) => { if (e.key === 'Enter') startCapture(); });

	$('#pc-load-url').addEventListener('click', () => {
		const u = $('#pc-ply-url').value.trim();
		if (u) loadFromUrl(u);
	});
	$('#pc-ply-url').addEventListener('keydown', (e) => {
		if (e.key === 'Enter') { const u = e.target.value.trim(); if (u) loadFromUrl(u); }
	});

	$('#pc-pick').addEventListener('click', () => $('#pc-file').click());
	$('#pc-idle').addEventListener('click', () => $('#pc-file').click());
	$('#pc-file').addEventListener('change', (e) => {
		const file = e.target.files?.[0];
		if (file) loadFromFile(file);
		e.target.value = '';
	});

	$('#pc-sample').addEventListener('click', loadSample);
	$('#pc-error-retry').addEventListener('click', loadSample);
	$('#pc-recenter').addEventListener('click', () => viewer?.recenter());
	$('#pc-size').addEventListener('input', (e) => viewer?.setPointScale(Number(e.target.value)));

	// Drag & drop a .ply onto the stage.
	const stage = STAGE();
	['dragenter', 'dragover'].forEach((ev) => stage.addEventListener(ev, (e) => {
		e.preventDefault(); stage.classList.add('is-dragover');
	}));
	stage.addEventListener('dragleave', (e) => { if (e.target === stage) stage.classList.remove('is-dragover'); });
	stage.addEventListener('drop', (e) => {
		e.preventDefault(); stage.classList.remove('is-dragover');
		const file = e.dataTransfer?.files?.[0];
		if (file) loadFromFile(file);
	});

	// Deep links: ?src=<ply-url> renders directly; ?video=<url> pre-fills capture.
	const p = new URLSearchParams(location.search);
	if (p.get('src')) { $('#pc-ply-url').value = p.get('src'); loadFromUrl(p.get('src'), p.get('name') || undefined); }
	if (p.get('video')) $('#pc-url').value = p.get('video');

	window.addEventListener('beforeunload', () => { stopPolling(); setDownload(null); viewer?.dispose(); });
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
else init();

// Forge — text / image / multi-view → 3D generator (browser client).
import { skeletonHTML, errorStateHTML, ensureStateKitStyles } from './shared/state-kit.js';
import { showSharePanel } from './shared/share.js';
ensureStateKitStyles();
//
// Drives /api/forge. Two paths share one polling loop:
//   • Text → 3D — POST a prompt; FLUX paints a reference image, then TRELLIS
//     reconstructs the mesh.
//   • Image / multi-view → 3D — the user adds 1–4 photos of one object from
//     different angles. Each photo is uploaded straight to object storage via a
//     presigned URL (/api/forge-upload), then their public URLs are POSTed as
//     image_urls. With >1 view the backend fuses them (multi-view conditioning)
//     and reports how many views it used + which backend handled it.
//
// State transitions are driven by real API responses; the only timer is the
// honest elapsed counter. Nothing fakes progress.

const POLL_INTERVAL_MS = 2500;
const MAX_POLL_MS = 5 * 60 * 1000; // generous ceiling for reconstruction
const MAX_VIEWS = 4;
const VIEW_LABELS = ['Front', 'Back', 'Left', 'Right'];
const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;
const ACCEPTED_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);

const els = {
	form: document.getElementById('composer'),
	prompt: document.getElementById('prompt'),
	aspect: document.getElementById('aspect'),
	generate: document.getElementById('generate'),
	generateLabel: document.getElementById('generate-label'),
	examples: document.getElementById('examples'),
	stage: document.getElementById('stage'),
	modeSwitch: document.getElementById('mode-switch'),
	textPane: document.getElementById('text-pane'),
	imagePane: document.getElementById('image-pane'),
	viewsGrid: document.getElementById('views-grid'),
	fileInput: document.getElementById('view-file-input'),
	imagePrompt: document.getElementById('image-prompt'),
	states: {
		empty: document.getElementById('state-empty'),
		generating: document.getElementById('state-generating'),
		result: document.getElementById('state-result'),
		error: document.getElementById('state-error'),
		unconfigured: document.getElementById('state-unconfigured'),
	},
	genPreview: document.getElementById('gen-preview'),
	genMeta: document.getElementById('gen-meta'),
	steps: {
		image: document.getElementById('step-image'),
		mesh: document.getElementById('step-mesh'),
		finish: document.getElementById('step-finish'),
	},
	cancel: document.getElementById('cancel'),
	viewer: document.getElementById('viewer'),
	resultLabel: document.getElementById('result-label'),
	resultViews: document.getElementById('result-views'),
	verdict: document.getElementById('verdict'),
	download: document.getElementById('download'),
	again: document.getElementById('again'),
	retry: document.getElementById('retry'),
	errorMessage: document.getElementById('error-message'),
	forgeShareBtn: document.getElementById('forge-share-btn'),
	segmentBtn: document.getElementById('forge-segment-btn'),
	creations: document.getElementById('creations'),
	creationsGrid: document.getElementById('creations-grid'),
	creationsCount: document.getElementById('creations-count'),
};

let aspectRatio = '1:1';
let elapsedTimer = null;
let pollAbort = false;
let mode = 'text'; // 'text' | 'image'
let lastJob = null; // { prompt, imageUrls } — for retry
let currentCreationId = null;

// One entry per reference-view slot. `state` drives the slot's rendered region;
// `url` is the durable public URL (what we send); `objectUrl` is the local
// preview blob, revoked when the slot is cleared.
const slots = VIEW_LABELS.map(() => ({
	state: 'empty',
	url: null,
	objectUrl: null,
	errorMsg: '',
}));

// File picker target: the slot index the picker was opened for, or null to fill
// from the first free slot.
let pickerTarget = null;

// Stable anonymous handle for this browser. /forge has no login, so durable
// creations + the gallery are scoped to this id (hashed server-side). Sent on
// every request via the x-forge-client header.
const CLIENT_ID = (() => {
	const KEY = 'forge:cid';
	try {
		let id = localStorage.getItem(KEY);
		if (!id) {
			id =
				crypto?.randomUUID?.() ||
				`c-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
			localStorage.setItem(KEY, id);
		}
		return id;
	} catch {
		// Private mode / storage blocked — fall back to an ephemeral per-load id.
		return `c-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
	}
})();

const CLIENT_HEADERS = { 'x-forge-client': CLIENT_ID };

function showState(name) {
	for (const [key, node] of Object.entries(els.states)) {
		node.classList.toggle('is-hidden', key !== name);
	}
}

function setStep(step, state) {
	if (els.steps[step]) els.steps[step].dataset.state = state;
}

function setStepLabel(step, text) {
	const node = els.steps[step]?.querySelector('span:last-child');
	if (node) node.textContent = text;
}

function startElapsed() {
	const started = performance.now();
	stopElapsed();
	const tick = () => {
		const s = Math.floor((performance.now() - started) / 1000);
		els.genMeta.textContent = `Elapsed ${s}s`;
	};
	tick();
	elapsedTimer = window.setInterval(tick, 1000);
}

function stopElapsed() {
	if (elapsedTimer) {
		window.clearInterval(elapsedTimer);
		elapsedTimer = null;
	}
}

function setBusy(busy) {
	els.generate.disabled = busy;
	els.generateLabel.textContent = busy ? 'Forging…' : 'Generate';
}

function sleep(ms) {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

// Mode switching --------------------------------------------------------------

function setMode(next) {
	if (next !== 'text' && next !== 'image') return;
	mode = next;
	els.textPane.classList.toggle('is-hidden', mode !== 'text');
	els.imagePane.classList.toggle('is-hidden', mode !== 'image');
	// Aspect ratio only shapes the synthesized reference image — irrelevant when
	// the user supplies their own photos.
	els.aspect.classList.toggle('is-hidden', mode !== 'text');
	els.examples.classList.toggle('is-hidden', mode !== 'text');
	for (const b of els.modeSwitch.querySelectorAll('button')) {
		b.setAttribute('aria-selected', String(b.dataset.mode === mode));
	}
	if (mode === 'text') els.prompt.focus();
}

// View slots ------------------------------------------------------------------

function buildSlots() {
	els.viewsGrid.innerHTML = '';
	slots.forEach((_, i) => {
		const slot = document.createElement('div');
		slot.className = 'view-slot';
		slot.dataset.index = String(i);
		slot.tabIndex = 0;
		slot.setAttribute('role', 'button');

		slot.innerHTML = `
			<div class="vs-empty">
				<span class="vs-icon" aria-hidden="true">＋</span>
				<span class="vs-label">${VIEW_LABELS[i]}</span>
			</div>
			<div class="vs-uploading">
				<div class="shimmer" aria-hidden="true"></div>
				<span>Uploading…</span>
			</div>
			<img class="vs-thumb" alt="" />
			<span class="vs-badge">${VIEW_LABELS[i]}</span>
			<button type="button" class="vs-remove" aria-label="Remove ${VIEW_LABELS[i]} view">×</button>
			<div class="vs-error">
				<span class="vs-error-msg">Upload failed</span>
				<button type="button" class="vs-retry">Retry</button>
			</div>`;

		// Remove (stop click from also re-opening the picker).
		slot.querySelector('.vs-remove').addEventListener('click', (e) => {
			e.stopPropagation();
			clearSlot(i);
		});
		// Retry re-opens the picker for this slot.
		slot.querySelector('.vs-retry').addEventListener('click', (e) => {
			e.stopPropagation();
			openPicker(i);
		});

		// Click empty/error → browse for this slot.
		slot.addEventListener('click', () => {
			if (slots[i].state === 'empty' || slots[i].state === 'error') openPicker(i);
		});
		slot.addEventListener('keydown', (e) => {
			if (e.key === 'Enter' || e.key === ' ') {
				e.preventDefault();
				if (slots[i].state === 'empty' || slots[i].state === 'error') openPicker(i);
			}
		});

		// Drag to reorder (uploaded slots only).
		slot.addEventListener('dragstart', (e) => {
			if (slots[i].state !== 'uploaded') {
				e.preventDefault();
				return;
			}
			e.dataTransfer.setData('application/x-forge-slot', String(i));
			e.dataTransfer.effectAllowed = 'move';
			slot.classList.add('dragging');
		});
		slot.addEventListener('dragend', () => slot.classList.remove('dragging'));

		// Drop target — accepts files OR a dragged thumbnail (reorder).
		slot.addEventListener('dragover', (e) => {
			e.preventDefault();
			e.dataTransfer.dropEffect = e.dataTransfer.types.includes('application/x-forge-slot')
				? 'move'
				: 'copy';
			slot.classList.add('drop-target');
		});
		slot.addEventListener('dragleave', () => slot.classList.remove('drop-target'));
		slot.addEventListener('drop', (e) => {
			e.preventDefault();
			slot.classList.remove('drop-target');
			const from = e.dataTransfer.getData('application/x-forge-slot');
			if (from !== '') {
				swapSlots(Number(from), i);
			} else if (e.dataTransfer.files?.length) {
				handleFiles(i, e.dataTransfer.files);
			}
		});

		els.viewsGrid.appendChild(slot);
		renderSlot(i);
	});
}

function slotEl(i) {
	return els.viewsGrid.querySelector(`.view-slot[data-index="${i}"]`);
}

function renderSlot(i) {
	const el = slotEl(i);
	if (!el) return;
	const s = slots[i];
	el.dataset.state = s.state;
	el.draggable = s.state === 'uploaded';

	const img = el.querySelector('.vs-thumb');
	if (s.objectUrl) {
		img.src = s.objectUrl;
		img.alt = `${VIEW_LABELS[i]} view`;
	} else {
		img.removeAttribute('src');
		img.alt = '';
	}
	el.querySelector('.vs-error-msg').textContent = s.errorMsg || 'Upload failed';

	const labels = {
		empty: `${VIEW_LABELS[i]} view, empty — add a photo`,
		uploading: `${VIEW_LABELS[i]} view, uploading`,
		uploaded: `${VIEW_LABELS[i]} view, uploaded — drag to reorder`,
		error: `${VIEW_LABELS[i]} view, upload failed`,
	};
	el.setAttribute('aria-label', labels[s.state] || VIEW_LABELS[i]);
}

function clearSlot(i) {
	const s = slots[i];
	if (s.objectUrl) URL.revokeObjectURL(s.objectUrl);
	slots[i] = { state: 'empty', url: null, objectUrl: null, errorMsg: '' };
	renderSlot(i);
}

function swapSlots(a, b) {
	if (a === b) return;
	const tmp = slots[a];
	slots[a] = slots[b];
	slots[b] = tmp;
	renderSlot(a);
	renderSlot(b);
}

function firstFreeSlot() {
	return slots.findIndex((s) => s.state === 'empty' || s.state === 'error');
}

function nextFreeAfter(i) {
	for (let j = i + 1; j < MAX_VIEWS; j++) {
		if (slots[j].state === 'empty' || slots[j].state === 'error') return j;
	}
	return -1;
}

function openPicker(index) {
	pickerTarget = index;
	els.fileInput.value = '';
	els.fileInput.click();
}

// Distribute dropped/picked files into slots, starting at `startIndex` (or the
// first free slot when null), filling free slots up to MAX_VIEWS.
function handleFiles(startIndex, fileList) {
	const files = Array.from(fileList).filter((f) => f && f.type && f.type.startsWith('image/'));
	if (!files.length) return;
	let idx = startIndex == null ? firstFreeSlot() : startIndex;
	for (const file of files) {
		if (idx < 0 || idx >= MAX_VIEWS) idx = firstFreeSlot();
		if (idx < 0) break; // all slots taken
		uploadToSlot(idx, file);
		idx = nextFreeAfter(idx);
	}
}

// Upload one file into a slot: presign → PUT to object storage → record the
// public URL. The slot moves empty/error → uploading → uploaded|error, each a
// real, designed state. The local blob preview shows immediately.
async function uploadToSlot(index, file) {
	if (!ACCEPTED_TYPES.has(file.type)) {
		setSlotError(index, 'Use PNG, JPG, or WebP.');
		return;
	}
	if (file.size > MAX_UPLOAD_BYTES) {
		setSlotError(index, 'Too large (max 8 MB).');
		return;
	}

	const prev = slots[index];
	if (prev.objectUrl) URL.revokeObjectURL(prev.objectUrl);
	const objectUrl = URL.createObjectURL(file);
	slots[index] = { state: 'uploading', url: null, objectUrl, errorMsg: '' };
	renderSlot(index);

	try {
		const presignRes = await fetch('/api/forge-upload', {
			method: 'POST',
			headers: { 'content-type': 'application/json', ...CLIENT_HEADERS },
			body: JSON.stringify({ content_type: file.type, size_bytes: file.size }),
		});
		const presign = await presignRes.json().catch(() => ({}));
		if (presignRes.status === 503) {
			setSlotError(index, 'Uploads unavailable — paste a URL.');
			return;
		}
		if (presignRes.status === 429) {
			setSlotError(index, 'Rate limited — retry shortly.');
			return;
		}
		if (!presignRes.ok || !presign.upload_url || !presign.public_url) {
			setSlotError(index, presign.message || 'Upload failed.');
			return;
		}

		const putRes = await fetch(presign.upload_url, {
			method: 'PUT',
			headers: { 'content-type': file.type },
			body: file,
		});
		if (!putRes.ok) {
			setSlotError(index, `Storage rejected the file (${putRes.status}).`);
			return;
		}

		// Success — keep the local blob preview, remember the public URL.
		slots[index] = { state: 'uploaded', url: presign.public_url, objectUrl, errorMsg: '' };
		renderSlot(index);
	} catch {
		setSlotError(index, 'Network error during upload.');
	}
}

function setSlotError(index, message) {
	const s = slots[index];
	// Keep any local preview so the user sees what failed.
	slots[index] = {
		state: 'error',
		url: null,
		objectUrl: s.objectUrl || null,
		errorMsg: message,
	};
	renderSlot(index);
}

function uploadedUrls() {
	return slots.filter((s) => s.state === 'uploaded' && s.url).map((s) => s.url);
}

function firstPreviewUrl() {
	const s = slots.find((x) => x.state === 'uploaded' && (x.objectUrl || x.url));
	return s ? s.objectUrl || s.url : null;
}

// Job submission --------------------------------------------------------------

async function startJob({ prompt, imageUrls }) {
	const body =
		Array.isArray(imageUrls) && imageUrls.length
			? { image_urls: imageUrls, prompt: prompt || undefined }
			: { prompt, aspect_ratio: aspectRatio };

	const res = await fetch('/api/forge', {
		method: 'POST',
		headers: { 'content-type': 'application/json', ...CLIENT_HEADERS },
		body: JSON.stringify(body),
	});
	const data = await res.json().catch(() => ({}));
	if (res.status === 503 || data.error === 'unconfigured') {
		const e = new Error(data.message || 'unconfigured');
		e.kind = 'unconfigured';
		throw e;
	}
	if (res.status === 429 || data.error === 'rate_limited') {
		const secs = Number(data.retry_after) > 0 ? Math.ceil(Number(data.retry_after)) : 10;
		const e = new Error(
			data.message || `The 3D generator is busy. Try again in about ${secs} seconds.`,
		);
		e.kind = 'rate_limited';
		throw e;
	}
	if (!res.ok) {
		throw new Error(data.message || `The generator returned ${res.status}.`);
	}
	return data;
}

async function pollUntilDone(jobId) {
	const deadline = performance.now() + MAX_POLL_MS;
	while (!pollAbort && performance.now() < deadline) {
		await sleep(POLL_INTERVAL_MS);
		if (pollAbort) return null;
		const res = await fetch(`/api/forge?job=${encodeURIComponent(jobId)}`, {
			headers: CLIENT_HEADERS,
		});
		const data = await res.json().catch(() => ({}));
		if (data.error === 'unconfigured') {
			const e = new Error(data.message || 'unconfigured');
			e.kind = 'unconfigured';
			throw e;
		}
		if (data.status === 'done' && data.glb_url) return data;
		if (data.status === 'failed') throw new Error(data.error || 'Generation failed.');
		if (data.status === 'running') setStep('mesh', 'active');
	}
	if (pollAbort) return null;
	throw new Error(
		'Generation timed out. The model may be too complex — try fewer views or a simpler prompt.',
	);
}

// Post the human verdict on a creation — the labeled half of the data flywheel.
function sendFeedback(payload) {
	if (!currentCreationId) return;
	fetch('/api/forge-feedback', {
		method: 'POST',
		headers: { 'content-type': 'application/json', ...CLIENT_HEADERS },
		body: JSON.stringify({ creation_id: currentCreationId, ...payload }),
		keepalive: true,
	}).catch(() => {});
}

function resetVerdict() {
	if (!els.verdict) return;
	for (const b of els.verdict.querySelectorAll('button')) {
		b.setAttribute('aria-pressed', 'false');
	}
}

// Render the small "N views · backend" badge from job metadata.
function setViewsBadge(meta) {
	if (!els.resultViews) return;
	const used = Number(meta?.views_used);
	if (!Number.isFinite(used) || used < 1) {
		els.resultViews.classList.add('is-hidden');
		els.resultViews.textContent = '';
		return;
	}
	const parts = [`${used} ${used === 1 ? 'view' : 'views'}`];
	if (meta.multiview) parts.push('multi-view');
	if (meta.backend) parts.push(meta.backend);
	els.resultViews.textContent = parts.join(' · ');
	els.resultViews.classList.remove('is-hidden');
}

function showResult(glbUrl, label, meta) {
	stopElapsed();
	resetVerdict();
	els.viewer.setAttribute('src', glbUrl);
	els.viewer.setAttribute('alt', `3D model: ${label}`);
	els.resultLabel.textContent = label;
	setViewsBadge(meta);
	els.download.href = glbUrl;
	els.download.setAttribute(
		'download',
		`${label.replace(/[^a-z0-9]+/gi, '-').slice(0, 48).replace(/^-|-$/g, '') || 'forge'}.glb`,
	);
	// Cross-link into Parts Studio with this exact model pre-loaded.
	if (els.segmentBtn) els.segmentBtn.href = `/segment?mesh=${encodeURIComponent(glbUrl)}`;
	showState('result');
	// Hand the live model to the Stylize panel (src/forge-stylize.js) so its
	// one-click geometric filters operate on the current source mesh.
	document.dispatchEvent(
		new CustomEvent('forge:model-ready', { detail: { glbUrl, label } }),
	);
	document.dispatchEvent(new CustomEvent('tws:feature-done', { detail: { feature: 'forge' } }));
	if (els.forgeShareBtn) {
		els.forgeShareBtn.dataset.sharePrompt = label;
	}
}

// Load (or reload) the "Your creations" strip from durable storage.
async function loadGallery() {
	if (!els.creations) return;

	els.creations.classList.remove('is-hidden');
	els.creationsGrid.setAttribute('aria-busy', 'true');
	els.creationsGrid.innerHTML = skeletonHTML(4, 'card');

	let data;
	try {
		const res = await fetch('/api/forge-gallery?limit=24', { headers: CLIENT_HEADERS });
		data = await res.json().catch(() => ({}));
	} catch {
		els.creationsGrid.removeAttribute('aria-busy');
		els.creationsGrid.innerHTML = errorStateHTML({
			title: "Couldn't load your creations",
			body: 'Check your connection — your models are still saved.',
		});
		els.creationsGrid.querySelector('[data-sk-retry]')?.addEventListener('click', loadGallery);
		return;
	}

	els.creationsGrid.removeAttribute('aria-busy');
	const creations = Array.isArray(data?.creations) ? data.creations : [];
	if (!data?.enabled || creations.length === 0) {
		els.creations.classList.add('is-hidden');
		return;
	}
	els.creationsGrid.innerHTML = '';
	for (const c of creations) {
		const card = document.createElement('button');
		card.type = 'button';
		card.className = 'creation';
		card.title = c.prompt || 'Forged model';
		card.setAttribute('aria-label', `Open: ${c.prompt || 'forged model'}`);
		if (c.id) card.dataset.creationId = c.id;

		if (c.preview_image_url) {
			const img = document.createElement('img');
			img.className = 'thumb';
			img.loading = 'lazy';
			img.alt = '';
			img.src = c.preview_image_url;
			card.appendChild(img);
		} else {
			const ph = document.createElement('span');
			ph.className = 'thumb placeholder';
			ph.textContent = '◳';
			card.appendChild(ph);
		}

		if (c.outcome === 'accepted' || c.outcome === 'rejected') {
			const badge = document.createElement('span');
			badge.className = 'badge';
			badge.dataset.outcome = c.outcome;
			badge.textContent = c.outcome === 'accepted' ? '👍' : '👎';
			card.appendChild(badge);
		}

		// Surface multi-view provenance so the gallery reflects how each model
		// was conditioned.
		if (Number(c.views_used) > 1) {
			const mv = document.createElement('span');
			mv.className = 'badge';
			mv.style.left = '6px';
			mv.style.right = 'auto';
			mv.textContent = `${c.views_used}×`;
			mv.title = `${c.views_used} reference views`;
			card.appendChild(mv);
		}

		const meta = document.createElement('span');
		meta.className = 'meta';
		meta.textContent = c.prompt || 'Untitled';
		card.appendChild(meta);

		card.addEventListener('click', () => {
			currentCreationId = c.id;
			lastJob = { prompt: c.prompt || '', imageUrls: [] };
			showResult(c.glb_url, c.prompt || 'Forged model', {
				views_used: c.views_used,
				multiview: c.multiview,
				backend: c.backend,
			});
			if (els.verdict) {
				for (const b of els.verdict.querySelectorAll('button')) {
					b.setAttribute('aria-pressed', String(b.dataset.outcome === c.outcome));
				}
			}
			els.stage.scrollIntoView({ behavior: 'smooth', block: 'start' });
		});

		els.creationsGrid.appendChild(card);
	}
	els.creationsCount.textContent = `${creations.length} saved`;
	els.creations.classList.remove('is-hidden');
}

function showError(message) {
	stopElapsed();
	els.errorMessage.textContent = message;
	showState('error');
}

// Run a job (text or image/multi-view). `cfg` = { prompt, imageUrls }.
async function run(cfg) {
	lastJob = cfg;
	pollAbort = false;
	currentCreationId = null;
	setBusy(true);

	const isImage = Array.isArray(cfg.imageUrls) && cfg.imageUrls.length > 0;

	// Reset the generating panel to its real starting state for this mode.
	if (isImage) {
		const n = cfg.imageUrls.length;
		setStepLabel('image', `Conditioning on ${n} ${n === 1 ? 'view' : 'views'}`);
		setStep('image', 'done');
		setStep('mesh', 'active');
		const preview = firstPreviewUrl();
		els.genPreview.innerHTML = preview ? '' : '<div class="shimmer" aria-hidden="true"></div>';
		if (preview) {
			const img = new Image();
			img.alt = 'Reference view';
			img.src = preview;
			els.genPreview.appendChild(img);
		}
	} else {
		setStepLabel('image', 'Painting reference image');
		els.genPreview.innerHTML = '<div class="shimmer" aria-hidden="true"></div>';
		setStep('image', 'active');
		setStep('mesh', 'pending');
	}
	setStep('finish', 'pending');
	startElapsed();
	showState('generating');

	const label = cfg.prompt || (isImage ? 'Multi-view reconstruction' : '');

	try {
		const job = await startJob(cfg);
		if (job.creation_id) currentCreationId = job.creation_id;

		// Text→3D: the reference image resolved before the POST returned — show it.
		if (!isImage && job.preview_image_url) {
			setStep('image', 'done');
			setStep('mesh', 'active');
			const img = new Image();
			img.alt = 'Reference image';
			img.src = job.preview_image_url;
			img.onload = () => {
				els.genPreview.innerHTML = '';
				els.genPreview.appendChild(img);
			};
		}

		const done = await pollUntilDone(job.job_id);
		if (pollAbort || !done) return; // cancelled

		if (done.creation_id) currentCreationId = done.creation_id;
		setStep('mesh', 'done');
		setStep('finish', 'done');
		// Prefer the poll's recorded meta; fall back to the submit response.
		showResult(done.glb_url, label || 'Forged model', {
			views_used: done.views_used ?? job.views_used,
			multiview: done.multiview ?? job.multiview,
			backend: done.backend ?? job.backend,
		});
		loadGallery();
	} catch (err) {
		if (pollAbort) return;
		if (err.kind === 'unconfigured') {
			stopElapsed();
			showState('unconfigured');
			return;
		}
		showError(
			err.message ||
				'Something went wrong. Try a simpler, single-subject prompt or cleaner photos.',
		);
	} finally {
		setBusy(false);
	}
}

function submit() {
	if (mode === 'text') {
		const prompt = els.prompt.value.trim();
		if (prompt.length < 3) {
			els.prompt.focus();
			return;
		}
		run({ prompt, imageUrls: [] });
		return;
	}

	// Image / multi-view mode.
	if (slots.some((s) => s.state === 'uploading')) {
		els.generateLabel.textContent = 'Waiting for uploads…';
		setTimeout(() => {
			if (!els.generate.disabled) els.generateLabel.textContent = 'Generate';
		}, 1600);
		return;
	}
	const urls = uploadedUrls();
	if (urls.length === 0) {
		const first = slotEl(0);
		first?.focus();
		first?.classList.add('drop-target');
		setTimeout(() => first?.classList.remove('drop-target'), 600);
		return;
	}
	run({ prompt: els.imagePrompt.value.trim(), imageUrls: urls });
}

// Wiring ----------------------------------------------------------------------

buildSlots();

els.modeSwitch.addEventListener('click', (e) => {
	const btn = e.target.closest('button[data-mode]');
	if (btn) setMode(btn.dataset.mode);
});

els.fileInput.addEventListener('change', () => {
	handleFiles(pickerTarget, els.fileInput.files);
	pickerTarget = null;
	els.fileInput.value = '';
});

els.form.addEventListener('submit', (e) => {
	e.preventDefault();
	submit();
});

// Cmd/Ctrl+Enter submits from either text box.
function submitOnModifierEnter(e) {
	if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
		e.preventDefault();
		submit();
	}
}
els.prompt.addEventListener('keydown', submitOnModifierEnter);
els.imagePrompt.addEventListener('keydown', submitOnModifierEnter);

els.aspect.addEventListener('click', (e) => {
	const btn = e.target.closest('button[data-aspect]');
	if (!btn) return;
	aspectRatio = btn.dataset.aspect;
	for (const b of els.aspect.querySelectorAll('button')) {
		b.setAttribute('aria-pressed', String(b === btn));
	}
});

els.examples.addEventListener('click', (e) => {
	const chip = e.target.closest('.chip');
	if (!chip) return;
	setMode('text');
	els.prompt.value = chip.textContent.trim();
	els.prompt.focus();
	submit();
});

els.cancel.addEventListener('click', () => {
	pollAbort = true;
	stopElapsed();
	setBusy(false);
	showState('empty');
});

els.again.addEventListener('click', () => {
	showState('empty');
	if (mode === 'text') {
		els.prompt.focus();
		els.prompt.select();
	} else {
		slotEl(0)?.focus();
	}
});

els.retry.addEventListener('click', () => {
	if (lastJob && (lastJob.prompt || (lastJob.imageUrls && lastJob.imageUrls.length))) {
		run(lastJob);
	} else {
		showState('empty');
		els.prompt.focus();
	}
});

if (els.verdict) {
	els.verdict.addEventListener('click', (e) => {
		const btn = e.target.closest('button[data-outcome]');
		if (!btn || !currentCreationId) return;
		const outcome = btn.dataset.outcome;
		for (const b of els.verdict.querySelectorAll('button')) {
			b.setAttribute('aria-pressed', String(b === btn));
		}
		sendFeedback({ outcome });
	});
}

els.download.addEventListener('click', () => {
	sendFeedback({ downloaded: true });
});

if (els.forgeShareBtn) {
	els.forgeShareBtn.addEventListener('click', () => {
		const origin = location.origin;
		const prompt = els.forgeShareBtn.dataset.sharePrompt || lastJob?.prompt || '';
		const id = currentCreationId;
		const shareUrl = id ? `${origin}/forge/share/${id}` : `${origin}/forge`;
		const remixUrl = prompt
			? `${origin}/forge?prompt=${encodeURIComponent(prompt)}`
			: `${origin}/forge`;
		showSharePanel(
			{
				kind: 'forge',
				id: id || '',
				title: prompt || 'Forged creation',
				description: 'A 3D model generated with text / image → 3D on three.ws',
				shareUrl,
				remixUrl,
			},
			els.forgeShareBtn,
		);
	});
}

// Handle ?prompt= (pre-fill from a remix link) and ?share= (open a creation).
(function handleQueryParams() {
	const params = new URLSearchParams(location.search);
	const promptParam = params.get('prompt');
	const shareParam = params.get('share');
	if (promptParam && els.prompt) {
		setMode('text');
		els.prompt.value = decodeURIComponent(promptParam).slice(0, 300);
		els.prompt.focus();
	}
	if (shareParam) {
		window.__forgeShareId = shareParam;
	}
})();

// Surface any previously forged models for this browser on load.
loadGallery().then(() => {
	const shareId = window.__forgeShareId;
	if (!shareId) return;
	const card = els.creationsGrid?.querySelector(`[data-creation-id="${shareId}"]`);
	if (card) {
		card.click();
		card.scrollIntoView({ behavior: 'smooth', block: 'center' });
	}
});

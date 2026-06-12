// Mini Forge — homepage slice of /forge (text → 3D, real pipeline).
//
// Drives the same /api/forge endpoint as the full page, pinned to the draft
// tier so the server resolves its free lane (NVIDIA-hosted TRELLIS today):
// seconds-fast, no vendor spend per visitor, and a far higher rate ceiling
// than the paid bucket — the right trade for a homepage teaser. That lane
// completes synchronously (the POST returns the finished GLB, job_id null);
// the async job_id + poll path is kept for when the server routes elsewhere.
// The only timer is the honest elapsed counter — progress states come from
// real API responses.
//
// Creations are scoped to the same x-forge-client id as /forge (shared
// localStorage key), so anything forged here appears in the full page's
// "Your creations" gallery.

const POLL_INTERVAL_MS = 2500;
const MAX_POLL_MS = 5 * 60 * 1000;
const MODEL_VIEWER_SRC =
	'https://ajax.googleapis.com/ajax/libs/model-viewer/4.0.0/model-viewer.min.js';

const root = document.getElementById('home-forge');

const els = root && {
	form: root.querySelector('[data-hf-form]'),
	prompt: root.querySelector('[data-hf-prompt]'),
	generate: root.querySelector('[data-hf-generate]'),
	generateLabel: root.querySelector('[data-hf-generate-label]'),
	chips: root.querySelector('[data-hf-chips]'),
	stage: root.querySelector('[data-hf-stage]'),
	states: {
		idle: root.querySelector('[data-hf-idle]'),
		generating: root.querySelector('[data-hf-generating]'),
		result: root.querySelector('[data-hf-result]'),
		error: root.querySelector('[data-hf-error]'),
	},
	preview: root.querySelector('[data-hf-preview]'),
	steps: {
		mesh: root.querySelector('[data-hf-step="mesh"]'),
		finish: root.querySelector('[data-hf-step="finish"]'),
	},
	elapsed: root.querySelector('[data-hf-elapsed]'),
	cancel: root.querySelector('[data-hf-cancel]'),
	resultMeta: root.querySelector('[data-hf-result-meta]'),
	download: root.querySelector('[data-hf-download]'),
	again: root.querySelector('[data-hf-again]'),
	errorMessage: root.querySelector('[data-hf-error-message]'),
	retry: root.querySelector('[data-hf-retry]'),
};

// Same anonymous handle as src/forge.js — keep the storage key in sync so the
// full page's gallery picks up models forged here.
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
		return `c-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
	}
})();

const CLIENT_HEADERS = { 'x-forge-client': CLIENT_ID };

let busy = false;
let pollAbort = false;
let elapsedTimer = null;
let lastPrompt = '';
let modelViewerReady = null;
// Monotonic run token: cancel-then-regenerate must not let the first run's
// poll loop wake up and fight the new one over the shared stage.
let runSeq = 0;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// model-viewer carries its own renderer (~700 KB) — fetch it only once a
// generation is actually running, so it's registered by the time the GLB lands.
function ensureModelViewer() {
	if (modelViewerReady) return modelViewerReady;
	modelViewerReady = customElements.get('model-viewer')
		? Promise.resolve()
		: new Promise((resolve, reject) => {
				const s = document.createElement('script');
				s.type = 'module';
				s.src = MODEL_VIEWER_SRC;
				s.crossOrigin = 'anonymous';
				s.onload = () => resolve();
				s.onerror = () => reject(new Error('Failed to load the 3D viewer.'));
				document.head.appendChild(s);
			});
	return modelViewerReady;
}

function showState(name) {
	for (const [key, node] of Object.entries(els.states)) {
		node.hidden = key !== name;
	}
}

function setStep(name, state) {
	els.steps[name].dataset.state = state;
}

function startElapsed() {
	const t0 = performance.now();
	stopElapsed();
	els.elapsed.textContent = 'Elapsed 0s';
	elapsedTimer = setInterval(() => {
		els.elapsed.textContent = `Elapsed ${Math.round((performance.now() - t0) / 1000)}s`;
	}, 1000);
}

function stopElapsed() {
	if (elapsedTimer) clearInterval(elapsedTimer);
	elapsedTimer = null;
}

function setBusy(b) {
	busy = b;
	els.generate.disabled = b;
	els.generateLabel.textContent = b ? 'Forging…' : 'Forge it';
}

function showError(message) {
	stopElapsed();
	els.errorMessage.textContent = message;
	showState('error');
}

async function startJob(prompt) {
	const res = await fetch('/api/forge', {
		method: 'POST',
		headers: { 'content-type': 'application/json', ...CLIENT_HEADERS },
		body: JSON.stringify({ prompt, aspect_ratio: '1:1', tier: 'draft' }),
	});
	const data = await res.json().catch(() => ({}));
	if (res.status === 503 || data.error === 'unconfigured') {
		throw new Error('The generator is offline right now — try again in a bit.');
	}
	if (res.status === 429 || data.error === 'rate_limited') {
		const secs = Number(data.retry_after) > 0 ? Math.ceil(Number(data.retry_after)) : 10;
		throw new Error(data.message || `The forge is busy. Try again in about ${secs} seconds.`);
	}
	if (!res.ok) throw new Error(data.message || `The generator returned ${res.status}.`);
	return data;
}

async function pollUntilDone(jobId, seq) {
	const deadline = performance.now() + MAX_POLL_MS;
	while (!pollAbort && seq === runSeq && performance.now() < deadline) {
		await sleep(POLL_INTERVAL_MS);
		if (pollAbort || seq !== runSeq) return null;
		const res = await fetch(`/api/forge?job=${encodeURIComponent(jobId)}`, {
			headers: CLIENT_HEADERS,
		});
		const data = await res.json().catch(() => ({}));
		if (data.status === 'done' && data.glb_url) return data;
		if (data.status === 'failed') throw new Error(data.error || 'Generation failed.');
		if (data.status === 'running') setStep('mesh', 'active');
	}
	if (pollAbort || seq !== runSeq) return null;
	throw new Error('Generation timed out — try a simpler, single-subject prompt.');
}

function showResult(glbUrl, prompt) {
	stopElapsed();
	const viewer = document.createElement('model-viewer');
	viewer.setAttribute('src', glbUrl);
	viewer.setAttribute('alt', `3D model: ${prompt}`);
	viewer.setAttribute('camera-controls', '');
	viewer.setAttribute('auto-rotate', '');
	viewer.setAttribute('auto-rotate-delay', '0');
	viewer.setAttribute('rotation-per-second', '18deg');
	viewer.setAttribute('shadow-intensity', '1');
	viewer.setAttribute('interaction-prompt', 'none');
	const slot = els.states.result.querySelector('[data-hf-viewer-slot]');
	slot.innerHTML = '';
	slot.appendChild(viewer);
	els.resultMeta.textContent = prompt;
	els.download.href = glbUrl;
	els.download.setAttribute(
		'download',
		`${prompt.replace(/[^a-z0-9]+/gi, '-').slice(0, 48).replace(/^-|-$/g, '') || 'forge'}.glb`,
	);
	showState('result');
	// Same signal the full page emits — the discovery layer turns it into a
	// "what's next?" card (embed it, drop it in a world, …).
	document.dispatchEvent(new CustomEvent('tws:feature-done', { detail: { feature: 'forge' } }));
}

async function run(prompt) {
	if (busy) return;
	lastPrompt = prompt;
	pollAbort = false;
	const seq = ++runSeq;
	setBusy(true);
	setStep('mesh', 'active');
	setStep('finish', 'pending');
	els.preview.innerHTML = '<div class="hf-shimmer" aria-hidden="true"></div>';
	startElapsed();
	showState('generating');
	// Fetch the viewer in parallel with the job — a failure surfaces only if a
	// model actually arrives.
	const viewerLoad = ensureModelViewer().catch((err) => err);

	try {
		const job = await startJob(prompt);
		if (seq !== runSeq) return; // cancelled while the POST was in flight

		if (job.preview_image_url) {
			const img = new Image();
			img.alt = 'Reference image';
			img.src = job.preview_image_url;
			img.onload = () => {
				els.preview.innerHTML = '';
				els.preview.appendChild(img);
			};
		}

		// Free draft lane: the POST itself returns the finished model (job_id
		// null) — polling would loop on invalid_job. Async lanes return a job_id.
		const done =
			job.status === 'done' && job.glb_url ? job : await pollUntilDone(job.job_id, seq);
		if (pollAbort || seq !== runSeq || !done) return; // cancelled
		setStep('mesh', 'done');
		setStep('finish', 'done');

		const viewerErr = await viewerLoad;
		if (viewerErr instanceof Error) throw viewerErr;
		showResult(done.glb_url, prompt);
	} catch (err) {
		if (!pollAbort && seq === runSeq) {
			showError(err.message || 'Something went wrong. Try a simpler prompt.');
		}
	} finally {
		if (seq === runSeq) setBusy(false);
	}
}

function reset() {
	pollAbort = true;
	stopElapsed();
	setBusy(false);
	showState('idle');
	els.prompt.focus();
}

function boot() {
	els.form.addEventListener('submit', (e) => {
		e.preventDefault();
		const prompt = els.prompt.value.trim();
		if (prompt) run(prompt);
		else els.prompt.focus();
	});

	// Cmd/Ctrl+Enter submits — same convention as the full page.
	els.prompt.addEventListener('keydown', (e) => {
		if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
			e.preventDefault();
			els.form.requestSubmit();
		}
	});

	els.chips.addEventListener('click', (e) => {
		const chip = e.target.closest('button[data-prompt]');
		if (!chip || busy) return;
		els.prompt.value = chip.dataset.prompt;
		run(chip.dataset.prompt);
	});

	els.cancel.addEventListener('click', reset);
	els.again.addEventListener('click', reset);
	els.retry.addEventListener('click', () => {
		if (lastPrompt) run(lastPrompt);
		else reset();
	});
}

if (root && els.form) boot();

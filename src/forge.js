// Forge — text → 3D generator (browser client).
//
// Drives /api/forge: POST a prompt to start a job, then poll GET /api/forge?job
// until it resolves to a GLB. State transitions are driven by real API
// responses — the reference image appears the moment the text-to-image pass
// returns, the "mesh" step lights up when the reconstruction job is actually
// running, and the result panel shows the real downloadable GLB. The only timer
// is the honest elapsed counter; nothing fakes progress.

const POLL_INTERVAL_MS = 2500;
const MAX_POLL_MS = 5 * 60 * 1000; // give the reconstruction a generous ceiling

const els = {
	form: document.getElementById('composer'),
	prompt: document.getElementById('prompt'),
	aspect: document.getElementById('aspect'),
	generate: document.getElementById('generate'),
	generateLabel: document.getElementById('generate-label'),
	examples: document.getElementById('examples'),
	stage: document.getElementById('stage'),
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
	download: document.getElementById('download'),
	again: document.getElementById('again'),
	retry: document.getElementById('retry'),
	errorMessage: document.getElementById('error-message'),
};

let aspectRatio = '1:1';
let elapsedTimer = null;
let pollAbort = false;
let lastPrompt = '';

function showState(name) {
	for (const [key, node] of Object.entries(els.states)) {
		node.classList.toggle('is-hidden', key !== name);
	}
}

function setStep(step, state) {
	if (els.steps[step]) els.steps[step].dataset.state = state;
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

async function startJob(prompt) {
	const res = await fetch('/api/forge', {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ prompt, aspect_ratio: aspectRatio }),
	});
	const data = await res.json().catch(() => ({}));
	if (res.status === 503 || data.error === 'unconfigured') {
		const e = new Error(data.message || 'unconfigured');
		e.kind = 'unconfigured';
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
		const res = await fetch(`/api/forge?job=${encodeURIComponent(jobId)}`);
		const data = await res.json().catch(() => ({}));
		if (data.error === 'unconfigured') {
			const e = new Error(data.message || 'unconfigured');
			e.kind = 'unconfigured';
			throw e;
		}
		if (data.status === 'done' && data.glb_url) return data.glb_url;
		if (data.status === 'failed') throw new Error(data.error || 'Generation failed.');
		if (data.status === 'running') setStep('mesh', 'active');
	}
	if (pollAbort) return null;
	throw new Error('Generation timed out. The model may be too complex — try a simpler prompt.');
}

function showResult(glbUrl, prompt) {
	stopElapsed();
	els.viewer.setAttribute('src', glbUrl);
	els.viewer.setAttribute('alt', `3D model: ${prompt}`);
	els.resultLabel.textContent = prompt;
	els.download.href = glbUrl;
	els.download.setAttribute(
		'download',
		`${prompt.replace(/[^a-z0-9]+/gi, '-').slice(0, 48).replace(/^-|-$/g, '') || 'forge'}.glb`,
	);
	showState('result');
}

function showError(message) {
	stopElapsed();
	els.errorMessage.textContent = message;
	showState('error');
}

async function run(prompt) {
	lastPrompt = prompt;
	pollAbort = false;
	setBusy(true);

	// Reset generating UI to its initial real state.
	els.genPreview.innerHTML = '<div class="shimmer" aria-hidden="true"></div>';
	setStep('image', 'active');
	setStep('mesh', 'pending');
	setStep('finish', 'pending');
	startElapsed();
	showState('generating');

	try {
		const job = await startJob(prompt);

		// Text-to-image really resolved before the POST returned: show it.
		if (job.preview_image_url) {
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

		const glbUrl = await pollUntilDone(job.job_id);
		if (pollAbort || !glbUrl) return; // cancelled

		setStep('mesh', 'done');
		setStep('finish', 'done');
		showResult(glbUrl, prompt);
	} catch (err) {
		if (pollAbort) return;
		if (err.kind === 'unconfigured') {
			stopElapsed();
			showState('unconfigured');
			return;
		}
		showError(err.message || 'Something went wrong. Try a simpler, single-subject prompt.');
	} finally {
		setBusy(false);
	}
}

function submit() {
	const prompt = els.prompt.value.trim();
	if (prompt.length < 3) {
		els.prompt.focus();
		return;
	}
	run(prompt);
}

// Wiring ----------------------------------------------------------------------

els.form.addEventListener('submit', (e) => {
	e.preventDefault();
	submit();
});

// Cmd/Ctrl+Enter submits from the textarea.
els.prompt.addEventListener('keydown', (e) => {
	if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
		e.preventDefault();
		submit();
	}
});

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
	els.prompt.focus();
	els.prompt.select();
	showState('empty');
});

els.retry.addEventListener('click', () => {
	if (lastPrompt) run(lastPrompt);
	else {
		showState('empty');
		els.prompt.focus();
	}
});

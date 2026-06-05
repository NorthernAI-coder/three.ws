/**
 * Prompt → 3D avatar controller for /create/prompt.
 *
 * Flow (reuses the same backend as the selfie pipeline):
 *   prompt text
 *     -> POST /api/avatars/reconstruct { name, prompt, visibility }
 *          (server turns the prompt into a frontal reference image via Flux,
 *           then runs the identical reconstruct -> auto-rig pipeline)
 *     -> poll /api/avatars/regenerate-status?jobId=...
 *     -> on { status:'done', resultAvatarId } -> fetch the avatar, preview it,
 *        and offer "Open in editor" / "Make another"
 *
 * Every state is designed: compose, building (with live status + elapsed),
 * done (with a real preview), and inline errors that tell the user what to do.
 */

import { log } from './shared/log.js';

const SUBMIT_ENDPOINT = '/api/avatars/reconstruct';
const STATUS_ENDPOINT = '/api/avatars/regenerate-status';
const POLL_INTERVAL_MS = 3000;
const POLL_TIMEOUT_MS = 8 * 60 * 1000;

const $ = (sel) => /** @type {HTMLElement} */ (document.querySelector(sel));

const promptEl = /** @type {HTMLTextAreaElement} */ ($('#prompt'));
const counterEl = $('#counter');
const generateBtn = /** @type {HTMLButtonElement} */ ($('#generate-btn'));
const composeError = $('#compose-error');
const buildError = $('#build-error');
const buildPrompt = $('#build-prompt');
const buildStatus = $('#build-status');
const progressFill = $('#progress-fill');
const elapsedEl = $('#elapsed');

let _submitting = false;
let _startedAt = 0;
let _elapsedTimer = 0;

function showStep(step) {
	for (const el of document.querySelectorAll('.step')) {
		el.classList.toggle('active', el.getAttribute('data-step') === step);
	}
}

function setError(box, message) {
	if (message) {
		box.innerHTML = message;
		box.classList.add('show');
	} else {
		box.textContent = '';
		box.classList.remove('show');
	}
}

// ── Compose ─────────────────────────────────────────────────────────────────

function updateCounter() {
	const n = promptEl.value.length;
	counterEl.textContent = `${n} / 600`;
	counterEl.classList.toggle('warn', n > 600);
	generateBtn.disabled = promptEl.value.trim().length < 3 || _submitting;
}

promptEl.addEventListener('input', () => {
	updateCounter();
	if (composeError.classList.contains('show')) setError(composeError, '');
});

// Cmd/Ctrl+Enter submits.
promptEl.addEventListener('keydown', (e) => {
	if ((e.metaKey || e.ctrlKey) && e.key === 'Enter' && !generateBtn.disabled) {
		e.preventDefault();
		start();
	}
});

for (const chip of document.querySelectorAll('.example')) {
	chip.addEventListener('click', () => {
		promptEl.value = chip.textContent.trim();
		updateCounter();
		promptEl.focus();
	});
}

$('#back-btn').addEventListener('click', () => {
	if (history.length > 1) history.back();
	else window.location.href = '/create';
});

generateBtn.addEventListener('click', start);

// ── Submit + poll ────────────────────────────────────────────────────────────

function nameFromPrompt(prompt) {
	const words = prompt.replace(/\s+/g, ' ').trim().split(' ').slice(0, 6).join(' ');
	return (words.length > 60 ? words.slice(0, 60) : words) || 'Prompt avatar';
}

async function start() {
	if (_submitting) return;
	const prompt = promptEl.value.trim();
	if (prompt.length < 3) {
		setError(composeError, 'Add a few words describing what you want.');
		return;
	}

	_submitting = true;
	generateBtn.disabled = true;
	setError(composeError, '');

	buildPrompt.textContent = `“${prompt}”`;
	setError(buildError, '');
	setProgress(8, 'Rendering a reference image…');
	startElapsed();
	showStep('building');

	let jobId;
	try {
		const res = await fetch(SUBMIT_ENDPOINT, {
			method: 'POST',
			credentials: 'include',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ name: nameFromPrompt(prompt), prompt, visibility: 'private' }),
		});
		if (res.status === 401) {
			window.location.assign(`/login?next=${encodeURIComponent('/create/prompt')}`);
			return;
		}
		const data = await res.json().catch(() => ({}));
		if (!res.ok || !data.jobId) {
			throw new ApiError(mapSubmitError(res.status, data));
		}
		jobId = data.jobId;
	} catch (err) {
		failBuild(err);
		return;
	}

	try {
		const final = await pollUntilDone(jobId);
		await renderDone(final.resultAvatarId);
	} catch (err) {
		failBuild(err);
	}
}

class ApiError extends Error {}

/** @param {string | null | undefined} raw */
function friendlyJobError(raw) {
	if (!raw) return 'Generation failed. Try a different prompt.';
	const lower = raw.toLowerCase();
	if (lower.includes('face') && (lower.includes('detect') || lower.includes('no face')))
		return 'Couldn\'t find a face in the generated reference image. Try rewording your prompt to describe the person more clearly.';
	if (lower.includes('nsfw'))
		return 'Content safety blocked this image. Try a different prompt.';
	if (lower.includes('unreachable') || lower.includes('502') || lower.includes('503'))
		return 'The avatar engine is temporarily unavailable. Try again in a few minutes.';
	if (lower.includes('timeout') || lower.includes('timed out'))
		return 'The engine took too long. Try again in a moment.';
	if (lower.includes('oom') || lower.includes('memory'))
		return 'The engine ran out of resources. Try a simpler prompt.';
	return 'Generation failed. Try a different prompt.';
}

function mapSubmitError(status, data) {
	const code = data?.error?.code || data?.code;
	if (status === 429) return 'You\'re generating too fast — wait a moment and try again.';
	if (code === 'regen_unconfigured' || code === 'txt2img_unconfigured') {
		return 'The avatar generator isn\'t configured on this deployment yet. Try the <a href="/scan">selfie scanner</a> instead.';
	}
	if (code === 'txt2img_error') return 'Couldn\'t render a reference image from that prompt. Try rewording it.';
	return data?.error?.message || data?.message || `The avatar engine returned ${status}. Try again.`;
}

async function pollUntilDone(jobId) {
	const deadline = Date.now() + POLL_TIMEOUT_MS;
	while (Date.now() < deadline) {
		await sleep(POLL_INTERVAL_MS);
		let data;
		try {
			const res = await fetch(`${STATUS_ENDPOINT}?jobId=${encodeURIComponent(jobId)}`, {
				credentials: 'include',
			});
			if (res.status === 401) {
				window.location.assign(`/login?next=${encodeURIComponent('/create/prompt')}`);
				throw new ApiError('redirecting');
			}
			data = await res.json().catch(() => ({}));
			if (!res.ok) throw new ApiError(data?.error?.message || `status ${res.status}`);
		} catch (err) {
			if (err instanceof ApiError) throw err;
			// Transient network blip — keep polling until the deadline.
			log.warn('[create-prompt] poll blip', err);
			continue;
		}

		advanceProgress(data.status);

		if (data.status === 'done' && data.resultAvatarId) {
			setProgress(100, 'Done.');
			return data;
		}
		if (data.status === 'failed') {
			throw new ApiError(friendlyJobError(data.error));
		}
	}
	throw new ApiError('This is taking longer than expected. Your avatar may still finish — check your dashboard in a minute.');
}

// Map backend job states to human progress. The bar creeps within each phase so
// it always feels alive, then jumps on real state transitions.
const PHASE = {
	queued: { pct: 18, label: 'Rendering a reference image…' },
	running: { pct: 55, label: 'Reconstructing it into 3D…' },
	rigging: { pct: 85, label: 'Adding a skeleton so it can move…' },
};
function advanceProgress(status) {
	const phase = PHASE[status];
	if (phase) setProgress(phase.pct, phase.label);
}
function setProgress(pct, label) {
	progressFill.style.width = `${pct}%`;
	if (label) buildStatus.textContent = label;
}

// ── Done ─────────────────────────────────────────────────────────────────────

async function renderDone(avatarId) {
	let avatar = null;
	try {
		const res = await fetch(`/api/avatars/${encodeURIComponent(avatarId)}`, { credentials: 'include' });
		const data = await res.json().catch(() => ({}));
		avatar = data?.avatar || data || null;
	} catch (err) {
		log.warn('[create-prompt] could not fetch finished avatar', err);
	}

	const editorUrl = `/avatars/${encodeURIComponent(avatarId)}/edit`;
	$('#open-editor').setAttribute('href', editorUrl);
	$('#make-another').addEventListener('click', () => resetToCompose());

	const modelUrl = avatar?.model_url || avatar?.modelUrl;
	const viewer = /** @type {any} */ ($('#done-model'));
	if (modelUrl && viewer) viewer.setAttribute('src', modelUrl);

	const rigged = avatar?.source_meta?.is_rigged ?? avatar?.tags?.includes?.('rigged');
	const tagsEl = $('#done-tags');
	tagsEl.innerHTML = '';
	const tag = (text, ok) => {
		const s = document.createElement('span');
		s.className = `tag${ok ? ' ok' : ''}`;
		s.textContent = text;
		tagsEl.appendChild(s);
	};
	if (rigged) tag('Animation-ready', true);
	else tag('Static mesh — riggable in editor', false);
	tag('Private to you', false);

	stopElapsed();
	// If the model can't render (no URL yet), go straight to the editor rather
	// than showing an empty viewer box.
	if (!modelUrl) {
		window.location.assign(editorUrl);
		return;
	}
	showStep('done');
}

function resetToCompose() {
	_submitting = false;
	stopElapsed();
	setError(composeError, '');
	updateCounter();
	showStep('compose');
	promptEl.focus();
}

// ── Failure ──────────────────────────────────────────────────────────────────

function failBuild(err) {
	if (err instanceof ApiError && err.message === 'redirecting') return;
	stopElapsed();
	_submitting = false;
	log.error('[create-prompt]', err);
	const message =
		err instanceof ApiError ? err.message : 'Something went wrong. Try again.';
	setError(buildError, `${message} <button id="build-retry" class="example" style="margin-left:8px">Back</button>`);
	const retry = document.getElementById('build-retry');
	if (retry) retry.addEventListener('click', resetToCompose);
}

// ── Elapsed clock ────────────────────────────────────────────────────────────

function startElapsed() {
	_startedAt = Date.now();
	stopElapsed();
	_elapsedTimer = window.setInterval(() => {
		const s = Math.floor((Date.now() - _startedAt) / 1000);
		elapsedEl.textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
	}, 1000);
}
function stopElapsed() {
	if (_elapsedTimer) { clearInterval(_elapsedTimer); _elapsedTimer = 0; }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

updateCounter();
promptEl.focus();

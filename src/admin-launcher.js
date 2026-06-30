// /admin/launcher — Memetic Launcher control panel controller.
//
// Talks only to /api/admin/launcher (admin session OR Bearer secret). The secret
// lives in sessionStorage and in memory, sent as `Authorization: Bearer` — never
// in a URL, never logged, cleared on any 401. All API-sourced strings (coin
// names, symbols, errors) are escaped before they touch the DOM.

import { updateValue, enterRow, rippleOnce } from './ui-juice.js';

const API = '/api/admin/launcher';
const SECRET_KEY = 'ml_launcher_secret';
const REFRESH_MS = 5000;

const MODES = [
	{ id: 'hybrid', name: 'Hybrid', desc: 'Trend first, meme + random filler to hold cadence.' },
	{ id: 'trend', name: 'Trend', desc: 'Only ride live cultural narratives.' },
	{ id: 'meme', name: 'Meme', desc: 'LLM coins original memes from culture.' },
	{ id: 'random', name: 'Random', desc: 'Wordlist salad. No LLM, pure volume.' },
	{ id: 'off', name: 'Off', desc: 'Selected but idle. Launches nothing.' },
];
const SOURCES = [
	{ id: 'coin_intel', label: 'Coin intel' },
	{ id: 'trending', label: 'Trending' },
	{ id: 'knowyourmeme', label: 'Know Your Meme' },
	{ id: 'googletrends', label: 'Google Trends' },
	{ id: 'x', label: 'X' },
	{ id: 'hackernews', label: 'Hacker News' },
	{ id: 'reddit', label: 'Reddit' },
	{ id: 'wikipedia', label: 'Wikipedia' },
];
const EDITABLE = [
	'enabled', 'dry_run', 'mode', 'sources', 'target_cadence_seconds',
	'max_per_hour', 'per_launch_sol', 'dev_buy_sol', 'daily_sol_cap', 'buyback_bps', 'network',
];

let secret = sessionStorage.getItem(SECRET_KEY) || '';
let loaded = null; // last-saved config (normalized)
let draft = null; // editable working copy
let refreshTimer = null;
let pendingLive = false; // a save is waiting on the arm modal

const $ = (id) => document.getElementById(id);
const esc = (s) =>
	String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// ── API ──────────────────────────────────────────────────────────────────────
async function api(method, body) {
	const r = await fetch(API, {
		method,
		headers: { 'content-type': 'application/json', authorization: `Bearer ${secret}` },
		credentials: 'same-origin',
		body: body ? JSON.stringify(body) : undefined,
	});
	if (r.status === 401 || r.status === 403) {
		secret = '';
		sessionStorage.removeItem(SECRET_KEY);
		stopRefresh();
		showGate('Secret rejected. Try again.');
		throw new Error('unauthorized');
	}
	const j = await r.json().catch(() => null);
	if (!r.ok) throw new Error(j?.error_description || j?.error || `HTTP ${r.status}`);
	return j;
}

// ── normalize ─────────────────────────────────────────────────────────────────
function normalize(c) {
	c = c || {};
	const arr = (v) => (Array.isArray(v) ? v : typeof v === 'string' ? safeJson(v, []) : []);
	return {
		enabled: !!c.enabled,
		dry_run: c.dry_run == null ? true : !!c.dry_run,
		paused: !!c.paused,
		pause_reason: c.pause_reason || '',
		mode: c.mode || 'hybrid',
		sources: arr(c.sources),
		target_cadence_seconds: Number(c.target_cadence_seconds ?? 60),
		max_per_hour: Number(c.max_per_hour ?? 30),
		per_launch_sol: Number(c.per_launch_sol ?? 0.03),
		dev_buy_sol: Number(c.dev_buy_sol ?? 0),
		daily_sol_cap: Number(c.daily_sol_cap ?? 1),
		buyback_bps: Number(c.buyback_bps ?? 5000),
		network: c.network || 'mainnet',
	};
}
function safeJson(s, d) { try { return JSON.parse(s); } catch { return d; } }

// ── gate ──────────────────────────────────────────────────────────────────────
function showGate(errMsg) {
	$('ml-panel').hidden = true;
	$('ml-gate').hidden = false;
	$('ml-root').setAttribute('aria-busy', 'false');
	$('ml-gate-err').textContent = errMsg || '';
	$('ml-secret').focus();
}

$('ml-gate-form').addEventListener('submit', async (e) => {
	e.preventDefault();
	const val = $('ml-secret').value.trim();
	if (!val) return;
	secret = val;
	$('ml-gate-err').textContent = '';
	try {
		await load();
		sessionStorage.setItem(SECRET_KEY, secret);
		$('ml-secret').value = '';
	} catch (err) {
		if (err.message !== 'unauthorized') $('ml-gate-err').textContent = err.message;
	}
});

// ── load + render ──────────────────────────────────────────────────────────────
async function load() {
	const state = await api('GET');
	loaded = normalize(state.config);
	draft = { ...loaded };
	$('ml-gate').hidden = true;
	$('ml-panel').hidden = false;
	$('ml-root').setAttribute('aria-busy', 'false');
	buildStaticControls();
	renderForm();
	renderState(state);
	updateDirty();
	startRefresh();
}

async function refresh() {
	if (document.hidden || !secret) return;
	try {
		const state = await api('GET');
		const fresh = normalize(state.config);
		// Only adopt server config into the form when the user has no pending edits,
		// so a background refresh never clobbers what they are typing.
		if (!isDirty()) {
			loaded = fresh;
			draft = { ...fresh };
			renderForm();
			updateDirty();
		} else {
			// Still keep breaker/paused state honest even mid-edit.
			loaded.paused = fresh.paused;
			loaded.pause_reason = fresh.pause_reason;
		}
		renderState(state);
	} catch {
		/* transient — next tick retries */
	}
}

function startRefresh() { stopRefresh(); refreshTimer = setInterval(refresh, REFRESH_MS); }
function stopRefresh() { if (refreshTimer) clearInterval(refreshTimer); refreshTimer = null; }
document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });

// Power-user: ⌘/Ctrl+S saves when there are pending edits (and a panel is up).
document.addEventListener('keydown', (e) => {
	if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
		if (loaded && !$('ml-panel').hidden && isDirty()) { e.preventDefault(); save(); }
	}
});

// ── static controls (modes, chips, network) built once ────────────────────────
let built = false;
function buildStaticControls() {
	if (built) return;
	built = true;

	$('ml-modes').innerHTML = MODES.map(
		(m) => `
		<label class="ml-mode">
			<input type="radio" name="ml-mode" value="${m.id}" />
			<span class="ml-mode-ui">
				<span class="ml-mode-name">${esc(m.name)}</span>
				<span class="ml-mode-desc">${esc(m.desc)}</span>
			</span>
		</label>`,
	).join('');
	$('ml-modes').addEventListener('change', (e) => {
		if (e.target.name === 'ml-mode') { draft.mode = e.target.value; onEdit(); }
	});

	$('ml-sources').innerHTML = SOURCES.map(
		(s) => `<button type="button" class="ml-chip" data-src="${s.id}" aria-pressed="false">${esc(s.label)}</button>`,
	).join('');
	$('ml-sources').addEventListener('click', (e) => {
		const btn = e.target.closest('.ml-chip');
		if (!btn) return;
		const id = btn.dataset.src;
		const set = new Set(draft.sources);
		set.has(id) ? set.delete(id) : set.add(id);
		draft.sources = [...set];
		onEdit();
	});

	$('ml-network').addEventListener('click', (e) => {
		const btn = e.target.closest('.ml-seg-btn');
		if (!btn) return;
		draft.network = btn.dataset.net;
		onEdit();
	});

	// numeric inputs
	bindNum('ml-cadence', 'target_cadence_seconds');
	bindNum('ml-maxhour', 'max_per_hour');
	bindNum('ml-perlaunch', 'per_launch_sol');
	bindNum('ml-devbuy', 'dev_buy_sol');
	bindNum('ml-dailycap', 'daily_sol_cap');
	$('ml-buyback').addEventListener('input', () => {
		const pct = Number($('ml-buyback').value);
		draft.buyback_bps = Number.isFinite(pct) ? Math.round(pct * 100) : draft.buyback_bps;
		$('ml-buyback-hint').textContent = `${draft.buyback_bps} bps → $THREE buyback-burn`;
		onEdit(false);
	});

	$('ml-dryrun').addEventListener('change', () => { draft.dry_run = $('ml-dryrun').checked; onEdit(); });
	$('ml-armswitch').addEventListener('click', () => { draft.enabled = !draft.enabled; onEdit(); });

	// The config form has no submit button; guard against Enter-to-reload.
	$('ml-config').addEventListener('submit', (e) => e.preventDefault());

	$('ml-save').addEventListener('click', save);
	$('ml-discard').addEventListener('click', () => { draft = { ...loaded }; renderForm(); updateDirty(); });
	$('ml-resume').addEventListener('click', resumeBreaker);

	// Force-tick: run one launcher tick immediately without waiting for cron.
	const forceTick = $('ml-force-tick');
	if (forceTick) {
		forceTick.addEventListener('click', async () => {
			forceTick.disabled = true;
			forceTick.textContent = 'Ticking…';
			try {
				const r = await api('POST', { action: 'force_tick' });
				const res = r.tick?.results?.[0];
				if (res?.mint) toast(`Launched ${res.name} (${res.symbol})`);
				else if (res?.dry_run) toast(`Dry run: ${res.name} (${res.symbol})`);
				else if (res?.skipped) toast(`Skipped: ${res.skipped}`);
				else toast('Tick complete');
				refresh();
			} catch (err) {
				if (err.message !== 'unauthorized') toast(err.message, true);
			} finally {
				forceTick.disabled = false;
				forceTick.textContent = 'Force tick';
			}
		});
	}

	wireModal();
}

function bindNum(id, key) {
	$(id).addEventListener('input', () => {
		const n = Number($(id).value);
		if (Number.isFinite(n)) { draft[key] = n; onEdit(false); }
	});
}

function onEdit(rerender = true) {
	if (rerender) renderForm();
	updateDirty();
	renderStatusFromDraft();
}

// ── render form from draft ─────────────────────────────────────────────────────
function renderForm() {
	// modes
	for (const el of document.querySelectorAll('input[name="ml-mode"]')) el.checked = el.value === draft.mode;
	// sources
	const set = new Set(draft.sources);
	for (const btn of document.querySelectorAll('#ml-sources .ml-chip')) {
		btn.setAttribute('aria-pressed', set.has(btn.dataset.src) ? 'true' : 'false');
	}
	$('ml-sources-card').style.opacity = draft.mode === 'trend' || draft.mode === 'hybrid' ? '1' : '0.5';
	// network
	for (const btn of document.querySelectorAll('#ml-network .ml-seg-btn')) {
		btn.classList.toggle('active', btn.dataset.net === draft.network);
	}
	// numbers
	setVal('ml-cadence', draft.target_cadence_seconds);
	setVal('ml-maxhour', draft.max_per_hour);
	setVal('ml-perlaunch', draft.per_launch_sol);
	setVal('ml-devbuy', draft.dev_buy_sol);
	setVal('ml-dailycap', draft.daily_sol_cap);
	setVal('ml-buyback', round(draft.buyback_bps / 100, 2));
	$('ml-buyback-hint').textContent = `${draft.buyback_bps} bps → $THREE buyback-burn`;
	$('ml-cadence-hint').textContent = cadenceHint(draft.target_cadence_seconds);
	$('ml-dryrun').checked = draft.dry_run;
	renderStatusFromDraft();
}
function setVal(id, v) { const el = $(id); if (el && document.activeElement !== el) el.value = v; }

function cadenceHint(sec) {
	if (!sec) return '';
	const perHr = Math.floor(3600 / sec);
	return `≈ ${perHr.toLocaleString()} / hour at full tilt`;
}

// ── status (hero) ──────────────────────────────────────────────────────────────
function renderStatusFromDraft() {
	const wasArmed = loaded.enabled && !loaded.dry_run && !loaded.paused;
	const willArm = draft.enabled && !draft.dry_run;
	// arm switch reflects desired enabled state
	const sw = $('ml-armswitch');
	sw.setAttribute('aria-pressed', draft.enabled ? 'true' : 'false');
	$('ml-armswitch-lbl').textContent = draft.enabled ? (draft.dry_run ? 'Enabled · dry run' : 'Armed') : 'Disabled';

	// dot + status line reflect SAVED state (truth), with a hint when edits pend
	const dot = $('ml-status-dot');
	dot.className = 'ml-dot';
	let line;
	if (loaded.paused) { dot.classList.add('is-paused'); line = `Paused — ${esc(loaded.pause_reason || 'circuit breaker tripped')}`; }
	else if (wasArmed) { dot.classList.add('is-armed'); line = `Live — minting on ${esc(loaded.mode)} mode, every ${loaded.target_cadence_seconds}s.`; }
	else if (loaded.enabled) { dot.classList.add('is-dry'); line = 'Enabled in dry-run — choosing coins + agents, moving no SOL.'; }
	else { line = 'Disabled — fully inert. Nothing launches.'; }
	if (isDirty()) line += willArm && !wasArmed ? '  •  Unsaved: will go LIVE on save.' : '  •  Unsaved changes.';
	$('ml-status-line').innerHTML = line;
}

// ── render server state (stats, console, master, breaker) ──────────────────────
function renderState(state) {
	const s = state.stats || {};
	// The launched-today tally is the real "it shipped" signal — when the live
	// firehose mints another coin it counts up, tints green, and the tile ripples
	// once. Backed entirely by the poll's real numbers, never a timer.
	const launchedEl = $('ml-s-launched');
	const prevLaunched = Number(launchedEl?.dataset.juiceVal);
	const nextLaunched = Number(s.launched_today || 0);
	updateValue(launchedEl, nextLaunched, num);
	if (Number.isFinite(prevLaunched) && nextLaunched > prevLaunched) {
		rippleOnce(launchedEl.closest('.ml-stat') || launchedEl);
	}
	updateValue($('ml-s-dry'), Number(s.dry_runs_today || 0), num, { flash: false });
	$('ml-s-spent').textContent = fmtSol(s.sol_spent_today);
	$('ml-s-left').textContent = s.sol_remaining_today == null ? '—' : fmtSol(s.sol_remaining_today);
	updateValue($('ml-s-queue'), Number(state.queue_enabled || 0), num, { flash: false });
	$('ml-s-fail').textContent = `${num(s.failed_today)} / ${num(s.skipped_today)}`;

	const rev = state.revenue || {};
	const feesEl = $('ml-s-fees');
	const buyEl = $('ml-s-buyback');
	if (feesEl) feesEl.textContent = rev.total_claimed_sol != null ? `${fmtSol(rev.total_claimed_sol)} ◎` : '—';
	if (buyEl) buyEl.textContent = rev.total_buyback_sol != null ? `${fmtSol(rev.total_buyback_sol)} ◎` : '—';

	$('ml-master-bal').textContent = state.master_balance_sol == null ? 'n/a' : `${fmtSol(state.master_balance_sol)} ◎`;

	const breaker = $('ml-breaker');
	if (loaded.paused) {
		breaker.hidden = false;
		$('ml-breaker-txt').textContent = `Circuit breaker tripped: ${loaded.pause_reason || 'repeated failures'}. Launches halted.`;
	} else { breaker.hidden = true; }

	renderConsole(state.console || [], state.config?.network || draft.network);
	$('ml-console-meta').textContent = `updated ${new Date().toLocaleTimeString()}`;

	renderNarratives(state.narratives);
}

// ── live narratives (what the launcher would ride right now) ─────────────────────
function renderNarratives(narr) {
	const list = $('ml-narr-list');
	const empty = $('ml-narr-empty');
	const lead = $('ml-narr-lead');
	const meta = $('ml-narr-meta');
	const terms = (narr && Array.isArray(narr.terms)) ? narr.terms : [];

	if (!terms.length) {
		list.innerHTML = '';
		empty.hidden = false;
		lead.hidden = true;
		meta.textContent = (draft.mode === 'trend' || draft.mode === 'hybrid') ? 'no signal' : 'trend off';
		return;
	}
	empty.hidden = true;
	meta.textContent = `${terms.length} live · ${(narr.providers || []).length} sources`;

	if (narr.top) {
		lead.hidden = false;
		lead.innerHTML = `Riding <strong>${esc(narr.top.term)}</strong>${narr.top.kind ? ` <span class="ml-narr-kind">${esc(narr.top.kind)}</span>` : ''} next.`;
	} else {
		lead.hidden = true;
	}

	const max = terms[0]?.score || 1;
	list.innerHTML = terms
		.slice(0, 12)
		.map((t) => {
			const pct = Math.max(6, Math.round((Number(t.score) / max) * 100));
			const srcs = Array.isArray(t.sources) ? t.sources.length : 0;
			return `
			<li class="ml-narr-row" title="${esc((t.sources || []).join(', '))}">
				<span class="ml-narr-bar" style="width:${pct}%"></span>
				<span class="ml-narr-term">${esc(t.term)}</span>
				<span class="ml-narr-tags">${t.kind ? `<span class="ml-narr-kind">${esc(t.kind)}</span>` : ''}${srcs > 1 ? `<span class="ml-narr-conf">×${srcs}</span>` : ''}</span>
			</li>`;
		})
		.join('');
}

// Inner markup for one run row (without the <li> wrapper) — shared by the keyed
// renderer so a row can be created once and patched in place.
function runRowHtml(r, network) {
	const status = String(r.status || 'pending');
	const mint = r.mint
		? `<a href="${solscan(r.mint, network)}" target="_blank" rel="noopener">${esc(r.name || r.symbol || 'coin')}</a>`
		: esc(r.name || r.symbol || '—');
	const rode = topNarrative(r.trigger_detail);
	const agentTag = r.agent_name ? `<span class="ml-run-agent">${esc(trunc(r.agent_name, 16))}</span> · ` : '';
	const meta = r.status === 'failed' && r.error
		? `${agentTag}<span class="ml-run-err">${esc(trunc(r.error, 60))}</span>`
		: `${agentTag}<span class="ml-kind">${esc(r.kind || '')}</span>${rode ? ' · ' + esc(rode) : (r.trigger_source ? ' · ' + esc(r.trigger_source) : '')}`;
	const sol = Number(r.sol_spent) > 0 ? `${fmtSol(r.sol_spent)} ◎` : (r.dry_run ? 'dry' : '—');
	return (
		`<span class="ml-pill s-${esc(status)}">${esc(statusLabel(status))}</span>` +
		`<span class="ml-run-main">` +
			`<span class="ml-run-name">${mint} <span class="ml-run-sym">${esc(r.symbol || '')}</span></span>` +
			`<span class="ml-run-meta">${meta}</span>` +
		`</span>` +
		`<span class="ml-run-r">` +
			`<span class="ml-run-sol">${esc(sol)}</span>` +
			`<span class="ml-run-time">${esc(reltime(r.created_at))}</span>` +
		`</span>`
	);
}

// A run is "the same" until its status/cost/mint/error changes — only then do we
// touch the DOM for it. Keeps the 5s refresh cheap and flicker-free.
function runSig(r) { return `${r.status}|${r.sol_spent}|${r.mint || ''}|${r.error || ''}|${reltime(r.created_at)}`; }

const _rows = new Map(); // run id → { el, sig }

// Keyed/incremental render: create new rows (animated in), patch changed rows in
// place, reorder to match newest-first, and drop rows that fell off the window.
function renderConsole(runs, network) {
	const list = $('ml-runs');
	const empty = $('ml-runs-empty');
	if (!runs.length) { list.replaceChildren(); _rows.clear(); empty.hidden = false; return; }
	empty.hidden = true;

	const seen = new Set();
	let prev = null;
	for (const r of runs.slice(0, 50)) {
		const id = String(r.id);
		seen.add(id);
		const sig = runSig(r);
		let entry = _rows.get(id);
		if (!entry) {
			const li = document.createElement('li');
			li.className = 'ml-run';
			li.innerHTML = runRowHtml(r, network);
			// Shared enter (replaces a hand-rolled setTimeout class-toggle).
			enterRow(li);
			entry = { el: li, sig };
			_rows.set(id, entry);
		} else if (entry.sig !== sig) {
			entry.el.innerHTML = runRowHtml(r, network);
			entry.sig = sig;
		}
		const ref = prev ? prev.nextSibling : list.firstChild;
		if (entry.el !== ref) list.insertBefore(entry.el, ref);
		prev = entry.el;
	}
	for (const [id, entry] of _rows) {
		if (!seen.has(id)) { entry.el.remove(); _rows.delete(id); }
	}
}

// ── dirty + save ───────────────────────────────────────────────────────────────
function pickEditable(o) { const r = {}; for (const k of EDITABLE) r[k] = o[k]; r.sources = [...(o.sources || [])].sort(); return r; }
function isDirty() { return JSON.stringify(pickEditable(draft)) !== JSON.stringify(pickEditable(loaded)); }
function updateDirty() {
	const dirty = isDirty();
	$('ml-savebar').hidden = !dirty;
	const willArm = draft.enabled && !draft.dry_run;
	const wasArmed = loaded.enabled && !loaded.dry_run && !loaded.paused;
	$('ml-savebar-txt').textContent = dirty && willArm && !wasArmed ? '⚠ Will arm the LIVE firehose' : 'Unsaved changes';
}

async function save() {
	const willArm = draft.enabled && !draft.dry_run;
	const wasArmed = loaded.enabled && !loaded.dry_run && !loaded.paused;
	if (willArm && !wasArmed) { openModal(); return; }
	await commit();
}

async function commit() {
	const payload = {};
	for (const k of EDITABLE) payload[k] = draft[k];
	$('ml-save').disabled = true;
	try {
		const resp = await api('POST', payload);
		loaded = normalize(resp.config);
		draft = { ...loaded };
		renderForm();
		updateDirty();
		toast(resp.armed ? 'Saved — launcher is ARMED' : 'Saved');
		refresh();
	} catch (err) {
		if (err.message !== 'unauthorized') toast(err.message, true);
	} finally {
		$('ml-save').disabled = false;
	}
}

async function resumeBreaker() {
	try {
		await api('POST', { action: 'resume' });
		toast('Breaker cleared');
		refresh();
	} catch (err) {
		if (err.message !== 'unauthorized') toast(err.message, true);
	}
}

// ── arm modal ──────────────────────────────────────────────────────────────────
function wireModal() {
	$('ml-modal-input').addEventListener('input', () => {
		$('ml-modal-go').disabled = $('ml-modal-input').value.trim().toUpperCase() !== 'ARM';
	});
	$('ml-modal-cancel').addEventListener('click', closeModal);
	$('ml-modal-go').addEventListener('click', async () => { closeModal(); await commit(); });
	$('ml-modal').addEventListener('click', (e) => { if (e.target === $('ml-modal')) closeModal(); });
	document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !$('ml-modal').hidden) closeModal(); });
}
function openModal() {
	pendingLive = true;
	$('ml-modal-body').textContent =
		`This enables real launches: the master wallet will fund agents and mint coins on ${draft.network} ` +
		`every ~${draft.target_cadence_seconds}s, up to ${draft.daily_sol_cap} SOL/day. Real SOL will move.`;
	$('ml-modal-input').value = '';
	$('ml-modal-go').disabled = true;
	$('ml-modal').hidden = false;
	$('ml-modal-input').focus();
}
function closeModal() { pendingLive = false; $('ml-modal').hidden = true; }

// ── toast ──────────────────────────────────────────────────────────────────────
let toastTimer = null;
function toast(msg, isErr) {
	const t = $('ml-toast');
	t.textContent = msg;
	t.classList.toggle('is-err', !!isErr);
	t.hidden = false;
	clearTimeout(toastTimer);
	toastTimer = setTimeout(() => { t.hidden = true; }, 3200);
}

// ── formatters ─────────────────────────────────────────────────────────────────
function num(n) { return Number(n || 0).toLocaleString(); }
function round(n, d) { const p = 10 ** d; return Math.round(Number(n) * p) / p; }
function fmtSol(n) { const v = Number(n || 0); return v === 0 ? '0' : v < 0.001 ? v.toExponential(1) : round(v, 4).toString(); }
function trunc(s, n) { s = String(s || ''); return s.length > n ? s.slice(0, n - 1) + '…' : s; }
function statusLabel(s) { return { dry_run: 'dry', confirmed: 'live', launched: 'live' }[s] || s; }
function topNarrative(detail) {
	let d = detail;
	if (typeof d === 'string') { try { d = JSON.parse(d); } catch { return ''; } }
	const t = d && typeof d === 'object' ? d.top_narrative : '';
	return t ? trunc(String(t), 28) : '';
}
function solscan(mint, network) { return `https://solscan.io/token/${encodeURIComponent(mint)}${network === 'devnet' ? '?cluster=devnet' : ''}`; }
function reltime(iso) {
	if (!iso) return '';
	const d = (Date.now() - new Date(iso).getTime()) / 1000;
	if (d < 60) return `${Math.max(0, Math.floor(d))}s`;
	if (d < 3600) return `${Math.floor(d / 60)}m`;
	if (d < 86400) return `${Math.floor(d / 3600)}h`;
	return `${Math.floor(d / 86400)}d`;
}

// ── boot ───────────────────────────────────────────────────────────────────────
(async function boot() {
	if (!secret) { showGate(); return; }
	try { await load(); } catch (err) { if (err.message !== 'unauthorized') showGate(err.message); }
})();

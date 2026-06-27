// /launcher — your personal Memetic Launcher (the per-user scope).
//
// Talks only to /api/launcher/me (session or bearer). The launcher is preview-only
// (server hard-locks dry-run), so there is no arm modal and no real-SOL surface —
// "On" simply lets the cron pick coins from your agents and record them. All
// API-sourced strings are escaped before they touch the DOM.

const API = '/api/launcher/me';
const REFRESH_MS = 6000;

const MODES = [
	{ id: 'hybrid', name: 'Hybrid', desc: 'Trend first, meme + random filler to hold cadence.' },
	{ id: 'trend', name: 'Trend', desc: 'Only ride live cultural narratives.' },
	{ id: 'meme', name: 'Meme', desc: 'Coins original memes from culture.' },
	{ id: 'random', name: 'Random', desc: 'Wordlist salad. No LLM, pure volume.' },
	{ id: 'off', name: 'Off', desc: 'Selected but idle. Picks nothing.' },
];
const SOURCES = [
	{ id: 'coin_intel', label: 'Coin intel' },
	{ id: 'trending', label: 'Trending' },
	{ id: 'knowyourmeme', label: 'Know Your Meme' },
	{ id: 'x', label: 'X' },
	{ id: 'hackernews', label: 'Hacker News' },
	{ id: 'reddit', label: 'Reddit' },
	{ id: 'wikipedia', label: 'Wikipedia' },
];
const EDITABLE = ['enabled', 'mode', 'sources', 'target_cadence_seconds', 'max_per_hour', 'network'];

let loaded = null;
let draft = null;
let refreshTimer = null;
let built = false;

const $ = (id) => document.getElementById(id);
const esc = (s) =>
	String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// ── API ──────────────────────────────────────────────────────────────────────
async function api(method, body) {
	const r = await fetch(API, {
		method,
		headers: { 'content-type': 'application/json' },
		credentials: 'same-origin',
		body: body ? JSON.stringify(body) : undefined,
	});
	if (r.status === 401) { showGate(); throw new Error('unauthorized'); }
	const j = await r.json().catch(() => null);
	if (!r.ok) throw new Error(j?.error_description || j?.error || `HTTP ${r.status}`);
	return j;
}

function safeJson(s, d) { try { return JSON.parse(s); } catch { return d; } }
function normalize(c) {
	c = c || {};
	const arr = (v) => (Array.isArray(v) ? v : typeof v === 'string' ? safeJson(v, []) : []);
	return {
		enabled: !!c.enabled,
		paused: !!c.paused,
		pause_reason: c.pause_reason || '',
		mode: c.mode || 'hybrid',
		sources: arr(c.sources),
		target_cadence_seconds: Number(c.target_cadence_seconds ?? 60),
		max_per_hour: Number(c.max_per_hour ?? 30),
		network: c.network || 'mainnet',
	};
}

// ── gate ──────────────────────────────────────────────────────────────────────
function showGate() {
	$('ul-panel').hidden = true;
	$('ul-gate').hidden = false;
	$('ul-root').setAttribute('aria-busy', 'false');
	stopRefresh();
}

// ── load + render ──────────────────────────────────────────────────────────────
async function load() {
	const state = await api('GET');
	loaded = normalize(state.config);
	draft = { ...loaded };
	$('ul-gate').hidden = true;
	$('ul-panel').hidden = false;
	$('ul-root').setAttribute('aria-busy', 'false');
	buildStaticControls();
	renderForm();
	renderState(state);
	updateDirty();
	startRefresh();
}

async function refresh() {
	if (document.hidden) return;
	try {
		const state = await api('GET');
		const fresh = normalize(state.config);
		if (!isDirty()) { loaded = fresh; draft = { ...fresh }; renderForm(); updateDirty(); }
		else { loaded.paused = fresh.paused; loaded.pause_reason = fresh.pause_reason; }
		renderState(state);
	} catch { /* transient */ }
}
function startRefresh() { stopRefresh(); refreshTimer = setInterval(refresh, REFRESH_MS); }
function stopRefresh() { if (refreshTimer) clearInterval(refreshTimer); refreshTimer = null; }
document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });

// ── static controls (built once) ───────────────────────────────────────────────
function buildStaticControls() {
	if (built) return;
	built = true;

	$('ul-modes').innerHTML = MODES.map(
		(m) => `
		<label class="ml-mode">
			<input type="radio" name="ul-mode" value="${m.id}" />
			<span class="ml-mode-ui">
				<span class="ml-mode-name">${esc(m.name)}</span>
				<span class="ml-mode-desc">${esc(m.desc)}</span>
			</span>
		</label>`,
	).join('');
	$('ul-modes').addEventListener('change', (e) => { if (e.target.name === 'ul-mode') { draft.mode = e.target.value; onEdit(); } });

	$('ul-sources').innerHTML = SOURCES.map(
		(s) => `<button type="button" class="ml-chip" data-src="${s.id}" aria-pressed="false">${esc(s.label)}</button>`,
	).join('');
	$('ul-sources').addEventListener('click', (e) => {
		const btn = e.target.closest('.ml-chip');
		if (!btn) return;
		const set = new Set(draft.sources);
		set.has(btn.dataset.src) ? set.delete(btn.dataset.src) : set.add(btn.dataset.src);
		draft.sources = [...set];
		onEdit();
	});

	$('ul-network').addEventListener('click', (e) => {
		const btn = e.target.closest('.ml-seg-btn');
		if (!btn) return;
		draft.network = btn.dataset.net;
		onEdit();
	});

	bindNum('ul-cadence', 'target_cadence_seconds');
	bindNum('ul-maxhour', 'max_per_hour');

	$('ul-enable').addEventListener('click', () => { draft.enabled = !draft.enabled; onEdit(); });
	$('ul-config').addEventListener('submit', (e) => e.preventDefault());
	$('ul-save').addEventListener('click', save);
	$('ul-discard').addEventListener('click', () => { draft = { ...loaded }; renderForm(); updateDirty(); });
	$('ul-resume').addEventListener('click', resumeBreaker);
	$('ul-preview-btn').addEventListener('click', previewCoin);

	// ⌘/Ctrl+S saves pending edits.
	document.addEventListener('keydown', (e) => {
		if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
			if (loaded && !$('ul-panel').hidden && isDirty()) { e.preventDefault(); save(); }
		}
	});
}

function bindNum(id, key) {
	$(id).addEventListener('input', () => {
		const n = Number($(id).value);
		if (Number.isFinite(n)) { draft[key] = n; onEdit(false); }
	});
}
function onEdit(rerender = true) { if (rerender) renderForm(); updateDirty(); renderStatusFromDraft(); }

// ── render form ────────────────────────────────────────────────────────────────
function renderForm() {
	for (const el of document.querySelectorAll('input[name="ul-mode"]')) el.checked = el.value === draft.mode;
	const set = new Set(draft.sources);
	for (const btn of document.querySelectorAll('#ul-sources .ml-chip')) {
		btn.setAttribute('aria-pressed', set.has(btn.dataset.src) ? 'true' : 'false');
	}
	$('ul-sources-card').style.opacity = draft.mode === 'trend' || draft.mode === 'hybrid' ? '1' : '0.5';
	for (const btn of document.querySelectorAll('#ul-network .ml-seg-btn')) btn.classList.toggle('active', btn.dataset.net === draft.network);
	setVal('ul-cadence', draft.target_cadence_seconds);
	setVal('ul-maxhour', draft.max_per_hour);
	$('ul-cadence-hint').textContent = cadenceHint(draft.target_cadence_seconds);
	renderStatusFromDraft();
}
function setVal(id, v) { const el = $(id); if (el && document.activeElement !== el) el.value = v; }
function cadenceHint(sec) { if (!sec) return ''; return `≈ ${Math.floor(3600 / sec).toLocaleString()} coins / hour at full tilt`; }

function renderStatusFromDraft() {
	$('ul-enable').setAttribute('aria-pressed', draft.enabled ? 'true' : 'false');
	$('ul-enable-lbl').textContent = draft.enabled ? 'On' : 'Off';
	const dot = $('ul-status-dot');
	dot.className = 'ml-dot';
	let line;
	if (loaded.paused) { dot.classList.add('is-paused'); line = `Paused — ${esc(loaded.pause_reason || 'too many misses')}.`; }
	else if (loaded.enabled) { dot.classList.add('is-dry'); line = `Previewing — coining on ${esc(loaded.mode)} mode every ${loaded.target_cadence_seconds}s. No SOL moves.`; }
	else { line = 'Off — idle. Turn on to watch it design your rotation.'; }
	if (isDirty()) line += '  •  Unsaved changes.';
	$('ul-status-line').textContent = line;
	$('ul-s-mode').textContent = draft.mode;
}

// ── server state ────────────────────────────────────────────────────────────────
function renderState(state) {
	const s = state.stats || {};
	$('ul-s-dry').textContent = num(s.dry_runs_today);
	$('ul-s-queue').textContent = num(state.queue_enabled);
	$('ul-s-eligible').textContent = num(state.eligible_agents);

	const breaker = $('ul-breaker');
	if (loaded.paused) { breaker.hidden = false; $('ul-breaker-txt').textContent = `Paused: ${loaded.pause_reason || 'too many misses'}.`; }
	else breaker.hidden = true;

	renderConsole(state.console || [], state.config?.network || draft.network);
	$('ul-console-meta').textContent = `updated ${new Date().toLocaleTimeString()}`;
	renderNarratives(state.narratives);
}

// ── narratives ──────────────────────────────────────────────────────────────────
let lastNarrSig = null;
function renderNarratives(narr) {
	const terms = (narr && Array.isArray(narr.terms)) ? narr.terms : [];
	const sig = (narr?.top?.term || '') + '|' + terms.map((t) => `${t.term}:${Math.round(t.score)}`).join(',');
	if (sig === lastNarrSig) return;
	lastNarrSig = sig;

	const list = $('ul-narr-list');
	const empty = $('ul-narr-empty');
	const lead = $('ul-narr-lead');
	const meta = $('ul-narr-meta');

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
	} else lead.hidden = true;

	const max = terms[0]?.score || 1;
	list.innerHTML = terms.slice(0, 12).map((t) => {
		const pct = Math.max(6, Math.round((Number(t.score) / max) * 100));
		const srcs = Array.isArray(t.sources) ? t.sources.length : 0;
		return `
		<li class="ml-narr-row" title="${esc((t.sources || []).join(', '))}">
			<span class="ml-narr-bar" style="width:${pct}%"></span>
			<span class="ml-narr-term">${esc(t.term)}</span>
			<span class="ml-narr-tags">${t.kind ? `<span class="ml-narr-kind">${esc(t.kind)}</span>` : ''}${srcs > 1 ? `<span class="ml-narr-conf">×${srcs}</span>` : ''}</span>
		</li>`;
	}).join('');
}

// ── console (keyed/incremental — flicker-free, scroll-stable) ─────────────────────
function runRowHtml(r, network) {
	const status = String(r.status || 'pending');
	const name = r.mint
		? `<a href="${solscan(r.mint, network)}" target="_blank" rel="noopener">${esc(r.name || r.symbol || 'coin')}</a>`
		: esc(r.name || r.symbol || '—');
	const rode = topNarrative(r.trigger_detail);
	const meta = `<span class="ml-kind">${esc(r.kind || '')}</span>${rode ? ' · rode ' + esc(rode) : (r.trigger_source ? ' · ' + esc(r.trigger_source) : '')}`;
	return (
		`<span class="ml-pill s-${esc(status)}">${esc(statusLabel(status))}</span>` +
		`<span class="ml-run-main">` +
			`<span class="ml-run-name">${name} <span class="ml-run-sym">${esc(r.symbol || '')}</span></span>` +
			`<span class="ml-run-meta">${meta}</span>` +
		`</span>` +
		`<span class="ml-run-r"><span class="ml-run-time">${esc(reltime(r.created_at))}</span></span>`
	);
}
function runSig(r) { return `${r.status}|${r.mint || ''}|${reltime(r.created_at)}`; }
const _rows = new Map();
function renderConsole(runs, network) {
	const list = $('ul-runs');
	const empty = $('ul-runs-empty');
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
			li.className = 'ml-run ml-run--new';
			li.innerHTML = runRowHtml(r, network);
			setTimeout(() => li.classList.remove('ml-run--new'), 1100);
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
	for (const [id, entry] of _rows) { if (!seen.has(id)) { entry.el.remove(); _rows.delete(id); } }
}

// ── preview a coin ──────────────────────────────────────────────────────────────
async function previewCoin() {
	const btn = $('ul-preview-btn');
	btn.disabled = true;
	btn.textContent = 'Synthesizing…';
	try {
		const r = await api('POST', { action: 'preview', mode: draft.mode });
		const s = r.sample;
		$('ul-sample-empty').hidden = true;
		$('ul-sample').hidden = false;
		$('ul-sample-name').textContent = s.name || 'Untitled';
		$('ul-sample-sym').textContent = s.symbol ? `$${s.symbol}` : '';
		$('ul-sample-desc').textContent = s.description || '';
		const bits = [];
		if (s.kind) bits.push(`<span class="ml-narr-kind">${esc(s.kind)}</span>`);
		if (s.top_narrative) bits.push(`rode <strong>${esc(s.top_narrative)}</strong>`);
		else if (s.trigger_source) bits.push(esc(s.trigger_source));
		$('ul-sample-meta').innerHTML = bits.join(' · ');
	} catch (err) {
		if (err.message !== 'unauthorized') toast(err.message, true);
	} finally {
		btn.disabled = false;
		btn.textContent = 'Synthesize';
	}
}

// ── dirty + save ───────────────────────────────────────────────────────────────
function pickEditable(o) { const r = {}; for (const k of EDITABLE) r[k] = o[k]; r.sources = [...(o.sources || [])].sort(); return r; }
function isDirty() { return JSON.stringify(pickEditable(draft)) !== JSON.stringify(pickEditable(loaded)); }
function updateDirty() { $('ul-savebar').hidden = !isDirty(); }

async function save() {
	const payload = {};
	for (const k of EDITABLE) payload[k] = draft[k];
	$('ul-save').disabled = true;
	try {
		const resp = await api('POST', payload);
		loaded = normalize(resp.config);
		draft = { ...loaded };
		renderForm();
		updateDirty();
		toast(loaded.enabled ? 'Saved — launcher is previewing' : 'Saved');
		refresh();
	} catch (err) {
		if (err.message !== 'unauthorized') toast(err.message, true);
	} finally {
		$('ul-save').disabled = false;
	}
}
async function resumeBreaker() {
	try { await api('POST', { action: 'resume' }); toast('Resumed'); refresh(); }
	catch (err) { if (err.message !== 'unauthorized') toast(err.message, true); }
}

// ── toast ──────────────────────────────────────────────────────────────────────
let toastTimer = null;
function toast(msg, isErr) {
	const t = $('ul-toast');
	t.textContent = msg;
	t.classList.toggle('is-err', !!isErr);
	t.hidden = false;
	clearTimeout(toastTimer);
	toastTimer = setTimeout(() => { t.hidden = true; }, 3200);
}

// ── formatters ─────────────────────────────────────────────────────────────────
function num(n) { return Number(n || 0).toLocaleString(); }
function trunc(s, n) { s = String(s || ''); return s.length > n ? s.slice(0, n - 1) + '…' : s; }
function statusLabel(s) { return { dry_run: 'preview', confirmed: 'live', launched: 'live' }[s] || s; }
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
	try { await load(); } catch (err) { if (err.message !== 'unauthorized') showGate(); }
})();

/**
 * Endpoint Revenue — the public, live view of USDC flowing INTO three.ws's own
 * x402 paid endpoints. The mirror of the Money Pulse (which shows agent SPEND):
 * this page reads the platform's revenue ledger via GET /api/x402-revenue.
 *
 *   GET /api/x402-revenue?view=stats&period=  totals, per-endpoint, per-network,
 *                                             time-series, momentum, health
 *   GET /api/x402-revenue?view=feed&…         recent settlements (keyset, filterable)
 *   GET /api/x402-revenue?since=<iso>&…       delta poll — only newer settlements
 *   GET /api/x402-revenue?view=export&…       CSV of the window
 *
 * Every row is a real, explorer-verifiable settlement. No synthetic events: a
 * quiet platform shows an honest empty state.
 */
import { updateValue } from './ui-juice.js';
import { timeAgo } from './shared/pulse-format.js';

const POLL_MS = 12_000; // live delta cadence when visible
const STATS_REFRESH_MS = 60_000;
const PERIODS = ['24h', '7d', '30d', 'all'];
const NETWORKS = ['solana', 'base', 'bsc'];

const $ = (id) => document.getElementById(id);

const state = {
	period: '24h',
	endpoint: null, // slug feed filter
	network: null, // network feed filter
	query: '', // client-side search
	paused: false,
	sound: false,
	seen: new Set(),
	latestTs: null,
	cursor: null, // oldest ts loaded (load-more)
	pollTimer: null,
	statsTimer: null,
	firstChart: true,
};

// ── formatters ───────────────────────────────────────────────────────────────
function fmtUsd(v) {
	const n = Number(v) || 0;
	if (n === 0) return '$0';
	if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
	if (n >= 1000) return `$${(n / 1000).toFixed(1)}k`;
	if (n >= 1) return `$${n.toFixed(2)}`;
	if (n >= 0.01) return `$${n.toFixed(3)}`;
	return `$${n.toFixed(6).replace(/0+$/, '').replace(/\.$/, '')}`;
}
function fmtInt(v) {
	return new Intl.NumberFormat('en-US').format(Math.round(Number(v) || 0));
}
function fmtPct(v) {
	return `${Math.round((Number(v) || 0) * 100)}%`;
}
function fmtSignedPct(v) {
	const n = Math.round((Number(v) || 0) * 100);
	return `${n > 0 ? '+' : ''}${n}%`;
}
function esc(s) {
	return String(s ?? '').replace(
		/[&<>"']/g,
		(c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
	);
}
// '/api/x402/token-intel' → 'token-intel'
function endpointLabel(route) {
	const m = String(route || '').match(/\/api\/x402\/([^?]+)/);
	return m ? m[1] : (route || 'unknown').replace(/^\/api\//, '');
}

// ── URL deep-link ────────────────────────────────────────────────────────────
function readUrl() {
	const p = new URLSearchParams(location.search);
	const per = p.get('period');
	if (PERIODS.includes(per)) state.period = per;
	const ep = (p.get('endpoint') || '').replace(/[^a-z0-9-]/gi, '');
	if (ep) state.endpoint = ep;
	const net = (p.get('network') || '').toLowerCase();
	if (NETWORKS.includes(net)) state.network = net;
}
function writeUrl() {
	const p = new URLSearchParams();
	if (state.period !== '24h') p.set('period', state.period);
	if (state.endpoint) p.set('endpoint', state.endpoint);
	if (state.network) p.set('network', state.network);
	const qs = p.toString();
	history.replaceState(null, '', qs ? `${location.pathname}?${qs}` : location.pathname);
}
function feedParams(extra = {}) {
	const p = new URLSearchParams();
	if (state.endpoint) p.set('endpoint', state.endpoint);
	if (state.network) p.set('network', state.network);
	for (const [k, v] of Object.entries(extra)) if (v != null) p.set(k, String(v));
	return p.toString();
}

// ── toast ─────────────────────────────────────────────────────────────────────
let toastTimer = null;
function toast(msg) {
	const el = $('xr-toast');
	if (!el) return;
	el.textContent = msg;
	el.hidden = false;
	requestAnimationFrame(() => el.classList.add('show'));
	clearTimeout(toastTimer);
	toastTimer = setTimeout(() => {
		el.classList.remove('show');
		setTimeout(() => (el.hidden = true), 220);
	}, 1800);
}

// ── stats ─────────────────────────────────────────────────────────────────────
function setCounter(id, value, format) {
	const el = $(id);
	if (!el) return;
	if (value == null || !Number.isFinite(Number(value))) {
		el.textContent = '—';
		delete el.dataset.juiceVal;
		return;
	}
	updateValue(el, Number(value), format);
}

async function loadStats() {
	let res;
	try {
		res = await fetch(
			`/api/x402-revenue?view=stats&period=${encodeURIComponent(state.period)}`,
			{
				headers: { accept: 'application/json' },
			},
		);
	} catch {
		return; // transient blip — keep last-known
	}
	if (!res.ok) return;
	const { data } = await res.json();
	if (!data) return;
	renderStats(data);
	const u = $('xr-updated');
	if (u) u.textContent = `updated ${timeAgo(new Date().toISOString())}`;
}

function renderStats(d) {
	const t = d.totals || {};
	setCounter('xr-c-gross', Number(t.gross_usd), fmtUsd);
	setCounter('xr-c-count', Number(t.total_payments), fmtInt);
	setCounter('xr-c-payers', Number(t.unique_payers), fmtInt);
	setCounter('xr-c-net', Number(t.net_platform_usd), fmtUsd);

	const health = d.settlement_health || {};
	setCounter('xr-c-success', Number(health.success_rate), fmtPct);
	const ss = $('xr-c-success-sub');
	if (ss)
		ss.textContent = `${fmtInt(health.settled || 0)} ok · ${fmtInt(health.failed || 0)} failed`;

	const gs = $('xr-c-gross-sub');
	if (gs)
		gs.textContent = `${fmtInt(t.total_payments || 0)} settled · avg ${fmtUsd(t.avg_payment_usd)}`;

	for (const id of ['xr-window-label', 'xr-top-window', 'xr-net-window']) {
		const el = $(id);
		if (el) el.textContent = d.period || state.period;
	}

	renderMomentum(d.momentum);
	renderRunRate(d.momentum);
	renderChart(d.series);
	renderTopEndpoints(d.by_endpoint || []);
	renderNetworks(d.by_network || []);
	renderChips(d.by_endpoint || [], d.by_network || []);
}

function renderMomentum(m) {
	const el = $('xr-momentum');
	if (!el) return;
	if (!m || m.change_pct == null) {
		el.hidden = true;
		return;
	}
	const pct = Number(m.change_pct);
	const dir = pct > 0.001 ? 'up' : pct < -0.001 ? 'down' : 'flat';
	el.dataset.dir = dir;
	const arrow = dir === 'up' ? '▲' : dir === 'down' ? '▼' : '→';
	el.textContent = `${arrow} ${fmtSignedPct(pct)} vs prev ${state.period}`;
	el.hidden = false;
}

function renderRunRate(m) {
	const el = $('xr-runrate');
	if (!el) return;
	el.textContent = m && m.per_hour_usd != null ? fmtUsd(m.per_hour_usd) : '—';
}

function renderTopEndpoints(rows) {
	const host = $('xr-top');
	if (!host) return;
	if (!rows.length) {
		host.innerHTML = `<p class="xr-empty">No endpoint has earned in this window yet.</p>`;
		return;
	}
	const max = Math.max(...rows.map((r) => Number(r.gross_usd) || 0), 0);
	host.innerHTML = rows
		.slice(0, 8)
		.map((r) => {
			const g = Number(r.gross_usd) || 0;
			const slug = endpointLabel(r.endpoint);
			const pct = max > 0 ? Math.max(2, Math.round((g / max) * 100)) : 2;
			const active = state.endpoint === slug ? ' active' : '';
			return (
				`<div class="xr-top-row${active}" role="button" tabindex="0" data-endpoint="${esc(slug)}" aria-label="Filter feed to ${esc(slug)}">` +
				`<span class="xr-top-bar" style="width:${pct}%" aria-hidden="true"></span>` +
				`<span class="xr-top-name">${esc(slug)}</span>` +
				`<span class="xr-top-val">${fmtUsd(g)}<small>${fmtInt(r.count)} call${r.count === 1 ? '' : 's'}</small></span>` +
				`</div>`
			);
		})
		.join('');
	for (const el of host.querySelectorAll('[data-endpoint]')) {
		const slug = el.dataset.endpoint;
		el.addEventListener('click', () => toggleEndpoint(slug));
		el.addEventListener('keydown', (e) => {
			if (e.key === 'Enter' || e.key === ' ') {
				e.preventDefault();
				toggleEndpoint(slug);
			}
		});
	}
}

function renderNetworks(rows) {
	const host = $('xr-networks');
	if (!host) return;
	const real = rows.filter((r) => Number(r.gross_usd) > 0 || Number(r.count) > 0);
	if (!real.length) {
		host.innerHTML = `<p class="xr-empty">No network revenue in this window yet.</p>`;
		return;
	}
	const max = Math.max(...real.map((r) => Number(r.gross_usd) || 0), 0);
	host.innerHTML = real
		.map((r) => {
			const g = Number(r.gross_usd) || 0;
			const pct = max > 0 ? Math.max(3, Math.round((g / max) * 100)) : 3;
			return (
				`<div class="xr-net-row">` +
				`<span class="xr-net-name">${esc(r.network)}</span>` +
				`<span class="xr-net-track"><span class="xr-net-fill" style="width:${pct}%"></span></span>` +
				`<span class="xr-net-val">${fmtUsd(g)}</span>` +
				`</div>`
			);
		})
		.join('');
}

// ── SVG area chart ────────────────────────────────────────────────────────────
function bucketStepMs(unit) {
	return unit === 'day' ? 86_400_000 : 3_600_000;
}
function truncUTC(ms, unit) {
	const d = new Date(ms);
	if (unit === 'day') d.setUTCHours(0, 0, 0, 0);
	else d.setUTCMinutes(0, 0, 0);
	return d.getTime();
}
// Fill gaps (buckets with no revenue) so the area stays continuous and honest.
function fillGaps(series) {
	const unit = series?.unit || 'hour';
	const pts = (series?.points || []).map((p) => ({
		ms: Date.parse(p.ts),
		gross: Number(p.gross_usd) || 0,
		count: p.count || 0,
	}));
	if (!pts.length) return { unit, points: [] };
	const step = bucketStepMs(unit);
	const map = new Map(pts.map((p) => [truncUTC(p.ms, unit), p]));
	const start = truncUTC(pts[0].ms, unit);
	const end = truncUTC(Date.now(), unit);
	const out = [];
	for (let t = start; t <= end && out.length < 400; t += step) {
		const p = map.get(t);
		out.push({
			ts: new Date(t).toISOString(),
			gross_usd: p ? p.gross : 0,
			count: p ? p.count : 0,
		});
	}
	return { unit, points: out };
}
function bucketLabel(iso, unit) {
	const d = new Date(iso);
	if (unit === 'day') return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
	return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
}

function renderChart(series) {
	const host = $('xr-chart');
	const empty = $('xr-chart-empty');
	if (!host) return;
	const filled = fillGaps(series);
	const points = filled.points;
	const hasData = points.some((p) => p.gross_usd > 0);
	if (!points.length || !hasData) {
		host.innerHTML = '';
		if (empty) empty.hidden = false;
		host._points = null;
		return;
	}
	if (empty) empty.hidden = true;

	const W = 800;
	const H = 160;
	const pad = 8;
	const n = points.length;
	const max = Math.max(...points.map((p) => p.gross_usd), 0.000001);
	const x = (i) => pad + (i / (n - 1 || 1)) * (W - 2 * pad);
	const y = (v) => H - pad - (v / max) * (H - 2 * pad);
	const pairs = points.map((p, i) => `${x(i).toFixed(1)},${y(p.gross_usd).toFixed(1)}`);
	const linePath = `M${pairs.join(' L')}`;
	const areaPath = `M${x(0).toFixed(1)},${H} L${pairs.join(' L')} L${x(n - 1).toFixed(1)},${H} Z`;
	const drawCls = state.firstChart ? ' xr-chart-draw' : '';

	host.innerHTML =
		`<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true">` +
		`<defs><linearGradient id="xrGrad" x1="0" y1="0" x2="0" y2="1">` +
		`<stop offset="0%" stop-color="var(--xr-accent)" stop-opacity="0.32"/>` +
		`<stop offset="100%" stop-color="var(--xr-accent)" stop-opacity="0"/>` +
		`</linearGradient></defs>` +
		`<path class="xr-chart-area" d="${areaPath}" fill="url(#xrGrad)"/>` +
		`<line class="xr-chart-cross" id="xr-cross" x1="0" y1="0" x2="0" y2="${H}" vector-effect="non-scaling-stroke" style="display:none"/>` +
		`<path class="xr-chart-line${drawCls}" d="${linePath}" vector-effect="non-scaling-stroke"/>` +
		`<circle class="xr-chart-dot" id="xr-dot" r="3.5" vector-effect="non-scaling-stroke" style="display:none"/>` +
		`</svg>`;

	// animate the draw only the first time
	if (state.firstChart) {
		const line = host.querySelector('.xr-chart-line');
		if (line) {
			try {
				const len = line.getTotalLength();
				line.style.setProperty('--len', String(Math.ceil(len)));
			} catch {
				line.classList.remove('xr-chart-draw');
			}
		}
		state.firstChart = false;
	}

	host._points = { points, unit: filled.unit, x, y, W, H };
	wireChartHover(host);
}

function wireChartHover(host) {
	const tip = $('xr-chart-tip');
	const move = (clientX) => {
		const ctx = host._points;
		if (!ctx) return;
		const rect = host.getBoundingClientRect();
		const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
		const idx = Math.round(ratio * (ctx.points.length - 1));
		const p = ctx.points[idx];
		if (!p) return;
		const cross = host.querySelector('#xr-cross');
		const dot = host.querySelector('#xr-dot');
		const cx = ctx.x(idx);
		const cy = ctx.y(p.gross_usd);
		if (cross) {
			cross.setAttribute('x1', cx);
			cross.setAttribute('x2', cx);
			cross.style.display = '';
		}
		if (dot) {
			dot.setAttribute('cx', cx);
			dot.setAttribute('cy', cy);
			dot.style.display = '';
		}
		if (tip) {
			tip.innerHTML = `<b>${fmtUsd(p.gross_usd)}</b> <span>· ${esc(bucketLabel(p.ts, ctx.unit))} · ${fmtInt(p.count)} call${p.count === 1 ? '' : 's'}</span>`;
			tip.style.left = `${(cx / ctx.W) * 100}%`;
			tip.hidden = false;
		}
	};
	host.onpointermove = (e) => move(e.clientX);
	host.onpointerleave = () => {
		const cross = host.querySelector('#xr-cross');
		const dot = host.querySelector('#xr-dot');
		if (cross) cross.style.display = 'none';
		if (dot) dot.style.display = 'none';
		if (tip) tip.hidden = true;
	};
}

// ── filter chips ──────────────────────────────────────────────────────────────
function renderChips(topEndpoints, networks) {
	const host = $('xr-chips');
	if (!host) return;
	const chips = [];
	const anyFilter = state.endpoint || state.network;
	chips.push(
		`<button type="button" class="xr-chip${anyFilter ? '' : ' active'}" data-all="1">All</button>`,
	);
	for (const r of topEndpoints.slice(0, 6)) {
		const slug = endpointLabel(r.endpoint);
		const active = state.endpoint === slug ? ' active' : '';
		chips.push(
			`<button type="button" class="xr-chip${active}" data-endpoint="${esc(slug)}">${esc(slug)}</button>`,
		);
	}
	for (const r of networks.filter((nr) => Number(nr.count) > 0).slice(0, 4)) {
		if (!NETWORKS.includes(r.network)) continue;
		const active = state.network === r.network ? ' active' : '';
		chips.push(
			`<button type="button" class="xr-chip${active}" data-network="${esc(r.network)}">${esc(r.network)}</button>`,
		);
	}
	host.innerHTML = chips.join('');
	host.querySelector('[data-all]')?.addEventListener('click', clearFilters);
	for (const el of host.querySelectorAll('[data-endpoint]')) {
		el.addEventListener('click', () => toggleEndpoint(el.dataset.endpoint));
	}
	for (const el of host.querySelectorAll('[data-network]')) {
		el.addEventListener('click', () => toggleNetwork(el.dataset.network));
	}
}

function toggleEndpoint(slug) {
	state.endpoint = state.endpoint === slug ? null : slug;
	writeUrl();
	reloadFeed();
	loadStats(); // refresh chip active states
}
function toggleNetwork(net) {
	state.network = state.network === net ? null : net;
	writeUrl();
	reloadFeed();
	loadStats();
}
function clearFilters() {
	if (!state.endpoint && !state.network) return;
	state.endpoint = null;
	state.network = null;
	writeUrl();
	reloadFeed();
	loadStats();
}

// ── feed ────────────────────────────────────────────────────────────────────
function setFeedState(s) {
	const el = $('xr-feed-state');
	if (!el) return;
	el.dataset.state = s;
	el.textContent =
		s === 'live'
			? 'live'
			: s === 'paused'
				? 'paused'
				: s === 'error'
					? 'reconnecting…'
					: s === 'empty'
						? 'no activity yet'
						: 'connecting…';
}

function searchText(e) {
	return `${endpointLabel(e.route)} ${e.payer || ''} ${e.tx || ''} ${e.network || ''}`.toLowerCase();
}

function rowHTML(e) {
	const label = endpointLabel(e.route);
	const tx = e.tx_url
		? `<a class="xr-row-tx" href="${esc(e.tx_url)}" target="_blank" rel="noopener" aria-label="View transaction on explorer">tx ↗</a>`
		: '';
	const payer = e.payer
		? `<span class="xr-row-payer" title="payer wallet">${esc(e.payer)}</span>`
		: '';
	const net = e.network ? `<span class="xr-row-net">${esc(e.network)}</span>` : '';
	const hidden = state.query && !searchText(e).includes(state.query) ? ' hidden' : '';
	return (
		`<div class="xr-row${hidden}" data-id="${esc(e.id)}" data-tx="${esc(e.tx || '')}" data-search="${esc(searchText(e))}" role="button" tabindex="0" aria-label="${esc(label)} settled ${esc(e.amount_usd)} — click to copy tx">` +
		`<span class="xr-row-glyph" aria-hidden="true">→</span>` +
		`<span class="xr-row-body">` +
		`<span class="xr-row-line"><span class="xr-row-ep">${esc(label)}</span> ${payer}</span>` +
		`<span class="xr-row-meta">${net}<span class="xr-row-time">${esc(timeAgo(e.ts))}</span></span>` +
		`</span>` +
		`<span class="xr-row-amt">${fmtUsd(e.amount_usd)}${tx}</span>` +
		`</div>`
	);
}

function wireRow(node) {
	node.addEventListener('click', (e) => {
		if (e.target.closest('.xr-row-tx')) return; // let the explorer link work
		const tx = node.dataset.tx;
		if (tx && navigator.clipboard) {
			navigator.clipboard.writeText(tx).then(
				() => toast('Transaction signature copied'),
				() => toast(tx.slice(0, 16) + '…'),
			);
		}
	});
	node.addEventListener('keydown', (e) => {
		if (e.key === 'Enter') node.click();
	});
}

function showSkeleton() {
	const host = $('xr-feed');
	if (!host) return;
	host.innerHTML = Array.from({ length: 6 }, () => `<div class="xr-skel"></div>`).join('');
}

function renderInitialFeed(events) {
	const host = $('xr-feed');
	if (!host) return;
	if (!events.length) {
		const filtered = state.endpoint || state.network;
		host.innerHTML =
			`<div class="xr-feed-empty">` +
			`<p class="xr-feed-empty-h">${filtered ? 'No settlements match this filter yet.' : 'No settled payments yet.'}</p>` +
			`<p class="xr-feed-empty-p">${
				filtered
					? 'Clear the filter to see the whole feed, or wait for the next matching settlement to land.'
					: 'The instant an agent or app pays one of the platform\'s x402 endpoints, the settlement lands here — live and verifiable. Browse what\'s payable in the <a href="/docs/x402-endpoints">endpoint catalog</a>.'
			}</p>` +
			`</div>`;
		setFeedState('empty');
		state.latestTs = null;
		return;
	}
	host.innerHTML = events.map(rowHTML).join('');
	for (const node of host.querySelectorAll('.xr-row')) wireRow(node);
	for (const e of events) state.seen.add(e.id);
	state.latestTs = events[0].ts;
	setFeedState(state.paused ? 'paused' : 'live');
}

function prependEvents(events) {
	const host = $('xr-feed');
	if (!host) return;
	const fresh = events.filter((e) => !state.seen.has(e.id));
	if (!fresh.length) return;
	const emptyEl = host.querySelector('.xr-feed-empty');
	if (emptyEl) host.innerHTML = '';
	const frag = document.createElement('div');
	frag.innerHTML = fresh.map(rowHTML).join('');
	const nodes = Array.from(frag.children).reverse();
	for (const node of nodes) {
		node.classList.add('xr-row--new');
		wireRow(node);
		host.prepend(node);
	}
	for (const e of fresh) state.seen.add(e.id);
	state.latestTs = fresh[0].ts;
	chime();
	const rows = host.querySelectorAll('.xr-row');
	for (let i = 240; i < rows.length; i++) rows[i].remove();
}

async function loadInitialFeed() {
	setFeedState('loading');
	showSkeleton();
	state.seen.clear();
	let res;
	try {
		res = await fetch(`/api/x402-revenue?view=feed&limit=30&${feedParams()}`, {
			headers: { accept: 'application/json' },
		});
	} catch {
		setFeedState('error');
		return;
	}
	if (!res.ok) {
		setFeedState('error');
		return;
	}
	const { data } = await res.json();
	renderInitialFeed(data?.events || []);
	state.cursor = data?.next_cursor || null;
	const more = $('xr-more');
	if (more) more.hidden = !state.cursor;
}

function reloadFeed() {
	loadInitialFeed();
}

async function loadMore() {
	if (!state.cursor) return;
	const more = $('xr-more');
	if (more) more.textContent = 'Loading…';
	let res;
	try {
		res = await fetch(
			`/api/x402-revenue?view=feed&limit=30&${feedParams({ cursor: state.cursor })}`,
			{
				headers: { accept: 'application/json' },
			},
		);
	} catch {
		if (more) more.textContent = 'Load older settlements';
		return;
	}
	const { data } = res.ok ? await res.json() : { data: null };
	const host = $('xr-feed');
	const events = (data?.events || []).filter((e) => !state.seen.has(e.id));
	if (host && events.length) {
		const frag = document.createElement('div');
		frag.innerHTML = events.map(rowHTML).join('');
		for (const node of Array.from(frag.children)) {
			wireRow(node);
			host.appendChild(node);
		}
		for (const e of events) state.seen.add(e.id);
	}
	state.cursor = data?.next_cursor || null;
	if (more) {
		more.hidden = !state.cursor;
		more.textContent = 'Load older settlements';
	}
}

async function pollDelta() {
	if (state.paused || !state.latestTs) return;
	let res;
	try {
		res = await fetch(`/api/x402-revenue?${feedParams({ since: state.latestTs })}`, {
			headers: { accept: 'application/json' },
		});
	} catch {
		setFeedState('error');
		return;
	}
	if (!res.ok) {
		setFeedState('error');
		return;
	}
	const { data } = await res.json();
	prependEvents(data?.events || []);
	setFeedState('live');
}

function startPolling() {
	if (state.pollTimer) return;
	state.pollTimer = setInterval(() => {
		if (document.hidden || state.paused) return;
		state.latestTs ? pollDelta() : loadInitialFeed();
	}, POLL_MS);
}

// ── controls ──────────────────────────────────────────────────────────────────
function setPeriod(period) {
	const target = PERIODS.includes(period) ? period : '24h';
	if (target === state.period) return;
	state.period = target;
	for (const b of document.querySelectorAll('[data-period]')) {
		const on = b.dataset.period === target;
		b.classList.toggle('active', on);
		b.setAttribute('aria-selected', String(on));
	}
	writeUrl();
	loadStats();
}
function wirePeriod() {
	for (const btn of document.querySelectorAll('[data-period]')) {
		btn.addEventListener('click', () => setPeriod(btn.dataset.period));
		btn.addEventListener('keydown', (e) => {
			if (e.key === 'Enter' || e.key === ' ') {
				e.preventDefault();
				setPeriod(btn.dataset.period);
			}
		});
	}
	// reflect restored period in the tab UI
	for (const b of document.querySelectorAll('[data-period]')) {
		const on = b.dataset.period === state.period;
		b.classList.toggle('active', on);
		b.setAttribute('aria-selected', String(on));
	}
}

function togglePause() {
	state.paused = !state.paused;
	const btn = $('xr-pause');
	if (btn) {
		btn.setAttribute('aria-pressed', String(state.paused));
		btn.querySelector('.xr-pause-ico').textContent = state.paused ? '▶' : '॥';
	}
	setFeedState(state.paused ? 'paused' : 'live');
	if (!state.paused) pollDelta();
	toast(state.paused ? 'Live feed paused' : 'Live feed resumed');
}

let audioCtx = null;
function chime() {
	if (!state.sound) return;
	try {
		audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
		const t = audioCtx.currentTime;
		const o = audioCtx.createOscillator();
		const g = audioCtx.createGain();
		o.type = 'sine';
		o.frequency.setValueAtTime(880, t);
		o.frequency.exponentialRampToValueAtTime(1320, t + 0.08);
		g.gain.setValueAtTime(0.0001, t);
		g.gain.exponentialRampToValueAtTime(0.06, t + 0.02);
		g.gain.exponentialRampToValueAtTime(0.0001, t + 0.26);
		o.connect(g).connect(audioCtx.destination);
		o.start(t);
		o.stop(t + 0.27);
	} catch {
		/* audio unavailable — silent */
	}
}
function toggleSound() {
	state.sound = !state.sound;
	const btn = $('xr-sound');
	if (btn) btn.setAttribute('aria-pressed', String(state.sound));
	try {
		localStorage.setItem('xr_sound', state.sound ? '1' : '0');
	} catch {
		/* ignore */
	}
	if (state.sound) chime();
	toast(state.sound ? 'Chime on new settlements' : 'Chime off');
}

function exportCsv() {
	const p = new URLSearchParams({ view: 'export', period: state.period });
	if (state.endpoint) p.set('endpoint', state.endpoint);
	if (state.network) p.set('network', state.network);
	window.open(`/api/x402-revenue?${p.toString()}`, '_blank', 'noopener');
	toast('Exporting CSV…');
}

function wireSearch() {
	const input = $('xr-search');
	if (!input) return;
	let deb = null;
	input.addEventListener('input', () => {
		clearTimeout(deb);
		deb = setTimeout(() => {
			state.query = input.value.trim().toLowerCase();
			for (const row of document.querySelectorAll('#xr-feed .xr-row')) {
				row.classList.toggle(
					'hidden',
					state.query && !row.dataset.search.includes(state.query),
				);
			}
		}, 120);
	});
}

function wireKeys() {
	document.addEventListener('keydown', (e) => {
		const typing = e.target.matches('input, textarea, [contenteditable]');
		if (typing) {
			if (e.key === 'Escape') e.target.blur();
			return;
		}
		if (e.metaKey || e.ctrlKey || e.altKey) return;
		if (e.key === '/') {
			e.preventDefault();
			$('xr-search')?.focus();
		} else if (e.key === 'p') {
			togglePause();
		} else if (e.key === 's') {
			toggleSound();
		} else if (e.key === 'e') {
			exportCsv();
		} else if (['1', '2', '3', '4'].includes(e.key)) {
			setPeriod(PERIODS[Number(e.key) - 1]);
		}
	});
}

function onVisibility() {
	if (document.hidden) {
		if (!state.paused) setFeedState('paused');
	} else {
		setFeedState(state.paused ? 'paused' : state.latestTs ? 'live' : 'empty');
		if (!state.paused) pollDelta();
		loadStats();
	}
}

function init() {
	readUrl();
	// restore persisted sound preference
	try {
		state.sound = localStorage.getItem('xr_sound') === '1';
	} catch {
		/* ignore */
	}
	$('xr-sound')?.setAttribute('aria-pressed', String(state.sound));

	wirePeriod();
	wireSearch();
	wireKeys();
	$('xr-pause')?.addEventListener('click', togglePause);
	$('xr-sound')?.addEventListener('click', toggleSound);
	$('xr-export')?.addEventListener('click', exportCsv);
	$('xr-more')?.addEventListener('click', loadMore);

	loadStats();
	loadInitialFeed().then(startPolling);
	state.statsTimer = setInterval(() => {
		if (!document.hidden) loadStats();
	}, STATS_REFRESH_MS);
	document.addEventListener('visibilitychange', onVisibility);
}

if (document.readyState === 'loading') {
	document.addEventListener('DOMContentLoaded', init);
} else {
	init();
}

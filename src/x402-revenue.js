/**
 * Endpoint Revenue — the public, live view of USDC flowing INTO three.ws's own
 * x402 paid endpoints. The mirror of the Money Pulse (which shows agent SPEND):
 * this page reads the platform's revenue ledger via GET /api/x402-revenue.
 *
 *   GET /api/x402-revenue?view=stats&period=  headline totals + top endpoints
 *   GET /api/x402-revenue?view=feed            recent settlements (keyset)
 *   GET /api/x402-revenue?since=<iso>          delta poll — only newer settlements
 *
 * Every row is a real, explorer-verifiable settlement. No synthetic events: a
 * quiet platform shows an honest empty state.
 */
import { updateValue } from './ui-juice.js';
import { timeAgo } from './shared/pulse-format.js';

const POLL_MS = 12_000; // live delta cadence when visible
const STATS_REFRESH_MS = 60_000;

const $ = (id) => document.getElementById(id);

const state = {
	period: '24h',
	latestTs: null, // ISO of the newest settlement we've rendered
	seen: new Set(), // event ids already in the feed (dedupe delta polls)
	pollTimer: null,
	statsTimer: null,
};

// ── formatters ───────────────────────────────────────────────────────────────
function fmtUsd(v) {
	const n = Number(v) || 0;
	if (n === 0) return '$0';
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
		return; // transient network blip — keep last-known counters
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

	const win = $('xr-top-window');
	if (win) win.textContent = d.period || state.period;
	renderTopEndpoints(d.by_endpoint || []);
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
			const pct = max > 0 ? Math.max(2, Math.round((g / max) * 100)) : 2;
			return (
				`<div class="xr-top-row">` +
				`<span class="xr-top-bar" style="width:${pct}%" aria-hidden="true"></span>` +
				`<span class="xr-top-name">${esc(endpointLabel(r.endpoint))}</span>` +
				`<span class="xr-top-val">${fmtUsd(g)}<small>${fmtInt(r.count)} call${r.count === 1 ? '' : 's'}</small></span>` +
				`</div>`
			);
		})
		.join('');
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

function rowHTML(e) {
	const label = endpointLabel(e.route);
	const tx = e.tx_url
		? `<a class="xr-row-tx" href="${esc(e.tx_url)}" target="_blank" rel="noopener" aria-label="View transaction on explorer">tx ↗</a>`
		: '';
	const payer = e.payer
		? `<span class="xr-row-payer" title="payer wallet">${esc(e.payer)}</span>`
		: '';
	const net = e.network ? `<span class="xr-row-net">${esc(e.network)}</span>` : '';
	return (
		`<div class="xr-row" data-id="${esc(e.id)}">` +
		`<span class="xr-row-glyph" aria-hidden="true">→</span>` +
		`<span class="xr-row-body">` +
		`<span class="xr-row-line"><span class="xr-row-ep">${esc(label)}</span> ${payer}</span>` +
		`<span class="xr-row-meta">${net}<span class="xr-row-time">${esc(timeAgo(e.ts))}</span></span>` +
		`</span>` +
		`<span class="xr-row-amt">${fmtUsd(e.amount_usd)}${tx}</span>` +
		`</div>`
	);
}

function renderInitialFeed(events) {
	const host = $('xr-feed');
	if (!host) return;
	if (!events.length) {
		host.innerHTML =
			`<div class="xr-feed-empty">` +
			`<p class="xr-feed-empty-h">No settled payments in this window yet.</p>` +
			`<p class="xr-feed-empty-p">The instant an agent or app pays one of the platform's x402 endpoints, the settlement lands here — live and verifiable. Browse what's payable in the <a href="/docs/x402-endpoints">endpoint catalog</a>.</p>` +
			`</div>`;
		setFeedState('empty');
		return;
	}
	host.innerHTML = events.map(rowHTML).join('');
	for (const e of events) state.seen.add(e.id);
	state.latestTs = events[0].ts;
	setFeedState('live');
}

function prependEvents(events) {
	const host = $('xr-feed');
	if (!host) return;
	const fresh = events.filter((e) => !state.seen.has(e.id));
	if (!fresh.length) return;
	// If the feed was empty, replace the empty-state block first.
	const emptyEl = host.querySelector('.xr-feed-empty');
	if (emptyEl) host.innerHTML = '';
	const frag = document.createElement('div');
	frag.innerHTML = fresh.map(rowHTML).join('');
	// Newest first: insert in reverse so the very latest ends up on top.
	const nodes = Array.from(frag.children).reverse();
	for (const node of nodes) {
		node.classList.add('xr-row--new');
		host.prepend(node);
	}
	for (const e of fresh) state.seen.add(e.id);
	state.latestTs = fresh[0].ts;
	// Trim very long feeds to keep the DOM light.
	const rows = host.querySelectorAll('.xr-row');
	for (let i = 200; i < rows.length; i++) rows[i].remove();
}

async function loadInitialFeed() {
	setFeedState('loading');
	let res;
	try {
		res = await fetch('/api/x402-revenue?view=feed&limit=30', {
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
}

async function pollDelta() {
	if (!state.latestTs) return; // nothing to delta against yet (empty feed)
	let res;
	try {
		res = await fetch(`/api/x402-revenue?since=${encodeURIComponent(state.latestTs)}`, {
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
		if (!document.hidden) {
			// When the feed is empty we re-fetch the head (a first payment may have landed).
			state.latestTs ? pollDelta() : loadInitialFeed();
		}
	}, POLL_MS);
}
function stopPolling() {
	if (state.pollTimer) {
		clearInterval(state.pollTimer);
		state.pollTimer = null;
	}
}

// ── period switch ─────────────────────────────────────────────────────────────
function setPeriod(period) {
	const target = ['24h', '7d', '30d', 'all'].includes(period) ? period : '24h';
	if (target === state.period) return;
	state.period = target;
	for (const b of document.querySelectorAll('[data-period]')) {
		const on = b.dataset.period === target;
		b.classList.toggle('active', on);
		b.setAttribute('aria-selected', String(on));
	}
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
}

function onVisibility() {
	if (document.hidden) {
		setFeedState('paused');
	} else {
		setFeedState(state.latestTs ? 'live' : 'empty');
		pollDelta();
		loadStats();
	}
}

function init() {
	wirePeriod();
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

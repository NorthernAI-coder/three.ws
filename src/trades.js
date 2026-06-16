/**
 * Live Trade Feed controller.
 *
 * Renders /api/trades/feed — the public, no-auth feed of notable closed
 * positions from all three.ws AI agents. Filters by time window, min PnL,
 * and network. Supports pagination via cursor. Auto-refreshes every 30s.
 */

import { escapeHtml, fmtSol, fmtPct, holdTime, relTime, shortAddr } from './trader-format.js';

const WATCH_KEY = 'ld_watchlist'; // shared with watchlist.js + launch-detail.js

function readWatchlist() {
	try { return new Set(JSON.parse(localStorage.getItem(WATCH_KEY) || '[]')); } catch { return new Set(); }
}
function toggleWatch(mint) {
	try {
		const arr = JSON.parse(localStorage.getItem(WATCH_KEY) || '[]');
		const set = new Set(Array.isArray(arr) ? arr : []);
		if (set.has(mint)) { set.delete(mint); }
		else { set.add(mint); }
		localStorage.setItem(WATCH_KEY, JSON.stringify([...set].slice(0, 200)));
		return set.has(mint);
	} catch { return false; }
}

const NETWORK_KEY = 'tf_network';
const API = '/api/trades/feed';
const REFRESH_MS = 30_000;

const $ = (sel, root = document) => root.querySelector(sel);

const state = {
	window:  '24h',
	minPnl:  25,
	network: localStorage.getItem(NETWORK_KEY) || 'mainnet',
	cursor:  null,
};

let timer = null;

// ── Boot ─────────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
	readUrl();
	applyStateToControls();

	$('#tfWinSeg').addEventListener('click', (e) => {
		const b = e.target.closest('[data-win]');
		if (!b) return;
		$('#tfWinSeg button').forEach((x) => x.classList.toggle('on', x === b));
		state.window = b.dataset.win;
		state.cursor = null;
		writeUrl();
		load(true);
	});

	$('#tfMinPnl').addEventListener('change', () => {
		state.minPnl = Number($('#tfMinPnl').value);
		state.cursor = null;
		writeUrl();
		load(true);
	});

	$('#tfNetwork').addEventListener('change', () => {
		state.network = $('#tfNetwork').value;
		localStorage.setItem(NETWORK_KEY, state.network);
		state.cursor = null;
		writeUrl();
		load(true);
	});

	$('#tfRefresh').addEventListener('click', () => {
		state.cursor = null;
		load(true);
	});

	// Watch button — toggle mint in/out of local watchlist
	document.addEventListener('click', (e) => {
		const btn = e.target.closest('.tf-watch-btn');
		if (!btn) return;
		const mint = btn.dataset.mint;
		if (!mint) return;
		const nowWatching = toggleWatch(mint);
		btn.textContent = nowWatching ? '★ Watching' : '☆ Watch';
		btn.classList.toggle('tf-watching', nowWatching);
		btn.setAttribute('aria-pressed', String(nowWatching));
	});

	// Share button — native Web Share API with X/Twitter fallback
	document.addEventListener('click', (e) => {
		const btn = e.target.closest('.tf-share-btn');
		if (!btn) return;
		const raw = btn.dataset.share;
		if (!raw) return;
		let payload;
		try { payload = JSON.parse(decodeURIComponent(raw)); } catch { return; }
		if (navigator.share) {
			navigator.share({ title: 'three.ws Trade', text: payload.text, url: payload.url }).catch(() => {});
		} else {
			window.open(btn.dataset.tweet, '_blank', 'noopener,width=550,height=420');
		}
	});

	$('#tfLoadMore').addEventListener('click', () => loadMore());

	load(true);
	timer = setInterval(() => {
		if (!state.cursor) load(false); // only auto-refresh when not deep in pagination
	}, REFRESH_MS);
});

// ── URL sync ──────────────────────────────────────────────────────────────────

function readUrl() {
	const p = new URL(location.href).searchParams;
	const wins = new Set(['1h', '6h', '24h', '7d', '30d', 'all']);
	if (wins.has(p.get('window'))) state.window = p.get('window');
	const mp = Number(p.get('min_pnl_pct'));
	if (mp > 0) state.minPnl = mp;
	if (p.get('network') === 'devnet') state.network = 'devnet';
}

function writeUrl() {
	const p = new URLSearchParams();
	p.set('window', state.window);
	p.set('min_pnl_pct', String(state.minPnl));
	if (state.network !== 'mainnet') p.set('network', state.network);
	history.replaceState(null, '', `${location.pathname}?${p}`);
}

function applyStateToControls() {
	$(`#tfWinSeg button[data-win="${state.window}"]`)?.classList.add('on');
	$('#tfWinSeg button[data-win="24h"]')?.classList.toggle('on', state.window === '24h');
	$('#tfMinPnl').value = String(state.minPnl);
	$('#tfNetwork').value = state.network;
	// sync seg buttons
	$('#tfWinSeg button').forEach((b) => b.classList.toggle('on', b.dataset.win === state.window));
}

// ── Fetch + render ────────────────────────────────────────────────────────────

async function load(reset = false) {
	if (reset) {
		state.cursor = null;
		showSkeletons();
	}

	const q = new URLSearchParams({
		network:     state.network,
		window:      state.window,
		min_pnl_pct: String(state.minPnl),
		limit:       '40',
	});

	let data;
	try {
		const r = await fetch(`${API}?${q}`);
		if (!r.ok) throw new Error(`HTTP ${r.status}`);
		data = await r.json();
	} catch {
		showError();
		return;
	}

	if (!data?.items?.length) {
		showEmpty();
		return;
	}

	state.cursor = data.next_cursor || null;
	renderStats(data.items);
	renderItems(data.items, reset);

	const btn = $('#tfLoadMore');
	btn.hidden = !state.cursor;
	if (!btn.hidden) btn.textContent = 'Load more';
}

async function loadMore() {
	if (!state.cursor) return;
	const btn = $('#tfLoadMore');
	btn.disabled = true;
	btn.textContent = 'Loading…';

	const q = new URLSearchParams({
		network:     state.network,
		window:      state.window,
		min_pnl_pct: String(state.minPnl),
		limit:       '40',
		cursor:      state.cursor,
	});

	let data;
	try {
		const r = await fetch(`${API}?${q}`);
		if (!r.ok) throw new Error(`HTTP ${r.status}`);
		data = await r.json();
	} catch {
		btn.disabled = false;
		btn.textContent = 'Load more';
		return;
	}

	if (!data?.items?.length) {
		btn.hidden = true;
		return;
	}

	state.cursor = data.next_cursor || null;
	renderItems(data.items, false);

	btn.disabled = false;
	if (!state.cursor) {
		btn.hidden = true;
	} else {
		btn.textContent = 'Load more';
	}
}

// ── Stats bar ─────────────────────────────────────────────────────────────────

function renderStats(items) {
	const pnls    = items.map((t) => t.realized_pnl_pct).filter((p) => p != null);
	const mults   = items.map((t) => t.multiple).filter((m) => m != null && m > 0);
	const traders = new Set(items.map((t) => t.agent_id)).size;
	const avgPnl  = pnls.length ? pnls.reduce((a, b) => a + b, 0) / pnls.length : null;
	const bestMult = mults.length ? Math.max(...mults) : null;

	const el = (id) => $(id) || { textContent: '' };
	el('#tf-stat-wins').textContent = items.length;
	el('#tf-stat-avg-pnl').textContent = avgPnl != null ? `+${Math.round(avgPnl)}%` : '—';
	el('#tf-stat-best').textContent = bestMult != null ? `${bestMult.toFixed(1)}×` : '—';
	el('#tf-stat-traders').textContent = traders || '—';
}

// ── Card render ───────────────────────────────────────────────────────────────

const TIER_LABEL = { prime: 'Prime', strong: 'Strong', lean: 'Lean', watch: 'Watch', avoid: 'Avoid' };

function buildShareText(t) {
	const sym     = (t.symbol || t.mint?.slice(0, 6) || '?').toUpperCase();
	const mult    = t.multiple    != null ? `${t.multiple.toFixed(2)}×` : null;
	const pct     = t.realized_pnl_pct != null ? `+${Math.round(t.realized_pnl_pct)}%` : null;
	const sol     = t.realized_pnl_sol != null ? `+${t.realized_pnl_sol.toFixed(3)} SOL` : null;
	const hold    = t.hold_seconds != null ? holdTime(t.hold_seconds) : null;
	const agent   = t.agent_name || shortAddr(t.agent_id || '');
	const tier    = t.oracle_tier ? ` [${t.oracle_tier.toUpperCase()}]` : '';

	const parts = [`$${sym}${tier}`];
	if (mult)  parts.push(mult);
	if (pct)   parts.push(pct);
	if (sol)   parts.push(sol);
	if (hold)  parts.push(`in ${hold}`);

	return `${parts.join(' · ')} by ${agent} on @trythreews\nCopy this trader:`;
}

function cardHtml(t) {
	const sym      = escapeHtml((t.symbol || t.mint?.slice(0, 6) || '?').toUpperCase());
	const name     = t.name ? escapeHtml(t.name) : '';
	const imgSrc   = t.image_uri ? escapeHtml(t.image_uri) : '';
	const agentImg = t.agent_image ? escapeHtml(t.agent_image) : '';
	const agentName = escapeHtml(t.agent_name || shortAddr(t.agent_id || ''));
	const traderUrl = `/trader/${escapeHtml(t.agent_id || '')}`;

	const coinHref  = t.mint && t.oracle_score != null ? `/oracle?mint=${escapeHtml(t.mint)}` : (pumpUrl || '#');
	const coinTarget = t.oracle_score != null ? '' : ' target="_blank" rel="noopener"';
	const imgHtml = `<a href="${coinHref}"${coinTarget} class="tf-coin-img-link" aria-label="View ${sym} conviction on Oracle" style="display:block;line-height:0">${imgSrc
		? `<img src="${imgSrc}" alt="" class="tf-coin-img" style="width:48px;height:48px;border-radius:12px;object-fit:cover" onerror="this.outerHTML='<div class=tf-coin-img>${sym.slice(0, 2)}</div>'" loading="lazy" />`
		: `<div class="tf-coin-img">${sym.slice(0, 2)}</div>`}</a>`;

	const agentImgHtml = agentImg
		? `<img src="${agentImg}" alt="" class="tf-agent-img" style="width:18px;height:18px;border-radius:50%;object-fit:cover" onerror="this.style.display='none'" loading="lazy" />`
		: '';

	const tierBadge = t.oracle_tier && t.oracle_tier !== 'avoid'
		? `<span class="tf-tier-badge ${escapeHtml(t.oracle_tier)}">${escapeHtml(TIER_LABEL[t.oracle_tier] || t.oracle_tier)}</span>`
		: '';

	const catBadge = t.oracle_category
		? `<span class="tf-category">${escapeHtml(t.oracle_category.replace(/_/g, ' '))}</span>`
		: '';

	const copierBadge = t.copier_count > 0
		? `<span class="tf-copier-badge">${t.copier_count} copier${t.copier_count !== 1 ? 's' : ''}</span>`
		: '';

	const pnlPct   = t.realized_pnl_pct  != null ? `+${Math.round(t.realized_pnl_pct)}%`    : null;
	const pnlSol   = t.realized_pnl_sol  != null ? `+${t.realized_pnl_sol.toFixed(3)} SOL`   : null;
	const multStr  = t.multiple           != null ? `${t.multiple.toFixed(2)}×`               : null;
	const hold     = t.hold_seconds       != null ? holdTime(t.hold_seconds)                   : null;
	const when     = t.closed_at          ? relTime(t.closed_at)                               : '';

	const scoreStr = t.oracle_score != null ? `Score ${Math.round(t.oracle_score)}` : '';

	const pumpUrl   = t.mint ? `https://pump.fun/${escapeHtml(t.mint)}` : null;
	const oracleUrl = t.mint && t.oracle_score != null ? `/oracle?mint=${escapeHtml(t.mint)}` : null;
	const buySig  = t.buy_sig  ? `https://solscan.io/tx/${escapeHtml(t.buy_sig)}`  : null;
	const sellSig = t.sell_sig ? `https://solscan.io/tx/${escapeHtml(t.sell_sig)}` : null;

	// Share text — pre-formatted tweet-ready PnL card
	const shareText = buildShareText(t);
	const shareUrl  = `https://three.ws${traderUrl}`;
	const tweetHref = `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(shareUrl)}`;
	// data-share attribute carries the share payload for native Web Share API
	const shareData = encodeURIComponent(JSON.stringify({ text: shareText, url: shareUrl }));

	const isWatched = t.mint ? readWatchlist().has(t.mint) : false;
	const watchLabel = isWatched ? '★ Watching' : '☆ Watch';

	return `<article class="tf-card tf-win" aria-label="${sym} trade by ${agentName}">
		${imgHtml}

		<div class="tf-main">
			<div class="tf-coin-row">
				<a href="${coinHref}"${coinTarget} class="tf-coin-sym" style="color:inherit;text-decoration:none" aria-label="View ${sym} Oracle conviction">$${sym}</a>
				${name ? `<span class="tf-coin-name">${name}</span>` : ''}
				${tierBadge}
				${catBadge}
			</div>
			<div class="tf-agent-row">
				${agentImgHtml}
				<a href="${traderUrl}" class="tf-agent-name">${agentName}</a>
				${copierBadge}
			</div>
			<div class="tf-meta-row">
				${hold ? `<span class="tf-meta-item">Held <b>${hold}</b></span>` : ''}
				${when ? `<span class="tf-meta-item">${when}</span>` : ''}
				${t.exit_reason ? `<span class="tf-meta-item">Exit <b>${escapeHtml(t.exit_reason.replace(/_/g, ' '))}</b></span>` : ''}
				${scoreStr ? `<span class="tf-meta-item">${scoreStr}</span>` : ''}
			</div>
		</div>

		<div class="tf-pnl">
			${multStr ? `<div class="tf-multiple">${multStr}</div>` : ''}
			${pnlPct  ? `<div class="tf-pnl-pct">${pnlPct}</div>`  : ''}
			${pnlSol  ? `<div class="tf-pnl-sol">${pnlSol}</div>`  : ''}
			${t.exit_reason ? `<div class="tf-exit-reason">${escapeHtml(t.exit_reason.replace(/_/g, ' '))}</div>` : ''}
		</div>

		<div class="tf-actions">
			<a href="${traderUrl}" class="tf-btn primary">Copy trader →</a>
			<button type="button" class="tf-btn tf-share-btn" data-share="${shareData}" data-tweet="${escapeHtml(tweetHref)}" aria-label="Share this trade">Share ↗</button>
			${t.mint ? `<button type="button" class="tf-btn tf-watch-btn${isWatched ? ' tf-watching' : ''}" data-mint="${escapeHtml(t.mint)}" aria-pressed="${isWatched}" title="Add to watchlist">${watchLabel}</button>` : ''}
			${oracleUrl ? `<a href="${oracleUrl}" class="tf-btn" style="background:rgba(192,132,252,0.12);border-color:rgba(192,132,252,0.35);color:#c084fc">Oracle ↗</a>` : ''}
			${pumpUrl ? `<a href="${pumpUrl}" class="tf-btn" target="_blank" rel="noopener">pump.fun ↗</a>` : ''}
			${buySig  ? `<a href="${buySig}"  class="tf-btn" target="_blank" rel="noopener">Buy tx ↗</a>`  : ''}
			${sellSig ? `<a href="${sellSig}" class="tf-btn" target="_blank" rel="noopener">Sell tx ↗</a>` : ''}
		</div>
	</article>`;
}

// ── DOM helpers ───────────────────────────────────────────────────────────────

function showSkeletons() {
	const grid = $('#tfGrid');
	grid.setAttribute('aria-busy', 'true');
	grid.innerHTML = Array.from({ length: 8 }, () => '<div class="tf-skel" aria-hidden="true"></div>').join('');
	$('#tfLoadMore').hidden = true;
}

function renderItems(items, reset) {
	const grid = $('#tfGrid');
	grid.removeAttribute('aria-busy');
	if (reset) {
		grid.innerHTML = items.map(cardHtml).join('');
	} else {
		grid.insertAdjacentHTML('beforeend', items.map(cardHtml).join(''));
	}
}

function showEmpty() {
	const grid = $('#tfGrid');
	grid.removeAttribute('aria-busy');
	grid.innerHTML = `<div class="tf-state">
		<h2>No trades yet</h2>
		<p>No positions meeting the current filters have closed in this window.<br>
		Try a wider window or lower minimum PnL threshold, or check back shortly.</p>
	</div>`;
	$('#tfLoadMore').hidden = true;
}

function showError() {
	const grid = $('#tfGrid');
	grid.removeAttribute('aria-busy');
	grid.innerHTML = `<div class="tf-state">
		<h2>Could not load feed</h2>
		<p>There was a problem reaching the server. <button class="tf-btn" onclick="location.reload()">Try again</button></p>
	</div>`;
	$('#tfLoadMore').hidden = true;
}

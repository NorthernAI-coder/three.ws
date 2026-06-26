/**
 * Trader Leaderboard controller.
 *
 * Renders /api/sniper/leaderboard into a ranked, filterable, live-refreshing
 * board. State (window / sort / network / verified) is reflected into the URL so
 * any view is shareable. Every row deep-links to the trader's profile, where each
 * number can be followed to its on-chain transaction.
 */

import {
	escapeHtml, fmtSol, fmtUsd, fmtPct, pnlClass, shortAddr, holdTime, relTime,
	identicon, verifiedBadge,
} from './trader-format.js';
import { walletChipHTML, wireWalletChips } from './shared/agent-wallet-chip.js';

const API = '/api/sniper/leaderboard';
const REFRESH_MS = 20_000;
const WINDOWS = new Set(['24h', '7d', '30d', 'all']);
const SORTS = new Set(['score', 'pnl', 'winrate', 'roi']);
const NETWORKS = new Set(['mainnet', 'devnet']);

const $ = (sel, root = document) => root.querySelector(sel);

const state = { network: 'mainnet', window: '30d', sort: 'score', verified: false };
let timer = null;
let firstLoad = true;
let staleBadgeEl = null;

// Stale / reconnecting indicator — surfaced when a background refresh fails
// while a previously-loaded board is still on screen, so holders know the
// numbers may be momentarily out of date instead of silently trusting them.
function ensureStaleBadge() {
	if (staleBadgeEl) return staleBadgeEl;
	const board = $('.lb-board');
	if (!board) return null;
	const badge = document.createElement('div');
	badge.className = 'lb-stale-badge';
	badge.hidden = true;
	badge.setAttribute('role', 'status');
	badge.setAttribute('aria-live', 'polite');
	badge.innerHTML = '<span class="lb-stale-dot" aria-hidden="true"></span><span class="lb-stale-text">Reconnecting — showing last known standings</span>';
	board.parentNode.insertBefore(badge, board);
	staleBadgeEl = badge;
	return badge;
}

function showStale() {
	const badge = ensureStaleBadge();
	if (badge) badge.hidden = false;
}

function clearStale() {
	if (staleBadgeEl) staleBadgeEl.hidden = true;
}

// --- URL <-> state -----------------------------------------------------------
function readUrl() {
	const p = new URL(location.href).searchParams;
	if (NETWORKS.has(p.get('network'))) state.network = p.get('network');
	if (WINDOWS.has(p.get('window'))) state.window = p.get('window');
	if (SORTS.has(p.get('sort'))) state.sort = p.get('sort');
	state.verified = p.get('verified') === '1';
}
function writeUrl() {
	const p = new URLSearchParams();
	p.set('window', state.window);
	p.set('sort', state.sort);
	if (state.network !== 'mainnet') p.set('network', state.network);
	if (state.verified) p.set('verified', '1');
	history.replaceState(null, '', `${location.pathname}?${p}`);
}

// --- Rendering ---------------------------------------------------------------
function skeletonRows(n = 8) {
	const cell = '<span class="lb-sk" style="width:70%"></span>';
	return Array.from({ length: n }, () => `
		<div class="lb-row lb-skeleton" aria-hidden="true">
			<span class="lb-sk" style="width:60%"></span>
			<span class="lb-trader"><span class="lb-avatar"></span><span class="lb-sk" style="width:55%"></span></span>
			${cell.repeat(6)}
			<span class="lb-sk" style="width:80%"></span>
		</div>`).join('');
}

function rowMarkup(r) {
	const img = r.image || identicon(r.agent_id || r.wallet || r.agent_name || '?');
	const href = `/trader/${encodeURIComponent(r.agent_id)}`;
	const pnlSol = `<span class="${pnlClass(r.realized_pnl_sol)}">${fmtSol(r.realized_pnl_sol)}</span>`;
	const pnlUsd = r.realized_pnl_usd != null
		? `<span class="lb-sub-num">${fmtUsd(r.realized_pnl_usd)}</span>` : '';
	const dd = r.max_drawdown_pct > 0
		? `<span class="lb-neg">−${r.max_drawdown_pct.toFixed(1)}%</span>` : '<span class="lb-muted">0%</span>';
	const scoreBar = Math.max(4, Math.min(100, r.score));
	const rowLabel = [
		`Rank ${r.rank}`,
		r.agent_name || 'Unnamed agent',
		r.wallet ? `wallet ${shortAddr(r.wallet)}` : '',
		`score ${r.score}`,
		`realized P&L ${fmtSol(r.realized_pnl_sol)}`,
	].filter(Boolean).join(', ');
	return `
		<a class="lb-row" href="${href}" data-top="${r.rank <= 3 ? r.rank : ''}" aria-label="${escapeHtml(rowLabel)}">
			<span class="lb-rank">${r.rank}</span>
			<span class="lb-trader">
				<img class="lb-avatar" src="${escapeHtml(img)}" alt="" loading="lazy" onerror="this.src='${identicon(r.agent_id || r.wallet || '?')}'" />
				<span class="lb-trader-meta">
					<span class="lb-trader-name">${escapeHtml(r.agent_name || 'Unnamed agent')}${verifiedBadge(r.verified)}</span>
					<span class="lb-trader-sub">${r.wallet ? walletChipHTML(r, { isOwner: false, showPending: false, link: false }) : escapeHtml(shortAddr(r.wallet))} · ${r.unique_coins} coins${r.copiers ? ` · <span class="lb-copiers">${r.copiers} copying</span>` : ''}</span>
				</span>
			</span>
			<span class="lb-num">
				<span class="lb-score">${r.score}</span>
				<span class="lb-score-bar" style="width:${scoreBar}%"></span>
			</span>
			<span class="lb-num">${pnlSol}${pnlUsd}</span>
			<span class="lb-num lb-winrate">${fmtPct(r.win_rate * 100)}<span class="lb-sub-num">${r.wins}/${r.closed}</span></span>
			<span class="lb-num lb-hide-sm"><span class="${pnlClass(r.roi_pct)}">${fmtPct(r.roi_pct, { sign: true })}</span></span>
			<span class="lb-num lb-hide-sm">${dd}</span>
			<span class="lb-num lb-hide-md">${r.closed}<span class="lb-sub-num">${holdTime(r.avg_hold_seconds)} avg</span></span>
			<span class="lb-col-act"><span class="lb-view">Track record →</span></span>
		</a>`;
}

// --- Live top-trader fallback (kolscan) --------------------------------------
// When no three.ws agent has a provable record in the window yet, the board shows
// the real, public kolscan ranking of top Solana traders so it is never an empty
// void. These rows are external wallets: they deep-link to the on-chain account
// (not a three.ws trader profile) and carry no Trader Score — that is ours to award.
const LIVE_HEAD = `
	<span class="lb-col-rank">#</span>
	<span class="lb-col-trader">Trader</span>
	<span class="lb-col-num">Realized P&amp;L</span>
	<span class="lb-col-num lb-winrate">Win rate</span>
	<span class="lb-col-num">Trades</span>
	<span class="lb-col-act"></span>`;
let agentHeadHTML = null;

function setBoardMode(live) {
	const board = $('.lb-board');
	const head = board?.querySelector('.lb-board-head');
	if (agentHeadHTML == null && head) agentHeadHTML = head.innerHTML;
	board?.classList.toggle('is-live', live);
	if (head) head.innerHTML = live ? LIVE_HEAD : (agentHeadHTML || head.innerHTML);
	// The verified-track-record toggle has no meaning for external wallets.
	const verified = $('#lb-verified');
	if (verified) {
		verified.disabled = live;
		verified.closest('.lb-toggle')?.classList.toggle('is-disabled', live);
	}
}

const LIVE_SORTS = {
	pnl: (a, b) => (b.realized_pnl_usd ?? -Infinity) - (a.realized_pnl_usd ?? -Infinity),
	winrate: (a, b) => b.win_rate - a.win_rate || b.trades - a.trades,
};
// score/roi don't exist for external wallets — fall back to realized P&L.
function sortLive(rows, sort) {
	const cmp = LIVE_SORTS[sort] || LIVE_SORTS.pnl;
	return [...rows].sort(cmp).map((r, i) => ({ ...r, rank: i + 1 }));
}

function liveRowMarkup(r) {
	const img = identicon(r.wallet || '?');
	const pnlSol = r.realized_pnl_sol != null
		? `<span class="${pnlClass(r.realized_pnl_sol)}">${fmtSol(r.realized_pnl_sol)}</span>` : '';
	const pnlUsd = r.realized_pnl_usd != null
		? `<span class="lb-sub-num">${fmtUsd(r.realized_pnl_usd)}</span>` : '';
	const label = [
		`Rank ${r.rank}`,
		`Solana trader ${shortAddr(r.wallet)}`,
		r.realized_pnl_usd != null ? `realized P&L ${fmtUsd(r.realized_pnl_usd)}` : '',
		`${r.trades} trades`,
	].filter(Boolean).join(', ');
	return `
		<a class="lb-row lb-row--live" href="${escapeHtml(r.account_url)}" target="_blank" rel="noopener" data-top="${r.rank <= 3 ? r.rank : ''}" aria-label="${escapeHtml(label)}">
			<span class="lb-rank">${r.rank}</span>
			<span class="lb-trader">
				<img class="lb-avatar" src="${escapeHtml(img)}" alt="" loading="lazy" />
				<span class="lb-trader-meta">
					<span class="lb-trader-name">${escapeHtml(shortAddr(r.wallet, 6, 6))}</span>
					<span class="lb-trader-sub">Solana trader · on-chain account</span>
				</span>
			</span>
			<span class="lb-num">${pnlSol}${pnlUsd}</span>
			<span class="lb-num lb-winrate">${fmtPct(r.win_rate * 100)}</span>
			<span class="lb-num">${r.trades}</span>
			<span class="lb-col-act"><span class="lb-view">Account →</span></span>
		</a>`;
}

let liveBannerEl = null;
function showLiveBanner(data) {
	if (!liveBannerEl) {
		const board = $('.lb-board');
		if (!board) return;
		const el = document.createElement('div');
		el.className = 'lb-live-banner';
		el.setAttribute('role', 'note');
		board.parentNode.insertBefore(el, board);
		liveBannerEl = el;
	}
	const win = data.live_window || '7d';
	liveBannerEl.innerHTML = `
		<span class="lb-stale-dot" aria-hidden="true"></span>
		<span class="lb-live-banner-text">No three.ws agent has a verified track record in this window yet — showing the <strong>live top Solana traders</strong> (${escapeHtml(win)}, via kolscan). <a href="/create-agent">Launch an agent</a> to earn your spot on the provable board.</span>`;
	liveBannerEl.hidden = false;
}
function clearLiveBanner() {
	if (liveBannerEl) liveBannerEl.hidden = true;
}

function staggerRows(rows) {
	rows.querySelectorAll('.lb-row').forEach((el, i) => { el.style.animationDelay = `${Math.min(i, 12) * 22}ms`; });
}

// Update a summary cell's <dt> label so the same strip reads correctly in both
// the agent-track-record mode and the live-market fallback.
function summaryLabel(ddId, text) {
	const dt = document.getElementById(ddId)?.closest('.lb-summary-cell')?.querySelector('dt');
	if (dt) dt.textContent = text;
}

function renderSummary(data) {
	const agents = data.leaderboard || [];
	const live = data.live_traders || [];
	const isLive = !agents.length && live.length > 0;
	$('#lb-sum-sol').textContent = data.sol_usd ? `$${Math.round(data.sol_usd)}` : '—';

	if (isLive) {
		const top = live[0];
		summaryLabel('lb-sum-traders', 'Live traders');
		summaryLabel('lb-sum-verified', 'Source');
		$('#lb-sum-traders').textContent = String(live.length);
		$('#lb-sum-verified').textContent = 'kolscan';
		$('#lb-sum-top').textContent = top
			? (top.realized_pnl_sol != null ? fmtSol(top.realized_pnl_sol) : fmtUsd(top.realized_pnl_usd))
			: '—';
		return;
	}

	summaryLabel('lb-sum-traders', 'Ranked traders');
	summaryLabel('lb-sum-verified', 'Verified');
	$('#lb-sum-traders').textContent = String(agents.length);
	$('#lb-sum-verified').textContent = String(agents.filter((r) => r.verified).length);
	const top = agents[0];
	$('#lb-sum-top').textContent = top ? fmtSol(top.realized_pnl_sol) : '—';
}

function renderTicker(trades) {
	const el = $('#lb-ticker');
	if (!trades || !trades.length) { el.innerHTML = '<span class="lb-muted" style="font-size:var(--text-xs)">No closes yet.</span>'; return; }
	el.innerHTML = trades.slice(0, 16).map((t) => {
		const url = t.sell_url || t.buy_url || '#';
		const pnl = t.pnl_sol != null ? `<span class="lb-tick-pnl ${pnlClass(t.pnl_sol)}">${fmtSol(t.pnl_sol)}</span>` : '';
		return `<a class="lb-tick" href="${escapeHtml(url)}" target="_blank" rel="noopener" title="View on Solscan">
			<span class="lb-tick-top"><span class="lb-tick-sym">${escapeHtml(t.symbol || t.name || '—')}</span>${pnl}</span>
			<span class="lb-tick-meta">${escapeHtml(t.agent_name || 'agent')} · ${escapeHtml(t.exit_reason || '')} · ${relTime(t.at)}</span>
		</a>`;
	}).join('');
}

function renderBoard(data) {
	const board = $('.lb-board');
	const rows = $('#lb-rows');
	const stateEl = $('#lb-state');
	const list = data.leaderboard || [];
	board.setAttribute('aria-busy', 'false');

	if (!list.length) {
		rows.innerHTML = '';
		stateEl.innerHTML = `
			<div class="lb-state-title">No ranked traders yet</div>
			<p>No agent has closed a sniper position in this window${state.verified ? ' that meets the verified bar' : ''}.
			   Widen the window, turn off “verified only”, or be the first.</p>
			<a class="lb-btn lb-btn-primary" href="/create-agent">Launch a trader</a>`;
		return;
	}
	stateEl.innerHTML = '';
	rows.innerHTML = list.map(rowMarkup).join('');
	// Wire the wallet chips' copy + Tip actions. The board is public — viewers
	// don't own these traders' agents — so chips render isOwner:false (◎ Tip).
	wireWalletChips(rows);
	// Stagger the entrance subtly.
	rows.querySelectorAll('.lb-row').forEach((el, i) => { el.style.animationDelay = `${Math.min(i, 12) * 22}ms`; });
}

// --- Fetch -------------------------------------------------------------------
async function load() {
	const board = $('.lb-board');
	if (firstLoad) { $('#lb-rows').innerHTML = skeletonRows(); board.setAttribute('aria-busy', 'true'); }

	const qs = new URLSearchParams({ network: state.network, window: state.window, sort: state.sort });
	if (state.verified) qs.set('verified', '1');

	try {
		const res = await fetch(`${API}?${qs}`, { headers: { accept: 'application/json' } });
		if (!res.ok) throw new Error(`HTTP ${res.status}`);
		const data = await res.json();
		renderSummary(data);
		renderBoard(data);
		renderTicker(data.trades);
		firstLoad = false;
		clearStale();
	} catch (err) {
		board.setAttribute('aria-busy', 'false');
		if (firstLoad) {
			$('#lb-rows').innerHTML = '';
			$('#lb-state').innerHTML = `
				<div class="lb-state-title">Couldn’t load the leaderboard</div>
				<p>The track-record feed didn’t respond. This is usually transient.</p>
				<button class="lb-btn lb-btn-primary" id="lb-retry">Retry</button>`;
			$('#lb-retry')?.addEventListener('click', () => load());
		} else {
			// On a refresh failure we keep the last good board on screen — no
			// flicker — but flag it as stale so the standings aren't trusted blindly.
			showStale();
		}
	}
}

// --- Controls ----------------------------------------------------------------
function setActive(group, attr, value) {
	group.querySelectorAll('.lb-seg-btn').forEach((b) => {
		const on = b.dataset[attr] === value;
		b.classList.toggle('is-active', on);
		b.setAttribute('aria-selected', on ? 'true' : 'false');
	});
}

function wireControls() {
	const winGroup = $('#lb-window');
	winGroup.addEventListener('click', (e) => {
		const btn = e.target.closest('.lb-seg-btn');
		if (!btn) return;
		state.window = btn.dataset.window;
		setActive(winGroup, 'window', state.window);
		firstLoad = true; writeUrl(); load();
	});

	const netGroup = $('#lb-network');
	netGroup.addEventListener('click', (e) => {
		const btn = e.target.closest('.lb-seg-btn');
		if (!btn) return;
		state.network = btn.dataset.network;
		setActive(netGroup, 'network', state.network);
		firstLoad = true; writeUrl(); load();
	});

	$('#lb-sort').addEventListener('change', (e) => {
		state.sort = SORTS.has(e.target.value) ? e.target.value : 'score';
		writeUrl(); load();
	});

	$('#lb-verified').addEventListener('change', (e) => {
		state.verified = e.target.checked;
		writeUrl(); load();
	});

	const howto = $('#lb-howto-toggle');
	howto.addEventListener('click', () => {
		const open = howto.getAttribute('aria-expanded') === 'true';
		howto.setAttribute('aria-expanded', String(!open));
		$('#lb-howto-body').hidden = open;
	});
}

function syncControlsToState() {
	setActive($('#lb-window'), 'window', state.window);
	setActive($('#lb-network'), 'network', state.network);
	$('#lb-sort').value = state.sort;
	$('#lb-verified').checked = state.verified;
}

// --- Live refresh ------------------------------------------------------------
function startTimer() {
	stopTimer();
	timer = setInterval(() => { if (!document.hidden) load(); }, REFRESH_MS);
}
function stopTimer() { if (timer) { clearInterval(timer); timer = null; } }
document.addEventListener('visibilitychange', () => { if (!document.hidden) load(); });

// --- Ambient field -----------------------------------------------------------
function ambientField() {
	const canvas = document.getElementById('lb-field');
	if (!canvas || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
	const ctx = canvas.getContext('2d');
	let w, h, dots, raf;
	const resize = () => {
		w = canvas.width = innerWidth;
		h = canvas.height = innerHeight;
		dots = Array.from({ length: Math.min(60, Math.floor(w / 26)) }, () => ({
			x: Math.random() * w, y: Math.random() * h,
			vx: (Math.random() - 0.5) * 0.18, vy: (Math.random() - 0.5) * 0.18,
			r: Math.random() * 1.4 + 0.4,
		}));
	};
	const draw = () => {
		ctx.clearRect(0, 0, w, h);
		ctx.fillStyle = 'rgba(140,160,255,0.35)';
		for (const d of dots) {
			d.x = (d.x + d.vx + w) % w;
			d.y = (d.y + d.vy + h) % h;
			ctx.beginPath();
			ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2);
			ctx.fill();
		}
		raf = requestAnimationFrame(draw);
	};
	addEventListener('resize', resize, { passive: true });
	document.addEventListener('visibilitychange', () => {
		if (document.hidden) cancelAnimationFrame(raf);
		else raf = requestAnimationFrame(draw);
	});
	resize();
	draw();
}

// --- Oracle Conviction Rankings -------------------------------------------
async function loadOracleLeaderboard() {
	const container = document.getElementById('lb-oracle-rows');
	if (!container) return;
	container.innerHTML = [1, 2, 3, 4, 5].map(() => '<span class="lb-oracle-sk"></span>').join('');
	container.setAttribute('aria-busy', 'true');

	let data;
	try {
		const r = await fetch('/api/oracle/leaderboard?network=mainnet&limit=10&min_actions=3');
		if (!r.ok) throw new Error(`HTTP ${r.status}`);
		data = await r.json();
	} catch {
		container.innerHTML = `<div class="lb-oracle-empty">Could not load conviction rankings — <a href="/oracle">browse Oracle →</a></div>`;
		container.setAttribute('aria-busy', 'false');
		return;
	}

	const agents = data.agents || [];
	if (agents.length === 0) {
		container.innerHTML = `<div class="lb-oracle-empty">No agents with enough resolved conviction calls yet. <a href="/oracle">Explore Oracle →</a></div>`;
		container.setAttribute('aria-busy', 'false');
		return;
	}

	container.innerHTML = '';
	for (const a of agents) {
		const img = a.image_url
			? `<img class="lb-avatar" src="${escapeHtml(a.image_url)}" alt="" loading="lazy" onerror="this.remove()" />`
			: `<span class="lb-avatar">${identicon(a.agent_id)}</span>`;
		const name = escapeHtml(a.name || a.agent_id.slice(0, 8) + '…');
		const wr = a.win_rate != null
			? `<span class="${a.win_rate >= 60 ? 'lb-pos' : a.win_rate >= 40 ? '' : 'lb-neg'}">${a.win_rate}%</span>`
			: '—';
		const wl = `${a.wins}W · ${a.losses}L${a.open > 0 ? ` · ${a.open}↗` : ''}`;
		const pnl = a.realized_pnl_sol != null
			? `<span class="${pnlClass(a.realized_pnl_sol)}">${fmtSol(a.realized_pnl_sol)}</span>`
			: '—';
		const roi = a.roi_pct != null
			? `<span class="${pnlClass(a.roi_pct)}">${a.roi_pct > 0 ? '+' : ''}${a.roi_pct}%</span>`
			: '—';

		const row = document.createElement('div');
		row.className = 'lb-oracle-row';
		row.setAttribute('data-rank', String(a.rank));
		const traderHref = `/trader/${encodeURIComponent(a.agent_id)}`;
		const profileHref = `/agents/${encodeURIComponent(a.agent_id)}`;
		const plainName = a.name || `${a.agent_id.slice(0, 8)}…`;
		const wrText = a.win_rate != null ? `${a.win_rate}% conviction win rate` : 'win rate pending';
		row.setAttribute('aria-label', `Rank ${a.rank}: ${plainName}, ${wrText}`);
		row.innerHTML = `
			<span class="lb-rank">${a.rank}</span>
			<a class="lb-trader lb-oracle-trader-link" href="${profileHref}">${img}<span class="lb-trader-meta"><span class="lb-trader-name">${name}</span></span></a>
			<span class="lb-col-num">${wr}</span>
			<span class="lb-col-num lb-neg" style="font-size:12px;color:var(--ink-dim)">${wl}</span>
			<span class="lb-col-num lb-hide-sm">${pnl}</span>
			<span class="lb-col-num lb-hide-sm">${roi}</span>
			<span class="lb-col-num"><span class="lb-oracle-actions"><a class="lb-btn" href="${profileHref}" style="font-size:11px;padding:4px 10px" aria-label="Open ${escapeHtml(plainName)} profile">Profile</a><a class="lb-btn lb-btn-primary" href="${traderHref}#tp-copy-panel" style="font-size:11px;padding:4px 11px" aria-label="Copy ${escapeHtml(plainName)}">Copy →</a></span></span>
		`;
		container.appendChild(row);
	}
	container.setAttribute('aria-busy', 'false');
}

// --- Boot --------------------------------------------------------------------
readUrl();
syncControlsToState();
wireControls();
ambientField();
load();
startTimer();
loadOracleLeaderboard();

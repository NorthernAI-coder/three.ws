/**
 * Trader profile controller.
 *
 * Renders /api/sniper/trader into a full, verifiable track record: score gauge,
 * metric grid, realized-equity curve, and three tabs — Track record (closed
 * trades), Open positions, and Proof (every closed trade linked to its on-chain
 * buy/sell tx, plus the on-chain attestation note). Also generates a shareable
 * PnL card (PNG) that embeds the viewer's referral link when signed in.
 */

import {
	escapeHtml, fmtSol, fmtUsd, fmtPct, pnlClass, shortAddr, holdTime, relTime,
	identicon, verifiedBadge,
} from './trader-format.js';
import { mountCopyPanel } from './copy-panel.js';

const WINDOWS = ['24h', '7d', '30d', 'all'];
const WINDOW_LABEL = { '24h': '24h', '7d': '7d', '30d': '30d', all: 'All-time' };
const NETWORKS = new Set(['mainnet', 'devnet']);

const root = document.getElementById('tp-root');
const content = document.getElementById('tp-content');

const ctx = {
	agentId: '',
	network: 'mainnet',
	window: 'all',
	data: null,
	refCode: null,
};

// A Solana base58 address — 32-44 chars, no hyphens. Used to distinguish
// wallet addresses from agent UUIDs in the URL path.
const WALLET_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const UUID_RE   = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isWalletAddress(s) { return WALLET_RE.test(s) && !UUID_RE.test(s); }

// --- Param parsing -----------------------------------------------------------
function parseParams() {
	const path = location.pathname.replace(/\/+$/, '');
	const m = path.match(/^\/trader\/(.+)$/);
	const qp = new URLSearchParams(location.search);
	ctx.agentId = m ? decodeURIComponent(m[1]) : (qp.get('agent_id') || qp.get('agent') || '');
	if (NETWORKS.has(qp.get('network'))) ctx.network = qp.get('network');
	if (WINDOWS.includes(qp.get('window'))) ctx.window = qp.get('window');
}

function solscanAddr(addr) {
	return ctx.network === 'devnet'
		? `https://solscan.io/account/${addr}?cluster=devnet`
		: `https://solscan.io/account/${addr}`;
}

// --- Score gauge -------------------------------------------------------------
function gaugeSvg(score) {
	const r = 34, c = 2 * Math.PI * r;
	const pct = Math.max(0, Math.min(100, score)) / 100;
	const dash = (c * pct).toFixed(1);
	const hue = Math.round(pct * 130); // red→green
	return `<svg width="92" height="92" viewBox="0 0 92 92" role="img" aria-label="Trader score ${score}">
		<circle cx="46" cy="46" r="${r}" fill="none" stroke="var(--surface-3)" stroke-width="7"/>
		<circle cx="46" cy="46" r="${r}" fill="none" stroke="hsl(${hue} 70% 55%)" stroke-width="7"
			stroke-linecap="round" stroke-dasharray="${dash} ${c.toFixed(1)}"
			transform="rotate(-90 46 46)"/>
	</svg>`;
}

// --- Equity curve (pure) -----------------------------------------------------
function equityCurveSvg(closed) {
	if (!closed || closed.length < 2) {
		return '<div class="tp-curve-empty">Not enough closed trades to chart an equity curve yet.</div>';
	}
	// closed comes newest-first; chart oldest→newest cumulative realized SOL.
	const asc = [...closed].reverse();
	let cum = 0;
	const pts = asc.map((t) => { cum += Number(t.pnl_sol) || 0; return cum; });
	const series = [0, ...pts]; // start at 0
	const min = Math.min(...series), max = Math.max(...series);
	const range = (max - min) || 1;
	const W = 1000, H = 180, pad = 8;
	const x = (i) => pad + (i / (series.length - 1)) * (W - pad * 2);
	const y = (v) => H - pad - ((v - min) / range) * (H - pad * 2);
	const path = series.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(' ');
	const last = series[series.length - 1];
	const stroke = last >= 0 ? 'var(--success)' : 'var(--danger)';
	const area = `${path} L${x(series.length - 1).toFixed(1)} ${H - pad} L${x(0).toFixed(1)} ${H - pad} Z`;
	const zeroY = y(0).toFixed(1);
	return `<svg class="tp-curve" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="Realized equity curve">
		<defs><linearGradient id="tpfill" x1="0" y1="0" x2="0" y2="1">
			<stop offset="0" stop-color="${stroke}" stop-opacity="0.22"/>
			<stop offset="1" stop-color="${stroke}" stop-opacity="0"/>
		</linearGradient></defs>
		<line x1="${pad}" y1="${zeroY}" x2="${W - pad}" y2="${zeroY}" stroke="var(--stroke)" stroke-width="1" stroke-dasharray="3 4"/>
		<path d="${area}" fill="url(#tpfill)"/>
		<path d="${path}" fill="none" stroke="${stroke}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>
	</svg>`;
}

// --- Metric grid -------------------------------------------------------------
function metric(label, val, sub = '') {
	return `<div class="tp-metric">
		<div class="tp-metric-label">${escapeHtml(label)}</div>
		<div class="tp-metric-val">${val}</div>
		${sub ? `<div class="tp-metric-sub">${sub}</div>` : ''}
	</div>`;
}

function metricsGrid(m) {
	const pnl = `<span class="${pnlClass(m.realized_pnl_sol)}">${fmtSol(m.realized_pnl_sol)}</span>`;
	const pnlSub = m.realized_pnl_usd != null ? fmtUsd(m.realized_pnl_usd) : '';
	const pf = m.profit_factor == null ? '∞' : m.profit_factor.toFixed(2);
	const unreal = m.open_count
		? `<span class="${pnlClass(m.unrealized_pnl_sol)}">${fmtSol(m.unrealized_pnl_sol)}</span>` : '<span class="lb-muted">—</span>';
	return `
		${metric('Realized P&L', pnl, pnlSub)}
		${metric('Win rate', fmtPct(m.win_rate * 100), `${m.wins}W · ${m.losses}L`)}
		${metric('ROI', `<span class="${pnlClass(m.roi_pct)}">${fmtPct(m.roi_pct, { sign: true })}</span>`, `on ${fmtSol(m.invested_sol, { sign: false })} traded`)}
		${metric('Profit factor', pf, 'gross win ÷ gross loss')}
		${metric('Max drawdown', `<span class="${m.max_drawdown_pct > 0 ? 'lb-neg' : 'lb-muted'}">${m.max_drawdown_pct > 0 ? '−' : ''}${m.max_drawdown_pct.toFixed(1)}%</span>`, fmtSol(m.max_drawdown_sol, { sign: false }))}
		${metric('Avg hold', holdTime(m.avg_hold_seconds), `median ${holdTime(m.median_hold_seconds)}`)}
		${metric('Coins traded', String(m.unique_coins), `${m.closed_count} closed trades`)}
		${metric('Open exposure', m.open_count ? fmtSol(m.open_exposure_sol, { sign: false }) : '<span class="lb-muted">none</span>', m.open_count ? `${m.open_count} open · ${unreal}` : 'flat')}
	`;
}

// --- Oracle conviction block -------------------------------------------------
function oracleBlock(oracle, agentId) {
	const pnlStr = oracle.realized_pnl_sol != null
		? `<span class="${pnlClass(oracle.realized_pnl_sol)}">${fmtSol(oracle.realized_pnl_sol)}</span>`
		: '—';
	const wrStr = oracle.win_rate != null
		? `<span class="${oracle.win_rate >= 50 ? 'lb-pos' : 'lb-neg'}">${oracle.win_rate}%</span>`
		: '—';
	const roiStr = oracle.roi_pct != null
		? `<span class="${pnlClass(oracle.roi_pct)}">${oracle.roi_pct > 0 ? '+' : ''}${oracle.roi_pct}%</span>`
		: '—';
	return `
		<div class="tp-oracle-block">
			<div class="tp-oracle-head">
				<span class="tp-oracle-label">Oracle conviction</span>
				<a class="tp-oracle-link" href="/oracle" target="_blank" rel="noopener">View live ↗</a>
			</div>
			<div class="tp-oracle-kpis">
				<div class="tp-oracle-kpi"><span>Actions</span><b>${oracle.total}</b></div>
				<div class="tp-oracle-kpi"><span>Win rate</span><b>${wrStr}</b></div>
				<div class="tp-oracle-kpi"><span>Wins</span><b class="lb-pos">${oracle.wins}</b></div>
				<div class="tp-oracle-kpi"><span>Losses</span><b class="lb-neg">${oracle.losses}</b></div>
				<div class="tp-oracle-kpi"><span>Open</span><b>${oracle.open}</b></div>
				<div class="tp-oracle-kpi"><span>Realized</span><b>${pnlStr}</b></div>
				${oracle.roi_pct != null ? `<div class="tp-oracle-kpi"><span>ROI</span><b>${roiStr}</b></div>` : ''}
			</div>
			<p class="tp-oracle-note">Conviction actions are scored against ground truth — did the coin graduate? The win rate above is the engine's accuracy on this agent's calls, not wallet trades.</p>
		</div>`;
}

// --- Trade tables ------------------------------------------------------------
function closedRows(closed) {
	if (!closed.length) return '<tr><td colspan="6" style="text-align:center;color:var(--ink-faint)">No closed trades in this window.</td></tr>';
	return closed.map((t) => {
		const pnl = t.pnl_sol != null ? `<span class="${pnlClass(t.pnl_sol)}">${fmtSol(t.pnl_sol)}</span>` : '—';
		const pct = t.pnl_pct != null ? `<span class="${pnlClass(t.pnl_pct)}">${fmtPct(t.pnl_pct, { sign: true })}</span>` : '';
		const held = t.opened_at && t.closed_at
			? holdTime((new Date(t.closed_at) - new Date(t.opened_at)) / 1000) : '—';
		const proof = [
			t.buy_url ? `<a class="tp-proof-link" href="${escapeHtml(t.buy_url)}" target="_blank" rel="noopener">buy ↗</a>` : '',
			t.sell_url ? `<a class="tp-proof-link" href="${escapeHtml(t.sell_url)}" target="_blank" rel="noopener">sell ↗</a>` : '',
		].filter(Boolean).join(' ');
		return `<tr>
			<td><div class="tp-coin"><span class="tp-coin-sym">${escapeHtml(t.symbol || t.name || '—')}</span><span class="tp-coin-mint">${escapeHtml(shortAddr(t.mint, 4, 4))}</span></div></td>
			<td>${pnl}<div class="tp-metric-sub">${pct}</div></td>
			<td><span class="tp-reason">${escapeHtml(t.exit_reason || '—')}</span></td>
			<td>${held}</td>
			<td>${relTime(t.closed_at)}</td>
			<td>${proof || '—'}</td>
		</tr>`;
	}).join('');
}

function openRows(open) {
	if (!open.length) return '<tr><td colspan="5" style="text-align:center;color:var(--ink-faint)">No open positions.</td></tr>';
	return open.map((o) => {
		const up = `<span class="${pnlClass(o.unrealized_pct)}">${fmtPct(o.unrealized_pct, { sign: true })}</span>`;
		return `<tr>
			<td><div class="tp-coin"><span class="tp-coin-sym">${escapeHtml(o.symbol || o.name || '—')}</span><span class="tp-coin-mint">${escapeHtml(shortAddr(o.mint, 4, 4))}</span></div></td>
			<td>${fmtSol(o.entry_sol, { sign: false })}</td>
			<td>${fmtSol(o.current_sol, { sign: false })}</td>
			<td>${up}</td>
			<td>${o.buy_url ? `<a class="tp-proof-link" href="${escapeHtml(o.buy_url)}" target="_blank" rel="noopener">buy ↗</a>` : '—'}</td>
		</tr>`;
	}).join('');
}

const SHIELD = '<svg viewBox="0 0 24 24" fill="none"><path d="M12 2l8 3v6c0 5-3.5 8.5-8 11-4.5-2.5-8-6-8-11V5l8-3z" stroke="currentColor" stroke-width="1.5"/><path d="M8.5 12l2.2 2.2 4.8-4.8" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';

// --- Main render -------------------------------------------------------------
function render(data) {
	const a = data.agent;
	const m = data.metrics;
	const img = a.image || identicon(a.id || a.wallet || a.name || '?');
	const walletLink = a.wallet
		? `<a href="${solscanAddr(a.wallet)}" target="_blank" rel="noopener" title="Agent wallet on Solscan">${escapeHtml(shortAddr(a.wallet, 4, 4))} ↗</a>`
		: '';
	document.title = `${a.name || 'Trader'} · track record · three.ws`;

	const winSeg = WINDOWS.map((w) => `<button class="lb-seg-btn ${w === ctx.window ? 'is-active' : ''}" data-window="${w}">${WINDOW_LABEL[w]}</button>`).join('');

	content.innerHTML = `
		<section class="tp-hero">
			<div class="tp-avatar-wrap">
				<img class="tp-avatar" src="${escapeHtml(img)}" alt="" onerror="this.src='${identicon(a.id || '?')}'" />
			</div>
			<div class="tp-id">
				<div class="tp-name">${escapeHtml(a.name || 'Unnamed agent')}${verifiedBadge(m.verified)}</div>
				<div class="tp-sub">
					${walletLink}
					<span>${m.closed_count} closed trades</span>
					<span>${m.unique_coins} coins</span>
					${m.last_active_at ? `<span>active ${relTime(m.last_active_at)}</span>` : ''}
					${a.copiers ? `<span class="tp-copiers">${a.copiers} copying</span>` : ''}
				</div>
				${a.description ? `<p class="tp-desc">${escapeHtml(a.description)}</p>` : ''}
			</div>
			<div class="tp-gauge">
				${gaugeSvg(m.score)}
				<div class="tp-gauge-val" style="margin-top:-58px">${m.score}</div>
				<div class="tp-gauge-label" style="margin-top:34px">Trader Score</div>
			</div>
		</section>

		<div class="tp-actions">
			<div class="lb-seg" role="tablist" aria-label="Time window" id="tp-window">${winSeg}</div>
			<div style="display:flex;gap:var(--space-2xs)">
				<button class="lb-btn" id="tp-share">Share track record</button>
				<button class="lb-btn lb-btn-primary" id="tp-card">Download PnL card</button>
			</div>
		</div>

		<div class="tp-metrics">${metricsGrid(m)}</div>

		${data.oracle ? oracleBlock(data.oracle, a.id) : ''}

		<div class="tp-curve-wrap">
			<div class="tp-curve-head">
				<span class="tp-curve-title">Realized equity · ${WINDOW_LABEL[ctx.window]}</span>
				<span class="${pnlClass(m.realized_pnl_sol)}" style="font-variant-numeric:tabular-nums;font-weight:var(--weight-semibold)">${fmtSol(m.realized_pnl_sol)}</span>
			</div>
			${equityCurveSvg(data.closed)}
		</div>

		<div class="tp-tabs" role="tablist">
			<button class="tp-tab is-active" data-tab="record" role="tab">Track record<span class="tp-tab-count">${data.closed.length}</span></button>
			<button class="tp-tab" data-tab="open" role="tab">Open<span class="tp-tab-count">${data.open.length}</span></button>
			<button class="tp-tab" data-tab="proof" role="tab">Proof</button>
		</div>

		<div class="tp-panel is-active" data-panel="record">
			<table class="tp-table"><thead><tr>
				<th>Coin</th><th>P&L</th><th>Exit</th><th>Held</th><th>When</th><th>Proof</th>
			</tr></thead><tbody>${closedRows(data.closed)}</tbody></table>
		</div>

		<div class="tp-panel" data-panel="open">
			<table class="tp-table"><thead><tr>
				<th>Coin</th><th>Entry</th><th>Now</th><th>Unrealized</th><th>Proof</th>
			</tr></thead><tbody>${openRows(data.open)}</tbody></table>
		</div>

		<div class="tp-panel" data-panel="proof">
			<div class="tp-proof-note">
				${SHIELD}
				<p><strong>This track record is verifiable, not trusted.</strong> Every closed trade above links to its
				on-chain buy and sell transaction on Solscan — the numbers are computed from those, nothing else. The
				headline score is additionally committed on-chain daily as a signed attestation against this trader's
				wallet${a.wallet ? ` (<a class="tp-proof-link" href="${solscanAddr(a.wallet)}" target="_blank" rel="noopener">${escapeHtml(shortAddr(a.wallet))} ↗</a>)` : ''}, so it can't be quietly edited after the fact.</p>
			</div>
			<table class="tp-table"><thead><tr>
				<th>Coin</th><th>P&L</th><th>Exit</th><th>Held</th><th>When</th><th>On-chain</th>
			</tr></thead><tbody>${closedRows(data.closed)}</tbody></table>
		</div>

		<section class="tp-copy" id="tp-copy-panel"></section>
	`;

	wireTabs();
	wireWindow();
	wireShare();
	const panel = document.getElementById('tp-copy-panel');
	if (panel) mountCopyPanel(panel, { leaderAgentId: a.id, leaderName: a.name, network: ctx.network });
	root.setAttribute('aria-busy', 'false');
}

// --- Interactions ------------------------------------------------------------
function wireTabs() {
	const tabs = content.querySelectorAll('.tp-tab');
	tabs.forEach((tab) => tab.addEventListener('click', () => {
		tabs.forEach((t) => t.classList.toggle('is-active', t === tab));
		content.querySelectorAll('.tp-panel').forEach((p) => {
			p.classList.toggle('is-active', p.dataset.panel === tab.dataset.tab);
		});
	}));
}

function wireWindow() {
	const seg = content.querySelector('#tp-window');
	seg.addEventListener('click', (e) => {
		const btn = e.target.closest('.lb-seg-btn');
		if (!btn || btn.dataset.window === ctx.window) return;
		ctx.window = btn.dataset.window;
		const url = new URL(location.href);
		url.searchParams.set('window', ctx.window);
		history.replaceState(null, '', url);
		load();
	});
}

function shareUrl() {
	const base = `${location.origin}/trader/${encodeURIComponent(ctx.agentId)}`;
	return ctx.refCode ? `${base}?ref=${encodeURIComponent(ctx.refCode)}` : base;
}

function toast(msg) {
	let el = document.querySelector('.tp-toast');
	if (!el) { el = document.createElement('div'); el.className = 'tp-toast'; document.body.appendChild(el); }
	el.textContent = msg;
	requestAnimationFrame(() => el.classList.add('is-shown'));
	setTimeout(() => el.classList.remove('is-shown'), 2200);
}

function wireShare() {
	content.querySelector('#tp-share')?.addEventListener('click', async () => {
		const url = shareUrl();
		const title = `${ctx.data.agent.name || 'Trader'} · ${fmtSol(ctx.data.metrics.realized_pnl_sol)} on three.ws`;
		if (navigator.share) {
			try { await navigator.share({ title, url }); return; } catch { /* fall through to copy */ }
		}
		try { await navigator.clipboard.writeText(url); toast('Track-record link copied'); }
		catch { toast(url); }
	});
	content.querySelector('#tp-card')?.addEventListener('click', () => downloadCard());
}

// --- Shareable PnL card (PNG) ------------------------------------------------
function downloadCard() {
	const a = ctx.data.agent, m = ctx.data.metrics;
	const scale = 2;
	const W = 1200, H = 630;
	const canvas = document.createElement('canvas');
	canvas.width = W * scale; canvas.height = H * scale;
	const c = canvas.getContext('2d');
	c.scale(scale, scale);

	// Background
	const grad = c.createLinearGradient(0, 0, W, H);
	grad.addColorStop(0, '#0a0a0c'); grad.addColorStop(1, '#15151b');
	c.fillStyle = grad; c.fillRect(0, 0, W, H);
	c.strokeStyle = 'rgba(255,255,255,0.08)'; c.lineWidth = 2; c.strokeRect(20, 20, W - 40, H - 40);

	const pos = m.realized_pnl_sol >= 0;
	const accent = pos ? '#4ade80' : '#f87171';

	// Kicker
	c.fillStyle = 'rgba(255,255,255,0.55)';
	c.font = '600 22px Inter, system-ui, sans-serif';
	c.fillText('PROVABLE TRACK RECORD · three.ws', 64, 96);

	// Name
	c.fillStyle = '#fff';
	c.font = '700 64px "Space Grotesk", Inter, sans-serif';
	c.fillText((a.name || 'Trader').slice(0, 22), 64, 176);
	if (m.verified) {
		c.fillStyle = accent;
		c.font = '600 22px Inter, sans-serif';
		c.fillText('✓ VERIFIED', 64, 212);
	}

	// Big PnL
	c.fillStyle = accent;
	c.font = '700 132px "Space Grotesk", Inter, sans-serif';
	c.fillText(fmtSol(m.realized_pnl_sol), 60, 360);
	c.fillStyle = 'rgba(255,255,255,0.6)';
	c.font = '500 28px Inter, sans-serif';
	c.fillText(`${WINDOW_LABEL[ctx.window]} realized P&L${m.realized_pnl_usd != null ? '  ·  ' + fmtUsd(m.realized_pnl_usd) : ''}`, 64, 408);

	// Stat strip
	const stats = [
		['SCORE', String(m.score)],
		['WIN RATE', fmtPct(m.win_rate * 100)],
		['ROI', fmtPct(m.roi_pct, { sign: true })],
		['TRADES', String(m.closed_count)],
	];
	const sx = 64, sy = 470, sw = (W - 128) / stats.length;
	stats.forEach(([label, val], i) => {
		const x = sx + i * sw;
		c.fillStyle = 'rgba(255,255,255,0.45)';
		c.font = '600 20px Inter, sans-serif';
		c.fillText(label, x, sy);
		c.fillStyle = '#fff';
		c.font = '700 42px "Space Grotesk", Inter, sans-serif';
		c.fillText(val, x, sy + 50);
	});

	// Footer link
	c.fillStyle = 'rgba(255,255,255,0.5)';
	c.font = '500 24px Inter, sans-serif';
	c.fillText(`three.ws/trader/${shortAddr(ctx.agentId, 6, 4)}`, 64, H - 48);

	canvas.toBlob((blob) => {
		if (!blob) { toast('Could not render card'); return; }
		const url = URL.createObjectURL(blob);
		const link = document.createElement('a');
		link.href = url;
		link.download = `${(a.name || 'trader').replace(/\s+/g, '-').toLowerCase()}-pnl.png`;
		link.click();
		setTimeout(() => URL.revokeObjectURL(url), 1000);
		toast('PnL card downloaded');
	}, 'image/png');
}

// --- Referral code (best-effort) ---------------------------------------------
async function loadRefCode() {
	try {
		const res = await fetch('/api/users/referrals', { credentials: 'include', headers: { accept: 'application/json' } });
		if (!res.ok) return;
		const card = await res.json();
		ctx.refCode = card.referral_code || card.code || card.referralCode || null;
	} catch { /* signed-out or unavailable — share the bare profile link */ }
}

// --- Skeleton / states -------------------------------------------------------
function showSkeleton() {
	root.setAttribute('aria-busy', 'true');
	content.innerHTML = `<div class="tp-skel">
		<div class="tp-sk" style="width:40%;height:28px"></div>
		<div class="tp-sk" style="width:25%"></div>
		<div class="tp-sk" style="width:90%;height:120px;margin-top:24px"></div>
		<div class="tp-sk" style="width:100%;height:180px"></div>
	</div>`;
}

function showError(kind) {
	root.setAttribute('aria-busy', 'false');
	if (kind === 'not_found') {
		content.innerHTML = `<div class="tp-empty">
			<h1>Trader not found</h1>
			<p>This agent doesn't exist, isn't public, or hasn't traded on this network yet.</p>
			<a class="lb-btn lb-btn-primary" href="/leaderboard">Browse the leaderboard</a>
		</div>`;
	} else {
		content.innerHTML = `<div class="tp-error">
			<h1>Couldn't load this trader</h1>
			<p>The track-record feed didn't respond. This is usually transient.</p>
			<button class="lb-btn lb-btn-primary" id="tp-retry">Retry</button>
		</div>`;
		content.querySelector('#tp-retry')?.addEventListener('click', () => load());
	}
}

// --- Fetch -------------------------------------------------------------------
async function load() {
	showSkeleton();
	const qs = new URLSearchParams({ agent_id: ctx.agentId, network: ctx.network, window: ctx.window });
	try {
		const res = await fetch(`/api/sniper/trader?${qs}`, { headers: { accept: 'application/json' } });
		if (res.status === 404) return showError('not_found');
		if (!res.ok) throw new Error(`HTTP ${res.status}`);
		ctx.data = await res.json();
		render(ctx.data);
	} catch {
		showError('error');
	}
}

// --- Wallet profile (for on-chain pump.fun wallets, not agent UUIDs) ---------
async function loadWalletProfile() {
	showSkeleton();
	try {
		const qs = new URLSearchParams({ address: ctx.agentId, network: ctx.network });
		const res = await fetch(`/api/oracle/wallet?${qs}`, { headers: { accept: 'application/json' } });
		if (!res.ok) throw new Error(`HTTP ${res.status}`);
		const data = await res.json();
		renderWalletProfile(data);
	} catch {
		showError('error');
	}
}

const ARCH_COLOR = {
	smart_money: '#34d399', kol: '#a78bfa', top_dev: '#60a5fa',
	sniper: '#fbbf24', dumper: '#f87171', rugger: '#f43f5e',
	fresh: '#94a3b8', neutral: '#94a3b8', unproven: '#64748b',
};

function renderWalletProfile(data) {
	const addr = data.address || ctx.agentId;
	const a = data.archetype || {};
	const r = data.reputation;
	const label = a.label || 'unproven';
	const color = ARCH_COLOR[label] || '#94a3b8';

	document.title = `${shortAddr(addr, 6, 4)} · wallet profile · three.ws`;

	const recentRows = (data.recent || []).map((c) => {
		const pnl = c.sell_sol > 0 ? c.sell_sol - c.buy_sol : null;
		const pnlStr = pnl != null
			? `<span class="${pnlClass(pnl)}" style="font-variant-numeric:tabular-nums">${fmtSol(pnl)}</span>`
			: '—';
		return `<tr>
			<td><div class="tp-coin">
				<span class="tp-coin-sym">${escapeHtml(c.symbol || c.mint.slice(0, 6))}${c.is_creator ? ' <span class="tp-reason">created</span>' : ''}</span>
				<span class="tp-coin-mint">${escapeHtml(c.mint.slice(0, 8))}…</span>
			</div></td>
			<td style="text-align:right">${fmtSol(c.buy_sol, { sign: false })}</td>
			<td style="text-align:right">${c.sell_sol > 0 ? fmtSol(c.sell_sol, { sign: false }) : '—'}</td>
			<td style="text-align:right">${pnlStr}</td>
			<td style="text-align:right"><a class="tp-proof-link" href="https://solscan.io/account/${escapeHtml(c.mint)}" target="_blank" rel="noopener">solscan ↗</a></td>
		</tr>`;
	}).join('') || `<tr><td colspan="5" style="text-align:center;color:var(--ink-faint)">No recent coins recorded.</td></tr>`;

	const statsHtml = r ? `
		<div class="tp-metrics">
			<div class="tp-metric">
				<div class="tp-metric-label">Smart score</div>
				<div class="tp-metric-val" style="color:${color}">${Math.round(r.score)}</div>
			</div>
			<div class="tp-metric">
				<div class="tp-metric-label">Win rate</div>
				<div class="tp-metric-val ${r.win_rate >= 50 ? 'lb-pos' : 'lb-neg'}">${Math.round(r.win_rate)}%</div>
			</div>
			<div class="tp-metric">
				<div class="tp-metric-label">Early win rate</div>
				<div class="tp-metric-val ${r.early_win_rate >= 40 ? 'lb-pos' : ''}">${Math.round(r.early_win_rate)}%</div>
			</div>
			<div class="tp-metric">
				<div class="tp-metric-label">Dump rate</div>
				<div class="tp-metric-val ${r.dump_rate >= 60 ? 'lb-neg' : ''}">${Math.round(r.dump_rate)}%</div>
			</div>
			<div class="tp-metric">
				<div class="tp-metric-label">Coins traded</div>
				<div class="tp-metric-val">${r.coins_traded ?? 0}</div>
			</div>
			<div class="tp-metric">
				<div class="tp-metric-label">Early entries</div>
				<div class="tp-metric-val">${r.early_entries ?? 0}</div>
			</div>
			<div class="tp-metric">
				<div class="tp-metric-label">Wins</div>
				<div class="tp-metric-val lb-pos">${r.wins ?? 0}</div>
			</div>
			<div class="tp-metric">
				<div class="tp-metric-label">Duds</div>
				<div class="tp-metric-val lb-neg">${r.duds ?? 0}</div>
			</div>
			${r.creator_count ? `<div class="tp-metric">
				<div class="tp-metric-label">Launched</div>
				<div class="tp-metric-val">${r.creator_count}</div>
			</div>` : ''}
		</div>` : `<div class="tp-empty" style="text-align:center;padding:var(--space-xl) 0;color:var(--ink-faint)">
			<p>No reputation data yet. This wallet hasn't been scored by the Oracle engine.</p>
		</div>`;

	content.innerHTML = `
		<section class="tp-hero">
			<div class="tp-avatar-wrap">
				<img class="tp-avatar" src="${identicon(addr)}" alt="" />
			</div>
			<div class="tp-id">
				<div class="tp-name"><span style="color:${color}">${escapeHtml(a.title || 'Unproven wallet')}</span></div>
				<div class="tp-sub">
					<a href="${solscanAddr(addr)}" target="_blank" rel="noopener" title="View on Solscan">${escapeHtml(shortAddr(addr, 6, 4))} ↗</a>
					${r ? `<span>${r.coins_traded} coins</span>` : ''}
					${r?.last_active_at ? `<span>active ${relTime(r.last_active_at)}</span>` : ''}
				</div>
				${a.blurb ? `<p class="tp-desc">${escapeHtml(a.blurb)}</p>` : ''}
			</div>
			<div class="tp-gauge">
				${r ? gaugeSvg(Math.round(r.score)) : gaugeSvg(0)}
				<div class="tp-gauge-val" style="margin-top:-58px;color:${color}">${r ? Math.round(r.score) : '—'}</div>
				<div class="tp-gauge-label" style="margin-top:34px">Smart Score</div>
			</div>
		</section>

		<div class="tp-actions">
			<div></div>
			<div style="display:flex;gap:var(--space-2xs)">
				<button class="lb-btn" id="tp-share-wallet">Share wallet profile</button>
				<a class="lb-btn" href="/oracle?wallet=${encodeURIComponent(addr)}" target="_blank">Oracle intel ↗</a>
			</div>
		</div>

		${statsHtml}

		<div class="tp-curve-wrap" style="margin-top:var(--space-lg)">
			<div class="tp-curve-head">
				<span class="tp-curve-title">Recent pump.fun footprint</span>
				<span class="lb-muted">${(data.recent || []).length} coins recorded</span>
			</div>
			<table class="tp-table">
				<thead><tr><th>Coin</th><th>Bought</th><th>Sold</th><th>P&L</th><th>On-chain</th></tr></thead>
				<tbody>${recentRows}</tbody>
			</table>
		</div>
	`;

	const shareBtn = content.querySelector('#tp-share-wallet');
	shareBtn?.addEventListener('click', () => {
		const url = `${location.origin}/trader/${encodeURIComponent(addr)}`;
		if (navigator.share) {
			navigator.share({ title: `${a.title || 'Wallet'} · ${shortAddr(addr)} on three.ws`, url }).catch(() => {});
		} else {
			navigator.clipboard?.writeText(url).then(() => toast('Link copied')).catch(() => {});
		}
	});

	root.setAttribute('aria-busy', 'false');
}

// --- Boot --------------------------------------------------------------------
parseParams();
if (!ctx.agentId) {
	showError('not_found');
} else if (isWalletAddress(ctx.agentId)) {
	loadWalletProfile();
} else {
	loadRefCode();
	load();
}

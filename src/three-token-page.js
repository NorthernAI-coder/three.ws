// Public $THREE coin page (/three-token).
//
// The canonical, trustworthy page for the protocol token: a live price header,
// the real bonding-curve chart, a streaming trade tape, and a one-click buy.
// Reuses the shared $THREE store (single source of truth) for the header, the
// bonding-curve widget, the SSE trade stream, and the Jupiter swap modal — no
// bespoke data plumbing, no mock data.

import { createThreeTokenData, THREE_MINT } from './pump/three-token-data.js';
import { mountBondingCurve } from './widgets/bonding-curve.js';
import { openSwapModal } from './swap-jupiter.js';

const SOL_MINT = 'So11111111111111111111111111111111111111112';
const PUMP_URL = `https://pump.fun/coin/${THREE_MINT}`;
const MAX_TAPE_ROWS = 40;
const REDUCED_MOTION = matchMedia('(prefers-reduced-motion: reduce)').matches;

// ── formatters ──────────────────────────────────────────────────────────────
const fmtUsd = (n, max = 2) => {
	const v = Number(n);
	if (!Number.isFinite(v)) return '—';
	return v.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: v !== 0 && Math.abs(v) < 1 ? 6 : max });
};
const fmtCompactUsd = (n) => {
	const v = Number(n);
	if (!Number.isFinite(v)) return '—';
	if (Math.abs(v) >= 1e9) return `$${(v / 1e9).toFixed(2)}B`;
	if (Math.abs(v) >= 1e6) return `$${(v / 1e6).toFixed(2)}M`;
	if (Math.abs(v) >= 1e3) return `$${(v / 1e3).toFixed(1)}K`;
	return fmtUsd(v);
};
const fmtNum = (n) => (Number.isFinite(Number(n)) ? Number(n).toLocaleString('en-US', { maximumFractionDigits: 2 }) : '—');
const fmtPct = (n) => {
	const v = Number(n);
	if (!Number.isFinite(v)) return '';
	const s = v >= 0 ? '+' : '';
	return `${s}${v.toFixed(2)}%`;
};
const shortAddr = (a) => { const s = String(a || ''); return s.length > 9 ? `${s.slice(0, 4)}…${s.slice(-4)}` : s; };
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const relTime = (sec) => {
	const d = Math.max(0, Math.floor(Date.now() / 1000 - Number(sec || 0)));
	if (d < 60) return `${d}s`;
	if (d < 3600) return `${Math.floor(d / 60)}m`;
	return `${Math.floor(d / 3600)}h`;
};

// ── styles ──────────────────────────────────────────────────────────────────
function injectStyles() {
	const css = `
	:root { color-scheme: dark; }
	* { box-sizing: border-box; }
	body { margin:0; background:#0a0a0d; color:#f5f5f7; font-family:Inter,system-ui,-apple-system,Segoe UI,Roboto,sans-serif; -webkit-font-smoothing:antialiased; }
	a { color:inherit; }
	.tk-wrap { max-width:1080px; margin:0 auto; padding:24px 18px 64px; }
	.tk-head { display:flex; align-items:center; gap:14px; margin-bottom:4px; }
	.tk-logo { width:46px; height:46px; border-radius:12px; background:linear-gradient(135deg,#fff,#888); display:grid; place-items:center; font-weight:800; color:#000; font-size:18px; flex-shrink:0; }
	.tk-title { font-size:26px; font-weight:800; margin:0; letter-spacing:-0.02em; }
	.tk-sub { margin:0; color:#9a9aa3; font-size:13px; }
	.tk-ca { font-family:ui-monospace,Menlo,monospace; font-size:11.5px; color:#8a8a93; cursor:pointer; border:1px solid #232329; border-radius:8px; padding:3px 8px; background:none; }
	.tk-ca:hover { color:#fff; border-color:#3a3a42; }
	.tk-stats { display:grid; grid-template-columns:repeat(auto-fit,minmax(150px,1fr)); gap:10px; margin:18px 0 22px; }
	.tk-stat { background:#111116; border:1px solid #1d1d24; border-radius:12px; padding:14px 16px; }
	.tk-stat-l { font-size:11px; text-transform:uppercase; letter-spacing:0.06em; color:#7d7d86; margin-bottom:5px; }
	.tk-stat-v { font-size:22px; font-weight:700; font-family:ui-monospace,Menlo,monospace; }
	.tk-grid { display:grid; grid-template-columns:1.1fr 0.9fr; gap:18px; }
	@media (max-width:820px){ .tk-grid { grid-template-columns:1fr; } }
	.tk-card { background:#111116; border:1px solid #1d1d24; border-radius:14px; padding:18px; }
	.tk-card h2 { font-size:12px; text-transform:uppercase; letter-spacing:0.06em; color:#7d7d86; margin:0 0 12px; }
	.tk-buy { display:flex; gap:10px; margin-top:16px; flex-wrap:wrap; }
	.tk-btn { appearance:none; border:1px solid #2a2a32; background:#1a1a20; color:#fff; border-radius:10px; padding:11px 18px; font-size:14px; font-weight:600; cursor:pointer; text-decoration:none; display:inline-flex; align-items:center; gap:8px; transition:background .15s,border-color .15s,transform .1s; }
	.tk-btn:hover { background:#23232b; border-color:#3a3a44; }
	.tk-btn:active { transform:translateY(1px); }
	.tk-btn.primary { background:linear-gradient(135deg,#fff,#cfcfd6); color:#000; border:none; }
	.tk-btn.primary:hover { filter:brightness(0.95); }
	.tk-btn:focus-visible { outline:2px solid #7CC4FF; outline-offset:2px; }
	.tk-tape { display:flex; flex-direction:column; gap:2px; max-height:430px; overflow-y:auto; }
	.tk-trade { display:grid; grid-template-columns:54px 1fr auto; gap:8px; align-items:center; padding:8px 10px; border-radius:8px; font-size:13px; }
	.tk-trade.buy { background:rgba(74,222,128,0.07); }
	.tk-trade.sell { background:rgba(248,113,113,0.07); }
	.tk-trade.in { animation:tkIn .35s ease; }
	@keyframes tkIn { from { opacity:0; transform:translateY(-6px); } to { opacity:1; transform:none; } }
	.tk-side { font-weight:700; font-size:11px; text-transform:uppercase; letter-spacing:0.04em; }
	.tk-side.buy { color:#4ade80; } .tk-side.sell { color:#f87171; }
	.tk-trader { font-family:ui-monospace,Menlo,monospace; color:#b8b8c0; text-decoration:none; }
	.tk-trader:hover { color:#fff; }
	.tk-amt { font-family:ui-monospace,Menlo,monospace; text-align:right; }
	.tk-amt small { color:#7d7d86; }
	.tk-status { display:inline-flex; align-items:center; gap:6px; font-size:11.5px; color:#7d7d86; }
	.tk-dot { width:7px; height:7px; border-radius:50%; background:#4ade80; box-shadow:0 0 8px #4ade80; }
	.tk-dot.off { background:#f87171; box-shadow:none; }
	.tk-empty { text-align:center; color:#7d7d86; font-size:13px; padding:40px 0; }
	.tk-skel { background:linear-gradient(90deg,#16161c,#1d1d24,#16161c); background-size:200% 100%; animation:tkSh 1.4s infinite; border-radius:10px; }
	@keyframes tkSh { from { background-position:200% 0; } to { background-position:-200% 0; } }
	.tk-foot { display:flex; gap:18px; flex-wrap:wrap; margin-top:26px; font-size:13px; }
	.tk-foot a { color:#9a9aa3; text-decoration:none; } .tk-foot a:hover { color:#fff; }
	@media (prefers-reduced-motion: reduce){ .tk-trade.in { animation:none; } .tk-skel { animation:none; } }
	`;
	const el = document.createElement('style');
	el.textContent = css;
	document.head.appendChild(el);
}

// ── header (price + protocol stats) from the shared store ───────────────────
function renderHeaderStats(token) {
	const stats = [
		{ l: 'Price', v: fmtUsd(token.price_usd, 6), sub: token.price_change_24h != null ? fmtPct(token.price_change_24h) : '' },
		{ l: 'Market Cap', v: fmtCompactUsd(token.market_cap) },
		{ l: '24h Volume', v: fmtCompactUsd(token.volume_24h) },
		{ l: 'Holders', v: token.holders != null ? fmtNum(token.holders) : '—' },
	];
	return stats.map((s) => {
		const up = s.sub?.startsWith('+');
		return `<div class="tk-stat">
			<div class="tk-stat-l">${esc(s.l)}</div>
			<div class="tk-stat-v">${s.v}</div>
			${s.sub ? `<div style="font-size:12px;margin-top:3px;color:${up ? '#4ade80' : '#f87171'}">${s.sub} 24h</div>` : ''}
		</div>`;
	}).join('');
}

// ── live trade tape via SSE (reconnecting) ───────────────────────────────────
function startTradeTape(tapeEl, statusEl) {
	let es = null;
	let stopped = false;
	let retry = null;
	let everConnected = false;

	const setStatus = (online) => {
		statusEl.innerHTML = `<span class="tk-dot ${online ? '' : 'off'}"></span>${online ? 'Live' : 'Reconnecting…'}`;
	};

	const addTrade = (t) => {
		if (!t || (t.mint && t.mint !== THREE_MINT)) return;
		// Drop the empty-state placeholder on first real trade.
		const empty = tapeEl.querySelector('[data-empty]');
		if (empty) empty.remove();

		const isBuy = t.is_buy ?? t.txType === 'buy';
		const usd = t.sol_value_usd != null ? fmtUsd(t.sol_value_usd) : null;
		const sol = t.sol_amount != null ? `${Number(t.sol_amount).toFixed(3)} SOL` : '';
		const row = document.createElement('div');
		row.className = `tk-trade ${isBuy ? 'buy' : 'sell'}${REDUCED_MOTION ? '' : ' in'}`;
		row.innerHTML = `
			<span class="tk-side ${isBuy ? 'buy' : 'sell'}">${isBuy ? 'Buy' : 'Sell'}</span>
			<a class="tk-trader" href="https://solscan.io/account/${esc(t.trader || '')}" target="_blank" rel="noopener">${esc(shortAddr(t.trader))}</a>
			<span class="tk-amt">${usd || sol}${usd && sol ? ` <small>${sol}</small>` : ''} <small>· ${relTime(t.timestamp)}</small></span>`;
		tapeEl.prepend(row);
		while (tapeEl.children.length > MAX_TAPE_ROWS) tapeEl.lastElementChild.remove();
	};

	const connect = () => {
		if (stopped) return;
		es = new EventSource(`/api/pump/trades-stream?mint=${encodeURIComponent(THREE_MINT)}`);
		es.addEventListener('open', () => { everConnected = true; setStatus(true); });
		es.addEventListener('trade', (e) => { try { addTrade(JSON.parse(e.data)); } catch {} });
		es.addEventListener('close', () => { es.close(); scheduleReconnect(); });
		es.onerror = () => { setStatus(false); es.close(); scheduleReconnect(); };
	};

	const scheduleReconnect = () => {
		if (stopped) return;
		setStatus(false);
		clearTimeout(retry);
		// The server caps each stream at 90s, so a reconnect is normal, not an error.
		retry = setTimeout(connect, everConnected ? 1200 : 4000);
	};

	setStatus(false);
	connect();
	return () => { stopped = true; clearTimeout(retry); es?.close(); };
}

// ── buy flow: Phantom → in-page swap, else pump.fun ─────────────────────────
async function buyThree() {
	const provider = window.solana || window.phantom?.solana;
	if (!provider?.isPhantom) {
		window.open(PUMP_URL, '_blank', 'noopener');
		return;
	}
	try {
		const resp = provider.publicKey ? { publicKey: provider.publicKey } : await provider.connect();
		const wallet = resp.publicKey.toString();
		openSwapModal({ wallet, getProvider: () => provider, defaultInputMint: SOL_MINT, defaultOutputMint: THREE_MINT });
	} catch {
		window.open(PUMP_URL, '_blank', 'noopener');
	}
}

// ── boot ─────────────────────────────────────────────────────────────────────
function boot() {
	injectStyles();
	document.title = '$THREE · Live price, chart & trades · three.ws';

	const wrap = document.createElement('div');
	wrap.className = 'tk-wrap';
	wrap.innerHTML = `
		<div class="tk-head">
			<div class="tk-logo">$3</div>
			<div style="flex:1;min-width:0">
				<h1 class="tk-title">$THREE</h1>
				<p class="tk-sub">The protocol token powering the three.ws agent economy</p>
			</div>
			<button class="tk-ca" data-ca title="Copy contract address">${esc(shortAddr(THREE_MINT))} · copy</button>
		</div>
		<div class="tk-stats" data-stats>
			${Array.from({ length: 4 }, () => `<div class="tk-stat"><div class="tk-skel" style="height:48px"></div></div>`).join('')}
		</div>
		<div class="tk-grid">
			<div class="tk-card">
				<h2>Bonding curve</h2>
				<div data-curve></div>
				<div class="tk-buy">
					<button class="tk-btn primary" data-buy>Buy $THREE</button>
					<a class="tk-btn" href="${PUMP_URL}" target="_blank" rel="noopener">View on pump.fun ↗</a>
				</div>
			</div>
			<div class="tk-card">
				<h2 style="display:flex;align-items:center;justify-content:space-between">Live trades <span class="tk-status" data-tape-status></span></h2>
				<div class="tk-tape" data-tape>
					<div class="tk-empty" data-empty>Waiting for the next trade…</div>
				</div>
			</div>
		</div>
		<div class="tk-foot">
			<a href="/dashboard/holders">🏆 Holder leaderboard</a>
			<a href="/three-live">⚡ Protocol Pulse (live 3D)</a>
			<a href="/dashboard/three-token">📊 $THREE dashboard</a>
			<a href="https://solscan.io/token/${THREE_MINT}" target="_blank" rel="noopener">🔎 Solscan ↗</a>
		</div>
	`;
	document.body.appendChild(wrap);

	// Copy CA
	wrap.querySelector('[data-ca]').addEventListener('click', async (e) => {
		try {
			await navigator.clipboard.writeText(THREE_MINT);
			const b = e.currentTarget;
			const prev = b.textContent;
			b.textContent = 'Copied ✓';
			setTimeout(() => { b.textContent = prev; }, 1400);
		} catch {}
	});

	// Buy
	wrap.querySelector('[data-buy]').addEventListener('click', () => { buyThree().catch(() => window.open(PUMP_URL, '_blank', 'noopener')); });

	// Bonding curve — real on-chain reads for the $THREE mint.
	mountBondingCurve(wrap.querySelector('[data-curve]'), { mint: THREE_MINT, network: 'mainnet', showUsd: true, refreshMs: 15_000 });

	// Header stats from the shared store (price/mcap/volume/holders).
	const statsEl = wrap.querySelector('[data-stats]');
	const store = createThreeTokenData({ pollMs: 30_000, anchorEl: wrap });
	store.subscribe((state) => {
		const p = state.protocol;
		if (p.status === 'ok' && p.token) statsEl.innerHTML = renderHeaderStats(p.token);
		else if (p.status === 'error') statsEl.innerHTML = `<div class="tk-empty" style="grid-column:1/-1">Couldn’t load $THREE market data. <a href="${PUMP_URL}" target="_blank" rel="noopener" style="color:#7CC4FF">View on pump.fun ↗</a></div>`;
	});

	// Live trade tape.
	startTradeTape(wrap.querySelector('[data-tape]'), wrap.querySelector('[data-tape-status]'));
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();

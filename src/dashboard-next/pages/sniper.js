// dashboard-next — Sniper Strategies.
//
// Strategy management for the autonomous pump.fun sniper worker:
//   1. Overview strip     — aggregate PnL, open positions, win rate.
//   2. Your strategies    — one card per armed agent with enable/kill-switch.
//   3. Strategy editor    — inline config for budget, exits, filters.
//   4. Live positions     — SSE stream of open trades, real-time.
//   5. Arm new strategy   — select an unstrategied agent and configure it.
//
// Endpoints:
//   GET  /api/sniper/strategy   → { strategies: [...] }
//   POST /api/sniper/strategy   → upsert/arm strategy
//   GET  /api/sniper/stream     → SSE: position events

import { mountShell } from '../shell.js';
import { requireUser, get, post, esc, relTime, ApiError } from '../api.js';

const SOL = 1_000_000_000n;
const lamportsToSol = (l) => Number(BigInt(l || '0')) / 1e9;
const fmtSol = (sol) => {
	const v = Number(sol) || 0;
	if (Math.abs(v) < 0.001) return `${v.toFixed(4)} ◎`;
	return `${v.toFixed(3)} ◎`;
};
const fmtLamports = (l) => fmtSol(lamportsToSol(l));
const solToLamports = (s) => String(Math.round(Number(s) * 1e9));
const pct = (n) => (n == null ? '—' : `${Number(n).toFixed(1)}%`);
const clr = (n) => (Number(n) > 0 ? 'sn-pos' : Number(n) < 0 ? 'sn-neg' : '');

function fmtHold(sec) {
	if (!sec) return '—';
	const s = Number(sec);
	if (s < 60) return `${s}s`;
	if (s < 3600) return `${Math.round(s / 60)}m`;
	return `${(s / 3600).toFixed(1)}h`;
}
function fmtDelayMs(ms) {
	const n = Number(ms || 0);
	if (!n) return 'No delay';
	if (n < 1000) return `${n}ms`;
	return `${(n / 1000).toFixed(1)}s`;
}

function pumpUrl(mint) { return `https://pump.fun/coin/${encodeURIComponent(mint)}`; }
function solscanTx(sig) { return `https://solscan.io/tx/${sig}`; }

// ── Styles ───────────────────────────────────────────────────────────────────

const STYLE = `<style>
.sn-wrap { display: grid; gap: 20px; }

/* overview strip */
.sn-strip { display: grid; grid-template-columns: repeat(auto-fit, minmax(130px, 1fr)); gap: 12px; }
.sn-kpi { background: var(--nxt-panel); border: 1px solid var(--nxt-stroke); border-radius: var(--nxt-radius); padding: 14px 16px; }
.sn-kpi-label { font-size: 11px; color: var(--nxt-ink-faint); text-transform: uppercase; letter-spacing: .05em; margin-bottom: 4px; }
.sn-kpi-val { font-size: 22px; font-weight: 700; font-variant-numeric: tabular-nums; line-height: 1.2; }

/* strategy card */
.sn-cards { display: grid; gap: 14px; }
.sn-card { background: var(--nxt-panel); border: 1px solid var(--nxt-stroke); border-radius: var(--nxt-radius); overflow: hidden; transition: border-color .14s; }
.sn-card.armed { border-color: color-mix(in srgb, var(--nxt-accent) 40%, var(--nxt-stroke)); }
.sn-card-head { display: flex; align-items: center; gap: 12px; padding: 14px 16px; cursor: pointer; user-select: none; }
.sn-card-head:hover { background: var(--nxt-bg-2); }
.sn-av { width: 40px; height: 40px; border-radius: 10px; object-fit: cover; background: var(--nxt-bg-2); border: 1px solid var(--nxt-stroke); flex-shrink: 0; }
.sn-info { flex: 1; min-width: 0; }
.sn-name { font-weight: 600; font-size: 15px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.sn-meta { font-size: 12px; color: var(--nxt-ink-faint); margin-top: 2px; display: flex; gap: 10px; flex-wrap: wrap; }
.sn-badges { display: flex; gap: 6px; align-items: center; }
.sn-badge { font-size: 11px; padding: 2px 8px; border-radius: 999px; border: 1px solid var(--nxt-stroke); color: var(--nxt-ink-dim); white-space: nowrap; }
.sn-badge.on { color: var(--nxt-success); border-color: color-mix(in srgb, var(--nxt-success) 35%, transparent); background: color-mix(in srgb, var(--nxt-success) 8%, transparent); }
.sn-badge.kill { color: var(--nxt-danger, #f87171); border-color: color-mix(in srgb, var(--nxt-danger, #f87171) 35%, transparent); background: color-mix(in srgb, var(--nxt-danger, #f87171) 8%, transparent); }
.sn-badge.off { color: var(--nxt-ink-faint); }
.sn-badge.sim { color: var(--nxt-warn); border-color: color-mix(in srgb, var(--nxt-warn) 35%, transparent); }
.sn-chevron { color: var(--nxt-ink-faint); font-size: 12px; transition: transform .18s; flex-shrink: 0; }
.sn-card.open .sn-chevron { transform: rotate(180deg); }
.sn-card-body { display: none; border-top: 1px solid var(--nxt-line); padding: 16px; }
.sn-card.open .sn-card-body { display: block; }

/* toggles row */
.sn-toggles { display: flex; gap: 10px; flex-wrap: wrap; margin-bottom: 16px; }
.sn-toggle-btn { font-size: 12px; padding: 6px 14px; border-radius: var(--nxt-radius-sm); border: 1px solid var(--nxt-stroke); background: var(--nxt-bg-2); color: var(--nxt-ink); cursor: pointer; transition: border-color .12s, background .12s, transform .12s; }
.sn-toggle-btn:hover { border-color: var(--nxt-stroke-strong); transform: translateY(-1px); }
.sn-toggle-btn.active { background: var(--nxt-accent); color: #061018; border-color: transparent; }
.sn-toggle-btn.danger { border-color: color-mix(in srgb, var(--nxt-danger, #f87171) 50%, transparent); color: var(--nxt-danger, #f87171); }
.sn-toggle-btn.danger:hover { background: color-mix(in srgb, var(--nxt-danger, #f87171) 12%, transparent); }

/* summary mini-strip inside card */
.sn-sum { display: flex; gap: 20px; flex-wrap: wrap; padding: 10px 0 16px; border-bottom: 1px solid var(--nxt-line); margin-bottom: 16px; }
.sn-sum-item { display: flex; flex-direction: column; gap: 2px; }
.sn-sum-label { font-size: 11px; color: var(--nxt-ink-faint); text-transform: uppercase; letter-spacing: .05em; }
.sn-sum-val { font-size: 15px; font-weight: 600; font-variant-numeric: tabular-nums; }

/* config form */
.sn-form { display: grid; grid-template-columns: 1fr 1fr; gap: 12px 20px; }
@media (max-width: 560px) { .sn-form { grid-template-columns: 1fr; } }
.sn-field { display: flex; flex-direction: column; gap: 4px; }
.sn-field label { font-size: 11px; color: var(--nxt-ink-faint); text-transform: uppercase; letter-spacing: .04em; }
.sn-field input, .sn-field select { background: var(--nxt-bg-2); border: 1px solid var(--nxt-stroke); border-radius: var(--nxt-radius-sm); color: var(--nxt-ink); padding: 7px 10px; font-size: 13px; font-family: inherit; width: 100%; transition: border-color .12s; }
.sn-field input:focus, .sn-field select:focus { outline: none; border-color: var(--nxt-accent); }
.sn-field .sn-hint { font-size: 11px; color: var(--nxt-ink-faint); }
.sn-field-full { grid-column: 1 / -1; }
.sn-link { color: var(--nxt-accent); text-decoration: none; }
.sn-link:hover { text-decoration: underline; }
.sn-section-head { font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: .06em; color: var(--nxt-ink-dim); margin: 16px 0 8px; grid-column: 1 / -1; }
.sn-save-row { grid-column: 1 / -1; display: flex; gap: 10px; align-items: center; margin-top: 6px; }
.sn-btn { font-size: 13px; padding: 8px 18px; border-radius: var(--nxt-radius-sm); border: 1px solid transparent; cursor: pointer; transition: opacity .14s, transform .14s; }
.sn-btn:hover { opacity: .88; transform: translateY(-1px); }
.sn-btn.primary { background: var(--nxt-accent); color: #061018; }
.sn-btn.ghost { background: transparent; border-color: var(--nxt-stroke); color: var(--nxt-ink); }
.sn-btn:disabled { opacity: .45; cursor: not-allowed; transform: none; }
.sn-save-msg { font-size: 12px; color: var(--nxt-ink-faint); }

/* live positions */
.sn-live { background: var(--nxt-panel); border: 1px solid var(--nxt-stroke); border-radius: var(--nxt-radius); }
.sn-live-head { display: flex; align-items: center; justify-content: space-between; padding: 14px 16px; border-bottom: 1px solid var(--nxt-line); }
.sn-live-title { font-size: 14px; font-weight: 600; display: flex; gap: 8px; align-items: center; }
.sn-live-dot { width: 7px; height: 7px; border-radius: 50%; background: var(--nxt-success); animation: sn-pulse 2s ease infinite; }
@keyframes sn-pulse { 0%,100% { opacity: 1 } 50% { opacity: .35 } }
.sn-pos-list { padding: 0; }
.sn-pos-row { display: grid; grid-template-columns: 1fr auto auto auto; gap: 10px; align-items: center; padding: 11px 16px; border-bottom: 1px solid var(--nxt-line); }
.sn-pos-row:last-child { border-bottom: 0; }
.sn-pos-info { min-width: 0; }
.sn-pos-sym { font-weight: 600; font-size: 14px; }
.sn-pos-sub { font-size: 11px; color: var(--nxt-ink-faint); margin-top: 2px; }
.sn-pos-pnl { font-size: 14px; font-weight: 600; font-variant-numeric: tabular-nums; text-align: right; }
.sn-pos-link { font-size: 12px; color: var(--nxt-accent); text-decoration: none; padding: 4px 10px; border: 1px solid color-mix(in srgb, var(--nxt-accent) 35%, transparent); border-radius: var(--nxt-radius-sm); white-space: nowrap; transition: background .12s; }
.sn-pos-link:hover { background: color-mix(in srgb, var(--nxt-accent) 12%, transparent); }
.sn-pos-oracle { display: inline-flex; }
.sn-ob { display: inline-flex; align-items: center; gap: 3px; background: rgba(0,0,0,0.4); border: 1px solid rgba(255,255,255,0.08); border-radius: 6px; padding: 3px 7px; text-decoration: none; transition: border-color .12s; }
.sn-ob:hover { border-color: rgba(255,255,255,0.22); }
.sn-ob-score { font: 700 11px/1 var(--nxt-mono, monospace); font-variant-numeric: tabular-nums; }
.sn-ob-tier { font: 600 8px/1 var(--nxt-mono, monospace); text-transform: uppercase; letter-spacing: .06em; opacity: .8; }
.sn-empty { color: var(--nxt-ink-faint); font-size: 13px; padding: 24px 16px; text-align: center; }

/* trade history */
.sn-hist { background: var(--nxt-panel); border: 1px solid var(--nxt-stroke); border-radius: var(--nxt-radius); overflow: hidden; }
.sn-hist-head { display: flex; align-items: center; justify-content: space-between; padding: 14px 18px 12px; border-bottom: 1px solid var(--nxt-line); }
.sn-hist-head h3 { font-size: 14px; margin: 0; }
.sn-hist-table { width: 100%; border-collapse: collapse; font-size: 12.5px; }
.sn-hist-table th { padding: 9px 14px; text-align: left; font: 600 10px/1 var(--nxt-mono, monospace); letter-spacing: .07em; text-transform: uppercase; color: var(--nxt-ink-faint); border-bottom: 1px solid var(--nxt-line); white-space: nowrap; }
.sn-hist-table th.r, .sn-hist-table td.r { text-align: right; }
.sn-hist-row td { padding: 10px 14px; border-bottom: 1px solid rgba(255,255,255,0.04); vertical-align: middle; white-space: nowrap; }
.sn-hist-row:last-child td { border-bottom: none; }
.sn-hist-sym { font-weight: 700; font-size: 13px; }
.sn-hist-agent { font-size: 11px; color: var(--nxt-ink-faint); margin-top: 2px; }
.sn-hist-mono { font-family: var(--nxt-mono, monospace); font-variant-numeric: tabular-nums; }
.sn-hist-tag { font-size: 10px; padding: 2px 7px; border-radius: 999px; border: 1px solid var(--nxt-stroke); color: var(--nxt-ink-faint); }
.sn-hist-tag.tp { color: var(--nxt-success); border-color: color-mix(in srgb, var(--nxt-success) 40%, transparent); }
.sn-hist-tag.sl { color: var(--nxt-danger, #f87171); border-color: color-mix(in srgb, var(--nxt-danger, #f87171) 40%, transparent); }
.sn-hist-link { color: var(--nxt-accent); text-decoration: none; font-size: 11px; }
.sn-hist-link:hover { text-decoration: underline; }
.sn-hist-more { display: block; text-align: center; padding: 12px; font-size: 12px; color: var(--nxt-ink-faint); border-top: 1px solid var(--nxt-line); background: none; border-left:0;border-right:0;border-bottom:0; width:100%; cursor:pointer; }
.sn-hist-more:hover { color: var(--nxt-ink); }
@media (max-width: 640px) { .sn-hist-table th.hide-mobile, .sn-hist-row td.hide-mobile { display: none; } }

/* pnl chart */
.sn-chart-wrap { padding: 14px 18px 10px; border-bottom: 1px solid var(--nxt-line); }
.sn-chart-head { display: flex; align-items: baseline; gap: 10px; margin-bottom: 10px; }
.sn-chart-label { font-size: 11px; color: var(--nxt-ink-faint); text-transform: uppercase; letter-spacing: .07em; font-family: var(--nxt-mono, monospace); }
.sn-chart-val { font-size: 18px; font-weight: 700; font-variant-numeric: tabular-nums; font-family: var(--nxt-mono, monospace); }
.sn-chart-canvas { width: 100%; height: 90px; display: block; }

/* new strategy cta */
.sn-new { background: var(--nxt-panel); border: 1px dashed var(--nxt-stroke); border-radius: var(--nxt-radius); padding: 20px 24px; display: flex; align-items: center; justify-content: space-between; gap: 16px; flex-wrap: wrap; }
.sn-new-text { font-size: 13px; color: var(--nxt-ink-faint); max-width: 340px; }
.sn-new-text b { color: var(--nxt-ink); }

/* pos/neg colors */
.sn-pos { color: var(--nxt-success); }
.sn-neg { color: var(--nxt-danger, #f87171); }

/* skeleton */
.sn-sk { height: 80px; border-radius: var(--nxt-radius); background: var(--nxt-bg-2); animation: sn-sk 1.4s ease infinite; margin-bottom: 12px; }
@keyframes sn-sk { 0%,100% { opacity: .5 } 50% { opacity: 1 } }

/* arm modal overlay */
.sn-overlay { position: fixed; inset: 0; background: rgba(0,0,0,.6); backdrop-filter: blur(6px); z-index: 900; display: flex; align-items: center; justify-content: center; padding: 16px; }
.sn-modal { background: var(--nxt-bg); border: 1px solid var(--nxt-stroke-strong); border-radius: var(--nxt-radius); padding: 24px; width: 100%; max-width: 480px; }
.sn-modal h2 { font-size: 16px; margin: 0 0 16px; }
.sn-modal-foot { display: flex; gap: 10px; justify-content: flex-end; margin-top: 20px; }
</style>`;

// ── Boot ──────────────────────────────────────────────────────────────────────

(async function boot() {
	try {
		const main = await mountShell();
		await requireUser();

		main.innerHTML = `
			<h1 class="dn-h1">Sniper Strategies</h1>
			<p class="dn-h1-sub">Manage your autonomous trading agents — budgets, filters, exits, and live positions.</p>
			<div id="sn-root"><div class="sn-sk"></div><div class="sn-sk"></div></div>
		`;
		main.insertAdjacentHTML('beforeend', STYLE);

		await refresh(main.querySelector('#sn-root'));
	} catch (e) {
		const root = document.getElementById('sn-root');
		if (root) root.innerHTML = `<p class="sn-empty">${esc(e.message || 'Error loading strategies')}</p>`;
	}
})();

// ── Main render ───────────────────────────────────────────────────────────────

let _strategies = [];
let _positions = [];
let _agents = [];
let _sseSource = null;

async function refresh(root) {
	const [stratData, agentData] = await Promise.all([
		get('/api/sniper/strategy').catch(() => ({ strategies: [] })),
		get('/api/agents').catch(() => ({ agents: [] })),
	]);
	_strategies = stratData.strategies || [];
	_agents = agentData.agents || [];

	root.innerHTML = render();
	wireEvents(root);
	startSse(root);
	loadTradeHistory(root);

	// Auto-open arm modal when arriving from Strategy Lab with a preset
	const qp = new URLSearchParams(location.search);
	if (qp.get('from') === 'strategy-lab' && qp.get('preset_tier')) {
		openArmModal(root);
	}
}

function render() {
	const hasStrats = _strategies.length > 0;
	return `
	<div class="sn-wrap">
		${overviewStrip()}
		<div class="sn-cards" id="sn-cards">
			${hasStrats ? _strategies.map(stratCard).join('') : ''}
		</div>
		${livePositionsSection()}
		<div id="sn-hist-mount"></div>
		${newStrategyCta()}
	</div>`;
}

// ── Overview strip ────────────────────────────────────────────────────────────

function overviewStrip() {
	const totalOpen = _strategies.reduce((s, r) => s + (r.summary?.open_positions || 0), 0);
	const totalClosed = _strategies.reduce((s, r) => s + (r.summary?.closed_positions || 0), 0);
	const totalWins = _strategies.reduce((s, r) => s + (r.summary?.wins || 0), 0);
	const totalPnlLam = _strategies.reduce((s, r) => s + BigInt(r.summary?.realized_pnl_lamports || '0'), 0n);
	const winRate = totalClosed > 0 ? Math.round((totalWins / totalClosed) * 100) : null;
	const armed = _strategies.filter((s) => s.enabled && !s.kill_switch).length;

	return `<div class="sn-strip">
		<div class="sn-kpi">
			<div class="sn-kpi-label">Armed agents</div>
			<div class="sn-kpi-val">${armed}</div>
		</div>
		<div class="sn-kpi">
			<div class="sn-kpi-label">Open positions</div>
			<div class="sn-kpi-val">${totalOpen}</div>
		</div>
		<div class="sn-kpi">
			<div class="sn-kpi-label">Realized PnL</div>
			<div class="sn-kpi-val ${clr(lamportsToSol(String(totalPnlLam)))}">${fmtLamports(String(totalPnlLam))}</div>
		</div>
		<div class="sn-kpi">
			<div class="sn-kpi-label">Win rate</div>
			<div class="sn-kpi-val">${winRate != null ? `${winRate}%` : '—'}</div>
		</div>
		<div class="sn-kpi">
			<div class="sn-kpi-label">Closed trades</div>
			<div class="sn-kpi-val">${totalClosed}</div>
		</div>
	</div>`;
}

// ── Strategy card ─────────────────────────────────────────────────────────────

function stratCard(s) {
	const armed = s.enabled && !s.kill_switch;
	const pnlSol = lamportsToSol(s.summary?.realized_pnl_lamports || '0');
	const closed = s.summary?.closed_positions || 0;
	const wins = s.summary?.wins || 0;
	const wr = closed > 0 ? Math.round((wins / closed) * 100) : null;
	const img = s.image || '/favicon.ico';
	const triggerLabel = s.trigger === 'first_claim' ? 'First-claim trigger' : s.trigger === 'intel_confirmed' ? 'Intel-confirmed trigger' : 'New mint trigger';

	const walletBal = s.wallet_sol != null ? s.wallet_sol : null;
	const walletWarn = walletBal != null && walletBal < lamportsToSol(s.per_trade_lamports || '0') + 0.003;

	return `<div class="sn-card ${armed ? 'armed' : ''}" data-agent="${esc(s.agent_id)}">
		<div class="sn-card-head" data-toggle="card">
			<img class="sn-av" src="${esc(img)}" alt="" onerror="this.style.visibility='hidden'" />
			<div class="sn-info">
				<div class="sn-name">${esc(s.agent_name || s.agent_id)}</div>
				<div class="sn-meta">
					<span>${triggerLabel}</span>
					<span>${fmtSol(lamportsToSol(s.per_trade_lamports))} / trade</span>
					<span>Daily budget: ${fmtSol(lamportsToSol(s.daily_budget_lamports))}</span>
					${walletBal != null ? `<span class="${walletWarn ? 'sn-neg' : ''}">Wallet: ${fmtSol(walletBal)}${walletWarn ? ' ⚠ low' : ''}</span>` : ''}
				</div>
			</div>
			<div class="sn-badges">
				${s.kill_switch ? '<span class="sn-badge kill">Kill switch ON</span>' : s.enabled ? '<span class="sn-badge on">Armed</span>' : '<span class="sn-badge off">Disarmed</span>'}
			</div>
			<span class="sn-chevron">▼</span>
		</div>
		<div class="sn-card-body">
			<div class="sn-toggles">
				<button class="sn-toggle-btn ${armed ? 'active' : ''}" data-action="toggle-enabled" data-agent="${esc(s.agent_id)}">
					${s.enabled ? 'Disarm' : 'Arm strategy'}
				</button>
				<button class="sn-toggle-btn ${s.kill_switch ? 'active danger' : 'danger'}" data-action="toggle-kill" data-agent="${esc(s.agent_id)}">
					${s.kill_switch ? 'Clear kill switch' : 'Kill switch'}
				</button>
				<a class="sn-toggle-btn" href="/trader/${esc(s.agent_id)}" target="_blank" rel="noopener">Track record ↗</a>
				${s.wallet_address ? `<a class="sn-toggle-btn" href="https://solscan.io/account/${esc(s.wallet_address)}" target="_blank" rel="noopener">Wallet ↗</a>` : ''}
			</div>
			${walletWarn ? `<div style="font-size:12px;color:var(--nxt-warn,#f59e0b);padding:4px 0 12px;border-bottom:1px solid var(--nxt-line);margin-bottom:12px;">⚠ Wallet balance (${fmtSol(walletBal)}) may be too low for a trade. Fund ${s.wallet_address ? `<a href="https://solscan.io/account/${esc(s.wallet_address)}" target="_blank" rel="noopener" style="color:inherit;text-decoration:underline">${s.wallet_address.slice(0,8)}…</a>` : 'the agent wallet'} with more SOL before arming.</div>` : ''}
			<div class="sn-sum">
				<div class="sn-sum-item">
					<span class="sn-sum-label">Open</span>
					<span class="sn-sum-val">${s.summary?.open_positions || 0}</span>
				</div>
				<div class="sn-sum-item">
					<span class="sn-sum-label">Closed</span>
					<span class="sn-sum-val">${closed}</span>
				</div>
				<div class="sn-sum-item">
					<span class="sn-sum-label">Wins</span>
					<span class="sn-sum-val sn-pos">${wins}</span>
				</div>
				<div class="sn-sum-item">
					<span class="sn-sum-label">Win rate</span>
					<span class="sn-sum-val ${wr != null && wr >= 50 ? 'sn-pos' : ''}">${wr != null ? `${wr}%` : '—'}</span>
				</div>
				<div class="sn-sum-item">
					<span class="sn-sum-label">Realized PnL</span>
					<span class="sn-sum-val ${clr(pnlSol)}">${fmtSol(pnlSol)}</span>
				</div>
			</div>
			${stratForm(s)}
		</div>
	</div>`;
}

function stratForm(s) {
	const toLamSol = (l) => (BigInt(l || '0') > 0n ? lamportsToSol(l).toFixed(3) : '');
	const toLamSolNum = (l) => (l != null && BigInt(l || '0') > 0n ? lamportsToSol(l) : '');

	return `<form class="sn-form" data-strat-form="${esc(s.agent_id)}">
		<div class="sn-section-head">Trigger & Sizing</div>
		<div class="sn-field">
			<label>Trigger</label>
			<select name="trigger" aria-label="Trigger">
				<option value="new_mint" ${s.trigger === 'new_mint' || (!s.trigger || (s.trigger !== 'first_claim' && s.trigger !== 'intel_confirmed')) ? 'selected' : ''}>New mint — snipe every launch</option>
				<option value="first_claim" ${s.trigger === 'first_claim' ? 'selected' : ''}>First claim — creator claims for first time</option>
				<option value="intel_confirmed" ${s.trigger === 'intel_confirmed' ? 'selected' : ''}>Intel confirmed — buy after Coin Intelligence verdict</option>
			</select>
			<span class="sn-hint">Intel confirmed waits for the observation window (~60s) and only buys if the coin passes bundle detection and quality analysis.</span>
			<span class="sn-hint">When the agent enters a position.</span>
		</div>
		<div class="sn-field">
			<label>Buy delay (ms)</label>
			<input name="buy_delay_ms" type="number" min="0" max="600000" value="${s.buy_delay_ms || 0}" aria-label="Buy delay in milliseconds" />
			<span class="sn-hint">Pause before buying. Currently ${fmtDelayMs(s.buy_delay_ms)}.</span>
		</div>
		<div class="sn-field">
			<label>Daily budget (SOL)</label>
			<input name="daily_budget_sol" type="number" min="0" step="0.001" value="${toLamSol(s.daily_budget_lamports)}" aria-label="Daily budget in SOL" />
			<span class="sn-hint">Max SOL to spend per calendar day.</span>
		</div>
		<div class="sn-field">
			<label>Per-trade size (SOL)</label>
			<input name="per_trade_sol" type="number" min="0" step="0.001" value="${toLamSol(s.per_trade_lamports)}" aria-label="Per-trade size in SOL" />
			<span class="sn-hint">SOL per snipe. Must be ≤ daily budget.</span>
		</div>
		<div class="sn-field">
			<label>Max concurrent positions</label>
			<input name="max_concurrent_positions" type="number" min="1" max="50" value="${s.max_concurrent_positions || 1}" aria-label="Max concurrent positions" />
		</div>
		<div class="sn-field">
			<label>Slippage (bps)</label>
			<input name="slippage_bps" type="number" min="0" max="5000" value="${s.slippage_bps || 500}" aria-label="Slippage in basis points" />
			<span class="sn-hint">100 bps = 1%.</span>
		</div>

		<div class="sn-section-head">Exit Rules</div>
		<div class="sn-field">
			<label>Take profit (%)</label>
			<input name="take_profit_pct" type="number" min="1" step="1" value="${s.take_profit_pct != null ? s.take_profit_pct : ''}" placeholder="e.g. 50" aria-label="Take profit percent" />
			<span class="sn-hint">Sell when up this %. Leave blank to hold.</span>
		</div>
		<div class="sn-field">
			<label>Stop loss (%) *</label>
			<input name="stop_loss_pct" type="number" min="1" max="99" step="1" value="${s.stop_loss_pct != null ? s.stop_loss_pct : 30}" required aria-label="Stop loss percent" />
		</div>
		<div class="sn-field">
			<label>Trailing stop (%)</label>
			<input name="trailing_stop_pct" type="number" min="1" step="1" value="${s.trailing_stop_pct != null ? s.trailing_stop_pct : ''}" placeholder="e.g. 20" aria-label="Trailing stop percent" />
			<span class="sn-hint">Sell when peak drops by this %. Optional.</span>
		</div>
		<div class="sn-field">
			<label>Max hold time (seconds)</label>
			<input name="max_hold_seconds" type="number" min="30" max="86400" value="${s.max_hold_seconds || 1800}" aria-label="Max hold time in seconds" />
			<span class="sn-hint">Force-exit after this. Currently ${fmtHold(s.max_hold_seconds)}.</span>
		</div>

		<div class="sn-section-head">Entry Filters</div>
		<div class="sn-field">
			<label>Min market cap (USD)</label>
			<input name="min_market_cap_usd" type="number" min="0" value="${s.min_market_cap_usd != null ? s.min_market_cap_usd : ''}" placeholder="any" aria-label="Min market cap in USD" />
		</div>
		<div class="sn-field">
			<label>Max market cap (USD)</label>
			<input name="max_market_cap_usd" type="number" min="0" value="${s.max_market_cap_usd != null ? s.max_market_cap_usd : ''}" placeholder="any" aria-label="Max market cap in USD" />
		</div>
		<div class="sn-field">
			<label>Min creator graduated coins</label>
			<input name="min_creator_graduated" type="number" min="0" value="${s.min_creator_graduated != null ? s.min_creator_graduated : ''}" placeholder="any" aria-label="Min creator graduated coins" />
			<span class="sn-hint">Only launch from creators with this many graduates.</span>
		</div>
		<div class="sn-field">
			<label>Max creator total launches</label>
			<input name="max_creator_launches" type="number" min="1" value="${s.max_creator_launches != null ? s.max_creator_launches : ''}" placeholder="any" aria-label="Max creator total launches" />
			<span class="sn-hint">Skip serial launchers with too many coins.</span>
		</div>
		<div class="sn-field">
			<label>Require social links</label>
			<select name="require_socials" aria-label="Require social links">
				<option value="false" ${!s.require_socials ? 'selected' : ''}>No — any launch</option>
				<option value="true" ${s.require_socials ? 'selected' : ''}>Yes — Twitter/Telegram required</option>
			</select>
		</div>
		<div class="sn-field">
			<label>Require SOL quote</label>
			<select name="require_sol_quote" aria-label="Require SOL quote">
				<option value="true" ${s.require_sol_quote !== false ? 'selected' : ''}>Yes (recommended)</option>
				<option value="false" ${s.require_sol_quote === false ? 'selected' : ''}>No</option>
			</select>
		</div>
		<div class="sn-field">
			<label>Min Oracle conviction (0–100)</label>
			<input name="min_oracle_score" type="number" step="1" min="0" max="100" value="${s.min_oracle_score != null ? s.min_oracle_score : ''}" placeholder="any" aria-label="Min Oracle conviction score, 0 to 100" />
			<span class="sn-hint">Skip the snipe if Oracle conviction is below this. Leave blank to snipe regardless of conviction. New mints without a score are allowed through.</span>
		</div>

		${s.trigger === 'first_claim' ? firstClaimFields(s) : ''}
		${s.trigger === 'intel_confirmed' ? intelFields(s) : ''}

		<div class="sn-section-head">Notifications</div>
		<div class="sn-field sn-field-full">
			<label>Telegram chat ID (optional)</label>
			<input name="telegram_chat_id" type="text" inputmode="numeric" value="${s.telegram_chat_id || ''}" placeholder="e.g. 123456789" autocomplete="off" aria-label="Telegram chat ID (optional)" />
			<span class="sn-hint">Get buy/sell alerts in your own Telegram chat. Message <a class="sn-link" href="https://t.me/userinfobot" target="_blank" rel="noopener">@userinfobot</a> to find your chat ID, then forward its reply here. Leave blank to use the platform ops channel.</span>
		</div>

		<div class="sn-save-row">
			<button type="submit" class="sn-btn primary" data-save="${esc(s.agent_id)}">Save changes</button>
			<span class="sn-save-msg" data-msg="${esc(s.agent_id)}"></span>
		</div>
	</form>`;
}

function firstClaimFields(s) {
	const toLamSolOptional = (l) => (l != null ? lamportsToSol(l).toFixed(4) : '');
	return `
		<div class="sn-section-head">First-Claim Filters</div>
		<div class="sn-field">
			<label>Min claim size (SOL)</label>
			<input name="min_claim_lamports_sol" type="number" min="0" step="0.001" value="${toLamSolOptional(s.min_claim_lamports)}" placeholder="any" aria-label="Min claim size in SOL" />
			<span class="sn-hint">Only trigger if the creator claimed this much SOL.</span>
		</div>
		<div class="sn-field">
			<label>Max claim size (SOL)</label>
			<input name="max_claim_lamports_sol" type="number" min="0" step="0.001" value="${toLamSolOptional(s.max_claim_lamports)}" placeholder="any" aria-label="Max claim size in SOL" />
		</div>
		<div class="sn-field">
			<label>Max claim age (seconds)</label>
			<input name="first_claim_max_age_seconds" type="number" min="1" max="86400" value="${s.first_claim_max_age_seconds != null ? s.first_claim_max_age_seconds : ''}" placeholder="300" aria-label="Max claim age in seconds" />
			<span class="sn-hint">Skip if the claim tx is older than this.</span>
		</div>`;
}

function intelFields(s) {
	const cats = Array.isArray(s.allowed_categories) ? s.allowed_categories.join(', ') : '';
	return `
		<div class="sn-section-head">Coin Intelligence Filters</div>
		<div class="sn-field">
			<label>Min quality score (0–100)</label>
			<input name="min_quality_score" type="number" step="1" min="0" max="100" value="${s.min_quality_score != null ? s.min_quality_score : ''}" placeholder="e.g. 60" aria-label="Min quality score, 0 to 100" />
			<span class="sn-hint">Overall quality composite. 0 = any, 100 = best only. Higher = fewer but cleaner entries.</span>
		</div>
		<div class="sn-field">
			<label>Max bundle score (0–1)</label>
			<input name="max_bundle_score" type="number" step="0.05" min="0" max="1" value="${s.max_bundle_score != null ? s.max_bundle_score : ''}" placeholder="e.g. 0.5" aria-label="Max bundle score, 0 to 1" />
			<span class="sn-hint">Bundle likelihood from wallet graph analysis. 0 = no bundles tolerated, 1 = allow all.</span>
		</div>
		<div class="sn-field">
			<label>Max top-wallet concentration (%)</label>
			<input name="max_concentration_top1" type="number" step="1" min="0" max="100" value="${s.max_concentration_top1 != null ? s.max_concentration_top1 : ''}" placeholder="e.g. 20" aria-label="Max top-wallet concentration percent" />
			<span class="sn-hint">Skip if the single largest holder owns more than this % of supply.</span>
		</div>
		<div class="sn-field">
			<label>Avoid dev dump</label>
			<select name="avoid_dev_dump" aria-label="Avoid dev dump">
				<option value="true" ${s.avoid_dev_dump !== false ? 'selected' : ''}>Yes — skip if dev sold (recommended)</option>
				<option value="false" ${s.avoid_dev_dump === false ? 'selected' : ''}>No — allow dev sells</option>
			</select>
		</div>
		<div class="sn-field">
			<label>Allowed categories (comma-separated)</label>
			<input name="allowed_categories" type="text" value="${esc(cats)}" placeholder="e.g. meme, animal, culture (blank = allow all)" aria-label="Allowed categories, comma-separated" />
			<span class="sn-hint">Only snipe coins classified into these categories. Leave blank to allow all.</span>
		</div>`;
}

// ── Live positions ────────────────────────────────────────────────────────────

function livePositionsSection() {
	return `<div class="sn-live">
		<div class="sn-live-head">
			<div class="sn-live-title">
				<span class="sn-live-dot"></span>
				Live Positions
			</div>
			<a class="sn-btn ghost" style="font-size:12px;padding:5px 12px;border-radius:var(--nxt-radius-sm);border:1px solid var(--nxt-stroke);text-decoration:none;color:var(--nxt-ink);" href="/play/arena" target="_blank" rel="noopener">Sniper Arena ↗</a>
		</div>
		<div id="sn-positions" class="sn-pos-list">
			<p class="sn-empty">Connecting…</p>
		</div>
	</div>`;
}

function renderPositions(positions) {
	const el = document.getElementById('sn-positions');
	if (!el) return;
	if (!positions.length) {
		el.innerHTML = '<p class="sn-empty">No open positions right now. When the sniper buys, positions appear here live.</p>';
		return;
	}
	el.innerHTML = positions.map(posRow).join('');
	enrichPositionOracle();
}

function posRow(p) {
	const pnlSol = p.unrealized_pnl_sol != null ? p.unrealized_pnl_sol : null;
	const pnlStr = pnlSol != null ? `<span class="${clr(pnlSol)}">${fmtSol(pnlSol)}</span>` : '—';
	const link = p.entry_buy_sig && p.entry_buy_sig !== 'SIMULATED'
		? `<a class="sn-pos-link" href="${solscanTx(p.entry_buy_sig)}" target="_blank" rel="noopener">Solscan ↗</a>`
		: p.mint ? `<a class="sn-pos-link" href="${pumpUrl(p.mint)}" target="_blank" rel="noopener">pump.fun ↗</a>` : '';
	const mintAttr = p.mint ? ` data-oracle-mint="${esc(p.mint)}"` : '';
	return `<div class="sn-pos-row"${mintAttr}>
		<div class="sn-pos-info">
			<div class="sn-pos-sym">${esc(p.symbol || p.mint?.slice(0, 8) || '—')}</div>
			<div class="sn-pos-sub">${esc(p.agent_name || '')} · opened ${relTime(p.opened_at)}</div>
		</div>
		<div class="sn-pos-pnl">${pnlStr}</div>
		<span class="sn-pos-oracle"></span>
		${link}
	</div>`;
}

const SN_TIER_COLOR = { prime: '#c084fc', strong: '#34d399', lean: '#fbbf24', watch: '#94a3b8', avoid: '#f87171' };

async function enrichPositionOracle() {
	const el = document.getElementById('sn-positions');
	if (!el) return;
	const rows = el.querySelectorAll('[data-oracle-mint]');
	if (!rows.length) return;
	const mints = [...new Set([...rows].map((r) => r.dataset.oracleMint).filter(Boolean))];
	if (!mints.length) return;
	try {
		const r = await fetch(`/api/oracle/batch?mints=${mints.map(encodeURIComponent).join(',')}&network=mainnet`);
		if (!r.ok) return;
		const { results = {} } = await r.json();
		for (const row of rows) {
			const mint = row.dataset.oracleMint;
			const d = results[mint];
			if (!d || d.score == null) continue;
			const badge = row.querySelector('.sn-pos-oracle');
			if (!badge || badge.hasChildNodes()) continue;
			const color = SN_TIER_COLOR[d.tier] || '#94a3b8';
			badge.innerHTML = `<a class="sn-ob" href="/oracle?mint=${encodeURIComponent(mint)}" title="Oracle conviction: ${d.score} (${d.tier})">
				<span class="sn-ob-score" style="color:${color}">${d.score}</span>
				<span class="sn-ob-tier" style="color:${color}">${d.tier}</span>
			</a>`;
		}
	} catch { /* non-fatal */ }
}

// ── Trade history ─────────────────────────────────────────────────────────────

const EXIT_TAG = {
	take_profit: ['tp', 'Take profit'],
	stop_loss:   ['sl', 'Stop loss'],
	trailing_stop: ['sl', 'Trailing stop'],
	timeout:     ['', 'Timeout'],
	kill_switch: ['', 'Kill switch'],
	manual:      ['', 'Manual'],
};

function histRow(t) {
	const pnlCls = t.pnl_sol > 0 ? 'sn-pos' : t.pnl_sol < 0 ? 'sn-neg' : '';
	const pnlStr = t.pnl_sol != null ? `<span class="${pnlCls} sn-hist-mono">${fmtSol(t.pnl_sol)}</span>` : '—';
	const pctStr = t.pnl_pct != null ? `<span class="${pnlCls} sn-hist-mono">${t.pnl_pct >= 0 ? '+' : ''}${t.pnl_pct.toFixed(1)}%</span>` : '—';
	const [tagCls, tagLabel] = EXIT_TAG[t.exit_reason] || ['', t.exit_reason || '—'];
	const entrySol = t.entry_sol != null ? `<span class="sn-hist-mono">${fmtSol(t.entry_sol)}</span>` : '—';
	const links = [
		t.buy_url ? `<a class="sn-hist-link" href="${esc(t.buy_url)}" target="_blank" rel="noopener">buy ↗</a>` : '',
		t.sell_url ? `<a class="sn-hist-link" href="${esc(t.sell_url)}" target="_blank" rel="noopener">sell ↗</a>` : '',
	].filter(Boolean).join(' · ');
	const holdMs = t.opened_at && t.closed_at
		? new Date(t.closed_at).getTime() - new Date(t.opened_at).getTime()
		: null;
	const holdStr = holdMs != null ? holdDuration(holdMs) : '—';
	return `<tr class="sn-hist-row">
		<td>
			<div class="sn-hist-sym">${esc(t.symbol)}</div>
			<div class="sn-hist-agent">${esc(t.agent_name || '')}</div>
		</td>
		<td class="r">${entrySol}</td>
		<td class="r">${pnlStr}</td>
		<td class="r hide-mobile">${pctStr}</td>
		<td class="r hide-mobile"><span class="sn-hist-mono">${holdStr}</span></td>
		<td class="r"><span class="sn-hist-tag ${tagCls}">${esc(tagLabel)}</span></td>
		<td class="r hide-mobile">${links || '—'}</td>
	</tr>`;
}

function holdDuration(ms) {
	const s = Math.round(ms / 1000);
	if (s < 60) return `${s}s`;
	const m = Math.floor(s / 60);
	if (m < 60) return `${m}m`;
	return `${Math.floor(m / 60)}h ${m % 60}m`;
}

function drawPnlChart(canvas, points) {
	if (!canvas || points.length < 2) return;
	const dpr = window.devicePixelRatio || 1;
	const W = canvas.offsetWidth || canvas.parentElement?.offsetWidth || 400;
	const H = 90;
	canvas.width = W * dpr;
	canvas.height = H * dpr;
	const ctx = canvas.getContext('2d');
	ctx.scale(dpr, dpr);

	const PAD = { top: 8, right: 12, bottom: 8, left: 4 };
	const cw = W - PAD.left - PAD.right;
	const ch = H - PAD.top - PAD.bottom;

	const vals = points.map((p) => p.v);
	const times = points.map((p) => p.t);
	const minV = Math.min(0, ...vals);
	const maxV = Math.max(0, ...vals);
	const rangeV = maxV - minV || 1;
	const minT = times[0];
	const maxT = times[times.length - 1];
	const rangeT = maxT - minT || 1;

	const toX = (t) => PAD.left + ((t - minT) / rangeT) * cw;
	const toY = (v) => PAD.top + ch - ((v - minV) / rangeV) * ch;

	const finalVal = vals[vals.length - 1];
	const lineColor = finalVal >= 0 ? '#34d399' : '#f87171';
	const fillColor = finalVal >= 0 ? 'rgba(52,211,153,0.12)' : 'rgba(248,113,113,0.12)';

	// zero line
	const zeroY = toY(0);
	ctx.strokeStyle = 'rgba(255,255,255,0.08)';
	ctx.lineWidth = 1;
	ctx.setLineDash([3, 3]);
	ctx.beginPath();
	ctx.moveTo(PAD.left, zeroY);
	ctx.lineTo(PAD.left + cw, zeroY);
	ctx.stroke();
	ctx.setLineDash([]);

	// fill under curve
	ctx.beginPath();
	ctx.moveTo(toX(times[0]), zeroY);
	ctx.lineTo(toX(times[0]), toY(vals[0]));
	for (let i = 1; i < points.length; i++) {
		const xMid = (toX(times[i - 1]) + toX(times[i])) / 2;
		ctx.bezierCurveTo(xMid, toY(vals[i - 1]), xMid, toY(vals[i]), toX(times[i]), toY(vals[i]));
	}
	ctx.lineTo(toX(times[times.length - 1]), zeroY);
	ctx.closePath();
	ctx.fillStyle = fillColor;
	ctx.fill();

	// line
	ctx.beginPath();
	ctx.moveTo(toX(times[0]), toY(vals[0]));
	for (let i = 1; i < points.length; i++) {
		const xMid = (toX(times[i - 1]) + toX(times[i])) / 2;
		ctx.bezierCurveTo(xMid, toY(vals[i - 1]), xMid, toY(vals[i]), toX(times[i]), toY(vals[i]));
	}
	ctx.strokeStyle = lineColor;
	ctx.lineWidth = 2;
	ctx.lineJoin = 'round';
	ctx.stroke();

	// final dot
	ctx.beginPath();
	ctx.arc(toX(times[times.length - 1]), toY(vals[vals.length - 1]), 3.5, 0, 2 * Math.PI);
	ctx.fillStyle = lineColor;
	ctx.fill();
}

let _histLoading = false;
let _histLimit = 25;

async function loadTradeHistory(root, append = false) {
	if (_histLoading) return;
	const mount = root.querySelector('#sn-hist-mount');
	if (!mount) return;
	_histLoading = true;
	if (!append) {
		mount.innerHTML = `<div class="sn-hist"><div class="sn-hist-head"><h3>Trade History</h3></div><div class="sn-empty" style="padding:24px 18px">Loading…</div></div>`;
	}
	try {
		const data = await get(`/api/sniper/history?limit=${_histLimit}`);
		const trades = data.trades || [];
		if (!trades.length) {
			mount.innerHTML = `<div class="sn-hist"><div class="sn-hist-head"><h3>Trade History</h3></div><div class="sn-empty" style="padding:24px 18px">No closed trades yet. Your completed snipes appear here.</div></div>`;
			return;
		}
		const hasMore = trades.length >= _histLimit;
		const sorted = [...trades].sort((a, b) => new Date(a.closed_at || 0) - new Date(b.closed_at || 0));
		const cumPoints = [];
		let running = 0;
		for (const t of sorted) {
			if (t.pnl_sol != null) { running += t.pnl_sol; cumPoints.push({ t: new Date(t.closed_at).getTime(), v: running }); }
		}
		const totalPnl = running;
		const pnlClass = totalPnl > 0 ? 'sn-pos' : totalPnl < 0 ? 'sn-neg' : '';
		const chartHtml = cumPoints.length >= 2
			? `<div class="sn-chart-wrap">
				<div class="sn-chart-head">
					<span class="sn-chart-label">Cumulative PnL</span>
					<span class="sn-chart-val ${pnlClass}">${totalPnl >= 0 ? '+' : ''}${fmtSol(totalPnl)}</span>
				</div>
				<canvas class="sn-chart-canvas" id="sn-pnl-canvas" height="90" role="img" aria-label="Cumulative PnL line chart, ${cumPoints.length} closed trades, current ${totalPnl >= 0 ? '+' : ''}${fmtSol(totalPnl)}"></canvas>
			</div>` : '';
		mount.innerHTML = `
		<div class="sn-hist">
			<div class="sn-hist-head">
				<h3>Trade History</h3>
				<span style="font-size:12px;color:var(--nxt-ink-faint)">${trades.length} closed trade${trades.length !== 1 ? 's' : ''}</span>
			</div>
			${chartHtml}
			<div style="overflow-x:auto">
				<table class="sn-hist-table">
					<thead>
						<tr>
							<th>Coin</th>
							<th class="r">Entry</th>
							<th class="r">PnL</th>
							<th class="r hide-mobile">PnL %</th>
							<th class="r hide-mobile">Hold</th>
							<th class="r">Exit</th>
							<th class="r hide-mobile">Proof</th>
						</tr>
					</thead>
					<tbody>${trades.map(histRow).join('')}</tbody>
				</table>
			</div>
			${hasMore ? `<button class="sn-hist-more" id="sn-hist-more">Load more</button>` : ''}
		</div>`;
		if (cumPoints.length >= 2) drawPnlChart(mount.querySelector('#sn-pnl-canvas'), cumPoints);
		if (hasMore) {
			mount.querySelector('#sn-hist-more')?.addEventListener('click', () => {
				_histLimit += 25;
				loadTradeHistory(root, false);
			});
		}
	} catch {
		mount.innerHTML = `<div class="sn-hist"><div class="sn-hist-head"><h3>Trade History</h3></div><div class="sn-empty" style="padding:20px 18px;color:var(--nxt-ink-faint)">Couldn't load trade history.</div></div>`;
	} finally {
		_histLoading = false;
	}
}

// ── New strategy CTA ──────────────────────────────────────────────────────────

function newStrategyCta() {
	const armedIds = new Set(_strategies.map((s) => s.agent_id));
	const unarmed = _agents.filter((a) => !armedIds.has(a.id));
	if (!unarmed.length && _strategies.length > 0) return '';
	return `<div class="sn-new">
		<div class="sn-new-text">
			<b>Arm another agent</b><br>
			Select an agent and set its budget to let it snipe pump.fun launches autonomously. Trades come from the agent's own wallet.
		</div>
		<button class="sn-btn primary" id="sn-arm-btn">Arm an agent +</button>
	</div>`;
}

// ── Wire events ───────────────────────────────────────────────────────────────

function wireEvents(root) {
	// Card expand/collapse
	root.addEventListener('click', (e) => {
		const head = e.target.closest('[data-toggle="card"]');
		if (head) {
			head.closest('.sn-card')?.classList.toggle('open');
			return;
		}

		// Toggle enabled
		const toggleEn = e.target.closest('[data-action="toggle-enabled"]');
		if (toggleEn) { toggleEnabled(toggleEn, root); return; }

		// Toggle kill switch
		const toggleKill = e.target.closest('[data-action="toggle-kill"]');
		if (toggleKill) { toggleKill_(toggleKill, root); return; }

		// Arm btn
		if (e.target.id === 'sn-arm-btn') { openArmModal(root); return; }
	});

	// Form submits
	root.addEventListener('submit', async (e) => {
		const form = e.target.closest('[data-strat-form]');
		if (!form) return;
		e.preventDefault();
		await saveForm(form, root);
	});
}

async function toggleEnabled(btn, root) {
	const agentId = btn.dataset.agent;
	const strat = _strategies.find((s) => s.agent_id === agentId);
	if (!strat) return;
	btn.disabled = true;
	try {
		await post('/api/sniper/strategy', { agent_id: agentId, network: strat.network, enabled: !strat.enabled });
		const sn_root = document.getElementById('sn-root');
		if (sn_root) await refresh(sn_root);
	} catch (err) {
		toast(err.message || 'Failed to update strategy');
	} finally {
		btn.disabled = false;
	}
}

async function toggleKill_(btn, root) {
	const agentId = btn.dataset.agent;
	const strat = _strategies.find((s) => s.agent_id === agentId);
	if (!strat) return;
	btn.disabled = true;
	try {
		await post('/api/sniper/strategy', { agent_id: agentId, network: strat.network, kill_switch: !strat.kill_switch });
		const sn_root = document.getElementById('sn-root');
		if (sn_root) await refresh(sn_root);
	} catch (err) {
		toast(err.message || 'Failed to update kill switch');
	} finally {
		btn.disabled = false;
	}
}

async function saveForm(form, root) {
	const agentId = form.dataset.stratForm;
	const strat = _strategies.find((s) => s.agent_id === agentId);
	if (!strat) return;
	const btn = form.querySelector(`[data-save="${agentId}"]`);
	const msg = form.querySelector(`[data-msg="${agentId}"]`);
	if (btn) btn.disabled = true;
	if (msg) msg.textContent = 'Saving…';

	try {
		const fd = Object.fromEntries(new FormData(form).entries());
		const body = {
			agent_id: agentId,
			network: strat.network,
			trigger: fd.trigger,
			buy_delay_ms: Number(fd.buy_delay_ms) || 0,
			daily_budget_lamports: solToLamports(fd.daily_budget_sol || '0'),
			per_trade_lamports: solToLamports(fd.per_trade_sol || '0'),
			max_concurrent_positions: Number(fd.max_concurrent_positions) || 1,
			slippage_bps: Number(fd.slippage_bps) || 500,
			take_profit_pct: fd.take_profit_pct !== '' ? Number(fd.take_profit_pct) : null,
			stop_loss_pct: Number(fd.stop_loss_pct) || 30,
			trailing_stop_pct: fd.trailing_stop_pct !== '' ? Number(fd.trailing_stop_pct) : null,
			max_hold_seconds: Number(fd.max_hold_seconds) || 1800,
			min_market_cap_usd: fd.min_market_cap_usd !== '' ? Number(fd.min_market_cap_usd) : null,
			max_market_cap_usd: fd.max_market_cap_usd !== '' ? Number(fd.max_market_cap_usd) : null,
			min_creator_graduated: fd.min_creator_graduated !== '' ? Number(fd.min_creator_graduated) : null,
			max_creator_launches: fd.max_creator_launches !== '' ? Number(fd.max_creator_launches) : null,
			require_socials: fd.require_socials === 'true',
			require_sol_quote: fd.require_sol_quote !== 'false',
			min_oracle_score: fd.min_oracle_score !== '' ? Math.round(Number(fd.min_oracle_score)) : null,
			telegram_chat_id: fd.telegram_chat_id && /^-?[0-9]+$/.test(fd.telegram_chat_id.trim()) ? fd.telegram_chat_id.trim() : null,
		};
		if (fd.trigger === 'first_claim') {
			body.min_claim_lamports = fd.min_claim_lamports_sol !== '' ? solToLamports(fd.min_claim_lamports_sol) : null;
			body.max_claim_lamports = fd.max_claim_lamports_sol !== '' ? solToLamports(fd.max_claim_lamports_sol) : null;
			body.first_claim_max_age_seconds = fd.first_claim_max_age_seconds !== '' ? Number(fd.first_claim_max_age_seconds) : null;
		}
		if (fd.trigger === 'intel_confirmed') {
			body.min_quality_score = fd.min_quality_score !== '' ? Number(fd.min_quality_score) : null;
			body.max_bundle_score = fd.max_bundle_score !== '' ? Number(fd.max_bundle_score) : null;
			body.max_concentration_top1 = fd.max_concentration_top1 !== '' ? Number(fd.max_concentration_top1) : null;
			body.avoid_dev_dump = fd.avoid_dev_dump !== 'false';
			body.allowed_categories = fd.allowed_categories ? fd.allowed_categories.split(',').map((c) => c.trim()).filter(Boolean) : null;
		}

		await post('/api/sniper/strategy', body);
		if (msg) { msg.textContent = 'Saved!'; setTimeout(() => { if (msg) msg.textContent = ''; }, 2000); }
		const sn_root = document.getElementById('sn-root');
		if (sn_root) await refresh(sn_root);
	} catch (err) {
		if (msg) msg.textContent = err.message || 'Save failed';
	} finally {
		if (btn) btn.disabled = false;
	}
}

// ── Arm new agent modal ───────────────────────────────────────────────────────

function openArmModal(root) {
	const armedIds = new Set(_strategies.map((s) => s.agent_id));
	const unarmed = _agents.filter((a) => !armedIds.has(a.id));

	// Read preset params passed from Strategy Lab
	const qp = new URLSearchParams(location.search);
	const presetTier  = qp.get('preset_tier') || '';
	const presetScore = qp.get('preset_score') ? Number(qp.get('preset_score')) : null;
	const fromLab     = qp.get('from') === 'strategy-lab';

	const overlay = document.createElement('div');
	overlay.className = 'sn-overlay';
	overlay.innerHTML = `<div class="sn-modal">
		<h2>Arm an agent</h2>
		${fromLab && presetTier ? `<p style="color:var(--nxt-ink-faint);font-size:13px;margin:0 0 14px">Strategy Lab preset: <strong style="color:var(--nxt-accent)">${esc(presetTier)}</strong> conviction filter (min score ${presetScore ?? '—'}).</p>` : ''}
		${!unarmed.length
			? '<p style="color:var(--nxt-ink-faint);font-size:13px">All your agents already have a strategy. Edit their config in the cards above.</p>'
			: `<div class="sn-field" style="margin-bottom:16px">
				<label>Choose agent</label>
				<select id="sn-arm-agent" aria-label="Choose agent">
					<option value="">— select an agent —</option>
					${unarmed.map((a) => `<option value="${esc(a.id)}">${esc(a.name || a.id)}</option>`).join('')}
				</select>
			</div>
			<div class="sn-field">
				<label>Daily budget (SOL)</label>
				<input id="sn-arm-budget" type="number" min="0.001" step="0.001" value="0.1" aria-label="Daily budget in SOL" />
				<span class="sn-hint">The agent will spend at most this much per day.</span>
			</div>
			<div class="sn-field" style="margin-top:12px">
				<label>Per-trade size (SOL)</label>
				<input id="sn-arm-per-trade" type="number" min="0.001" step="0.001" value="0.01" aria-label="Per-trade size in SOL" />
			</div>
			<div class="sn-field" style="margin-top:12px">
				<label>Min Oracle conviction score (0–100, blank = no filter)</label>
				<input id="sn-arm-oracle" type="number" min="0" max="100" step="1" value="${presetScore != null ? presetScore : ''}" placeholder="e.g. 55 for strong+" aria-label="Min Oracle conviction score, 0 to 100, blank for no filter" />
				<span class="sn-hint">Only enter coins that clear this conviction threshold. Higher = fewer, higher-quality entries.</span>
			</div>`
		}
		<div class="sn-modal-foot">
			<button class="sn-btn ghost" id="sn-arm-cancel">Cancel</button>
			${unarmed.length ? '<button class="sn-btn primary" id="sn-arm-confirm">Arm</button>' : ''}
		</div>
	</div>`;

	document.body.appendChild(overlay);

	overlay.querySelector('#sn-arm-cancel')?.addEventListener('click', () => overlay.remove());
	overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });

	overlay.querySelector('#sn-arm-confirm')?.addEventListener('click', async (e) => {
		const agentId  = overlay.querySelector('#sn-arm-agent')?.value;
		const budget   = overlay.querySelector('#sn-arm-budget')?.value;
		const perTrade = overlay.querySelector('#sn-arm-per-trade')?.value;
		const oracleRaw = overlay.querySelector('#sn-arm-oracle')?.value.trim();
		const minOracle = oracleRaw !== '' ? Math.max(0, Math.min(100, Number(oracleRaw))) : null;
		if (!agentId) { toast('Select an agent first'); return; }
		e.target.disabled = true;
		try {
			await post('/api/sniper/strategy', {
				agent_id: agentId,
				network: 'mainnet',
				enabled: false,
				daily_budget_lamports: solToLamports(budget || '0.1'),
				per_trade_lamports: solToLamports(perTrade || '0.01'),
				stop_loss_pct: 30,
				max_hold_seconds: 1800,
				min_oracle_score: minOracle,
			});
			overlay.remove();
			const sn_root = document.getElementById('sn-root');
			if (sn_root) await refresh(sn_root);
			toast('Strategy created — configure it in the card, then arm it.');
		} catch (err) {
			toast(err.message || 'Failed to arm agent');
			e.target.disabled = false;
		}
	});
}

// ── SSE live positions ────────────────────────────────────────────────────────

function startSse(root) {
	if (_sseSource) { _sseSource.close(); _sseSource = null; }
	if (!_strategies.length) {
		renderPositions([]);
		return;
	}

	const src = new EventSource('/api/sniper/stream?network=mainnet');
	_sseSource = src;

	// Build initial snapshot from 'open' event, then update on 'buy'/'update'/'sell'.
	const positions = new Map();

	src.addEventListener('open', (e) => {
		try {
			const data = JSON.parse(e.data);
			if (Array.isArray(data)) {
				for (const p of data) positions.set(p.id, p);
				renderPositions([...positions.values()].filter((p) => ['opening', 'open'].includes(p.status)));
			}
		} catch {}
	});

	src.addEventListener('buy', (e) => {
		try {
			const p = JSON.parse(e.data);
			positions.set(p.id, p);
			renderPositions([...positions.values()].filter((p) => ['opening', 'open'].includes(p.status)));
		} catch {}
	});

	src.addEventListener('update', (e) => {
		try {
			const p = JSON.parse(e.data);
			positions.set(p.id, { ...(positions.get(p.id) || {}), ...p });
			renderPositions([...positions.values()].filter((p) => ['opening', 'open'].includes(p.status)));
		} catch {}
	});

	src.addEventListener('sell', (e) => {
		try {
			const p = JSON.parse(e.data);
			positions.set(p.id, p);
			renderPositions([...positions.values()].filter((pos) => ['opening', 'open'].includes(pos.status)));
		} catch {}
	});

	src.onerror = () => {
		const el = document.getElementById('sn-positions');
		if (el && !el.querySelector('.sn-pos-row')) {
			el.innerHTML = '<p class="sn-empty">Live feed offline — positions update on next refresh.</p>';
		}
	};
}

// ── Toast ─────────────────────────────────────────────────────────────────────

function toast(msg) {
	let el = document.getElementById('sn-toast');
	if (!el) {
		el = document.createElement('div');
		el.id = 'sn-toast';
		el.style.cssText = `position:fixed;left:50%;bottom:32px;transform:translateX(-50%) translateY(20px);
			background:rgba(20,21,28,0.95);border:1px solid var(--nxt-stroke-strong);
			color:var(--nxt-ink);padding:9px 18px;border-radius:999px;font-size:13px;
			z-index:9999;opacity:0;transition:opacity .18s,transform .18s;
			backdrop-filter:blur(20px);-webkit-backdrop-filter:blur(20px);
			box-shadow:0 8px 24px rgba(0,0,0,.4);pointer-events:none;`;
		document.body.appendChild(el);
	}
	el.textContent = msg;
	requestAnimationFrame(() => { el.style.opacity = '1'; el.style.transform = 'translateX(-50%) translateY(0)'; });
	clearTimeout(el._t);
	el._t = setTimeout(() => { el.style.opacity = '0'; el.style.transform = 'translateX(-50%) translateY(20px)'; }, 2500);
}

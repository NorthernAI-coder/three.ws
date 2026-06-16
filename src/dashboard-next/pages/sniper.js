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
.sn-pos-row { display: grid; grid-template-columns: 1fr auto auto; gap: 10px; align-items: center; padding: 11px 16px; border-bottom: 1px solid var(--nxt-line); }
.sn-pos-row:last-child { border-bottom: 0; }
.sn-pos-info { min-width: 0; }
.sn-pos-sym { font-weight: 600; font-size: 14px; }
.sn-pos-sub { font-size: 11px; color: var(--nxt-ink-faint); margin-top: 2px; }
.sn-pos-pnl { font-size: 14px; font-weight: 600; font-variant-numeric: tabular-nums; text-align: right; }
.sn-pos-link { font-size: 12px; color: var(--nxt-accent); text-decoration: none; padding: 4px 10px; border: 1px solid color-mix(in srgb, var(--nxt-accent) 35%, transparent); border-radius: var(--nxt-radius-sm); white-space: nowrap; transition: background .12s; }
.sn-pos-link:hover { background: color-mix(in srgb, var(--nxt-accent) 12%, transparent); }
.sn-empty { color: var(--nxt-ink-faint); font-size: 13px; padding: 24px 16px; text-align: center; }

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
	const triggerLabel = s.trigger === 'first_claim' ? 'First-claim trigger' : 'New mint trigger';

	return `<div class="sn-card ${armed ? 'armed' : ''}" data-agent="${esc(s.agent_id)}">
		<div class="sn-card-head" data-toggle="card">
			<img class="sn-av" src="${esc(img)}" alt="" onerror="this.style.visibility='hidden'" />
			<div class="sn-info">
				<div class="sn-name">${esc(s.agent_name || s.agent_id)}</div>
				<div class="sn-meta">
					<span>${triggerLabel}</span>
					<span>${fmtSol(lamportsToSol(s.per_trade_lamports))} / trade</span>
					<span>Daily budget: ${fmtSol(lamportsToSol(s.daily_budget_lamports))}</span>
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
			</div>
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
			<select name="trigger">
				<option value="new_mint" ${s.trigger !== 'first_claim' ? 'selected' : ''}>New mint — snipe every launch</option>
				<option value="first_claim" ${s.trigger === 'first_claim' ? 'selected' : ''}>First claim — creator claims for first time</option>
			</select>
			<span class="sn-hint">When the agent enters a position.</span>
		</div>
		<div class="sn-field">
			<label>Buy delay (ms)</label>
			<input name="buy_delay_ms" type="number" min="0" max="600000" value="${s.buy_delay_ms || 0}" />
			<span class="sn-hint">Pause before buying. Currently ${fmtDelayMs(s.buy_delay_ms)}.</span>
		</div>
		<div class="sn-field">
			<label>Daily budget (SOL)</label>
			<input name="daily_budget_sol" type="number" min="0" step="0.001" value="${toLamSol(s.daily_budget_lamports)}" />
			<span class="sn-hint">Max SOL to spend per calendar day.</span>
		</div>
		<div class="sn-field">
			<label>Per-trade size (SOL)</label>
			<input name="per_trade_sol" type="number" min="0" step="0.001" value="${toLamSol(s.per_trade_lamports)}" />
			<span class="sn-hint">SOL per snipe. Must be ≤ daily budget.</span>
		</div>
		<div class="sn-field">
			<label>Max concurrent positions</label>
			<input name="max_concurrent_positions" type="number" min="1" max="50" value="${s.max_concurrent_positions || 1}" />
		</div>
		<div class="sn-field">
			<label>Slippage (bps)</label>
			<input name="slippage_bps" type="number" min="0" max="5000" value="${s.slippage_bps || 500}" />
			<span class="sn-hint">100 bps = 1%.</span>
		</div>

		<div class="sn-section-head">Exit Rules</div>
		<div class="sn-field">
			<label>Take profit (%)</label>
			<input name="take_profit_pct" type="number" min="1" step="1" value="${s.take_profit_pct != null ? s.take_profit_pct : ''}" placeholder="e.g. 50" />
			<span class="sn-hint">Sell when up this %. Leave blank to hold.</span>
		</div>
		<div class="sn-field">
			<label>Stop loss (%) *</label>
			<input name="stop_loss_pct" type="number" min="1" max="99" step="1" value="${s.stop_loss_pct != null ? s.stop_loss_pct : 30}" required />
		</div>
		<div class="sn-field">
			<label>Trailing stop (%)</label>
			<input name="trailing_stop_pct" type="number" min="1" step="1" value="${s.trailing_stop_pct != null ? s.trailing_stop_pct : ''}" placeholder="e.g. 20" />
			<span class="sn-hint">Sell when peak drops by this %. Optional.</span>
		</div>
		<div class="sn-field">
			<label>Max hold time (seconds)</label>
			<input name="max_hold_seconds" type="number" min="30" max="86400" value="${s.max_hold_seconds || 1800}" />
			<span class="sn-hint">Force-exit after this. Currently ${fmtHold(s.max_hold_seconds)}.</span>
		</div>

		<div class="sn-section-head">Entry Filters</div>
		<div class="sn-field">
			<label>Min market cap (USD)</label>
			<input name="min_market_cap_usd" type="number" min="0" value="${s.min_market_cap_usd != null ? s.min_market_cap_usd : ''}" placeholder="any" />
		</div>
		<div class="sn-field">
			<label>Max market cap (USD)</label>
			<input name="max_market_cap_usd" type="number" min="0" value="${s.max_market_cap_usd != null ? s.max_market_cap_usd : ''}" placeholder="any" />
		</div>
		<div class="sn-field">
			<label>Min creator graduated coins</label>
			<input name="min_creator_graduated" type="number" min="0" value="${s.min_creator_graduated != null ? s.min_creator_graduated : ''}" placeholder="any" />
			<span class="sn-hint">Only launch from creators with this many graduates.</span>
		</div>
		<div class="sn-field">
			<label>Max creator total launches</label>
			<input name="max_creator_launches" type="number" min="1" value="${s.max_creator_launches != null ? s.max_creator_launches : ''}" placeholder="any" />
			<span class="sn-hint">Skip serial launchers with too many coins.</span>
		</div>
		<div class="sn-field">
			<label>Require social links</label>
			<select name="require_socials">
				<option value="false" ${!s.require_socials ? 'selected' : ''}>No — any launch</option>
				<option value="true" ${s.require_socials ? 'selected' : ''}>Yes — Twitter/Telegram required</option>
			</select>
		</div>
		<div class="sn-field">
			<label>Require SOL quote</label>
			<select name="require_sol_quote">
				<option value="true" ${s.require_sol_quote !== false ? 'selected' : ''}>Yes (recommended)</option>
				<option value="false" ${s.require_sol_quote === false ? 'selected' : ''}>No</option>
			</select>
		</div>

		${s.trigger === 'first_claim' ? firstClaimFields(s) : ''}

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
			<input name="min_claim_lamports_sol" type="number" min="0" step="0.001" value="${toLamSolOptional(s.min_claim_lamports)}" placeholder="any" />
			<span class="sn-hint">Only trigger if the creator claimed this much SOL.</span>
		</div>
		<div class="sn-field">
			<label>Max claim size (SOL)</label>
			<input name="max_claim_lamports_sol" type="number" min="0" step="0.001" value="${toLamSolOptional(s.max_claim_lamports)}" placeholder="any" />
		</div>
		<div class="sn-field">
			<label>Max claim age (seconds)</label>
			<input name="first_claim_max_age_seconds" type="number" min="1" max="86400" value="${s.first_claim_max_age_seconds != null ? s.first_claim_max_age_seconds : ''}" placeholder="300" />
			<span class="sn-hint">Skip if the claim tx is older than this.</span>
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
}

function posRow(p) {
	const pnlSol = p.unrealized_pnl_sol != null ? p.unrealized_pnl_sol : null;
	const pnlStr = pnlSol != null ? `<span class="${clr(pnlSol)}">${fmtSol(pnlSol)}</span>` : '—';
	const link = p.entry_buy_sig && p.entry_buy_sig !== 'SIMULATED'
		? `<a class="sn-pos-link" href="${solscanTx(p.entry_buy_sig)}" target="_blank" rel="noopener">Solscan ↗</a>`
		: p.mint ? `<a class="sn-pos-link" href="${pumpUrl(p.mint)}" target="_blank" rel="noopener">pump.fun ↗</a>` : '';
	return `<div class="sn-pos-row">
		<div class="sn-pos-info">
			<div class="sn-pos-sym">${esc(p.symbol || p.mint?.slice(0, 8) || '—')}</div>
			<div class="sn-pos-sub">${esc(p.agent_name || '')} · opened ${relTime(p.opened_at)}</div>
		</div>
		<div class="sn-pos-pnl">${pnlStr}</div>
		${link}
	</div>`;
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
		};
		if (fd.trigger === 'first_claim') {
			body.min_claim_lamports = fd.min_claim_lamports_sol !== '' ? solToLamports(fd.min_claim_lamports_sol) : null;
			body.max_claim_lamports = fd.max_claim_lamports_sol !== '' ? solToLamports(fd.max_claim_lamports_sol) : null;
			body.first_claim_max_age_seconds = fd.first_claim_max_age_seconds !== '' ? Number(fd.first_claim_max_age_seconds) : null;
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

	const overlay = document.createElement('div');
	overlay.className = 'sn-overlay';
	overlay.innerHTML = `<div class="sn-modal">
		<h2>Arm an agent</h2>
		${!unarmed.length
			? '<p style="color:var(--nxt-ink-faint);font-size:13px">All your agents already have a strategy. Edit their config in the cards above.</p>'
			: `<div class="sn-field" style="margin-bottom:16px">
				<label>Choose agent</label>
				<select id="sn-arm-agent">
					<option value="">— select an agent —</option>
					${unarmed.map((a) => `<option value="${esc(a.id)}">${esc(a.name || a.id)}</option>`).join('')}
				</select>
			</div>
			<div class="sn-field">
				<label>Daily budget (SOL)</label>
				<input id="sn-arm-budget" type="number" min="0.001" step="0.001" value="0.1" />
				<span class="sn-hint">The agent will spend at most this much per day.</span>
			</div>
			<div class="sn-field" style="margin-top:12px">
				<label>Per-trade size (SOL)</label>
				<input id="sn-arm-per-trade" type="number" min="0.001" step="0.001" value="0.01" />
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
		const agentId = overlay.querySelector('#sn-arm-agent')?.value;
		const budget = overlay.querySelector('#sn-arm-budget')?.value;
		const perTrade = overlay.querySelector('#sn-arm-per-trade')?.value;
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

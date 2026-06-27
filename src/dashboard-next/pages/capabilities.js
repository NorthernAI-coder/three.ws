// dashboard-next — Capabilities command center.
//
// Live status for all 4 autonomous agent capabilities:
//   1. Alpha Hunt   — intel scores, signal feed, last buys triggered
//   2. Coin Launcher— schedule status, launched coins, fee totals
//   3. Auto-Claim   — per-coin claimable fees, claim history
//   4. Market Maker — active markets, spread P&L, inventory
//
// Polls every 30s. SSE from /api/sniper/stream drives live positions.

import { mountShell } from '../shell.js';
import { requireUser, get, post, esc, relTime, ApiError } from '../api.js';

const POLL_MS = 30_000;
const fmtSol = (n) => (n == null || isNaN(Number(n)) ? '—' : `${Number(n) >= 0 ? '+' : ''}${Number(n).toFixed(4)} ◎`);
const fmtSolAbs = (n) => (n == null || isNaN(Number(n)) ? '—' : `${Number(n).toFixed(4)} ◎`);
const fmtPct = (n) => (n == null || isNaN(Number(n)) ? '—' : `${Number(n).toFixed(1)}%`);
const clr = (n) => (Number(n) >= 0 ? 'cp-pos' : 'cp-neg');

const STYLE = `<style>
.cp-page { display: flex; flex-direction: column; gap: 24px; }
.cp-section { background: var(--nxt-panel); border: 1px solid var(--nxt-stroke); border-radius: var(--nxt-radius); overflow: hidden; }
.cp-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 14px 18px; border-bottom: 1px solid var(--nxt-line); }
.cp-head-left { display: flex; align-items: center; gap: 10px; }
.cp-head-title { font-size: 14px; font-weight: 700; letter-spacing: -0.01em; }
.cp-head-sub { font-size: 12px; color: var(--nxt-ink-dim); }
.cp-badge { display: inline-flex; align-items: center; gap: 5px; padding: 3px 9px; border-radius: 999px; font-size: 11px; font-weight: 700; letter-spacing: 0.04em; border: 1px solid; }
.cp-badge.on  { color: var(--nxt-success,#34d399); border-color: color-mix(in srgb, var(--nxt-success,#34d399) 40%, transparent); background: color-mix(in srgb, var(--nxt-success,#34d399) 8%, transparent); }
.cp-badge.off { color: var(--nxt-ink-dim); border-color: var(--nxt-stroke); }
.cp-badge.live { color: #60a5fa; border-color: rgba(96,165,250,.4); background: rgba(96,165,250,.07); animation: cpblink 2s ease infinite; }
@keyframes cpblink { 0%,100%{opacity:1} 50%{opacity:.6} }
.cp-kpi-row { display: grid; grid-template-columns: repeat(auto-fit, minmax(110px, 1fr)); gap: 0; }
.cp-kpi { padding: 12px 18px; border-right: 1px solid var(--nxt-line); }
.cp-kpi:last-child { border-right: none; }
.cp-kpi-label { font-size: 10px; font-weight: 600; text-transform: uppercase; letter-spacing: .07em; color: var(--nxt-ink-faint); margin-bottom: 5px; }
.cp-kpi-val { font-size: 20px; font-weight: 700; font-variant-numeric: tabular-nums; line-height: 1; }
.cp-body { padding: 0; }
.cp-table { width: 100%; border-collapse: collapse; font-size: 12.5px; }
.cp-table th { padding: 8px 14px; text-align: left; font: 600 10px/1 monospace; letter-spacing: .06em; text-transform: uppercase; color: var(--nxt-ink-faint); border-bottom: 1px solid var(--nxt-line); white-space: nowrap; }
.cp-table th.r, .cp-table td.r { text-align: right; }
.cp-table td { padding: 10px 14px; border-bottom: 1px solid var(--nxt-line); vertical-align: middle; }
.cp-table tr:last-child td { border-bottom: none; }
.cp-table tr:hover td { background: rgba(255,255,255,.025); }
.cp-mono { font-family: ui-monospace, monospace; font-variant-numeric: tabular-nums; }
.cp-pos { color: var(--nxt-success,#34d399); }
.cp-neg { color: var(--nxt-danger,#f87171); }
.cp-muted { color: var(--nxt-ink-dim); }
.cp-empty { text-align: center; padding: 2.5rem 1rem; color: var(--nxt-ink-dim); font-size: 13px; }
.cp-sk { height: 52px; border-radius: 6px; background: var(--nxt-bg-2); animation: cp-sk 1.4s ease infinite; margin: 10px 14px; }
@keyframes cp-sk { 0%,100%{opacity:.5} 50%{opacity:1} }
.cp-agent-chip { display: inline-flex; align-items: center; gap: 6px; }
.cp-av { width: 22px; height: 22px; border-radius: 50%; object-fit: cover; background: var(--nxt-bg-2); }
.cp-score-bar { display: inline-flex; align-items: center; gap: 6px; }
.cp-score-fill { height: 4px; border-radius: 2px; background: linear-gradient(90deg, #3b82f6, #34d399); }
.cp-spread-bar { display: inline-flex; align-items: center; gap: 6px; }
.cp-buy-side  { height: 4px; border-radius: 2px; background: #34d399; }
.cp-sell-side { height: 4px; border-radius: 2px; background: #f87171; }
.cp-inv-bar { display: flex; align-items: center; gap: 6px; }
.cp-inv-fill { height: 6px; border-radius: 3px; background: #60a5fa; }
.cp-inv-track { height: 6px; border-radius: 3px; background: var(--nxt-bg-2); flex: 1; overflow: hidden; }
.cp-tabs { display: flex; gap: 2px; padding: 10px 14px 0; border-bottom: 1px solid var(--nxt-line); }
.cp-tab { padding: 6px 12px; border-radius: 6px 6px 0 0; font-size: 12px; font-weight: 600; color: var(--nxt-ink-dim); cursor: pointer; border: none; background: none; transition: color .12s, background .12s; }
.cp-tab:hover { color: var(--nxt-ink); background: rgba(255,255,255,.04); }
.cp-tab.active { color: var(--nxt-ink); background: var(--nxt-bg-2); }
.cp-tab-panel { display: none; }
.cp-tab-panel.active { display: block; }
.cp-action-row { display: flex; gap: 8px; align-items: center; padding: 10px 14px; border-top: 1px solid var(--nxt-line); }
.cp-link { font-size: 12px; color: #60a5fa; text-decoration: none; padding: 5px 10px; border-radius: 6px; border: 1px solid rgba(96,165,250,.3); transition: background .12s; }
.cp-link:hover { background: rgba(96,165,250,.1); }
@media (max-width: 600px) { .cp-kpi-row { grid-template-columns: 1fr 1fr; } .cp-table th.hide-sm, .cp-table td.hide-sm { display: none; } }
</style>`;

// ── Boot ──────────────────────────────────────────────────────────────────────

(async function boot() {
	try {
		const main = await mountShell();
		const me = await requireUser();

		main.innerHTML = `
			<h1 class="dn-h1">Capabilities</h1>
			<p class="dn-h1-sub">Live status across all 4 autonomous capabilities — Alpha Hunt, Launcher, Auto-Claim, and Market Maker.</p>
			<div id="cp-root" class="cp-page">
				<div class="cp-sk"></div>
				<div class="cp-sk"></div>
				<div class="cp-sk"></div>
				<div class="cp-sk"></div>
			</div>
		`;
		main.insertAdjacentHTML('beforeend', STYLE);

		await refresh(main.querySelector('#cp-root'), me);

		setInterval(async () => {
			const root = document.getElementById('cp-root');
			if (root) await refresh(root, me).catch(() => {});
		}, POLL_MS);
	} catch (e) {
		const root = document.getElementById('cp-root');
		if (root) root.innerHTML = `<p class="cp-empty">${esc(e.message || 'Error loading capabilities')}</p>`;
	}
})();

// ── Data + render ─────────────────────────────────────────────────────────────

async function refresh(root, me) {
	const [agentsRes, strategiesRes] = await Promise.allSettled([
		get('/api/agents?limit=50'),
		get('/api/sniper/strategy'),
	]);

	const agents = agentsRes.status === 'fulfilled' ? (agentsRes.value?.agents ?? []) : [];
	const strategies = strategiesRes.status === 'fulfilled' ? (strategiesRes.value?.strategies ?? []) : [];
	const agentMap = new Map(agents.map((a) => [a.id, a]));

	// Load per-agent capability data in parallel
	const agentIds = agents.map((a) => a.id);
	const [launcherResults, mmResults] = await Promise.allSettled([
		Promise.all(agentIds.map((id) => get(`/api/agent/launcher?agentId=${id}`).catch(() => null))),
		Promise.all(agentIds.map((id) => get(`/api/agent/market-maker?agentId=${id}`).catch(() => null))),
	]);

	const launcherData = launcherResults.status === 'fulfilled' ? launcherResults.value : [];
	const mmData = mmResults.status === 'fulfilled' ? mmResults.value : [];

	// Flatten across all agents
	const allLauncherConfigs = [], allCoins = [], allMMConfigs = [], allMMTrades = [];
	agentIds.forEach((id, i) => {
		const ag = agentMap.get(id);
		const ld = launcherData[i];
		if (ld) {
			(ld.configs || []).forEach((c) => allLauncherConfigs.push({ ...c, _agent: ag }));
			(ld.coins || []).forEach((c) => allCoins.push({ ...c, _agent: ag }));
		}
		const md = mmData[i];
		if (md) {
			(md.configs || []).forEach((c) => allMMConfigs.push({ ...c, _agent: ag }));
			(md.recent_trades || []).forEach((t) => allMMTrades.push({ ...t, _agent: ag }));
		}
	});

	const alphaStrategies = strategies.filter((s) => s.trigger === 'alpha_hunt');

	root.innerHTML = [
		renderAlphaHunt(alphaStrategies, agentMap),
		renderLauncher(allLauncherConfigs, allCoins),
		renderAutoClaim(allCoins),
		renderMarketMaker(allMMConfigs, allMMTrades),
	].join('');

	wireTabSwitchers(root);
}

// ── Alpha Hunt ────────────────────────────────────────────────────────────────

function renderAlphaHunt(strategies, agentMap) {
	const armed = strategies.filter((s) => s.enabled && !s.kill_switch);
	const totalBudget = strategies.reduce((sum, s) => sum + (lamportsToSol(s.daily_budget_lamports) || 0), 0);
	const totalPnl = strategies.reduce((sum, s) => sum + (lamportsToSol(s.summary?.realized_pnl_lamports) || 0), 0);
	const totalWins = strategies.reduce((sum, s) => sum + (s.summary?.wins || 0), 0);
	const totalClosed = strategies.reduce((sum, s) => sum + (s.summary?.closed_positions || 0), 0);
	const wr = totalClosed > 0 ? Math.round((totalWins / totalClosed) * 100) : null;

	return `<div class="cp-section">
		<div class="cp-head">
			<div class="cp-head-left">
				<div>
					<div class="cp-head-title">Alpha Hunt</div>
					<div class="cp-head-sub">Smart-money signal scoring across all agents</div>
				</div>
			</div>
			<div style="display:flex;align-items:center;gap:8px">
				<span class="cp-badge ${armed.length ? 'live' : 'off'}">${armed.length ? `${armed.length} Armed` : 'Disarmed'}</span>
				<a class="cp-link" href="/dashboard/sniper">Configure ↗</a>
			</div>
		</div>
		<div class="cp-kpi-row">
			<div class="cp-kpi"><div class="cp-kpi-label">Strategies</div><div class="cp-kpi-val">${strategies.length}</div></div>
			<div class="cp-kpi"><div class="cp-kpi-label">Daily Budget</div><div class="cp-kpi-val cp-mono">${fmtSolAbs(totalBudget)}</div></div>
			<div class="cp-kpi"><div class="cp-kpi-label">Win Rate</div><div class="cp-kpi-val">${wr != null ? `${wr}%` : '—'}</div></div>
			<div class="cp-kpi"><div class="cp-kpi-label">Realized P&L</div><div class="cp-kpi-val cp-mono ${clr(totalPnl)}">${fmtSol(totalPnl)}</div></div>
		</div>
		<div class="cp-body">
			${strategies.length === 0 ? `
				<div class="cp-empty">
					No Alpha Hunt strategies yet.<br>
					<a class="cp-link" href="/dashboard/sniper" style="margin-top:10px;display:inline-block">Create a strategy →</a>
				</div>` : `
			<table class="cp-table">
				<thead>
					<tr>
						<th>Agent</th>
						<th>Status</th>
						<th class="hide-sm">Min Smart-Money</th>
						<th class="hide-sm">Min Quality</th>
						<th class="hide-sm">Max MCap</th>
						<th class="r">P&L</th>
						<th class="r">Win Rate</th>
					</tr>
				</thead>
				<tbody>
					${strategies.map((s) => {
						const ag = agentMap.get(s.agent_id);
						const pnl = lamportsToSol(s.summary?.realized_pnl_lamports);
						const closed = s.summary?.closed_positions || 0;
						const wins = s.summary?.wins || 0;
						const wr = closed > 0 ? Math.round((wins / closed) * 100) : null;
						return `<tr>
							<td>
								<div class="cp-agent-chip">
									<img class="cp-av" src="${esc(ag?.image || '/favicon.ico')}" alt="" onerror="this.style.visibility='hidden'" loading="lazy" />
									<span>${esc(ag?.name || s.agent_id.slice(0, 8))}</span>
								</div>
							</td>
							<td><span class="cp-badge ${s.enabled && !s.kill_switch ? 'on' : 'off'}">${s.kill_switch ? 'Kill switch' : s.enabled ? 'Armed' : 'Disarmed'}</span></td>
							<td class="hide-sm cp-mono">${s.alpha_min_smart_money != null ? s.alpha_min_smart_money : '—'}</td>
							<td class="hide-sm cp-mono">${s.alpha_min_quality_score != null ? s.alpha_min_quality_score : '—'}</td>
							<td class="hide-sm cp-mono">${s.alpha_max_mcap_usd != null ? `$${Number(s.alpha_max_mcap_usd).toLocaleString()}` : '—'}</td>
							<td class="r cp-mono ${clr(pnl)}">${fmtSol(pnl)}</td>
							<td class="r">${wr != null ? `${wr}%` : '—'}</td>
						</tr>`;
					}).join('')}
				</tbody>
			</table>`}
		</div>
	</div>`;
}

// ── Coin Launcher ─────────────────────────────────────────────────────────────

function renderLauncher(configs, coins) {
	const enabled = configs.filter((c) => c.enabled);
	const totalLaunches = configs.reduce((sum, c) => sum + (Number(c.launches_count) || 0), 0);
	const totalClaimed = coins.reduce((sum, c) => sum + (Number(c.total_claimed_lamports) || 0), 0);
	const graduated = coins.filter((c) => c.is_graduated).length;

	return `<div class="cp-section">
		<div class="cp-head">
			<div class="cp-head-left">
				<div>
					<div class="cp-head-title">Coin Launcher</div>
					<div class="cp-head-sub">Autonomous pump.fun launches on schedule</div>
				</div>
			</div>
			<div style="display:flex;align-items:center;gap:8px">
				<span class="cp-badge ${enabled.length ? 'live' : 'off'}">${enabled.length ? `${enabled.length} Active` : 'Inactive'}</span>
				<a class="cp-link" href="/agent-edit" style="display:${configs.length ? 'inline-flex' : 'none'}">Configure ↗</a>
			</div>
		</div>
		<div class="cp-kpi-row">
			<div class="cp-kpi"><div class="cp-kpi-label">Launchers</div><div class="cp-kpi-val">${configs.length}</div></div>
			<div class="cp-kpi"><div class="cp-kpi-label">Total Launches</div><div class="cp-kpi-val">${totalLaunches}</div></div>
			<div class="cp-kpi"><div class="cp-kpi-label">Graduated</div><div class="cp-kpi-val">${graduated}</div></div>
			<div class="cp-kpi"><div class="cp-kpi-label">Fees Claimed</div><div class="cp-kpi-val cp-mono">${fmtSolAbs(totalClaimed / 1e9)}</div></div>
		</div>
		${coins.length > 0 ? `
		<div class="cp-body">
			<div class="cp-tabs">
				<button class="cp-tab active" data-tab-group="launcher" data-tab="coins">Launched Coins</button>
				<button class="cp-tab" data-tab-group="launcher" data-tab="schedule">Schedule</button>
			</div>
			<div class="cp-tab-panel active" data-tab-group="launcher" data-panel="coins">
				<table class="cp-table">
					<thead>
						<tr>
							<th>Symbol</th>
							<th>Name</th>
							<th class="hide-sm">Agent</th>
							<th class="hide-sm">Network</th>
							<th class="r">Claimed</th>
							<th class="r">Graduated</th>
						</tr>
					</thead>
					<tbody>
						${coins.slice(0, 20).map((c) => `<tr>
							<td class="cp-mono" style="font-weight:700">$${esc(c.symbol || '—')}</td>
							<td class="cp-muted">${esc(c.name || '—')}</td>
							<td class="hide-sm">${esc(c._agent?.name || c.agent_id?.slice(0, 8) || '—')}</td>
							<td class="hide-sm cp-muted">${esc(c.network || 'mainnet')}</td>
							<td class="r cp-mono">${fmtSolAbs(Number(c.total_claimed_lamports || 0) / 1e9)}</td>
							<td class="r">${c.is_graduated ? '<span class="cp-pos">Yes</span>' : '<span class="cp-muted">No</span>'}</td>
						</tr>`).join('')}
					</tbody>
				</table>
			</div>
			<div class="cp-tab-panel" data-tab-group="launcher" data-panel="schedule">
				<table class="cp-table">
					<thead>
						<tr>
							<th>Agent</th>
							<th>Symbol</th>
							<th class="hide-sm">Interval</th>
							<th class="r">Launches</th>
							<th class="r">Next Launch</th>
						</tr>
					</thead>
					<tbody>
						${configs.map((c) => `<tr>
							<td>${esc(c._agent?.name || c.agent_id?.slice(0, 8) || '—')}</td>
							<td class="cp-mono" style="font-weight:700">$${esc(c.symbol || '—')}</td>
							<td class="hide-sm cp-muted">${c.interval_hours != null ? `Every ${c.interval_hours}h` : 'Manual'}</td>
							<td class="r">${c.launches_count || 0}${c.max_launches ? ` / ${c.max_launches}` : ''}</td>
							<td class="r cp-muted">${c.next_launch_at ? relTime(c.next_launch_at) : c.enabled ? 'Now' : '—'}</td>
						</tr>`).join('')}
					</tbody>
				</table>
			</div>
		</div>` : `
		<div class="cp-empty">
			No launcher configs yet — enable Coin Launcher in Agent Edit to start.
		</div>`}
	</div>`;
}

// ── Auto-Claim ────────────────────────────────────────────────────────────────

function renderAutoClaim(coins) {
	const claimable = coins.filter((c) => c.auto_claim_enabled);
	const totalClaimable = claimable.reduce((sum, c) => sum + (Number(c.claimable_lamports) || 0), 0);
	const totalEarned = claimable.reduce((sum, c) => sum + (Number(c.total_claimed_lamports) || 0), 0);
	const runners = claimable.filter((c) => Number(c.claimable_lamports) > 0.1e9);

	return `<div class="cp-section">
		<div class="cp-head">
			<div class="cp-head-left">
				<div>
					<div class="cp-head-title">Creator Auto-Claim</div>
					<div class="cp-head-sub">Automatically harvest creator fees when coins run</div>
				</div>
			</div>
			<div style="display:flex;align-items:center;gap:8px">
				<span class="cp-badge ${runners.length ? 'live' : claimable.length ? 'on' : 'off'}">${runners.length ? `${runners.length} Ready to Claim` : claimable.length ? `${claimable.length} Watching` : 'Inactive'}</span>
			</div>
		</div>
		<div class="cp-kpi-row">
			<div class="cp-kpi"><div class="cp-kpi-label">Coins Watching</div><div class="cp-kpi-val">${claimable.length}</div></div>
			<div class="cp-kpi"><div class="cp-kpi-label">Claimable Now</div><div class="cp-kpi-val cp-mono ${totalClaimable > 0 ? 'cp-pos' : ''}">${fmtSolAbs(totalClaimable / 1e9)}</div></div>
			<div class="cp-kpi"><div class="cp-kpi-label">Total Earned</div><div class="cp-kpi-val cp-mono">${fmtSolAbs(totalEarned / 1e9)}</div></div>
			<div class="cp-kpi"><div class="cp-kpi-label">Runners</div><div class="cp-kpi-val ${runners.length ? 'cp-pos' : ''}">${runners.length}</div></div>
		</div>
		${claimable.length > 0 ? `
		<div class="cp-body">
			<table class="cp-table">
				<thead>
					<tr>
						<th>Symbol</th>
						<th class="hide-sm">Agent</th>
						<th class="r">Claimable</th>
						<th class="r">Total Claimed</th>
						<th class="r">Graduated</th>
						<th class="r hide-sm">Last Checked</th>
					</tr>
				</thead>
				<tbody>
					${claimable.map((c) => {
						const claimSol = Number(c.claimable_lamports || 0) / 1e9;
						const earnedSol = Number(c.total_claimed_lamports || 0) / 1e9;
						return `<tr>
							<td class="cp-mono" style="font-weight:700">$${esc(c.symbol || '—')}</td>
							<td class="hide-sm">${esc(c._agent?.name || c.agent_id?.slice(0, 8) || '—')}</td>
							<td class="r cp-mono ${claimSol > 0 ? 'cp-pos' : 'cp-muted'}">${fmtSolAbs(claimSol)}</td>
							<td class="r cp-mono">${fmtSolAbs(earnedSol)}</td>
							<td class="r">${c.is_graduated ? '<span class="cp-pos">Yes</span>' : '<span class="cp-muted">No</span>'}</td>
							<td class="r hide-sm cp-muted">${c.last_fee_check_at ? relTime(c.last_fee_check_at) : 'Never'}</td>
						</tr>`;
					}).join('')}
				</tbody>
			</table>
		</div>` : `
		<div class="cp-empty">
			No coins being watched for fees yet. Launch a coin and enable Auto-Claim to start.
		</div>`}
	</div>`;
}

// ── Market Maker ──────────────────────────────────────────────────────────────

function renderMarketMaker(configs, trades) {
	const active = configs.filter((c) => c.enabled);
	const totalPnl = configs.reduce((sum, c) => sum + (Number(c.total_pnl_sol) || 0), 0);
	const totalVol = configs.reduce((sum, c) => sum + (Number(c.total_volume_sol) || 0), 0);
	const totalBuys = configs.reduce((sum, c) => sum + (Number(c.total_buys) || 0), 0);
	const totalSells = configs.reduce((sum, c) => sum + (Number(c.total_sells) || 0), 0);

	return `<div class="cp-section">
		<div class="cp-head">
			<div class="cp-head-left">
				<div>
					<div class="cp-head-title">Market Maker</div>
					<div class="cp-head-sub">Range-based liquidity with Jito-accelerated execution</div>
				</div>
			</div>
			<div style="display:flex;align-items:center;gap:8px">
				<span class="cp-badge ${active.length ? 'live' : 'off'}">${active.length ? `${active.length} Active` : 'Inactive'}</span>
			</div>
		</div>
		<div class="cp-kpi-row">
			<div class="cp-kpi"><div class="cp-kpi-label">Active Markets</div><div class="cp-kpi-val">${active.length}</div></div>
			<div class="cp-kpi"><div class="cp-kpi-label">Total Volume</div><div class="cp-kpi-val cp-mono">${fmtSolAbs(totalVol)}</div></div>
			<div class="cp-kpi"><div class="cp-kpi-label">Buys / Sells</div><div class="cp-kpi-val">${totalBuys} / ${totalSells}</div></div>
			<div class="cp-kpi"><div class="cp-kpi-label">Net P&L</div><div class="cp-kpi-val cp-mono ${clr(totalPnl)}">${fmtSol(totalPnl)}</div></div>
		</div>
		${active.length > 0 ? `
		<div class="cp-body">
			<div class="cp-tabs">
				<button class="cp-tab active" data-tab-group="mm" data-tab="markets">Active Markets</button>
				<button class="cp-tab" data-tab-group="mm" data-tab="trades">Recent Trades</button>
			</div>
			<div class="cp-tab-panel active" data-tab-group="mm" data-panel="markets">
				<table class="cp-table">
					<thead>
						<tr>
							<th>Symbol</th>
							<th class="hide-sm">Agent</th>
							<th>Spread</th>
							<th class="hide-sm">Order Size</th>
							<th>Inventory</th>
							<th class="r">P&L</th>
							<th class="r hide-sm">MEV Tip</th>
						</tr>
					</thead>
					<tbody>
						${active.map((c) => {
							const inv = Number(c.current_inventory_sol) || 0;
							const maxInv = Number(c.max_inventory_sol) || 1;
							const invPct = Math.min(100, Math.round((inv / maxInv) * 100));
							return `<tr>
								<td class="cp-mono" style="font-weight:700">${esc(c.symbol || c.mint?.slice(0, 6) || '—')}</td>
								<td class="hide-sm">${esc(c._agent?.name || c.agent_id?.slice(0, 8) || '—')}</td>
								<td class="cp-mono">${(Number(c.spread_bps) / 100).toFixed(2)}%</td>
								<td class="hide-sm cp-mono">${fmtSolAbs(Number(c.order_size_sol))}</td>
								<td>
									<div class="cp-inv-bar">
										<div class="cp-inv-track"><div class="cp-inv-fill" style="width:${invPct}%"></div></div>
										<span class="cp-mono" style="font-size:11px;min-width:2.5rem;text-align:right">${fmtSolAbs(inv)}</span>
									</div>
								</td>
								<td class="r cp-mono ${clr(Number(c.total_pnl_sol) || 0)}">${fmtSol(Number(c.total_pnl_sol) || 0)}</td>
								<td class="r hide-sm cp-muted">${esc(c.mev_tip_mode || 'off')}</td>
							</tr>`;
						}).join('')}
					</tbody>
				</table>
			</div>
			<div class="cp-tab-panel" data-tab-group="mm" data-panel="trades">
				${trades.length === 0 ? `<div class="cp-empty">No trades yet.</div>` : `
				<table class="cp-table">
					<thead>
						<tr>
							<th>Side</th>
							<th>Symbol</th>
							<th class="hide-sm">Agent</th>
							<th class="r">Size (SOL)</th>
							<th class="r">P&L</th>
							<th class="r hide-sm">Tx</th>
						</tr>
					</thead>
					<tbody>
						${trades.slice(0, 30).map((t) => {
							const pnl = Number(t.realized_pnl_lamports || 0) / 1e9;
							return `<tr>
								<td><span class="cp-badge ${t.side === 'buy' ? 'on' : 'off'}" style="font-size:10px">${esc(t.side || '—').toUpperCase()}</span></td>
								<td class="cp-mono" style="font-weight:600">${esc(t._agent?.name || t.agent_id?.slice(0, 8) || '—')}</td>
								<td class="hide-sm cp-muted">${esc(t._agent?.name || '—')}</td>
								<td class="r cp-mono">${fmtSolAbs(Number(t.quote_lamports || 0) / 1e9)}</td>
								<td class="r cp-mono ${clr(pnl)}">${t.side === 'sell' ? fmtSol(pnl) : '—'}</td>
								<td class="r hide-sm">${t.sig ? `<a class="cp-muted" href="https://solscan.io/tx/${esc(t.sig)}" target="_blank" rel="noopener" style="font-size:10px;font-family:monospace">${t.sig.slice(0, 8)}…</a>` : '—'}</td>
							</tr>`;
						}).join('')}
					</tbody>
				</table>`}
			</div>
		</div>` : `
		<div class="cp-empty">
			No active markets. Add a market in Agent Edit → Market Maker to start.
		</div>`}
	</div>`;
}

// ── Tab switchers ─────────────────────────────────────────────────────────────

function wireTabSwitchers(root) {
	root.querySelectorAll('.cp-tab').forEach((btn) => {
		btn.addEventListener('click', () => {
			const group = btn.dataset.tabGroup;
			const panel = btn.dataset.tab;
			root.querySelectorAll(`[data-tab-group="${group}"].cp-tab`).forEach((t) => t.classList.toggle('active', t === btn));
			root.querySelectorAll(`[data-tab-group="${group}"].cp-tab-panel`).forEach((p) => p.classList.toggle('active', p.dataset.panel === panel));
		});
	});
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function lamportsToSol(l) {
	if (l == null) return 0;
	try { return Number(BigInt(l)) / 1e9; } catch { return Number(l) / 1e9; }
}

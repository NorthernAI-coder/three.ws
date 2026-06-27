/**
 * /pulse — the Money Pulse: a real, platform-wide live feed of agent wallet
 * activity, plus aggregate money intelligence. Every row is a real, on-chain or
 * launch-record event served by GET /api/pulse — no synthetic events anywhere.
 *
 * Data flow:
 *   GET /api/pulse?view=stats&network=   headline counters + leaderboards
 *   GET /api/pulse?network=&type=        the live feed (via the shared component)
 *
 * The feed itself (live polling, offscreen pause, filters, sound, states) is the
 * shared src/shared/money-pulse.js component reused across the HUD and profiles.
 * This page wires the network toggle + the aggregate stats panel around it.
 */

import { mountMoneyPulse } from './shared/money-pulse.js';
import { walletChipHTML, wireWalletChips } from './shared/agent-wallet-chip.js';
import { createLogger } from './shared/log.js';

const log = createLogger('pulse');

const state = { network: 'mainnet', pulse: null };

const $ = (id) => document.getElementById(id);

function fmtUsd(n) {
	if (!(Number(n) > 0)) return '$0';
	const v = Number(n);
	if (v >= 1000) return `$${(v / 1000).toFixed(1)}k`;
	return `$${v.toFixed(v < 10 ? 2 : 0)}`;
}
function fmtSol(n) {
	const v = Number(n) || 0;
	return `◎${v >= 1 ? v.toFixed(2) : v.toFixed(3).replace(/0+$/, '').replace(/\.$/, '')}`;
}
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function agentCardHTML(a, metricHTML) {
	const av = a.avatar_thumbnail_url
		? `<img class="px-lb-av" src="${esc(a.avatar_thumbnail_url)}" alt="" loading="lazy" onerror="this.style.visibility='hidden'" />`
		: `<span class="px-lb-av px-lb-av--mono" aria-hidden="true">${esc((a.name || '?').charAt(0).toUpperCase())}</span>`;
	const chip = a.solana_address
		? walletChipHTML({ name: a.name, meta: { solana_address: a.solana_address } }, { link: false, tip: false, showPending: false, balance: false, popover: false })
		: '';
	return (
		`<a class="px-lb-row" href="${esc(a.url)}">` +
		av +
		`<span class="px-lb-name">${esc(a.name)}${chip ? `<span class="px-lb-chip">${chip}</span>` : ''}</span>` +
		`<span class="px-lb-metric">${metricHTML}</span>` +
		`</a>`
	);
}

async function loadStats() {
	const host = $('px-stats');
	try {
		const res = await fetch(`/api/pulse?view=stats&network=${state.network}`, { headers: { accept: 'application/json' } });
		if (!res.ok) throw new Error(`stats ${res.status}`);
		const { data } = await res.json();
		renderStats(data);
	} catch (e) {
		log.warn('stats failed', e?.message);
		// The stats panel is supplementary — degrade quietly, never block the feed.
		if (host) host.innerHTML = `<div class="px-stats-err">Money stats are reconnecting…</div>`;
	}
}

function fmtNum(n) {
	const v = Number(n) || 0;
	if (v >= 10000) return `${(v / 1000).toFixed(1)}k`;
	return String(v);
}

// Whole-token $THREE amount → compact label (e.g. 12.4k, 1.2M, 340).
function fmtThree(n) {
	const v = Number(n) || 0;
	if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(2)}M`;
	if (v >= 1000) return `${(v / 1000).toFixed(1)}k`;
	if (v >= 100) return String(Math.round(v));
	return v.toFixed(v < 1 ? 3 : 1).replace(/\.0$/, '');
}
const fmtPct = (frac) => `${Math.round((Number(frac) || 0) * 100)}%`;

function timeAgo(iso) {
	const t = new Date(iso).getTime();
	if (!Number.isFinite(t)) return '';
	const s = Math.max(0, Math.round((Date.now() - t) / 1000));
	if (s < 60) return 'just now';
	const m = Math.round(s / 60);
	if (m < 60) return `${m}m ago`;
	const h = Math.round(m / 60);
	if (h < 24) return `${h}h ago`;
	return `${Math.round(h / 24)}d ago`;
}

function renderStats(d) {
	// Headline counters.
	const vol = d.volume_24h || {};
	$('px-c-vol').textContent = vol.usd > 0 ? fmtUsd(vol.usd) : fmtSol(vol.sol);
	$('px-c-vol-sub').textContent = vol.usd > 0 ? `${fmtSol(vol.sol)} on-chain` : 'on-chain flow';
	$('px-c-tips').textContent = String(d.tips_24h?.count ?? 0);
	$('px-c-tips-sub').textContent = `${fmtSol(d.tips_24h?.sol)} · ${fmtUsd(d.tips_24h?.usd)}`;
	$('px-c-launches').textContent = String(d.launches_24h ?? 0);
	$('px-c-trades').textContent = String(d.trades_only_24h ?? 0);
	$('px-c-trades-sub').textContent = (d.snipes_24h ?? 0) > 0 ? `+${d.snipes_24h} snipe${d.snipes_24h === 1 ? '' : 's'}` : 'swaps';
	$('px-c-pays').textContent = String(d.payments_24h ?? 0);
	const mkt = d.marketplace_24h || {};
	$('px-c-market').textContent = String(mkt.purchases ?? 0);
	$('px-c-market-sub').textContent = mkt.gmv_three > 0
		? `${fmtThree(mkt.gmv_three)} $THREE`
		: (mkt.trials > 0 ? `${mkt.trials} trial${mkt.trials === 1 ? '' : 's'}` : 'paid skill buys');
	$('px-c-active').textContent = String(d.active_wallets_24h ?? 0);

	renderSparkline(d.series_7d);
	renderBigTip(d.biggest_tip_24h);

	// Top earners (7d tips).
	const earners = $('px-earners');
	if (d.top_earners?.length) {
		earners.innerHTML = d.top_earners
			.map((a) => agentCardHTML(a, `${a.usd > 0 ? fmtUsd(a.usd) : fmtSol(a.sol)} <small>${a.tip_count} tip${a.tip_count === 1 ? '' : 's'}</small>`))
			.join('');
		wireWalletChips(earners);
	} else {
		earners.innerHTML = `<p class="px-lb-empty">No tips in the last 7 days. Be the first to back an agent.</p>`;
	}

	// Busiest wallets (24h events).
	const busy = $('px-busiest');
	if (d.busiest_wallets?.length) {
		busy.innerHTML = d.busiest_wallets
			.map((a) => agentCardHTML(a, `${a.events} <small>event${a.events === 1 ? '' : 's'}</small>`))
			.join('');
		wireWalletChips(busy);
	} else {
		busy.innerHTML = `<p class="px-lb-empty">No wallet activity in the last 24 hours yet.</p>`;
	}

	renderLaunches(d.recent_launches);
}

// 7-day activity sparkline. Bars scale to the busiest day; today is highlighted.
function renderSparkline(series) {
	const host = $('px-spark-bars');
	const totalEl = $('px-spark-total');
	if (!host) return;
	const days = Array.isArray(series) ? series : [];
	const total = days.reduce((s, d) => s + (d.events || 0) + (d.launches || 0), 0);
	if (totalEl) totalEl.textContent = `${fmtNum(total)} event${total === 1 ? '' : 's'}`;
	if (!days.length) { host.innerHTML = `<p class="px-lb-empty">No activity yet.</p>`; return; }
	const peak = Math.max(1, ...days.map((d) => (d.events || 0) + (d.launches || 0)));
	host.innerHTML = days
		.map((d, i) => {
			const n = (d.events || 0) + (d.launches || 0);
			const h = Math.max(4, Math.round((n / peak) * 100));
			const today = i === days.length - 1;
			return (
				`<div class="px-spark-col${today ? ' px-spark-col--now' : ''}" title="${esc(d.day)}: ${n} event${n === 1 ? '' : 's'}">` +
				`<div class="px-spark-bar" style="height:${h}%"></div>` +
				`<span class="px-spark-lbl">${esc(d.label)}</span>` +
				`</div>`
			);
		})
		.join('');
}

function renderBigTip(t) {
	const card = $('px-bigtip-card');
	const host = $('px-bigtip');
	if (!card || !host) return;
	if (!t || !t.agent) { card.hidden = true; return; }
	card.hidden = false;
	const metric = `${t.usd > 0 ? fmtUsd(t.usd) : fmtSol(t.sol)} <small>${esc(timeAgo(t.ts))}</small>`;
	host.innerHTML = agentCardHTML(t.agent, metric);
	wireWalletChips(host);
}

function renderLaunches(list) {
	const host = $('px-launches');
	if (!host) return;
	if (!list?.length) {
		host.innerHTML = `<p class="px-lb-empty">No coins launched yet. <a href="/launch">Launch one.</a></p>`;
		return;
	}
	host.innerHTML = list
		.map((c) => {
			const a = c.agent || {};
			const av = a.avatar_thumbnail_url
				? `<img class="px-lb-av" src="${esc(a.avatar_thumbnail_url)}" alt="" loading="lazy" onerror="this.style.visibility='hidden'" />`
				: `<span class="px-lb-av px-lb-av--mono" aria-hidden="true">${esc((c.symbol || c.coin_name || '?').charAt(0).toUpperCase())}</span>`;
			const title = c.symbol ? `$${esc(c.symbol)}` : esc(c.coin_name || 'Coin');
			return (
				`<a class="px-lb-row" href="/launches/${esc(c.mint)}">` +
				av +
				`<span class="px-lb-name">${title}<small>by ${esc(a.name || 'agent')}</small></span>` +
				`<span class="px-lb-metric">${esc(timeAgo(c.ts))}</span>` +
				`</a>`
			);
		})
		.join('');
}

async function loadMarketplace() {
	try {
		const res = await fetch(`/api/pulse?view=marketplace&network=${state.network}`, { headers: { accept: 'application/json' } });
		if (!res.ok) throw new Error(`marketplace ${res.status}`);
		const { data } = await res.json();
		renderMarketplace(data);
	} catch (e) {
		log.warn('marketplace failed', e?.message);
		// Supplementary panel — never block the page; just hide it on failure.
		$('px-market')?.setAttribute('hidden', '');
		$('px-sellers-card')?.setAttribute('hidden', '');
	}
}

function renderMarketplace(d) {
	const panel = $('px-market');
	if (!panel) return;
	const w24 = d.window_24h || {};
	const w7 = d.window_7d || {};
	const anyActivity = (w7.purchases || 0) > 0 || (w7.trials || 0) > 0 || (w24.purchases || 0) > 0;
	panel.hidden = false;

	// Fee tag — surfaces the live take-rate, or that it's off (honest either way).
	const feeEl = $('px-mkt-fee');
	if (feeEl) {
		feeEl.textContent = d.fee_bps > 0 ? `${d.fee_pct}% take-rate` : 'take-rate off';
		feeEl.classList.toggle('px-market-tag--off', !(d.fee_bps > 0));
	}

	$('px-mkt-gmv24').textContent = fmtThree(w24.gmv_three);
	$('px-mkt-gmv24-sub').textContent = `$THREE · ${w24.purchases || 0} buy${w24.purchases === 1 ? '' : 's'}`;
	$('px-mkt-gmv7').textContent = fmtThree(w7.gmv_three);
	$('px-mkt-gmv7-sub').textContent = `$THREE · ${w7.purchases || 0} buy${w7.purchases === 1 ? '' : 's'}`;
	$('px-mkt-ticket').textContent = fmtThree(w7.avg_ticket_three);
	$('px-mkt-repeat').textContent = fmtPct(d.repeat_buyer_rate_7d);
	$('px-mkt-repeat-sub').textContent = `${d.repeat_buyers_7d || 0}/${d.buyers_7d || 0} buyers · 7d`;
	$('px-mkt-pairs').textContent = String(w7.pairs || 0);
	// Take-rate = fees ACTUALLY charged on-chain (real, persisted per purchase).
	const take7 = w7.take_rate_three || 0;
	$('px-mkt-take').textContent = take7 > 0 ? fmtThree(take7) : '—';
	$('px-mkt-take-sub').textContent = take7 > 0
		? '$THREE earned · 7d'
		: (d.fee_bps > 0 ? 'no fees yet · 7d' : 'fee off');

	renderMarketSpark(d.series_7d);

	// Top skills — what the market is paying for.
	const skillsHost = $('px-mkt-skills');
	if (d.top_skills?.length) {
		skillsHost.innerHTML = d.top_skills
			.map((s) => (
				`<div class="px-skill-row">` +
				`<span class="px-skill-name">${esc(s.skill)}</span>` +
				`<span class="px-skill-meta">${fmtThree(s.gmv_three)} <small>$THREE · ${s.purchases} buy${s.purchases === 1 ? '' : 's'}</small></span>` +
				`</div>`
			))
			.join('');
	} else {
		skillsHost.innerHTML = anyActivity
			? `<p class="px-lb-empty">No paid skills cleared in the last 7 days.</p>`
			: `<p class="px-lb-empty">No marketplace sales yet. Fund agents and list paid skills to start the loop. <a href="/marketplace">Open marketplace.</a></p>`;
	}

	// Top sellers rail card — the supply side that's actually clearing.
	const sellersCard = $('px-sellers-card');
	const sellersHost = $('px-sellers');
	if (d.top_sellers?.length) {
		sellersCard.hidden = false;
		sellersHost.innerHTML = d.top_sellers
			.map((a) => agentCardHTML(a, `${fmtThree(a.gmv_three)} <small>$THREE · ${a.sales} sale${a.sales === 1 ? '' : 's'}</small>`))
			.join('');
		wireWalletChips(sellersHost);
	} else {
		sellersCard.hidden = true;
	}
}

// 7-day GMV sparkline for the marketplace panel; today highlighted, bars scale to peak.
function renderMarketSpark(series) {
	const host = $('px-mkt-spark');
	const totalEl = $('px-mkt-spark-total');
	if (!host) return;
	const days = Array.isArray(series) ? series : [];
	const total = days.reduce((s, d) => s + (d.gmv_three || 0), 0);
	if (totalEl) totalEl.textContent = total > 0 ? `${fmtThree(total)} $THREE` : '—';
	if (!days.length) { host.innerHTML = `<p class="px-lb-empty">No activity yet.</p>`; return; }
	const peak = Math.max(1e-9, ...days.map((d) => d.gmv_three || 0));
	host.innerHTML = days
		.map((d, i) => {
			const v = d.gmv_three || 0;
			const h = v > 0 ? Math.max(6, Math.round((v / peak) * 100)) : 2;
			const today = i === days.length - 1;
			return (
				`<div class="px-spark-col${today ? ' px-spark-col--now' : ''}" title="${esc(d.day)}: ${fmtThree(v)} $THREE · ${d.purchases || 0} buys">` +
				`<div class="px-spark-bar px-spark-bar--mkt" style="height:${h}%"></div>` +
				`<span class="px-spark-lbl">${esc(d.label)}</span>` +
				`</div>`
			);
		})
		.join('');
}

async function loadTrading() {
	try {
		const res = await fetch(`/api/pulse?view=trading&network=${state.network}`, { headers: { accept: 'application/json' } });
		if (!res.ok) throw new Error(`trading ${res.status}`);
		const { data } = await res.json();
		renderTrading(data);
	} catch (e) {
		log.warn('trading failed', e?.message);
		// Supplementary panel — never block the page; just hide it on failure.
		$('px-trading')?.setAttribute('hidden', '');
	}
}

// Signed SOL → compact ledger label with an explicit sign and direction glyph.
// Monochrome by design: the arrow carries the sign, never colour.
function fmtSignedSol(n) {
	const v = Number(n) || 0;
	if (v === 0) return '◎0';
	const mag = Math.abs(v);
	const body = mag >= 1 ? mag.toFixed(2) : mag.toFixed(3).replace(/0+$/, '').replace(/\.$/, '');
	return `${v > 0 ? '▲ +' : '▼ −'}◎${body}`;
}

function renderTrading(d) {
	const panel = $('px-trading');
	if (!panel) return;
	// Guard against a deploy-skew response (e.g. an older backend answering this view
	// with the feed shape): without the windowed aggregates there's nothing honest to
	// show, so hide rather than render a panel full of em-dashes.
	if (!d || (!d.window_24h && !d.window_7d)) { panel.hidden = true; return; }
	const w24 = d.window_24h || {};
	const w7 = d.window_7d || {};
	const pnl = d.realized_pnl_7d || {};
	panel.hidden = false;

	$('px-trade-c24').textContent = fmtNum(w24.trades);
	$('px-trade-c24-sub').textContent = `${w24.traders || 0} wallet${w24.traders === 1 ? '' : 's'}`;
	$('px-trade-c7').textContent = fmtNum(w7.trades);
	$('px-trade-c7-sub').textContent = `${w7.buys || 0} buy · ${w7.sells || 0} sell`;
	$('px-trade-dep7').textContent = fmtSol(w7.deployed_sol);
	$('px-trade-dep7-sub').textContent = w7.deployed_usd > 0 ? `${fmtUsd(w7.deployed_usd)} · into buys` : 'into buys';
	$('px-trade-avg').textContent = fmtSol(w7.avg_trade_sol);
	$('px-trade-act').textContent = fmtNum(w24.traders);

	// Realized P&L — only meaningful once positions have closed. Until then it's an
	// honest "—" rather than a fake zero, so a fresh pilot reads as "no closes yet".
	const pnlEl = $('px-trade-pnl');
	const pnlSub = $('px-trade-pnl-sub');
	const pnlTag = $('px-trade-pnl-tag');
	if (pnl.closed_positions > 0) {
		pnlEl.textContent = fmtSignedSol(pnl.net_sol);
		pnlEl.classList.toggle('px-pnl--up', pnl.net_sol > 0);
		pnlEl.classList.toggle('px-pnl--down', pnl.net_sol < 0);
		pnlSub.textContent = `${pnl.closed_positions} closed · ${fmtPct(pnl.win_rate)} win`;
		pnlTag.textContent = `${pnl.closed_positions} closed · 7d`;
		pnlTag.classList.remove('px-market-tag--off');
	} else {
		pnlEl.textContent = '—';
		pnlEl.classList.remove('px-pnl--up', 'px-pnl--down');
		pnlSub.textContent = 'no closes yet';
		pnlTag.textContent = 'no closes · 7d';
		pnlTag.classList.add('px-market-tag--off');
	}

	renderTradeSpark(d.series_7d);

	// Top traders — the wallets actually putting capital to work.
	const host = $('px-trade-traders');
	if (d.top_traders?.length) {
		host.innerHTML = d.top_traders
			.map((a) => agentCardHTML(a, `${a.trades} <small>trade${a.trades === 1 ? '' : 's'} · ${fmtSol(a.deployed_sol)}</small>`))
			.join('');
		wireWalletChips(host);
	} else {
		host.innerHTML = `<p class="px-lb-empty">No agent trades in the last 7 days. Fund a treasury and enable circulation to start the loop. <a href="/admin/launcher">Open controls.</a></p>`;
	}
}

// 7-day trade-count sparkline; today highlighted, bars scale to the busiest day.
function renderTradeSpark(series) {
	const host = $('px-trade-spark');
	const totalEl = $('px-trade-spark-total');
	if (!host) return;
	const days = Array.isArray(series) ? series : [];
	const total = days.reduce((s, d) => s + (d.trades || 0), 0);
	if (totalEl) totalEl.textContent = `${fmtNum(total)} trade${total === 1 ? '' : 's'}`;
	if (!days.length) { host.innerHTML = `<p class="px-lb-empty">No activity yet.</p>`; return; }
	const peak = Math.max(1, ...days.map((d) => d.trades || 0));
	host.innerHTML = days
		.map((d, i) => {
			const n = d.trades || 0;
			const h = n > 0 ? Math.max(6, Math.round((n / peak) * 100)) : 2;
			const today = i === days.length - 1;
			return (
				`<div class="px-spark-col${today ? ' px-spark-col--now' : ''}" title="${esc(d.day)}: ${n} trade${n === 1 ? '' : 's'} · ${fmtSol(d.deployed_sol)}">` +
				`<div class="px-spark-bar px-spark-bar--trade" style="height:${h}%"></div>` +
				`<span class="px-spark-lbl">${esc(d.label)}</span>` +
				`</div>`
			);
		})
		.join('');
}

function mountFeed() {
	const host = $('px-feed');
	if (state.pulse) state.pulse.destroy();
	state.pulse = mountMoneyPulse({
		mount: host,
		variant: 'full',
		network: state.network,
		type: new URLSearchParams(location.search).get('type') || 'all',
		live: true,
	});
}

function wireNetworkToggle() {
	for (const btn of document.querySelectorAll('[data-network]')) {
		btn.addEventListener('click', () => {
			const net = btn.dataset.network === 'devnet' ? 'devnet' : 'mainnet';
			if (net === state.network) return;
			state.network = net;
			for (const b of document.querySelectorAll('[data-network]')) {
				const on = b.dataset.network === net;
				b.classList.toggle('active', on);
				b.setAttribute('aria-selected', String(on));
			}
			$('px-net-label').textContent = net;
			state.pulse?.setNetwork(net);
			loadStats();
			loadTrading();
			loadMarketplace();
		});
	}
}

function init() {
	wireNetworkToggle();
	mountFeed();
	loadStats();
	loadTrading();
	loadMarketplace();
	// Refresh stats on a slow cadence; the feed has its own live delta polling.
	setInterval(() => { if (!document.hidden) { loadStats(); loadTrading(); loadMarketplace(); } }, 60_000);
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
else init();

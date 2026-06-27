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
		});
	}
}

function init() {
	wireNetworkToggle();
	mountFeed();
	loadStats();
	// Refresh stats on a slow cadence; the feed has its own live delta polling.
	setInterval(() => { if (!document.hidden) loadStats(); }, 60_000);
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
else init();

/**
 * /viability — the honest signal behind three.ws. Two real money loops measured
 * without vanity: the skill marketplace (real $THREE GMV, take-rate, repeat
 * buyers, trading pairs) and agent trading (real guarded coin-trade flow, cost
 * and realized P&L on closed positions). Every figure is served by GET /api/pulse
 * from real on-chain and launch-record data — no synthetic activity anywhere.
 *
 * The panels themselves live in shared/viability-panels.js (also the source the
 * Money Pulse used before they earned this dedicated page). This module wires the
 * network toggle, the "updated X ago" ticker, and the slow refresh cadence.
 */

import { loadMarketplace, loadTrading } from './shared/viability-panels.js';

const state = { network: 'mainnet', lastUpdated: 0 };
const $ = (id) => document.getElementById(id);

// "Updated X ago" ticker — stamps time on each load, ticks every 15s.
function startUpdatedTick() {
	const el = $('px-updated');
	if (!el) return;
	function tick() {
		if (!state.lastUpdated) { el.textContent = ''; return; }
		const s = Math.round((Date.now() - state.lastUpdated) / 1000);
		if (s < 10) el.textContent = 'just now';
		else if (s < 60) el.textContent = `updated ${s}s ago`;
		else el.textContent = `updated ${Math.round(s / 60)}m ago`;
	}
	tick();
	setInterval(tick, 15_000);
}

async function loadAll() {
	await Promise.all([loadMarketplace(state.network), loadTrading(state.network)]);
	state.lastUpdated = Date.now();
	const updEl = $('px-updated');
	if (updEl) updEl.textContent = 'just now';
}

// Switch every panel to a network. No-op if unchanged.
function switchNetwork(net) {
	const target = net === 'devnet' ? 'devnet' : 'mainnet';
	if (target === state.network) return;
	state.network = target;
	for (const b of document.querySelectorAll('[data-network]')) {
		const on = b.dataset.network === target;
		b.classList.toggle('active', on);
		b.setAttribute('aria-selected', String(on));
	}
	const label = $('px-net-label');
	if (label) label.textContent = target;
	loadAll();
}

function wireNetworkToggle() {
	for (const btn of document.querySelectorAll('[data-network]')) {
		btn.addEventListener('click', () => switchNetwork(btn.dataset.network));
	}
}

function init() {
	wireNetworkToggle();
	loadAll();
	startUpdatedTick();
	// Slow refresh while the tab is visible — these are aggregates, not a live feed.
	setInterval(() => { if (!document.hidden) loadAll(); }, 60_000);
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
else init();

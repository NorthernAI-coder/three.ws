/**
 * Live $THREE signal bar (homepage, under the hero).
 *
 * Pulls real market + protocol data from /api/three-token/stats (Birdeye →
 * DexScreener → GeckoTerminal failover, edge-cached 20s) and renders it as a
 * compact, self-refreshing ticker: price, 24h change, market cap, 24h volume,
 * and lifetime deploy-burn. No sample data — every figure is live. If the fetch
 * fails the bar degrades to a quiet "view live stats →" link instead of blanking.
 *
 * The deploy-burn figure is derived the same way the API documents it:
 * total_agents × agent_deploy_burn $THREE permanently burned per deployment.
 */

const STATS_URL = '/api/three-token/stats';
const REFRESH_MS = 30_000; // matches the 20s edge cache with headroom

function fmtPrice(n) {
	const v = Number(n);
	if (!isFinite(v) || v <= 0) return null;
	// Sub-cent tokens need enough precision to be meaningful without noise.
	if (v >= 1) return `$${v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
	if (v >= 0.01) return `$${v.toFixed(4)}`;
	if (v >= 0.0001) return `$${v.toFixed(6)}`;
	return `$${v.toPrecision(2)}`;
}

function fmtCompactUsd(n) {
	const v = Number(n);
	if (!isFinite(v) || v <= 0) return null;
	if (v >= 1_000_000_000) return `$${(v / 1_000_000_000).toFixed(2)}B`;
	if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(2)}M`;
	if (v >= 1_000) return `$${(v / 1_000).toFixed(1)}K`;
	return `$${v.toFixed(0)}`;
}

function fmtCompactNum(n) {
	const v = Number(n);
	if (!isFinite(v) || v <= 0) return null;
	if (v >= 1_000_000_000) return `${(v / 1_000_000_000).toFixed(2)}B`;
	if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(2)}M`;
	if (v >= 1_000) return `${(v / 1_000).toFixed(1)}K`;
	return `${Math.round(v)}`;
}

function applyChange(el, pct) {
	const v = Number(pct);
	if (!isFinite(v)) {
		el.textContent = '';
		el.className = 'ts-chg ts-chg--flat';
		return;
	}
	const dir = v > 0.05 ? 'up' : v < -0.05 ? 'down' : 'flat';
	const sign = v > 0 ? '+' : '';
	el.textContent = `${sign}${v.toFixed(2)}% 24h`;
	el.className = `ts-chg ts-chg--${dir}`;
}

export function initHomeThreeSignal(root) {
	if (!root) return;

	const el = {
		price: root.querySelector('#ts-price'),
		change: root.querySelector('#ts-change'),
		mcap: root.querySelector('#ts-mcap'),
		vol: root.querySelector('#ts-vol'),
		burned: root.querySelector('#ts-burned'),
	};

	let timer = null;
	let stopped = false;

	async function load() {
		try {
			const res = await fetch(STATS_URL, { headers: { accept: 'application/json' } });
			if (!res.ok) throw new Error(`stats ${res.status}`);
			const data = await res.json();
			const t = data?.token || {};
			const p = data?.protocol || {};

			const price = fmtPrice(t.price_usd);
			// If the price itself is unavailable the signal has nothing real to
			// show — fall through to the error affordance rather than dashes.
			if (!price) throw new Error('no price');

			el.price.textContent = price;
			applyChange(el.change, t.price_change_24h);
			el.mcap.textContent = fmtCompactUsd(t.market_cap) || '—';
			el.vol.textContent = fmtCompactUsd(t.volume_24h) || '—';

			const burned = Number(p.total_agents) * Number(p.agent_deploy_burn || 0);
			el.burned.textContent = fmtCompactNum(burned) || '—';

			root.setAttribute('data-state', 'ready');
		} catch {
			// Keep whatever we last rendered if we already had data; only show the
			// degraded affordance when we never succeeded.
			if (root.getAttribute('data-state') !== 'ready') {
				root.setAttribute('data-state', 'error');
			}
		}
	}

	function schedule() {
		if (stopped) return;
		timer = setTimeout(async () => {
			// Skip refreshes while the tab is hidden to avoid pointless lambda hits.
			if (!document.hidden) await load();
			schedule();
		}, REFRESH_MS);
	}

	load().then(schedule);

	// Refresh promptly when the user returns to the tab after it was idle.
	document.addEventListener('visibilitychange', () => {
		if (!document.hidden && !stopped) load();
	});

	return () => {
		stopped = true;
		if (timer) clearTimeout(timer);
	};
}

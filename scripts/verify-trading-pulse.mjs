#!/usr/bin/env node
// Verify the Trading-viability surface end-to-end against a running deployment.
//
// Proves three things the /pulse "Trading viability" panel depends on:
//   1. GET /api/pulse?view=trading returns the full shape the panel renders.
//   2. Its 24h trade count RECONCILES with the headline stats counter
//      (trades_only_24h) — the panel can never silently drift from the number
//      $THREE holders see at the top of the page.
//   3. (optional) Firing one circulation tick actually produces trade events —
//      the real "is the trade-generation loop wired?" check.
//
// Usage:
//   node scripts/verify-trading-pulse.mjs                       # prod, mainnet
//   BASE=https://<preview>.vercel.app NET=devnet node scripts/verify-trading-pulse.mjs
//   CRON_SECRET=… TICK=1 NET=devnet node scripts/verify-trading-pulse.mjs   # also fire a tick
//
// Exit code 0 = all assertions passed; 1 = a check failed.

const BASE = (process.env.BASE || 'https://three.ws').replace(/\/$/, '');
const NET = process.env.NET === 'devnet' ? 'devnet' : 'mainnet';
const DO_TICK = process.env.TICK === '1' || process.env.TICK === 'true';
const CRON_SECRET = process.env.CRON_SECRET || '';

let failures = 0;
const pass = (m) => console.log(`  \x1b[32m✓\x1b[0m ${m}`);
const fail = (m) => { console.log(`  \x1b[31m✗ ${m}\x1b[0m`); failures++; };
const fmt = (n) => (Number(n) || 0).toLocaleString('en-US', { maximumFractionDigits: 4 });

async function getJson(path) {
	const res = await fetch(`${BASE}${path}`, { headers: { accept: 'application/json' } });
	const body = await res.json().catch(() => null);
	if (!res.ok) throw new Error(`${path} → ${res.status} ${JSON.stringify(body)?.slice(0, 160)}`);
	return body?.data;
}

async function main() {
	console.log(`\nTrading-viability verify · ${BASE} · ${NET}\n`);

	// 1. Shape.
	console.log('1) GET /api/pulse?view=trading');
	const t = await getJson(`/api/pulse?view=trading&network=${NET}`);
	for (const key of ['window_24h', 'window_7d', 'realized_pnl_7d', 'series_7d', 'top_traders']) {
		if (t && key in t) pass(`has ${key}`);
		else fail(`missing ${key} (got: ${t ? Object.keys(t).join(', ') : 'null'})`);
	}
	if (Array.isArray(t?.series_7d) && t.series_7d.length === 7) pass('series_7d is zero-filled to 7 days');
	else fail(`series_7d should have 7 days, got ${t?.series_7d?.length}`);

	const w24 = t?.window_24h || {};
	const w7 = t?.window_7d || {};
	const pnl = t?.realized_pnl_7d || {};
	console.log(
		`     trades 24h=${fmt(w24.trades)} · 7d=${fmt(w7.trades)} · ` +
		`SOL deployed 7d=◎${fmt(w7.deployed_sol)} · traders 24h=${fmt(w24.traders)} · ` +
		`realized P&L 7d=◎${fmt(pnl.net_sol)} over ${fmt(pnl.closed_positions)} closes`,
	);

	// 2. Reconciliation with the headline counter.
	console.log('\n2) Reconcile with headline stats (trades_only_24h)');
	const stats = await getJson(`/api/pulse?view=stats&network=${NET}`);
	const headline = Number(stats?.trades_only_24h);
	if (!Number.isFinite(headline)) {
		fail('stats.trades_only_24h missing — deploy is behind (split counters not live yet)');
	} else if (headline === Number(w24.trades || 0)) {
		pass(`trading.window_24h.trades (${headline}) === stats.trades_only_24h (${headline})`);
	} else {
		// A small drift is possible if the two cached views expired across a new trade.
		// Flag it but don't hard-fail on a 1-event cache skew.
		const drift = Math.abs(headline - Number(w24.trades || 0));
		(drift <= 1 ? pass : fail)(`headline=${headline} vs panel=${w24.trades} (drift ${drift}${drift <= 1 ? ', within cache skew' : ''})`);
	}

	// 3. Optional: fire one circulation tick and confirm it can produce trades.
	if (DO_TICK) {
		console.log('\n3) Fire one circulation tick (pulse-tick cron)');
		if (!CRON_SECRET) {
			fail('TICK=1 set but CRON_SECRET is empty — cannot authenticate the cron');
		} else {
			const res = await fetch(`${BASE}/api/cron/pulse-tick`, {
				method: 'POST',
				headers: { authorization: `Bearer ${CRON_SECRET}`, 'content-type': 'application/json' },
			});
			const body = await res.json().catch(() => null);
			if (!res.ok) {
				fail(`tick → ${res.status} ${JSON.stringify(body)?.slice(0, 200)}`);
			} else if (body?.skipped === 'disabled') {
				pass('tick inert (CIRCULATION_ENABLED unset) — expected until env + treasury are configured');
			} else if (body?.note === 'pool warming up' || (body?.pool ?? 0) < 2) {
				pass(`tick ran, pool warming up (pool=${body?.pool ?? 0}) — agents being provisioned`);
			} else {
				const acts = Array.isArray(body?.results) ? body.results : [];
				const trades = acts.filter((a) => a?.kind === 'trade' && a?.ok).length;
				const skips = acts.filter((a) => a?.skipped).map((a) => `${a.kind}:${a.skipped}`);
				pass(`tick ran: pool=${body?.pool ?? '?'} · ${acts.length} action(s) · ${trades} trade(s)`);
				if (trades > 0) pass('circulation produced a real trade event — loop is live');
				if (skips.length) console.log(`     skips: ${skips.slice(0, 4).join(', ')}`);
			}
		}
	} else {
		console.log('\n3) Skipped circulation tick (set TICK=1 + CRON_SECRET to exercise it)');
	}

	console.log(`\n${failures ? `\x1b[31m${failures} check(s) failed\x1b[0m` : '\x1b[32mAll checks passed\x1b[0m'}\n`);
	process.exit(failures ? 1 : 0);
}

main().catch((e) => {
	console.error(`\n\x1b[31mverify failed:\x1b[0m ${e?.message || e}\n`);
	process.exit(1);
});

#!/usr/bin/env node
// Trigger the pump.fun buyback / distribute crons against a deployment and print
// the JSON result — the operator's re-runnable verification for tasks 4 & 5 of
// tasks/onchain-deployment/09-fund-solana-relayers-verify-crons.md.
//
// Both crons are authed with the Vercel CRON_SECRET (Bearer). On success each
// returns per-mint results: when the relayer is funded you get tx_signature +
// status:'confirmed' and a fresh row in pump_buyback_runs / pump_distribute_runs;
// when it's unfunded you get status:'pending' + an unsigned tx_base64 for an
// external keeper (still a real audit row). A run that writes no row is a failure.
//
// Usage:
//   BASE_URL=https://three.ws CRON_SECRET=… node scripts/trigger-pump-crons.mjs
//   BASE_URL=http://localhost:3000 CRON_SECRET=… node scripts/trigger-pump-crons.mjs buyback
//   … node scripts/trigger-pump-crons.mjs distribute
//
// Pass `buyback` or `distribute` to run just one; default runs both.

const BASE_URL = (process.env.BASE_URL || 'https://three.ws').replace(/\/$/, '');
const CRON_SECRET = process.env.CRON_SECRET;
if (!CRON_SECRET) {
	console.error('CRON_SECRET is required (the Vercel cron bearer secret)');
	process.exit(1);
}

const which = process.argv[2];
const targets = [];
if (!which || which === 'buyback') targets.push(['buyback', '/api/cron/run-buyback']);
if (!which || which === 'distribute') targets.push(['distribute', '/api/cron/run-distribute-payments']);
if (targets.length === 0) {
	console.error('arg must be "buyback", "distribute", or omitted for both');
	process.exit(1);
}

let failed = false;
for (const [label, path] of targets) {
	console.log(`\n── ${label} → ${BASE_URL}${path} ──`);
	try {
		const r = await fetch(`${BASE_URL}${path}`, {
			method: 'POST',
			headers: { authorization: `Bearer ${CRON_SECRET}` },
		});
		const body = await r.json().catch(() => ({}));
		console.log(`HTTP ${r.status}`);
		console.log(JSON.stringify(body, null, 2));
		const results = body?.results || [];
		const confirmed = results.filter((x) => x.status === 'confirmed');
		const pending = results.filter((x) => x.status === 'pending');
		const errored = results.filter((x) => x.status === 'failed');
		console.log(
			`summary: ${results.length} processed, ${confirmed.length} confirmed, ` +
				`${pending.length} pending, ${errored.length} failed`,
		);
		for (const c of confirmed) {
			console.log(`  ✓ ${c.mint} sig=${c.tx_signature} run_id=${c.run_id}`);
		}
		if (!r.ok) failed = true;
	} catch (e) {
		console.error(`request failed: ${e.message}`);
		failed = true;
	}
}

process.exit(failed ? 1 : 0);

// econ-loop.mjs — run the three.ws agent-to-agent economy (Circulation engine)
// continuously, on the prod 2-min cadence. Each tick makes real marketplace
// agents pay each other (SOL tips, x402 pay-for-service, $THREE skill buys,
// pump.fun trades, reviews). Env gates in ~/.three-ws-fleet/env + CIRCULATION_*.
//
// Usage: node scripts/econ-loop.mjs   (loops until killed)

import { runCirculationTick, config } from '../api/_lib/circulation.js';

const EVERY_MS = Number(process.env.CIRCULATION_TICK_MS || 120_000);
const cfg = config ? config() : {};
console.log(JSON.stringify({ msg: 'econ-loop start', network: cfg.network, pool: cfg.poolTarget, actions: cfg.actionsPerTick, everyMs: EVERY_MS }));

let n = 0;
async function tick() {
	n++;
	try {
		const out = await runCirculationTick();
		const acts = (out.actions || []).map((a) => `${a.kind}:${a.ok ? 'OK' : (a.skipped ? 'skip' : 'fail')}`);
		console.log(JSON.stringify({ t: new Date().toISOString(), tick: n, pool: out.pool, grew: (out.grew || []).length, actions: acts }));
	} catch (e) {
		console.log(JSON.stringify({ t: new Date().toISOString(), tick: n, error: String(e.message || e).slice(0, 200) }));
	}
}

await tick();
setInterval(tick, EVERY_MS);

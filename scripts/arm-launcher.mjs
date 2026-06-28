#!/usr/bin/env node
// Arm / observe the autonomous coin launcher (the Memetic Launcher) against a
// deployment, and print the JSON result — the operator's one-command switch for
// turning autonomous pump.fun launches on.
//
// The launcher engine (api/_lib/launcher-engine.js) is fully inert until a
// launcher_config row is enabled AND out of dry_run: it ships disabled + dry_run
// so no SOL ever moves by accident. This is the supported way to flip it live —
// the same admin endpoint the console uses (api/admin/launcher.js), authed with
// the Vercel CRON_SECRET (Bearer).
//
// Commands:
//   status   (default)  GET the live config, master-wallet balance, queue size,
//                       today's throughput, and the `armed` flag.
//   dry-run             enabled=true, dry_run=true — picks a coin + agent every
//                       tick and records the run, but moves NO SOL. Prove the loop
//                       end-to-end before spending.
//   arm                 enabled=true, dry_run=false — REAL launches begin on the
//                       next cron tick (the tick cron runs every minute).
//   disarm              enabled=false — stop launching, keep the config.
//   resume              clear a tripped circuit breaker (paused=false).
//   tick                force one launcher tick right now (bypasses the schedule).
//
// Caps (apply to `arm` / `dry-run`; all overridable via env, conservative by
// default so a first arming can't run away):
//   CADENCE_SECONDS   target seconds between launches      (default 300 = 1 / 5 min)
//   MAX_PER_HOUR      hourly launch ceiling                (default 6)
//   PER_LAUNCH_SOL    SOL funded to each launching agent   (default 0.02)
//   DAILY_SOL_CAP     hard daily SOL ceiling               (default 0.25)
//   DEV_BUY_SOL       agent's own dev-buy on its coin      (default 0)
//   BUYBACK_BPS       creator-fee → $THREE buyback share   (default 5000 = 50%)
//   MODE              off|trend|meme|random|hybrid         (default hybrid)
//   NETWORK           mainnet|devnet                       (default mainnet)
//
// Usage:
//   CRON_SECRET=… node scripts/arm-launcher.mjs                 # status
//   CRON_SECRET=… node scripts/arm-launcher.mjs dry-run         # prove the loop
//   CRON_SECRET=… node scripts/arm-launcher.mjs arm             # go live
//   CRON_SECRET=… node scripts/arm-launcher.mjs tick            # launch now
//   BASE_URL=http://localhost:3000 CRON_SECRET=… node scripts/arm-launcher.mjs arm
//   PER_LAUNCH_SOL=0.03 DAILY_SOL_CAP=1 MAX_PER_HOUR=30 … node scripts/arm-launcher.mjs arm

const BASE_URL = (process.env.BASE_URL || 'https://three.ws').replace(/\/$/, '');
const CRON_SECRET = process.env.CRON_SECRET;
if (!CRON_SECRET) {
	console.error('CRON_SECRET is required (the Vercel cron bearer secret used by api/admin/launcher.js)');
	process.exit(1);
}

const cmd = (process.argv[2] || 'status').toLowerCase();
const COMMANDS = new Set(['status', 'dry-run', 'arm', 'disarm', 'resume', 'tick']);
if (!COMMANDS.has(cmd)) {
	console.error(`unknown command "${cmd}" — one of: ${[...COMMANDS].join(', ')}`);
	process.exit(1);
}

const ENDPOINT = `${BASE_URL}/api/admin/launcher`;

const num = (v, dflt) => {
	const n = Number(v);
	return Number.isFinite(n) ? n : dflt;
};

function armConfig(dryRun) {
	return {
		enabled: true,
		dry_run: dryRun,
		mode: process.env.MODE || 'hybrid',
		network: process.env.NETWORK || 'mainnet',
		target_cadence_seconds: Math.round(num(process.env.CADENCE_SECONDS, 300)),
		max_per_hour: Math.round(num(process.env.MAX_PER_HOUR, 6)),
		per_launch_sol: num(process.env.PER_LAUNCH_SOL, 0.02),
		daily_sol_cap: num(process.env.DAILY_SOL_CAP, 0.25),
		dev_buy_sol: num(process.env.DEV_BUY_SOL, 0),
		buyback_bps: Math.round(num(process.env.BUYBACK_BPS, 5000)),
	};
}

async function api(method, body) {
	const r = await fetch(ENDPOINT, {
		method,
		headers: {
			authorization: `Bearer ${CRON_SECRET}`,
			...(body ? { 'content-type': 'application/json' } : {}),
		},
		...(body ? { body: JSON.stringify(body) } : {}),
	});
	let parsed = null;
	try { parsed = await r.json(); } catch { /* non-JSON */ }
	return { status: r.status, body: parsed };
}

function printState(state) {
	if (!state) return;
	const c = state.config || {};
	console.log(`armed:           ${state.armed ? 'YES — real launches active' : 'no'}`);
	console.log(`mode:            ${c.mode}   network: ${c.network}`);
	console.log(`enabled:         ${c.enabled}   dry_run: ${c.dry_run}   paused: ${c.paused}${c.pause_reason ? ` (${c.pause_reason})` : ''}`);
	console.log(`cadence:         every ${c.target_cadence_seconds}s   max/hour: ${c.max_per_hour}`);
	console.log(`per-launch SOL:  ${c.per_launch_sol}   daily cap: ${c.daily_sol_cap}   dev-buy: ${c.dev_buy_sol}`);
	console.log(`master balance:  ${state.master_balance_sol == null ? 'UNCONFIGURED — set LAUNCHER_MASTER_SECRET_KEY_B64' : `◎${state.master_balance_sol}`}`);
	console.log(`launch-ready agents in queue: ${state.queue_enabled}`);
	if (state.stats) {
		const s = state.stats;
		console.log(`today:           ${s.launched_today ?? 0} launched · ${s.dry_runs_today ?? 0} dry · ${s.skipped_today ?? 0} skipped · ${s.failed_today ?? 0} failed · ◎${s.sol_spent_today ?? 0} spent`);
	}
	if (Array.isArray(state.console) && state.console.length) {
		console.log('recent runs:');
		for (const run of state.console.slice(0, 8)) {
			const tag = run.mint ? `mint=${run.mint}` : (run.error ? `err=${run.error}` : '');
			console.log(`  · ${run.status.padEnd(9)} ${(run.symbol || '—').padEnd(10)} ${(run.agent_name || '').slice(0, 20).padEnd(20)} ${tag}`);
		}
	}
}

// Pre-flight: refuse to spend if the master can't cover a launch or no agent is
// ready — better a clear stop than a tick that silently skips forever.
function preflight(state, planned) {
	const problems = [];
	if (state.master_balance_sol == null) {
		problems.push('master wallet is UNCONFIGURED (LAUNCHER_MASTER_SECRET_KEY_B64 / PUMP_X402_LAUNCHER_SECRET_KEY_B64 not set on the deployment) — funding transfers will be skipped.');
	} else if (state.master_balance_sol < planned.per_launch_sol + 0.01) {
		problems.push(`master balance ◎${state.master_balance_sol} is below per-launch ◎${planned.per_launch_sol} + fee buffer — fund the master wallet first.`);
	}
	if ((state.queue_enabled ?? 0) < 1) {
		problems.push('no launch-ready agents in the rotation yet (need a public agent with an avatar + Solana wallet; the global rotation auto-enrolls from the circulation pool — make sure circulation is seeded).');
	}
	return problems;
}

console.log(`── launcher · ${cmd} → ${ENDPOINT} ──\n`);

// Always read current state first.
const before = await api('GET');
if (before.status !== 200) {
	console.error(`GET failed: HTTP ${before.status}`);
	console.error(JSON.stringify(before.body, null, 2));
	process.exit(1);
}

if (cmd === 'status') {
	printState(before.body);
	process.exit(0);
}

if (cmd === 'tick') {
	const r = await api('POST', { action: 'force_tick' });
	console.log(`HTTP ${r.status}`);
	console.log(JSON.stringify(r.body?.tick ?? r.body, null, 2));
	process.exit(r.status === 200 ? 0 : 1);
}

if (cmd === 'resume') {
	const r = await api('POST', { action: 'resume' });
	console.log(`HTTP ${r.status} — circuit breaker cleared`);
	printState((await api('GET')).body);
	process.exit(r.status === 200 ? 0 : 1);
}

if (cmd === 'disarm') {
	const r = await api('POST', { enabled: false });
	console.log(`HTTP ${r.status} — launcher disabled (config preserved)`);
	process.exit(r.status === 200 ? 0 : 1);
}

// arm / dry-run
const planned = armConfig(cmd === 'dry-run');
const problems = preflight(before.body, planned);
if (problems.length) {
	console.log(cmd === 'dry-run' ? 'pre-flight notes (dry-run moves no SOL, proceeding anyway):' : 'pre-flight:');
	for (const p of problems) console.log(`  ⚠ ${p}`);
	console.log('');
	// In dry-run these are informational; for a real arm, a hard blocker stops us.
	if (cmd === 'arm') {
		console.error('Refusing to arm with real launches until the above is resolved. Run `dry-run` to prove the loop, or fix and re-run `arm`.');
		process.exit(2);
	}
}

const r = await api('POST', planned);
if (r.status !== 200) {
	console.error(`arm failed: HTTP ${r.status}`);
	console.error(JSON.stringify(r.body, null, 2));
	process.exit(1);
}
console.log(`HTTP ${r.status} — ${r.body?.armed ? 'ARMED · real launches will begin on the next tick' : (planned.dry_run ? 'dry-run enabled · loop runs, no SOL moves' : 'updated')}\n`);
printState((await api('GET')).body);
console.log('\nTick cron runs every minute. Use `node scripts/arm-launcher.mjs tick` to launch immediately, or `status` to watch.');

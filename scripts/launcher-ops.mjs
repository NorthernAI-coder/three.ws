// Ops CLI for the autonomous coin launcher (the Memetic Launcher).
//
// The engine (api/_lib/launcher-engine.js) + cron (api/cron/launcher-tick, every
// minute) ship fully wired but INERT: the global launcher_config is seeded
// enabled=false, dry_run=true so no SOL ever moves until an operator arms it.
// This is the supported, scriptable way to observe and arm it without the admin UI.
//
// Auth: the platform admin endpoint accepts `Authorization: Bearer $CRON_SECRET`.
// Set CRON_SECRET (and optionally APP_ORIGIN, default https://three.ws) in your env.
//
//   node scripts/launcher-ops.mjs status            # config, armed?, master SOL, queue, last runs
//   node scripts/launcher-ops.mjs dry               # rehearse: enabled + dry_run (picks coin+agent, spends nothing)
//   node scripts/launcher-ops.mjs tick              # force one tick now (bypasses the cron schedule)
//   node scripts/launcher-ops.mjs arm [flags]       # GO LIVE: enabled=true, dry_run=false (moves real SOL)
//   node scripts/launcher-ops.mjs disarm            # enabled=false (stops new launches)
//   node scripts/launcher-ops.mjs resume            # clear a tripped circuit breaker
//
// arm flags (all optional; omitted fields keep their saved value):
//   --network mainnet|devnet      --mode hybrid|trend|meme|random|off
//   --cadence <seconds>           --max-per-hour <n>
//   --per-launch-sol <sol>        --dev-buy-sol <sol>
//   --daily-cap-sol <sol>         --buyback-bps <0..10000>
//
//   node scripts/launcher-ops.mjs arm --network mainnet --cadence 90 --per-launch-sol 0.03 --daily-cap-sol 1

const ORIGIN = (process.env.APP_ORIGIN || process.env.PUBLIC_APP_ORIGIN || 'https://three.ws').replace(/\/$/, '');
const SECRET = process.env.CRON_SECRET;

if (!SECRET) {
	console.error('CRON_SECRET is unset. Export it (or run inside the deploy env) before arming.');
	process.exit(1);
}

const [cmd = 'status', ...rest] = process.argv.slice(2);

function flag(name, fallback = undefined) {
	const i = rest.indexOf(`--${name}`);
	return i >= 0 && rest[i + 1] != null ? rest[i + 1] : fallback;
}

async function call(method, body) {
	const res = await fetch(`${ORIGIN}/api/admin/launcher`, {
		method,
		headers: { authorization: `Bearer ${SECRET}`, 'content-type': 'application/json' },
		body: body ? JSON.stringify(body) : undefined,
	});
	const json = await res.json().catch(() => null);
	if (!res.ok) {
		throw new Error(`HTTP ${res.status}: ${json ? JSON.stringify(json) : '(no body)'}`);
	}
	return json;
}

const sol = (n) => (n == null ? '—' : `${Number(n).toFixed(4)} SOL`);

function printStatus(s) {
	const c = s.config || {};
	console.log(`\n  Launcher @ ${ORIGIN}`);
	console.log(`  ─────────────────────────────────────────────`);
	console.log(`  armed:        ${s.armed ? 'YES — live, moving real SOL' : 'no'}`);
	console.log(`  enabled:      ${c.enabled}    dry_run: ${c.dry_run}    paused: ${c.paused}${c.pause_reason ? ` (${c.pause_reason})` : ''}`);
	console.log(`  mode:         ${c.mode}    network: ${c.network}`);
	console.log(`  cadence:      every ${c.target_cadence_seconds}s    max/hr: ${c.max_per_hour}`);
	console.log(`  per launch:   ${sol(c.per_launch_sol)}    dev buy: ${sol(c.dev_buy_sol)}    daily cap: ${sol(c.daily_sol_cap)}`);
	console.log(`  buyback:      ${c.buyback_bps} bps`);
	console.log(`  master wallet:${sol(s.master_balance_sol)}    queue (ready agents): ${s.queue_enabled}`);
	if (s.stats) {
		const st = s.stats;
		console.log(`  today:        ${st.launched_today ?? 0} launched · ${st.dry_runs_today ?? 0} dry · ${st.skipped_today ?? 0} skipped · ${st.failed_today ?? 0} failed · ${sol(st.sol_spent_today)} spent`);
	}
	if (s.narratives?.top) {
		console.log(`  riding now:   ${s.narratives.top.term || s.narratives.top}`);
	}
	const runs = s.console || [];
	if (runs.length) {
		console.log(`\n  last ${Math.min(8, runs.length)} runs:`);
		for (const r of runs.slice(0, 8)) {
			const when = new Date(r.created_at).toISOString().slice(5, 16).replace('T', ' ');
			const who = r.agent_name || r.agent_id?.slice(0, 8) || '—';
			const tail = r.mint ? `mint ${r.mint.slice(0, 8)}…` : r.error ? `err: ${r.error.slice(0, 60)}` : '';
			console.log(`    ${when}  ${String(r.status).padEnd(9)} ${who} → $${r.symbol || '?'} ${tail}`);
		}
	}
	console.log('');
}

function armBody({ dryRun }) {
	const body = { enabled: true, dry_run: dryRun };
	const map = {
		network: flag('network'),
		mode: flag('mode'),
		target_cadence_seconds: flag('cadence'),
		max_per_hour: flag('max-per-hour'),
		per_launch_sol: flag('per-launch-sol'),
		dev_buy_sol: flag('dev-buy-sol'),
		daily_sol_cap: flag('daily-cap-sol'),
		buyback_bps: flag('buyback-bps'),
	};
	const numeric = new Set(['target_cadence_seconds', 'max_per_hour', 'per_launch_sol', 'dev_buy_sol', 'daily_sol_cap', 'buyback_bps']);
	for (const [k, v] of Object.entries(map)) {
		if (v == null) continue;
		body[k] = numeric.has(k) ? Number(v) : v;
	}
	return body;
}

try {
	switch (cmd) {
		case 'status': {
			printStatus(await call('GET'));
			break;
		}
		case 'dry': {
			const r = await call('POST', armBody({ dryRun: true }));
			console.log(`Rehearsal mode on (enabled + dry_run). armed=${r.armed}. Run "tick" then "status" to watch it pick coins without spending.`);
			break;
		}
		case 'arm': {
			const body = armBody({ dryRun: false });
			console.log('Arming LIVE — this moves real SOL on', body.network || '(saved network)', 'and mints real coins.');
			const r = await call('POST', body);
			console.log(`armed=${r.armed}. The minute cron will pick it up; or run "tick" to fire immediately.`);
			printStatus(await call('GET'));
			break;
		}
		case 'disarm': {
			const r = await call('POST', { enabled: false });
			console.log(`Disarmed. enabled=${r.config?.enabled}. No new launches; in-flight runs already recorded are unaffected.`);
			break;
		}
		case 'resume': {
			const r = await call('POST', { action: 'resume' });
			console.log(`Breaker cleared. paused=${r.config?.paused}.`);
			break;
		}
		case 'tick': {
			const r = await call('POST', { action: 'force_tick' });
			console.log('tick:', JSON.stringify(r.tick, null, 2));
			break;
		}
		default:
			console.error(`Unknown command "${cmd}". Use: status | dry | tick | arm | disarm | resume`);
			process.exit(1);
	}
} catch (e) {
	console.error('FAILED:', e.message);
	process.exit(1);
}

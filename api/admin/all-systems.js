// GET /api/admin/all-systems
//
// Single endpoint that checks every running system in parallel and returns
// a unified health picture. Auth: session+admin OR Bearer $CRON_SECRET.
//
// Each check returns:
//   { name, category, status: 'ok'|'warn'|'down', count?, last?, detail? }
//
// Status thresholds:
//   ok   — recent activity or heartbeat is fresh
//   warn — activity exists but is stale / lower than expected
//   down — no activity within the staleness window or query failed

import { sql } from '../_lib/db.js';
import { requireAdmin } from '../_lib/admin.js';
import { cors, json, method, wrap } from '../_lib/http.js';
import { env } from '../_lib/env.js';
import { constantTimeEquals } from '../_lib/crypto.js';
import { getRedis } from '../_lib/redis.js';

function isCronAuth(req) {
	const auth = req.headers.authorization || '';
	const bearer = auth.toLowerCase().startsWith('bearer ') ? auth.slice(7).trim() : '';
	return !!env.CRON_SECRET && constantTimeEquals(bearer, env.CRON_SECRET);
}

// ── Individual system checks ──────────────────────────────────────────────────

// Generic "count rows created in the last N minutes" check.
async function recentCount(table, minutesOk, minutesWarn, col = 'created_at') {
	try {
		const [row] = await sql`
			select count(*)::int as n from ${sql(table)}
			where ${sql(col)} > now() - (${minutesOk} || ' minutes')::interval
		`;
		const n = row?.n ?? 0;
		if (n > 0) return { status: 'ok', count: n };
		// Nothing in the ok window — check the warn window
		const [warn] = await sql`
			select count(*)::int as n, max(${sql(col)}) as last from ${sql(table)}
			where ${sql(col)} > now() - (${minutesWarn} || ' minutes')::interval
		`;
		if ((warn?.n ?? 0) > 0) return { status: 'warn', count: warn.n, last: warn.last };
		const [last] = await sql`
			select max(${sql(col)}) as last from ${sql(table)}
		`;
		return { status: 'down', count: 0, last: last?.last ?? null };
	} catch (err) {
		return { status: 'down', count: 0, detail: err?.message?.slice(0, 120) };
	}
}

// Bot heartbeat freshness check.
async function heartbeat(worker, okMinutes = 6, warnMinutes = 30) {
	try {
		const [row] = await sql`
			select last_beat_at, mode, meta from bot_heartbeat where worker = ${worker}
		`;
		if (!row) return { status: 'down', detail: 'no heartbeat row' };
		const ageMs = Date.now() - new Date(row.last_beat_at).getTime();
		const ageMins = ageMs / 60_000;
		const status = ageMins <= okMinutes ? 'ok' : ageMins <= warnMinutes ? 'warn' : 'down';
		return { status, last: row.last_beat_at, mode: row.mode, meta: row.meta };
	} catch (err) {
		return { status: 'down', detail: err?.message?.slice(0, 120) };
	}
}

// x402 payments: count from x402_audit_log last 10 min / 60 min.
async function checkX402() {
	try {
		const [r] = await sql`
			select
				count(*) filter (where created_at > now() - interval '10 minutes') as n_10m,
				count(*) filter (where created_at > now() - interval '60 minutes') as n_60m,
				count(*) filter (where created_at > now() - interval '24 hours') as n_24h,
				max(created_at) as last
			from x402_audit_log
			where event_type = 'payment_settled'
		`;
		const n = Number(r?.n_10m ?? 0);
		const n60 = Number(r?.n_60m ?? 0);
		const n24 = Number(r?.n_24h ?? 0);
		const status = n > 0 ? 'ok' : n60 > 0 ? 'warn' : 'down';
		return { status, count_10m: n, count_60m: n60, count_24h: n24, last: r?.last };
	} catch (err) {
		return { status: 'down', detail: err?.message?.slice(0, 120) };
	}
}

// Forge seed: done jobs last 10 / 60 min.
async function checkForgeSeed() {
	try {
		const [r] = await sql`
			select
				count(*) filter (where finished_at > now() - interval '10 minutes') as n_10m,
				count(*) filter (where finished_at > now() - interval '60 minutes') as n_60m,
				count(*) filter (where finished_at > now() - interval '24 hours') as n_24h,
				max(finished_at) as last
			from forge_seed_jobs where status = 'done'
		`;
		const n = Number(r?.n_10m ?? 0);
		const n60 = Number(r?.n_60m ?? 0);
		const n24 = Number(r?.n_24h ?? 0);
		const status = n > 0 ? 'ok' : n60 > 0 ? 'warn' : 'down';
		return { status, count_10m: n, count_60m: n60, count_24h: n24, last: r?.last };
	} catch (err) {
		return { status: 'down', detail: err?.message?.slice(0, 120) };
	}
}

// Club tips: recent tips.
async function checkClubTips() {
	try {
		const [r] = await sql`
			select
				count(*) filter (where created_at > now() - interval '10 minutes') as n_10m,
				count(*) filter (where created_at > now() - interval '60 minutes') as n_60m,
				count(*) filter (where created_at > now() - interval '24 hours') as n_24h,
				max(created_at) as last
			from club_tips
		`;
		const n = Number(r?.n_10m ?? 0);
		const n24 = Number(r?.n_24h ?? 0);
		const status = n > 0 ? 'ok' : Number(r?.n_60m ?? 0) > 0 ? 'warn' : 'down';
		return { status, count_10m: n, count_24h: n24, last: r?.last };
	} catch (err) {
		return { status: 'down', detail: err?.message?.slice(0, 120) };
	}
}

// Pump launches + trades.
async function checkPump() {
	try {
		const [mints, trades, buybacks, dist] = await Promise.all([
			sql`select count(*)::int as n_24h, max(created_at) as last from pump_agent_mints
			    where created_at > now() - interval '24 hours'`,
			sql`select count(*)::int as n_24h, max(created_at) as last from pump_agent_trades
			    where created_at > now() - interval '24 hours'`,
			sql`select count(*) filter (where status='confirmed') as ok,
			           count(*) filter (where status='failed') as err,
			           max(created_at) as last
			    from pump_buyback_runs where created_at > now() - interval '24 hours'`,
			sql`select count(*) filter (where status='confirmed') as ok,
			           count(*) filter (where status='failed') as err,
			           max(created_at) as last
			    from pump_distribute_runs where created_at > now() - interval '24 hours'`,
		]);
		const launchCount = mints[0]?.n_24h ?? 0;
		const tradeCount = trades[0]?.n_24h ?? 0;
		const status = tradeCount > 0 ? 'ok' : launchCount > 0 ? 'warn' : 'down';
		return {
			status,
			launches_24h: launchCount,
			trades_24h: tradeCount,
			buybacks: { ok: Number(buybacks[0]?.ok ?? 0), err: Number(buybacks[0]?.err ?? 0), last: buybacks[0]?.last },
			distributes: { ok: Number(dist[0]?.ok ?? 0), err: Number(dist[0]?.err ?? 0), last: dist[0]?.last },
			last: trades[0]?.last,
		};
	} catch (err) {
		return { status: 'down', detail: err?.message?.slice(0, 120) };
	}
}

// Circulation / pulse-tick: agent_custody_events last 10 / 60 min.
async function checkCirculation() {
	try {
		const [r] = await sql`
			select
				count(*) filter (where created_at > now() - interval '10 minutes') as n_10m,
				count(*) filter (where created_at > now() - interval '60 minutes') as n_60m,
				count(*) filter (where created_at > now() - interval '24 hours') as n_24h,
				count(distinct agent_id) filter (where created_at > now() - interval '24 hours') as agents_24h,
				max(created_at) as last
			from agent_custody_events
		`;
		const n = Number(r?.n_10m ?? 0);
		const n24 = Number(r?.n_24h ?? 0);
		const status = n > 0 ? 'ok' : Number(r?.n_60m ?? 0) > 0 ? 'warn' : 'down';
		return { status, count_10m: n, count_24h: n24, active_agents_24h: Number(r?.agents_24h ?? 0), last: r?.last };
	} catch (err) {
		return { status: 'down', detail: err?.message?.slice(0, 120) };
	}
}

// Marketplace: skill/asset purchases (x402_audit_log scoped to marketplace routes).
async function checkMarketplace() {
	try {
		const [r] = await sql`
			select
				count(*) filter (where created_at > now() - interval '60 minutes') as n_60m,
				count(*) filter (where created_at > now() - interval '24 hours') as n_24h,
				max(created_at) as last
			from x402_audit_log
			where event_type = 'payment_settled'
			  and route ilike '%skill%' or route ilike '%marketplace%' or route ilike '%asset%'
		`;
		const n = Number(r?.n_24h ?? 0);
		const status = n > 0 ? 'ok' : 'warn';
		return { status, count_24h: n, last: r?.last };
	} catch (err) {
		return { status: 'down', detail: err?.message?.slice(0, 120) };
	}
}

// x402 seed cron: payments from the seeder via club_tips payer matching.
async function checkX402Seed() {
	try {
		// Club tips is where dance-tip seeds land. Check for any tips in last 5 min.
		const [r] = await sql`
			select
				count(*) filter (where created_at > now() - interval '5 minutes') as n_5m,
				count(*) filter (where created_at > now() - interval '60 minutes') as n_60m,
				count(*) filter (where created_at > now() - interval '24 hours') as n_24h,
				max(created_at) as last
			from club_tips
		`;
		const n5 = Number(r?.n_5m ?? 0);
		const n60 = Number(r?.n_60m ?? 0);
		const n24 = Number(r?.n_24h ?? 0);
		// Cron fires every minute with 60 tips — we expect ≥1 in 5 min window.
		const status = n5 > 0 ? 'ok' : n60 > 0 ? 'warn' : 'down';
		return { status, count_5m: n5, count_60m: n60, count_24h: n24, last: r?.last };
	} catch (err) {
		return { status: 'down', detail: err?.message?.slice(0, 120) };
	}
}

// Redis x402 feed length.
async function checkX402Feed() {
	try {
		const r = getRedis();
		if (!r) return { status: 'warn', detail: 'Redis not configured' };
		const len = await r.llen('x402:pay:feed');
		return { status: len > 0 ? 'ok' : 'warn', feed_depth: len };
	} catch (err) {
		return { status: 'down', detail: err?.message?.slice(0, 120) };
	}
}

// Avatars seeded (source=forge or avaturn_seed) last 24h.
async function checkAvatarSeed() {
	try {
		const [r] = await sql`
			select
				count(*) filter (where created_at > now() - interval '60 minutes') as n_60m,
				count(*) filter (where created_at > now() - interval '24 hours') as n_24h,
				max(created_at) as last
			from avatars
			where visibility = 'public'
			  and source in ('forge', 'avaturn', 'avaturn_seed')
		`;
		const n = Number(r?.n_60m ?? 0);
		const n24 = Number(r?.n_24h ?? 0);
		const status = n > 0 ? 'ok' : n24 > 0 ? 'warn' : 'down';
		return { status, count_60m: n, count_24h: n24, last: r?.last };
	} catch (err) {
		return { status: 'down', detail: err?.message?.slice(0, 120) };
	}
}

// ── Handler ───────────────────────────────────────────────────────────────────

export default wrap(async (req, res) => {
	if (cors(req, res, { methods: 'GET,OPTIONS', credentials: true })) return;
	if (!method(req, res, ['GET'])) return;

	if (!isCronAuth(req)) {
		const admin = await requireAdmin(req, res);
		if (!admin) return;
	}

	// All checks run in parallel — a single slow query never blocks the rest.
	const [
		x402, forgeSeed, avatarSeed, clubTips, x402Seed,
		pump, circulation, marketplace, x402Feed,
		oracleWorker, sniperWorker, pumpMonitor,
	] = await Promise.all([
		checkX402(),
		checkForgeSeed(),
		checkAvatarSeed(),
		checkClubTips(),
		checkX402Seed(),
		checkPump(),
		checkCirculation(),
		checkMarketplace(),
		checkX402Feed(),
		heartbeat('oracle', 6, 30),
		heartbeat('agent-sniper', 6, 30),
		heartbeat('pumpfun-monitor', 6, 30),
	]);

	const systems = [
		// ── Payments ─────────────────────────────────────────────────
		{ name: 'x402 Payments', category: 'payments', icon: 'zap', ...x402 },
		{ name: 'x402 Feed (Redis)', category: 'payments', icon: 'activity', ...x402Feed },
		{ name: 'x402 Seed Cron', category: 'payments', icon: 'repeat', ...x402Seed },

		// ── Club ─────────────────────────────────────────────────────
		{ name: 'Club Tips', category: 'club', icon: 'music', ...clubTips },

		// ── Pump.fun ─────────────────────────────────────────────────
		{ name: 'Pump.fun Activity', category: 'pumpfun', icon: 'trending-up', ...pump },
		{ name: 'Pump Monitor Worker', category: 'pumpfun', icon: 'server', ...pumpMonitor },

		// ── Agents & Circulation ─────────────────────────────────────
		{ name: 'Agent Circulation', category: 'agents', icon: 'refresh-cw', ...circulation },
		{ name: 'Oracle Worker', category: 'agents', icon: 'cpu', ...oracleWorker },
		{ name: 'Agent Sniper Worker', category: 'agents', icon: 'crosshair', ...sniperWorker },

		// ── Content Seeding ──────────────────────────────────────────
		{ name: 'Forge Avatar Seed', category: 'seeding', icon: 'box', ...forgeSeed },
		{ name: 'Avatar Seed (Avaturn)', category: 'seeding', icon: 'user', ...avatarSeed },

		// ── Marketplace ──────────────────────────────────────────────
		{ name: 'Marketplace', category: 'marketplace', icon: 'shopping-bag', ...marketplace },
	];

	const summary = systems.reduce(
		(acc, s) => { acc[s.status] = (acc[s.status] || 0) + 1; return acc; },
		{ ok: 0, warn: 0, down: 0 },
	);

	const overall = summary.down > 0 ? 'degraded' : summary.warn > 0 ? 'partial' : 'healthy';

	return json(res, 200, {
		ok: true,
		overall,
		summary,
		systems,
		checked_at: new Date().toISOString(),
	});
});

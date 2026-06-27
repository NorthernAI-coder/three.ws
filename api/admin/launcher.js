// GET/POST /api/admin/launcher — arm + observe the autonomous coin launcher
// (System B: the platform trend firehose driven by api/_lib/launcher-engine.js).
//
//   GET  → the global launcher_config, the live console (recent launcher_runs),
//          today's spend/throughput stats, master-wallet balance, queue size.
//   POST → upsert the global config (mode, sources, cadence, caps, arm/disarm),
//          or { action: 'resume' } to clear a tripped circuit breaker.
//
// Auth: a real admin session OR `Bearer $CRON_SECRET` (for ops tooling). The
// launcher ships disabled + dry_run; this is the only supported way to arm it,
// so a misclick can't move SOL — enabling real launches takes enabled=true AND
// dry_run=false, set deliberately here.

import { sql } from '../_lib/db.js';
import { requireAdmin } from '../_lib/admin.js';
import { cors, json, error, method, readJson, wrap } from '../_lib/http.js';
import { env } from '../_lib/env.js';
import { constantTimeEquals } from '../_lib/crypto.js';
import { masterBalanceSol, dailySpentSol } from '../_lib/launcher-funding.js';

function isCronAuth(req) {
	const auth = req.headers.authorization || '';
	const bearer = auth.toLowerCase().startsWith('bearer ') ? auth.slice(7).trim() : '';
	return !!env.CRON_SECRET && constantTimeEquals(bearer, env.CRON_SECRET);
}

const MODES = ['off', 'trend', 'meme', 'random', 'hybrid'];
const KNOWN_SOURCES = ['coin_intel', 'trending', 'x', 'oracle', 'knowyourmeme', 'hackernews', 'reddit', 'wikipedia'];

async function ensureGlobalRow() {
	await sql`
		insert into launcher_config (scope, enabled, dry_run, mode)
		values ('global', false, true, 'hybrid')
		on conflict do nothing
	`;
}

export default wrap(async (req, res) => {
	if (cors(req, res, { methods: 'GET,POST,OPTIONS', credentials: true })) return;
	if (!method(req, res, ['GET', 'POST'])) return;

	if (!isCronAuth(req)) {
		const admin = await requireAdmin(req, res);
		if (!admin) return;
	}

	await ensureGlobalRow();

	if (req.method === 'GET') return getState(res);
	return postConfig(req, res);
});

async function getState(res) {
	const [config] = await sql`select * from launcher_config where scope = 'global' limit 1`;
	const network = config?.network || 'mainnet';

	const [recent, stats, queue, master] = await Promise.all([
		sql`
			select id, agent_id, kind, trigger_source, name, symbol, mint, network,
			       sol_spent, status, dry_run, tx_signature, error, created_at
			from launcher_runs
			where scope = 'global'
			order by created_at desc
			limit 50
		`,
		sql`
			select
				count(*)::int as runs_today,
				count(*) filter (where status in ('launched','confirmed'))::int as launched_today,
				count(*) filter (where status = 'dry_run')::int as dry_runs_today,
				count(*) filter (where status = 'skipped')::int as skipped_today,
				count(*) filter (where status = 'failed')::int as failed_today,
				coalesce(sum(sol_spent),0)::float8 as sol_spent_today
			from launcher_runs
			where scope = 'global' and created_at >= date_trunc('day', now())
		`,
		sql`select count(*)::int as enabled from launcher_queue where scope = 'global' and enabled = true`,
		masterBalanceSol(network).catch(() => null),
	]);

	const spentToday = await dailySpentSol('global', null).catch(() => 0);

	return json(res, 200, {
		config: config || null,
		console: recent,
		stats: {
			...(stats[0] || {}),
			sol_remaining_today: config ? Math.max(0, Number(config.daily_sol_cap) - spentToday) : null,
		},
		queue_enabled: queue[0]?.enabled ?? 0,
		master_balance_sol: master,
		armed: !!(config?.enabled && !config?.dry_run && !config?.paused),
	});
}

async function postConfig(req, res) {
	const body = (await readJson(req).catch(() => ({}))) || {};

	// Clear a tripped breaker without otherwise touching the config.
	if (body.action === 'resume') {
		const [row] = await sql`
			update launcher_config set paused = false, pause_reason = null, updated_at = now()
			where scope = 'global' returning *
		`;
		return json(res, 200, { ok: true, config: row });
	}

	// Validate everything before writing.
	if (body.mode != null && !MODES.includes(body.mode)) {
		return error(res, 400, 'invalid_mode', `mode must be one of ${MODES.join(', ')}`);
	}
	if (body.network != null && !['mainnet', 'devnet'].includes(body.network)) {
		return error(res, 400, 'invalid_network', 'network must be mainnet or devnet');
	}
	if (body.sources != null && (!Array.isArray(body.sources) || body.sources.some((s) => !KNOWN_SOURCES.includes(s)))) {
		return error(res, 400, 'invalid_sources', `sources must be a subset of ${KNOWN_SOURCES.join(', ')}`);
	}
	if (body.categories != null && !Array.isArray(body.categories)) {
		return error(res, 400, 'invalid_categories', 'categories must be an array');
	}
	const num = (v, lo, hi) => {
		const n = Number(v);
		return Number.isFinite(n) && n >= lo && (hi == null || n <= hi);
	};
	if (body.target_cadence_seconds != null && !num(body.target_cadence_seconds, 5, 86_400)) {
		return error(res, 400, 'invalid_cadence', 'target_cadence_seconds must be 5..86400');
	}
	if (body.max_per_hour != null && !num(body.max_per_hour, 0, 100_000)) {
		return error(res, 400, 'invalid_max_per_hour', 'max_per_hour must be >= 0');
	}
	if (body.per_launch_sol != null && !num(body.per_launch_sol, 0, 50)) {
		return error(res, 400, 'invalid_per_launch_sol', 'per_launch_sol must be 0..50');
	}
	if (body.dev_buy_sol != null && !num(body.dev_buy_sol, 0, 50)) {
		return error(res, 400, 'invalid_dev_buy_sol', 'dev_buy_sol must be 0..50');
	}
	if (body.daily_sol_cap != null && !num(body.daily_sol_cap, 0, 100_000)) {
		return error(res, 400, 'invalid_daily_sol_cap', 'daily_sol_cap must be >= 0');
	}
	if (body.buyback_bps != null && !num(body.buyback_bps, 0, 10_000)) {
		return error(res, 400, 'invalid_buyback_bps', 'buyback_bps must be 0..10000');
	}

	const [cur] = await sql`select * from launcher_config where scope = 'global' limit 1`;

	// Partial update: only fields present in the body change.
	const has = (k) => Object.prototype.hasOwnProperty.call(body, k);
	const next = {
		enabled: has('enabled') ? Boolean(body.enabled) : cur.enabled,
		dry_run: has('dry_run') ? Boolean(body.dry_run) : cur.dry_run,
		mode: has('mode') ? body.mode : cur.mode,
		sources: has('sources') ? JSON.stringify(body.sources) : JSON.stringify(cur.sources),
		categories: has('categories') ? JSON.stringify(body.categories) : JSON.stringify(cur.categories),
		target_cadence_seconds: has('target_cadence_seconds') ? Math.round(Number(body.target_cadence_seconds)) : cur.target_cadence_seconds,
		max_per_hour: has('max_per_hour') ? Math.round(Number(body.max_per_hour)) : cur.max_per_hour,
		per_launch_sol: has('per_launch_sol') ? Number(body.per_launch_sol) : cur.per_launch_sol,
		dev_buy_sol: has('dev_buy_sol') ? Number(body.dev_buy_sol) : cur.dev_buy_sol,
		daily_sol_cap: has('daily_sol_cap') ? Number(body.daily_sol_cap) : cur.daily_sol_cap,
		buyback_bps: has('buyback_bps') ? Math.round(Number(body.buyback_bps)) : cur.buyback_bps,
		network: has('network') ? body.network : cur.network,
	};

	const [row] = await sql`
		update launcher_config set
			enabled = ${next.enabled},
			dry_run = ${next.dry_run},
			mode = ${next.mode},
			sources = ${next.sources}::jsonb,
			categories = ${next.categories}::jsonb,
			target_cadence_seconds = ${next.target_cadence_seconds},
			max_per_hour = ${next.max_per_hour},
			per_launch_sol = ${next.per_launch_sol},
			dev_buy_sol = ${next.dev_buy_sol},
			daily_sol_cap = ${next.daily_sol_cap},
			buyback_bps = ${next.buyback_bps},
			network = ${next.network},
			updated_at = now()
		where scope = 'global'
		returning *
	`;

	return json(res, 200, {
		ok: true,
		config: row,
		armed: !!(row.enabled && !row.dry_run && !row.paused),
	});
}

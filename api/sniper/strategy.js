/**
 * Agent Sniper — strategy (arm/config) API.
 *
 *   GET  /api/sniper/strategy            → the caller's sniper strategies + each
 *                                          agent's live position summary.
 *   POST /api/sniper/strategy            → upsert/arm the strategy for one owned agent.
 *
 * Strategy rows (agent_sniper_strategies) are read by the agent-sniper worker
 * (workers/agent-sniper). Arming is an explicit, owner-only opt-in: the agent
 * trades from its OWN wallet with real funds, so a strategy is disabled until
 * the owner sets a budget, a per-trade size, and confirms the risk.
 *
 * Auth: session cookie OR bearer token. Every read/write is scoped to agents
 * the caller owns (agent_identities.user_id).
 */

import { cors, json, method, readJson, wrap, error, rateLimited } from '../_lib/http.js';
import { getSessionUser, authenticateBearer, extractBearer } from '../_lib/auth.js';
import { limits, clientIp } from '../_lib/rate-limit.js';
import { sql } from '../_lib/db.js';
import { solanaConnection } from '../_lib/solana/connection.js';
import { env } from '../_lib/env.js';
import { z } from 'zod';

// Best-effort SOL balance for an agent's Solana wallet. Returns null on any error.
async function getSolBalance(address) {
	if (!address || !env.HELIUS_API_KEY) return null;
	try {
		const conn = solanaConnection();
		const { PublicKey } = await import('@solana/web3.js');
		const lamports = await conn.getBalance(new PublicKey(address));
		return lamports / 1e9;
	} catch {
		return null;
	}
}

async function resolveUserId(req) {
	const session = await getSessionUser(req);
	if (session) return session.id;
	const bearer = await authenticateBearer(extractBearer(req));
	if (bearer) return bearer.userId;
	return null;
}

const lamports = z.union([z.string(), z.number()]);
const optPct = z.union([z.string(), z.number()]).nullable().optional();
const optInt = z.union([z.string(), z.number()]).nullable().optional();

const optLamports = z.union([z.string(), z.number()]).nullable().optional();

const STRATEGY_SCHEMA = z.object({
	agent_id: z.string().uuid(),
	network: z.enum(['mainnet', 'devnet']).default('mainnet'),
	enabled: z.boolean().optional(),
	kill_switch: z.boolean().optional(),
	// trigger: what arms this strategy.
	//   new_mint    — snipe new pump.fun launches off the PumpPortal feed (default).
	//   first_claim — snipe a creator's coin the first time they EVER claim rewards.
	trigger: z.enum(['new_mint', 'first_claim']).optional(),
	buy_delay_ms: z.union([z.string(), z.number()]).optional(),
	// first_claim entry filters (null clears)
	min_claim_lamports: optLamports,
	max_claim_lamports: optLamports,
	first_claim_max_age_seconds: optInt,
	// sizing
	daily_budget_lamports: lamports.optional(),
	per_trade_lamports: lamports.optional(),
	max_concurrent_positions: z.union([z.string(), z.number()]).optional(),
	slippage_bps: z.union([z.string(), z.number()]).optional(),
	max_price_impact_pct: z.union([z.string(), z.number()]).optional(),
	// entry filters (null clears)
	min_market_cap_usd: optPct,
	max_market_cap_usd: optPct,
	min_creator_graduated: optInt,
	max_creator_launches: optInt,
	require_socials: z.boolean().optional(),
	require_sol_quote: z.boolean().optional(),
	// exits
	take_profit_pct: optPct,
	stop_loss_pct: z.union([z.string(), z.number()]).optional(),
	trailing_stop_pct: optPct,
	max_hold_seconds: z.union([z.string(), z.number()]).optional(),
	// Oracle conviction gate (0–100, null = skip check)
	min_oracle_score: z.union([z.string(), z.number()]).nullable().optional(),
});

const atomicStr = (v, fallback = '0') => {
	if (v == null) return fallback;
	let s = String(v).trim();
	if (!/^\d+$/.test(s)) {
		const n = Number(s);
		if (!Number.isFinite(n) || n < 0) return fallback;
		s = String(Math.floor(n));
	}
	return s;
};
const intOrNull = (v) => {
	if (v == null || v === '') return null;
	const n = Math.floor(Number(v));
	return Number.isFinite(n) ? n : null;
};
const atomicOrNull = (v) => {
	if (v == null || v === '') return null;
	let s = String(v).trim();
	if (!/^\d+$/.test(s)) {
		const n = Number(s);
		if (!Number.isFinite(n) || n < 0) return null;
		s = String(Math.floor(n));
	}
	return s;
};
const numOrNull = (v) => {
	if (v == null || v === '') return null;
	const n = Number(v);
	return Number.isFinite(n) ? n : null;
};
const clampInt = (v, min, max, def) => {
	const n = Math.floor(Number(v));
	if (!Number.isFinite(n)) return def;
	return Math.min(max, Math.max(min, n));
};

export default wrap(async (req, res) => {
	if (cors(req, res, { methods: 'GET,POST,OPTIONS' })) return;
	if (!method(req, res, ['GET', 'POST'])) return;

	const userId = await resolveUserId(req);
	if (!userId) return error(res, 401, 'unauthorized', 'sign in to manage the sniper');

	const rl = await limits.authIp(clientIp(req));
	if (!rl.success) return rateLimited(res, rl);

	if (req.method === 'POST') return upsertStrategy(req, res, userId);
	return listStrategies(req, res, userId);
});

// ── GET — strategies + live position summary ─────────────────────────────────

async function listStrategies(req, res, userId) {
	const rows = await sql`
		select s.*, a.name as agent_name,
		       a.avatar_url as agent_avatar, a.profile_image_url as agent_image,
		       a.meta->>'solana_address' as solana_address
		from agent_sniper_strategies s
		join agent_identities a on a.id = s.agent_id
		where s.user_id = ${userId}
		order by s.updated_at desc
		limit 100
	`;

	const summary = rows.length
		? await sql`
			select agent_id,
			       count(*) filter (where status in ('opening','open','closing')) as open_positions,
			       count(*) filter (where status = 'closed')                       as closed_positions,
			       coalesce(sum(realized_pnl_lamports),0)::text                     as realized_pnl_lamports,
			       count(*) filter (where exit_reason = 'take_profit')              as wins
			from agent_sniper_positions
			where user_id = ${userId}
			group by agent_id
		`
		: [];
	const byAgent = new Map(summary.map((s) => [s.agent_id, s]));

	// Fetch wallet balances concurrently — best-effort, never block on failure.
	const balances = await Promise.all(
		rows.map((r) => getSolBalance(r.solana_address).catch(() => null)),
	);
	const balanceMap = new Map(rows.map((r, i) => [r.agent_id, balances[i]]));

	const strategies = rows.map((s) => {
		const sum = byAgent.get(s.agent_id);
		return {
			wallet_sol: balanceMap.get(s.agent_id) ?? null,
			wallet_address: s.solana_address || null,
			agent_id: s.agent_id,
			agent_name: s.agent_name,
			image: s.agent_image || s.agent_avatar || null,
			network: s.network,
			enabled: s.enabled,
			kill_switch: s.kill_switch,
			trigger: s.trigger || 'new_mint',
			buy_delay_ms: s.buy_delay_ms ?? 0,
			min_claim_lamports: s.min_claim_lamports != null ? String(s.min_claim_lamports) : null,
			max_claim_lamports: s.max_claim_lamports != null ? String(s.max_claim_lamports) : null,
			first_claim_max_age_seconds: s.first_claim_max_age_seconds ?? null,
			daily_budget_lamports: String(s.daily_budget_lamports),
			per_trade_lamports: String(s.per_trade_lamports),
			max_concurrent_positions: s.max_concurrent_positions,
			slippage_bps: s.slippage_bps,
			max_price_impact_pct: Number(s.max_price_impact_pct),
			min_market_cap_usd: s.min_market_cap_usd != null ? Number(s.min_market_cap_usd) : null,
			max_market_cap_usd: s.max_market_cap_usd != null ? Number(s.max_market_cap_usd) : null,
			min_creator_graduated: s.min_creator_graduated,
			max_creator_launches: s.max_creator_launches,
			require_socials: s.require_socials,
			require_sol_quote: s.require_sol_quote,
			take_profit_pct: s.take_profit_pct != null ? Number(s.take_profit_pct) : null,
			stop_loss_pct: Number(s.stop_loss_pct),
			trailing_stop_pct: s.trailing_stop_pct != null ? Number(s.trailing_stop_pct) : null,
			max_hold_seconds: s.max_hold_seconds,
			min_oracle_score: s.min_oracle_score != null ? Number(s.min_oracle_score) : null,
			summary: {
				open_positions: sum ? Number(sum.open_positions) : 0,
				closed_positions: sum ? Number(sum.closed_positions) : 0,
				realized_pnl_lamports: sum ? sum.realized_pnl_lamports : '0',
				wins: sum ? Number(sum.wins) : 0,
			},
		};
	});

	return json(res, 200, { strategies });
}

// ── POST — upsert/arm strategy ───────────────────────────────────────────────

async function upsertStrategy(req, res, userId) {
	const body = await readJson(req);
	const parsed = STRATEGY_SCHEMA.safeParse(body);
	if (!parsed.success) {
		return error(res, 400, 'bad_request', parsed.error.issues[0]?.message || 'invalid strategy');
	}
	const p = parsed.data;

	// Ownership: the agent must belong to the caller.
	const [agent] = await sql`
		select id from agent_identities
		where id = ${p.agent_id} and user_id = ${userId} and deleted_at is null
		limit 1
	`;
	if (!agent) return error(res, 404, 'not_found', 'agent not found or not owned by you');

	const [existing] = await sql`
		select * from agent_sniper_strategies
		where agent_id = ${p.agent_id} and network = ${p.network} limit 1
	`;
	const cur = existing || {
		enabled: false, kill_switch: false,
		trigger: 'new_mint', buy_delay_ms: 0,
		min_claim_lamports: null, max_claim_lamports: null, first_claim_max_age_seconds: null,
		daily_budget_lamports: '0', per_trade_lamports: '0',
		max_concurrent_positions: 1, slippage_bps: 500, max_price_impact_pct: 10,
		min_market_cap_usd: null, max_market_cap_usd: null,
		min_creator_graduated: null, max_creator_launches: null,
		require_socials: false, require_sol_quote: true,
		take_profit_pct: null, stop_loss_pct: 30, trailing_stop_pct: null,
		max_hold_seconds: 1800,
		min_oracle_score: null,
	};

	const next = {
		enabled: p.enabled ?? cur.enabled,
		kill_switch: p.kill_switch ?? cur.kill_switch,
		trigger: p.trigger ?? cur.trigger,
		buy_delay_ms: p.buy_delay_ms != null ? clampInt(p.buy_delay_ms, 0, 600000, 0) : cur.buy_delay_ms,
		min_claim_lamports: 'min_claim_lamports' in p ? atomicOrNull(p.min_claim_lamports) : (cur.min_claim_lamports != null ? String(cur.min_claim_lamports) : null),
		max_claim_lamports: 'max_claim_lamports' in p ? atomicOrNull(p.max_claim_lamports) : (cur.max_claim_lamports != null ? String(cur.max_claim_lamports) : null),
		first_claim_max_age_seconds: 'first_claim_max_age_seconds' in p ? (p.first_claim_max_age_seconds == null ? null : clampInt(p.first_claim_max_age_seconds, 1, 86400, 300)) : cur.first_claim_max_age_seconds,
		daily_budget_lamports: p.daily_budget_lamports != null ? atomicStr(p.daily_budget_lamports) : String(cur.daily_budget_lamports),
		per_trade_lamports: p.per_trade_lamports != null ? atomicStr(p.per_trade_lamports) : String(cur.per_trade_lamports),
		max_concurrent_positions: p.max_concurrent_positions != null ? clampInt(p.max_concurrent_positions, 1, 50, 1) : cur.max_concurrent_positions,
		slippage_bps: p.slippage_bps != null ? clampInt(p.slippage_bps, 0, 5000, 500) : cur.slippage_bps,
		max_price_impact_pct: p.max_price_impact_pct != null ? Math.min(100, Math.max(0, Number(p.max_price_impact_pct))) : Number(cur.max_price_impact_pct),
		min_market_cap_usd: 'min_market_cap_usd' in p ? numOrNull(p.min_market_cap_usd) : (cur.min_market_cap_usd != null ? Number(cur.min_market_cap_usd) : null),
		max_market_cap_usd: 'max_market_cap_usd' in p ? numOrNull(p.max_market_cap_usd) : (cur.max_market_cap_usd != null ? Number(cur.max_market_cap_usd) : null),
		min_creator_graduated: 'min_creator_graduated' in p ? intOrNull(p.min_creator_graduated) : cur.min_creator_graduated,
		max_creator_launches: 'max_creator_launches' in p ? intOrNull(p.max_creator_launches) : cur.max_creator_launches,
		require_socials: p.require_socials ?? cur.require_socials,
		require_sol_quote: p.require_sol_quote ?? cur.require_sol_quote,
		take_profit_pct: 'take_profit_pct' in p ? numOrNull(p.take_profit_pct) : (cur.take_profit_pct != null ? Number(cur.take_profit_pct) : null),
		stop_loss_pct: p.stop_loss_pct != null ? Number(p.stop_loss_pct) : Number(cur.stop_loss_pct),
		trailing_stop_pct: 'trailing_stop_pct' in p ? numOrNull(p.trailing_stop_pct) : (cur.trailing_stop_pct != null ? Number(cur.trailing_stop_pct) : null),
		max_hold_seconds: p.max_hold_seconds != null ? clampInt(p.max_hold_seconds, 30, 86400, 1800) : cur.max_hold_seconds,
		min_oracle_score: 'min_oracle_score' in p ? (p.min_oracle_score == null || p.min_oracle_score === '' ? null : Math.min(100, Math.max(0, Math.round(Number(p.min_oracle_score))))) : cur.min_oracle_score,
	};

	// Mandatory stop-loss — never let the DB constraint be the first line of defense.
	if (!(next.stop_loss_pct > 0)) {
		return error(res, 400, 'bad_request', 'stop_loss_pct must be greater than 0');
	}
	// A live, armed strategy with no real money makes no sense; guide the owner.
	if (next.enabled && (BigInt(next.daily_budget_lamports) <= 0n || BigInt(next.per_trade_lamports) <= 0n)) {
		return error(res, 400, 'bad_request', 'set a daily_budget_lamports and per_trade_lamports before enabling');
	}
	if (next.enabled && BigInt(next.per_trade_lamports) > BigInt(next.daily_budget_lamports)) {
		return error(res, 400, 'bad_request', 'per_trade_lamports cannot exceed daily_budget_lamports');
	}
	if (next.min_claim_lamports != null && next.max_claim_lamports != null &&
		BigInt(next.min_claim_lamports) > BigInt(next.max_claim_lamports)) {
		return error(res, 400, 'bad_request', 'min_claim_lamports cannot exceed max_claim_lamports');
	}

	const [row] = await sql`
		insert into agent_sniper_strategies
			(agent_id, user_id, network, enabled, kill_switch,
			 trigger, buy_delay_ms, min_claim_lamports, max_claim_lamports, first_claim_max_age_seconds,
			 daily_budget_lamports, per_trade_lamports, max_concurrent_positions,
			 slippage_bps, max_price_impact_pct,
			 min_market_cap_usd, max_market_cap_usd, min_creator_graduated, max_creator_launches,
			 require_socials, require_sol_quote,
			 take_profit_pct, stop_loss_pct, trailing_stop_pct, max_hold_seconds,
			 min_oracle_score, updated_at)
		values
			(${p.agent_id}, ${userId}, ${p.network}, ${next.enabled}, ${next.kill_switch},
			 ${next.trigger}, ${next.buy_delay_ms}, ${next.min_claim_lamports}, ${next.max_claim_lamports}, ${next.first_claim_max_age_seconds},
			 ${next.daily_budget_lamports}, ${next.per_trade_lamports}, ${next.max_concurrent_positions},
			 ${next.slippage_bps}, ${next.max_price_impact_pct},
			 ${next.min_market_cap_usd}, ${next.max_market_cap_usd}, ${next.min_creator_graduated}, ${next.max_creator_launches},
			 ${next.require_socials}, ${next.require_sol_quote},
			 ${next.take_profit_pct}, ${next.stop_loss_pct}, ${next.trailing_stop_pct}, ${next.max_hold_seconds},
			 ${next.min_oracle_score}, now())
		on conflict (agent_id, network) do update set
			enabled                  = excluded.enabled,
			kill_switch              = excluded.kill_switch,
			trigger                  = excluded.trigger,
			buy_delay_ms             = excluded.buy_delay_ms,
			min_claim_lamports       = excluded.min_claim_lamports,
			max_claim_lamports       = excluded.max_claim_lamports,
			first_claim_max_age_seconds = excluded.first_claim_max_age_seconds,
			daily_budget_lamports    = excluded.daily_budget_lamports,
			per_trade_lamports       = excluded.per_trade_lamports,
			max_concurrent_positions = excluded.max_concurrent_positions,
			slippage_bps             = excluded.slippage_bps,
			max_price_impact_pct     = excluded.max_price_impact_pct,
			min_market_cap_usd       = excluded.min_market_cap_usd,
			max_market_cap_usd       = excluded.max_market_cap_usd,
			min_creator_graduated    = excluded.min_creator_graduated,
			max_creator_launches     = excluded.max_creator_launches,
			require_socials          = excluded.require_socials,
			require_sol_quote        = excluded.require_sol_quote,
			take_profit_pct          = excluded.take_profit_pct,
			stop_loss_pct            = excluded.stop_loss_pct,
			trailing_stop_pct        = excluded.trailing_stop_pct,
			max_hold_seconds         = excluded.max_hold_seconds,
			min_oracle_score         = excluded.min_oracle_score,
			updated_at               = now()
		returning *
	`;

	return json(res, 200, {
		ok: true,
		strategy: {
			agent_id: row.agent_id,
			network: row.network,
			enabled: row.enabled,
			kill_switch: row.kill_switch,
			trigger: row.trigger || 'new_mint',
			buy_delay_ms: row.buy_delay_ms ?? 0,
			min_claim_lamports: row.min_claim_lamports != null ? String(row.min_claim_lamports) : null,
			max_claim_lamports: row.max_claim_lamports != null ? String(row.max_claim_lamports) : null,
			first_claim_max_age_seconds: row.first_claim_max_age_seconds ?? null,
			daily_budget_lamports: String(row.daily_budget_lamports),
			per_trade_lamports: String(row.per_trade_lamports),
			max_concurrent_positions: row.max_concurrent_positions,
			slippage_bps: row.slippage_bps,
			max_price_impact_pct: Number(row.max_price_impact_pct),
			min_market_cap_usd: row.min_market_cap_usd != null ? Number(row.min_market_cap_usd) : null,
			max_market_cap_usd: row.max_market_cap_usd != null ? Number(row.max_market_cap_usd) : null,
			min_creator_graduated: row.min_creator_graduated,
			max_creator_launches: row.max_creator_launches,
			require_socials: row.require_socials,
			require_sol_quote: row.require_sol_quote,
			take_profit_pct: row.take_profit_pct != null ? Number(row.take_profit_pct) : null,
			stop_loss_pct: Number(row.stop_loss_pct),
			trailing_stop_pct: row.trailing_stop_pct != null ? Number(row.trailing_stop_pct) : null,
			max_hold_seconds: row.max_hold_seconds,
			min_oracle_score: row.min_oracle_score != null ? Number(row.min_oracle_score) : null,
		},
	});
}

/**
 * GET /api/agents/:id/achievements
 *
 * The agent's earned + locked achievements, computed from REAL platform data:
 *   · coins launched               (pump_agent_mints)
 *   · graduations / migrations     (live pump.fun coin `complete` + AMM pool)
 *   · peak market cap reached       (live pump.fun usd_market_cap)
 *   · distinct supporters / payments (pump_agent_payments)
 *   · buyback-and-burn runs         (pump_buyback_runs)
 *   · reputation tier               (wallet-reputation, best-effort)
 *   · tenure                        (agent_identities.created_at)
 *
 * Pure scoring lives in api/_lib/agent-achievements.js. Public read — the badges
 * are a trust signal others rely on, so owner and visitor see the same set.
 * Short-cached (Redis) because the live market lookups are the slow part.
 */

import { cors, json, error, method, wrap, rateLimited } from '../../_lib/http.js';
import { limits, clientIp } from '../../_lib/rate-limit.js';
import { getRedis } from '../../_lib/redis.js';
import { sql } from '../../_lib/db.js';
import { isUuid } from '../../_lib/validate.js';
import { computeAchievements, isLaunchGraduated } from '../../_lib/agent-achievements.js';

const PUMP_FRONTEND_BASE = 'https://frontend-api-v3.pump.fun';
const CACHE_TTL_S = 120;
// Cap the live market lookups so a creator with dozens of launches can't fan out
// into dozens of upstream calls per request. Newest 30 covers every milestone in
// practice; older launches that already graduated keep the badge regardless.
const MARKET_LOOKUP_CAP = 30;

/** Live pump.fun coin object for a mint, or null on any failure (best-effort). */
async function fetchCoin(mint) {
	try {
		const resp = await fetch(new URL(`/coins/${mint}`, PUMP_FRONTEND_BASE), {
			headers: { accept: 'application/json' },
			signal: AbortSignal.timeout(7000),
		});
		if (!resp.ok) return null;
		return await resp.json();
	} catch {
		return null;
	}
}

export const handleAchievements = wrap(async (req, res, agentId) => {
	if (cors(req, res, { methods: 'GET,OPTIONS', origins: '*' })) return;
	if (!method(req, res, ['GET'])) return;
	if (!isUuid(String(agentId || ''))) return error(res, 404, 'not_found', 'agent not found');

	const rl = await limits.publicIp(clientIp(req));
	if (!rl.success) return rateLimited(res, rl);

	const cacheKey = `agent-achievements:v1:${agentId}`;
	const redis = await getRedis();
	if (redis) {
		try {
			const cached = await redis.get(cacheKey);
			if (cached) {
				res.setHeader('X-Cache', 'HIT');
				res.setHeader('cache-control', 'public, max-age=60');
				return json(res, 200, cached);
			}
		} catch {
			/* cache miss — recompute */
		}
	}

	// Agent must exist (and not be soft-deleted) for the page to mean anything.
	const [agent] = await sql`
		SELECT id, name, created_at
		FROM agent_identities
		WHERE id = ${agentId} AND deleted_at IS NULL
	`;
	if (!agent) return error(res, 404, 'not_found', 'agent not found');

	// Pull every launch, plus aggregate supporter + burn stats across all of this
	// agent's mints, in parallel — three independent reads, one round trip each.
	const [launchRows, [paymentStats], [burnStats]] = await Promise.all([
		sql`
			SELECT mint, network, created_at
			FROM pump_agent_mints
			WHERE agent_id = ${agentId}
			ORDER BY created_at DESC
		`,
		sql`
			SELECT
				count(*) FILTER (WHERE p.status='confirmed')::int                     AS confirmed_payments,
				count(DISTINCT p.payer_wallet) FILTER (WHERE p.status='confirmed')::int AS unique_payers
			FROM pump_agent_payments p
			JOIN pump_agent_mints m ON m.id = p.mint_id
			WHERE m.agent_id = ${agentId}
		`,
		sql`
			SELECT count(*) FILTER (WHERE b.status='confirmed')::int AS runs
			FROM pump_buyback_runs b
			JOIN pump_agent_mints m ON m.id = b.mint_id
			WHERE m.agent_id = ${agentId}
		`,
	]);

	// Enrich each launch with live market data (graduation + market cap). Only
	// mainnet mints have a pump.fun market; devnet launches stay non-graduated
	// with no mcap. Capped + parallel + best-effort so the endpoint never hangs
	// or fails on an upstream blip.
	const mainnet = launchRows.filter((r) => r.network !== 'devnet').slice(0, MARKET_LOOKUP_CAP);
	const coins = await Promise.all(mainnet.map((r) => fetchCoin(r.mint)));
	const marketByMint = new Map();
	mainnet.forEach((r, i) => marketByMint.set(r.mint, coins[i]));

	const launches = launchRows.map((r) => {
		const coin = marketByMint.get(r.mint);
		const mcap = Number(coin?.usd_market_cap);
		return {
			mint: r.mint,
			network: r.network,
			created_at: r.created_at,
			graduated: r.network !== 'devnet' && isLaunchGraduated(coin),
			mcap: Number.isFinite(mcap) ? mcap : 0,
		};
	});

	// Reputation tier — best-effort. The reputation read does on-chain + ledger
	// work, so a failure (or slow upstream) must never block the achievements:
	// the two reputation badges simply stay locked.
	let reputation = null;
	try {
		const { getAgentReputation } = await import('../../_lib/trust/wallet-reputation.js');
		const { TIERS } = await import('../../../src/shared/agent-financial-reputation.js');
		const rep = await getAgentReputation(agentId);
		if (rep && rep.tier) {
			reputation = {
				tier: rep.tier,
				tierLabel: rep.tierLabel || TIERS[rep.tier]?.label || rep.tier,
				rank: TIERS[rep.tier]?.rank ?? 0,
				score: rep.score ?? null,
			};
		}
	} catch {
		reputation = null;
	}

	const result = computeAchievements({
		agentCreatedAt: agent.created_at,
		launches,
		payments: paymentStats || {},
		burns: burnStats || {},
		reputation,
	});

	const body = {
		agent_id: agent.id,
		name: agent.name,
		...result,
		computed_at: new Date().toISOString(),
	};

	if (redis) {
		try {
			await redis.set(cacheKey, body, { ex: CACHE_TTL_S });
		} catch {
			/* cache write best-effort */
		}
	}
	res.setHeader('cache-control', 'public, max-age=60');
	return json(res, 200, body);
});

export default handleAchievements;

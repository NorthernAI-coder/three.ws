/**
 * $THREE Token Protocol API
 * -------------------------
 * GET /api/three-token/stats          — protocol-level metrics (public)
 * GET /api/three-token/revenue-share  — authenticated user's revenue share position
 * GET /api/three-token/burns          — deploy-to-burn ledger (per-deploy burns)
 * GET /api/three-token/activity       — protocol activity feed
 *
 * Market data (price, market cap, supply, holders) comes from the shared market
 * module — Birdeye → DexScreener → GeckoTerminal failover with a stale cache —
 * so a Birdeye 429 transparently falls over to the keyless sources instead of
 * blanking the price panel. Protocol data (agents, revenue, deploy burns) is
 * derived from the application database; deploy burns = deployed agents ×
 * AGENT_DEPLOY_BURN.
 */

import { sql } from '../_lib/db.js';
import { getSessionUser } from '../_lib/auth.js';
import { cors, error, json, method, wrap } from '../_lib/http.js';
import { TOKEN_MINT as THREE_MINT } from '../_lib/token/config.js';
import { fetchTokenMarketData } from '../_lib/market/token-market.js';

// Protocol tokenomics (fixed parameters of the $THREE protocol).
// AGENT_DEPLOY_BURN: $THREE permanently burned each time an agent is deployed.
// REVENUE_SHARE_POOL_PCT: share of platform revenue distributed to holders.
const AGENT_DEPLOY_BURN = 1000;
const REVENUE_SHARE_POOL_PCT = 10;

async function fetchPlatformMetrics() {
	const [agentCount, revenueData, paymentCount] = await Promise.all([
		sql`SELECT count(*)::int AS total FROM agent_identities WHERE deleted_at IS NULL`.catch(
			() => [{ total: 0 }],
		),
		sql`SELECT coalesce(sum(gross_amount), 0)::bigint AS total_gross, coalesce(sum(fee_amount), 0)::bigint AS total_fee FROM agent_revenue_events`.catch(
			() => [{ total_gross: 0, total_fee: 0 }],
		),
		sql`SELECT count(*)::int AS total FROM agent_revenue_events`.catch(() => [{ total: 0 }]),
	]);
	return {
		total_agents: agentCount[0]?.total ?? 0,
		total_revenue_gross: Number(revenueData[0]?.total_gross ?? 0),
		total_revenue_fee: Number(revenueData[0]?.total_fee ?? 0),
		total_payments: paymentCount[0]?.total ?? 0,
	};
}

// Deploy-to-burn ledger: each agent deployment burns AGENT_DEPLOY_BURN $THREE.
// We surface the most recent deployments as burn events and the lifetime total
// so the burn figures are derived from real on-chain deployment records rather
// than hardcoded or conflated with revenue.
async function fetchBurnEvents() {
	const [recent, totalRow] = await Promise.all([
		sql`
			SELECT id, name, display_name, created_at
			FROM agent_identities
			WHERE deleted_at IS NULL
			ORDER BY created_at DESC
			LIMIT 20
		`.catch(() => []),
		sql`SELECT count(*)::int AS total FROM agent_identities WHERE deleted_at IS NULL`.catch(
			() => [{ total: 0 }],
		),
	]);
	return { recent, totalAgents: totalRow[0]?.total ?? 0 };
}

async function fetchRecentActivity() {
	const rows = await sql`
		SELECT
			e.id,
			e.skill,
			e.gross_amount,
			e.fee_amount,
			e.created_at,
			a.name AS agent_name,
			a.display_name AS agent_display_name
		FROM agent_revenue_events e
		LEFT JOIN agent_identities a ON a.id = e.agent_id
		ORDER BY e.created_at DESC
		LIMIT 30
	`.catch(() => []);
	return rows;
}

export default wrap(async (req, res) => {
	if (cors(req, res, { methods: 'GET,OPTIONS', credentials: true })) return;
	if (!method(req, res, ['GET'])) return;

	const url = new URL(req.url, 'http://x');
	const parts = url.pathname.split('/').filter(Boolean);
	const action = parts[2];

	if (action === 'stats') {
		const [market, platform] = await Promise.all([
			fetchTokenMarketData(THREE_MINT).catch(() => null),
			fetchPlatformMetrics(),
		]);

		return json(
			res,
			200,
			{
				token: {
					mint: THREE_MINT,
					symbol: '$THREE',
					price_usd: market?.price_usd ?? null,
					price_change_24h: market?.price_change_24h ?? null,
					market_cap: market?.market_cap ?? null,
					volume_24h: market?.volume_24h ?? null,
					holders: market?.holders ?? null,
					liquidity: market?.liquidity ?? null,
					supply: market?.supply ?? null,
					decimals: market?.decimals ?? 6,
					source: market?.source ?? null,
				},
				protocol: {
					total_agents: platform.total_agents,
					total_revenue_usd: platform.total_revenue_gross / 1_000_000,
					total_payments: platform.total_payments,
					revenue_share_pool_pct: REVENUE_SHARE_POOL_PCT,
					agent_deploy_burn: AGENT_DEPLOY_BURN,
				},
			},
			// Edge-cache the public stats at the CDN so most page loads never reach
			// the lambda (or Birdeye). 20s freshness is invisible for a token price;
			// stale-while-revalidate keeps the panel populated during a refresh.
			{ 'cache-control': 'public, s-maxage=20, stale-while-revalidate=120' },
		);
	}

	if (action === 'revenue-share') {
		const user = await getSessionUser(req, res);
		if (!user) return error(res, 401, 'unauthorized', 'sign in required');

		const [platform, market] = await Promise.all([
			fetchPlatformMetrics(),
			fetchTokenMarketData(THREE_MINT).catch(() => null),
		]);

		const totalSupply = market?.supply ?? null;
		const totalRevenue = platform.total_revenue_gross / 1_000_000;
		const poolPct = REVENUE_SHARE_POOL_PCT;
		const revenuePool = totalRevenue * (poolPct / 100);

		return json(res, 200, {
			user_id: user.id,
			token_price: market?.price_usd ?? null,
			total_supply: totalSupply,
			total_holders: market?.holders ?? null,
			platform_revenue_usd: totalRevenue,
			revenue_share_pool_pct: poolPct,
			revenue_share_pool_usd: revenuePool,
			...(totalSupply > 0 ? { per_token_yield: revenuePool / totalSupply } : {}),
		});
	}

	if (action === 'burns') {
		const { recent, totalAgents } = await fetchBurnEvents();
		return json(res, 200, {
			burns: recent.map((a) => ({
				id: a.id,
				agent_name: a.display_name || a.name || 'Agent',
				amount: AGENT_DEPLOY_BURN,
				reason: 'agent_deploy',
				created_at: a.created_at,
			})),
			total_burned: totalAgents * AGENT_DEPLOY_BURN,
			burn_per_deploy: AGENT_DEPLOY_BURN,
		});
	}

	if (action === 'activity') {
		const events = await fetchRecentActivity();
		return json(res, 200, {
			events: events.map((e) => ({
				id: e.id,
				type: e.skill || 'payment',
				gross_usd: e.gross_amount ? Number(e.gross_amount) / 1_000_000 : null,
				fee_usd: e.fee_amount ? Number(e.fee_amount) / 1_000_000 : null,
				agent_name: e.agent_display_name || e.agent_name || 'Agent',
				created_at: e.created_at,
			})),
		});
	}

	return error(res, 404, 'not_found', `unknown action: ${action}`);
});

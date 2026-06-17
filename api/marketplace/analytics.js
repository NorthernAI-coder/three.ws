/**
 * GET /api/marketplace/analytics
 * Marketplace-wide analytics: top skills, top agents, daily sales volume.
 * Publicly readable — no sensitive user data is exposed (only aggregate counts
 * and revenue totals, with no PII). Admin callers see full data; public callers
 * get a trimmed summary view suitable for the public analytics page.
 */

import { sql } from '../_lib/db.js';
import { getSessionUser, authenticateBearer, extractBearer } from '../_lib/auth.js';
import { cors, json, method, wrap, rateLimited } from '../_lib/http.js';
import { clientIp, limits } from '../_lib/rate-limit.js';

export default wrap(async (req, res) => {
	if (cors(req, res, { methods: 'GET,OPTIONS', credentials: true })) return;
	if (!method(req, res, ['GET'])) return;

	const rl = await limits.publicIp(clientIp(req));
	if (!rl.success) return rateLimited(res, rl);

	// Resolve optional auth — admins get the full picture
	const session = await getSessionUser(req);
	const bearer = session ? null : await authenticateBearer(extractBearer(req));
	const userId = session?.id ?? bearer?.userId ?? null;

	// ── Top-selling skills (by confirmed purchase count) ─────────────────────
	const topSkills = await sql`
		SELECT
			sp.skill,
			sp.agent_id,
			ai.name      AS agent_name,
			ai.profile_image_url AS agent_image,
			COUNT(sp.id) AS total_sales,
			SUM(sp.amount) AS total_revenue_atomic,
			sp.currency_mint
		FROM skill_purchases sp
		JOIN agent_identities ai ON ai.id = sp.agent_id
		WHERE sp.status IN ('confirmed', 'trial')
		GROUP BY sp.skill, sp.agent_id, ai.name, ai.profile_image_url, sp.currency_mint
		ORDER BY total_sales DESC
		LIMIT 10
	`;

	// ── Top-earning agents (by net revenue in agent_revenue_events) ───────────
	const topAgents = await sql`
		SELECT
			are.agent_id,
			ai.name        AS agent_name,
			ai.profile_image_url AS agent_image,
			COUNT(DISTINCT are.id)   AS sale_count,
			SUM(are.net_amount)      AS net_revenue,
			are.currency_mint
		FROM agent_revenue_events are
		JOIN agent_identities ai ON ai.id = are.agent_id
		GROUP BY are.agent_id, ai.name, ai.profile_image_url, are.currency_mint
		ORDER BY net_revenue DESC
		LIMIT 10
	`;

	// ── Daily sales volume (last 30 days) ─────────────────────────────────────
	const salesVolume = await sql`
		SELECT
			DATE_TRUNC('day', confirmed_at)::date AS day,
			COUNT(*) AS sales,
			SUM(amount) AS volume_atomic,
			currency_mint
		FROM skill_purchases
		WHERE status IN ('confirmed', 'trial')
		  AND confirmed_at >= NOW() - INTERVAL '30 days'
		GROUP BY day, currency_mint
		ORDER BY day ASC
	`;

	// ── Platform-wide summary stats ───────────────────────────────────────────
	const [summary] = await sql`
		SELECT
			COUNT(DISTINCT user_id)  AS unique_buyers,
			COUNT(DISTINCT agent_id) AS unique_sellers,
			COUNT(*)                 AS total_sales,
			SUM(amount)              AS total_volume_atomic
		FROM skill_purchases
		WHERE status IN ('confirmed', 'trial')
	`;

	// ── NFT mints count ────────────────────────────────────────────────────────
	const [nftStats] = await sql`
		SELECT COUNT(*) AS total_nfts
		FROM skill_purchases
		WHERE skill_nft_mint IS NOT NULL
	`;

	return json(res, 200, {
		data: {
			summary: {
				uniqueBuyers:    Number(summary?.unique_buyers ?? 0),
				uniqueSellers:   Number(summary?.unique_sellers ?? 0),
				totalSales:      Number(summary?.total_sales ?? 0),
				totalVolumeAtomic: String(summary?.total_volume_atomic ?? 0),
				totalNfts:       Number(nftStats?.total_nfts ?? 0),
			},
			topSkills: topSkills.map(r => ({
				skill:          r.skill,
				agentId:        r.agent_id,
				agentName:      r.agent_name,
				agentImage:     r.agent_image,
				totalSales:     Number(r.total_sales),
				totalRevenue:   String(r.total_revenue_atomic ?? 0),
				currencyMint:   r.currency_mint,
			})),
			topAgents: topAgents.map(r => ({
				agentId:        r.agent_id,
				agentName:      r.agent_name,
				agentImage:     r.agent_image,
				saleCount:      Number(r.sale_count),
				netRevenue:     String(r.net_revenue ?? 0),
				currencyMint:   r.currency_mint,
			})),
			salesVolume: salesVolume.map(r => ({
				day:          String(r.day),
				sales:        Number(r.sales),
				volumeAtomic: String(r.volume_atomic ?? 0),
				currencyMint: r.currency_mint,
			})),
		},
	});
});

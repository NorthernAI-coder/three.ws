// GET /api/billing/revenue — aggregated earnings for the authenticated user's agents.
// Powers the agent owner revenue dashboard (Task 12).

import { sql } from '../_lib/db.js';
import { getSessionUser } from '../_lib/auth.js';
import { cors, json, method, wrap, error } from '../_lib/http.js';
import { isUuid } from '../_lib/validate.js';
import { reconciliationStatus } from '../_lib/metering.js';

const VALID_GRANULARITY = new Set(['day', 'week', 'month']);

export default wrap(async (req, res) => {
	if (cors(req, res, { methods: 'GET,OPTIONS', credentials: true })) return;
	if (!method(req, res, ['GET'])) return;

	const user = await getSessionUser(req);
	if (!user) return error(res, 401, 'unauthorized', 'sign in required');

	const q = req.query ?? {};

	// Parse and validate query params
	const agentId = q.agent_id ?? null;
	if (agentId !== null && !isUuid(agentId))
		return error(res, 400, 'validation_error', 'agent_id must be a UUID');

	const granularity = q.granularity ?? 'day';
	if (!VALID_GRANULARITY.has(granularity))
		return error(res, 400, 'validation_error', 'granularity must be day, week, or month');

	const now = new Date();
	const defaultFrom = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

	const fromDate = q.from ? new Date(q.from) : defaultFrom;
	const toDate = q.to ? new Date(q.to) : now;

	if (isNaN(fromDate.getTime()))
		return error(res, 400, 'validation_error', 'from must be a valid ISO-8601 date');
	if (isNaN(toDate.getTime()))
		return error(res, 400, 'validation_error', 'to must be a valid ISO-8601 date');

	const baseParams = [user.id, fromDate, toDate];
	const agentFilterSql = agentId ? `AND re.agent_id = $4::uuid` : '';
	const filterParams = agentId ? [...baseParams, agentId] : baseParams;

	const [summaryRow] = await sql(
		`
		SELECT
			COALESCE(SUM(re.gross_amount), 0)::bigint AS gross_total,
			COALESCE(SUM(re.fee_amount), 0)::bigint   AS fee_total,
			COALESCE(SUM(re.net_amount), 0)::bigint   AS net_total,
			COUNT(*)::int                             AS payment_count,
			MAX(re.currency_mint)                     AS currency_mint,
			MAX(re.chain)                             AS chain
		FROM agent_revenue_events re
		JOIN agent_identities ai ON ai.id = re.agent_id
		WHERE ai.user_id = $1
		  AND re.created_at BETWEEN $2 AND $3
		  ${agentFilterSql}
	`,
		filterParams,
	);

	const bySkill = await sql(
		`
		SELECT
			re.skill,
			COALESCE(SUM(re.net_amount), 0)::bigint AS net_total,
			COUNT(*)::int                           AS count
		FROM agent_revenue_events re
		JOIN agent_identities ai ON ai.id = re.agent_id
		WHERE ai.user_id = $1
		  AND re.created_at BETWEEN $2 AND $3
		  ${agentFilterSql}
		GROUP BY re.skill
		ORDER BY net_total DESC
	`,
		filterParams,
	);

	const tsParams = agentId
		? [user.id, fromDate, toDate, granularity, agentId]
		: [user.id, fromDate, toDate, granularity];
	const tsAgentFilter = agentId ? `AND re.agent_id = $5::uuid` : '';
	const timeseries = await sql(
		`
		SELECT
			date_trunc($4, re.created_at) AS period,
			COALESCE(SUM(re.net_amount), 0)::bigint   AS net_total,
			COUNT(*)::int                             AS count
		FROM agent_revenue_events re
		JOIN agent_identities ai ON ai.id = re.agent_id
		WHERE ai.user_id = $1
		  AND re.created_at BETWEEN $2 AND $3
		  ${tsAgentFilter}
		GROUP BY period
		ORDER BY period
	`,
		tsParams,
	);

	// ── Subscription income ──────────────────────────────────────────────────
	// Creator subscriptions (subscription_plans → creator_subscriptions →
	// subscription_payments) settle the creator leg DIRECTLY to the creator's
	// wallet on-chain, so they never write agent_revenue_events and are absent
	// from net_total / the withdrawable balance. Surface them here as a SEPARATE,
	// USD-denominated figure (amount_usd is numeric(8,2), not atomic units) so the
	// creator sees their full income without ever mixing units or double-counting
	// against the platform-custodied withdrawal pool. When filtering by agent we
	// count only plans scoped to that agent; creator-wide plans show in the
	// all-agents view. `subAgentFilter` reuses the same positional params as the
	// revenue queries above (so $4 is agent_id when present).
	const subAgentFilter = agentId ? `AND pl.agent_id = $4::uuid` : '';
	const [subSummaryRow] = await sql(
		`
		SELECT
			COALESCE(SUM(sp.amount_usd), 0)::numeric AS income_usd,
			COUNT(*)::int                            AS payment_count
		FROM subscription_payments sp
		JOIN creator_subscriptions cs ON cs.id = sp.subscription_id
		JOIN subscription_plans pl    ON pl.id = cs.plan_id
		WHERE pl.creator_id = $1
		  AND sp.status = 'succeeded'
		  AND sp.paid_at BETWEEN $2 AND $3
		  ${subAgentFilter}
	`,
		filterParams,
	);

	// Current-state counts (not date-bounded): active subscribers + active plans.
	const subStateAgentFilter = agentId ? `AND pl.agent_id = $2::uuid` : '';
	const subStateParams = agentId ? [user.id, agentId] : [user.id];
	const [subStateRow] = await sql(
		`
		SELECT
			COUNT(*) FILTER (WHERE cs.status = 'active')::int AS active_subscribers,
			COUNT(DISTINCT pl.id)::int                        AS plan_count
		FROM subscription_plans pl
		LEFT JOIN creator_subscriptions cs ON cs.plan_id = pl.id
		WHERE pl.creator_id = $1
		  AND pl.active = true
		  ${subStateAgentFilter}
	`,
		subStateParams,
	);

	const subTsAgentFilter = agentId ? `AND pl.agent_id = $5::uuid` : '';
	const subTimeseries = await sql(
		`
		SELECT
			date_trunc($4, sp.paid_at) AS period,
			COALESCE(SUM(sp.amount_usd), 0)::numeric AS income_usd,
			COUNT(*)::int                            AS count
		FROM subscription_payments sp
		JOIN creator_subscriptions cs ON cs.id = sp.subscription_id
		JOIN subscription_plans pl    ON pl.id = cs.plan_id
		WHERE pl.creator_id = $1
		  AND sp.status = 'succeeded'
		  AND sp.paid_at BETWEEN $2 AND $3
		  ${subTsAgentFilter}
		GROUP BY period
		ORDER BY period
	`,
		tsParams,
	);

	// Reconciliation status — does every metered charge map to a real settlement?
	// Surfaced on the dashboard so an operator sees "all charges reconciled" vs
	// "N unreconciled" without leaving the revenue view. Never fails the read.
	let reconciliation = null;
	try {
		reconciliation = await reconciliationStatus({ userId: user.id });
	} catch {
		reconciliation = null;
	}

	return json(res, 200, {
		summary: {
			gross_total: Number(summaryRow.gross_total),
			fee_total: Number(summaryRow.fee_total),
			net_total: Number(summaryRow.net_total),
			currency_mint: summaryRow.currency_mint ?? null,
			chain: summaryRow.chain ?? null,
			payment_count: summaryRow.payment_count,
		},
		by_skill: bySkill.map((r) => ({
			skill: r.skill,
			net_total: Number(r.net_total),
			count: r.count,
		})),
		timeseries: timeseries.map((r) => ({
			period: r.period instanceof Date ? r.period.toISOString().slice(0, 10) : String(r.period),
			net_total: Number(r.net_total),
			count: r.count,
		})),
		// USD-denominated, paid directly to the creator wallet (not withdrawable
		// from the platform pool — kept distinct from `summary` above by design).
		subscriptions: {
			income_usd: Number(subSummaryRow?.income_usd ?? 0),
			payment_count: subSummaryRow?.payment_count ?? 0,
			active_subscribers: subStateRow?.active_subscribers ?? 0,
			plan_count: subStateRow?.plan_count ?? 0,
		},
		subscription_timeseries: subTimeseries.map((r) => ({
			period: r.period instanceof Date ? r.period.toISOString().slice(0, 10) : String(r.period),
			income_usd: Number(r.income_usd),
			count: r.count,
		})),
		// Operator trust signal: usage charges reconciled against on-chain settlements.
		reconciliation,
	});
});

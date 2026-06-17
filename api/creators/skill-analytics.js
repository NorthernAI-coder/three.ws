/**
 * GET /api/creators/skill-analytics
 *
 * Aggregated skill usage metrics for all agents owned by the authenticated creator.
 * Query params:
 *   agent_id  — filter to a specific agent (optional)
 *   days      — lookback window in days (default 30, max 365)
 */

import { sql } from '../_lib/db.js';
import { getSessionUser } from '../_lib/auth.js';
import { cors, error, json, method, wrap } from '../_lib/http.js';

export default wrap(async (req, res) => {
	if (cors(req, res, { methods: 'GET,OPTIONS', credentials: true })) return;
	if (!method(req, res, ['GET'])) return;

	const user = await getSessionUser(req);
	if (!user) return error(res, 401, 'unauthorized', 'sign in required');

	const q = req.query ?? {};
	const days = Math.min(parseInt(q.days || '30', 10) || 30, 365);
	const agentIdFilter = q.agent_id || null;

	const since = new Date(Date.now() - days * 86400_000);

	// Confirm the user owns the requested agent (if filtering).
	if (agentIdFilter) {
		const [agent] = await sql`
			SELECT id FROM agent_identities WHERE id = ${agentIdFilter} AND user_id = ${user.id} AND deleted_at IS NULL
		`;
		if (!agent) return error(res, 403, 'forbidden', 'not your agent');
	}

	const bySkill = await sql`
		SELECT
			sul.agent_id,
			ai.name               AS agent_name,
			sul.skill_name,
			COUNT(*)::int         AS total_calls,
			COUNT(DISTINCT sul.user_id)::int AS unique_users,
			COUNT(*) FILTER (WHERE sul.status = 'success')::int AS successes,
			COUNT(*) FILTER (WHERE sul.status = 'failure')::int AS failures,
			ROUND(AVG(sul.execution_time_ms))::int              AS avg_execution_ms,
			ROUND(
				100.0 * COUNT(*) FILTER (WHERE sul.status = 'success') / NULLIF(COUNT(*), 0),
				1
			)::float AS success_rate_pct
		FROM skill_usage_logs sul
		JOIN agent_identities ai ON ai.id = sul.agent_id
		WHERE ai.user_id = ${user.id}
		  AND sul.created_at >= ${since}
		  ${agentIdFilter ? sql`AND sul.agent_id = ${agentIdFilter}` : sql``}
		GROUP BY sul.agent_id, ai.name, sul.skill_name
		ORDER BY total_calls DESC
		LIMIT 200
	`;

	// Summary totals.
	const [totals] = await sql`
		SELECT
			COUNT(*)::int           AS total_calls,
			COUNT(DISTINCT sul.user_id)::int AS unique_users,
			COUNT(*) FILTER (WHERE sul.status = 'success')::int AS successes
		FROM skill_usage_logs sul
		JOIN agent_identities ai ON ai.id = sul.agent_id
		WHERE ai.user_id = ${user.id}
		  AND sul.created_at >= ${since}
		  ${agentIdFilter ? sql`AND sul.agent_id = ${agentIdFilter}` : sql``}
	`;

	// Daily call volume for a sparkline.
	const daily = await sql`
		SELECT
			date_trunc('day', sul.created_at)::date AS date,
			COUNT(*)::int AS calls
		FROM skill_usage_logs sul
		JOIN agent_identities ai ON ai.id = sul.agent_id
		WHERE ai.user_id = ${user.id}
		  AND sul.created_at >= ${since}
		  ${agentIdFilter ? sql`AND sul.agent_id = ${agentIdFilter}` : sql``}
		GROUP BY 1
		ORDER BY 1 ASC
	`;

	return json(res, 200, {
		data: {
			period_days: days,
			summary: totals,
			by_skill: bySkill,
			daily,
		},
	});
});

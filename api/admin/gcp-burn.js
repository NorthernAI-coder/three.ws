// GET /api/admin/gcp-burn
//
// Internal spend dashboard data for the $100k GCP credit program. Two views,
// cross-referenced:
//
//   1. APP-SIDE TELEMETRY (always available, from Neon):
//      • LLM lane usage per day — requests + tokens + cost estimate, grouped by
//        provider, with `vertex-anthropic` broken out as the Vertex Claude lane.
//      • Forge generations per backend (forge_creations.backend), flagged
//        self-host (our Cloud Run GPU fleet, provider=gcp) vs external.
//
//   2. BILLING GROUND TRUTH (best-effort, from BigQuery billing export):
//      • The attributed burn report (credit consumed, projection vs expiry).
//      Degrades to { available:false, reason } when the export isn't wired yet
//      or the SA can't reach BigQuery — the app-side view still renders.
//
// Auth: session+admin OR Bearer $CRON_SECRET (matches api/admin/all-systems.js,
// circulation-health.js — lets the daily cron + monitoring scrapers read it).
// No secrets are returned.

import { sql } from '../_lib/db.js';
import { requireAdmin } from '../_lib/admin.js';
import { cors, json, method, wrap } from '../_lib/http.js';
import { env } from '../_lib/env.js';
import { constantTimeEquals } from '../_lib/crypto.js';
import { isSelfHostBackend } from '../_lib/forge-tiers.js';
import { buildBurnReport, billingConfigured, BillingUnavailableError } from '../_lib/gcp-billing.js';

// Which credit-program lane a usage_events.provider belongs to. Providers not
// funded by the GCP grant (free BYOK lanes, Replicate) map to null and are
// reported under "other" so the lane totals stay honest.
function providerLane(provider) {
	if (provider === 'vertex-anthropic') return 'vertex-claude';
	if (provider === 'gcp') return 'forge-gpu';
	if (provider === 'vertex-imagen' || provider === 'imagen') return 'imagen';
	return null;
}

function isCronAuth(req) {
	const auth = req.headers.authorization || '';
	const bearer = auth.toLowerCase().startsWith('bearer ') ? auth.slice(7).trim() : '';
	return !!env.CRON_SECRET && constantTimeEquals(bearer, env.CRON_SECRET);
}

const microToUsd = (micro) => Number(micro || 0) / 1_000_000;

export default wrap(async (req, res) => {
	if (cors(req, res, { methods: 'GET,OPTIONS', credentials: true })) return;
	if (!method(req, res, ['GET'])) return;

	if (!isCronAuth(req)) {
		const admin = await requireAdmin(req, res);
		if (!admin) return; // requireAdmin already wrote 401/403
	}

	// ── App-side telemetry (Neon) ────────────────────────────────────────────
	// LLM lane usage per day (last 14 days) — real provider/token/cost columns.
	const llmDailyP = sql`
		SELECT
			date_trunc('day', created_at)::date AS day,
			provider,
			count(*)::int                        AS requests,
			coalesce(sum(input_tokens), 0)::bigint  AS input_tokens,
			coalesce(sum(output_tokens), 0)::bigint AS output_tokens,
			coalesce(sum(cost_micro_usd), 0)::bigint AS cost_micro_usd
		FROM usage_events
		WHERE kind = 'llm'
			AND created_at > now() - interval '14 days'
			AND provider IS NOT NULL
		GROUP BY day, provider
		ORDER BY day DESC, cost_micro_usd DESC`;

	// Vertex Claude spend estimate — 24h and 30d windows, by model.
	const vertexP = sql`
		SELECT
			model,
			count(*)::int AS requests,
			coalesce(sum(input_tokens), 0)::bigint  AS input_tokens,
			coalesce(sum(output_tokens), 0)::bigint AS output_tokens,
			coalesce(sum(cost_micro_usd), 0)::bigint AS cost_micro_usd,
			coalesce(sum(cost_micro_usd) FILTER (WHERE created_at > now() - interval '24 hours'), 0)::bigint AS cost_micro_usd_24h
		FROM usage_events
		WHERE kind = 'llm' AND provider = 'vertex-anthropic'
			AND created_at > now() - interval '30 days'
		GROUP BY model
		ORDER BY cost_micro_usd DESC`;

	// Forge generations per backend (last 30 days) — the self-host GPU fleet is
	// what burns Cloud Run credits.
	const forgeP = sql`
		SELECT
			coalesce(backend, '(unknown)') AS backend,
			count(*)::int AS generations,
			count(*) FILTER (WHERE created_at > now() - interval '24 hours')::int AS generations_24h
		FROM forge_creations
		WHERE created_at > now() - interval '30 days'
		GROUP BY backend
		ORDER BY generations DESC`;

	const [llmDaily, vertexRows, forgeRows] = await Promise.all([
		llmDailyP.catch(() => []),
		vertexP.catch(() => []),
		forgeP.catch(() => []),
	]);

	// Roll LLM rows up into per-lane 14-day totals + a per-day series.
	const laneTotals = {};
	const daySeries = {};
	for (const r of llmDaily) {
		const lane = providerLane(r.provider) || 'other';
		const day = r.day instanceof Date ? r.day.toISOString().slice(0, 10) : String(r.day);
		const t = (laneTotals[lane] ||= { lane, requests: 0, inputTokens: 0, outputTokens: 0, costUsd: 0 });
		t.requests += Number(r.requests);
		t.inputTokens += Number(r.input_tokens);
		t.outputTokens += Number(r.output_tokens);
		t.costUsd += microToUsd(r.cost_micro_usd);
		const d = (daySeries[day] ||= { day });
		d[lane] = (d[lane] || 0) + microToUsd(r.cost_micro_usd);
	}

	const vertexClaude = {
		requests30d: vertexRows.reduce((a, r) => a + Number(r.requests), 0),
		inputTokens30d: vertexRows.reduce((a, r) => a + Number(r.input_tokens), 0),
		outputTokens30d: vertexRows.reduce((a, r) => a + Number(r.output_tokens), 0),
		costUsd30d: vertexRows.reduce((a, r) => a + microToUsd(r.cost_micro_usd), 0),
		costUsd24h: vertexRows.reduce((a, r) => a + microToUsd(r.cost_micro_usd_24h), 0),
		byModel: vertexRows.map((r) => ({
			model: r.model,
			requests: Number(r.requests),
			inputTokens: Number(r.input_tokens),
			outputTokens: Number(r.output_tokens),
			costUsd: microToUsd(r.cost_micro_usd),
		})),
	};

	const forgeByBackend = forgeRows.map((r) => ({
		backend: r.backend,
		generations30d: Number(r.generations),
		generations24h: Number(r.generations_24h),
		selfHost: r.backend !== '(unknown)' && isSelfHostBackend(r.backend),
	}));

	// ── Billing ground truth (BigQuery, best-effort) ─────────────────────────
	let billing;
	if (!billingConfigured()) {
		billing = { available: false, reason: 'BigQuery billing export not configured (see docs/gcp-credits.md).' };
	} else {
		try {
			const report = await buildBurnReport({});
			billing = { available: true, report };
		} catch (err) {
			billing = {
				available: false,
				reason: err instanceof BillingUnavailableError ? err.message : `billing query failed: ${err?.message || err}`,
			};
		}
	}

	return json(res, 200, {
		generated_at: new Date().toISOString(),
		app_side: {
			lane_totals_14d: Object.values(laneTotals).sort((a, b) => b.costUsd - a.costUsd),
			daily_llm_cost_usd: Object.values(daySeries).sort((a, b) => a.day.localeCompare(b.day)),
			vertex_claude: vertexClaude,
			forge_by_backend: forgeByBackend,
		},
		billing,
	});
});

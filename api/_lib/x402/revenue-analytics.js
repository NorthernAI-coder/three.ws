// api/_lib/x402/revenue-analytics.js
//
// Revenue Dashboard Aggregation — the data layer behind POST /api/x402/analytics
// ({ report: "revenue", period }). Builds a real, per-endpoint revenue report
// from the platform's own settled-payment ledger; no estimates of demand, only
// money that actually moved on-chain.
//
// Sources (both real, both already populated by live traffic):
//   • x402_audit_log (event_type = 'payment_settled') — every settled x402 call
//     with its route + atomic USDC amount. This is gross revenue, per endpoint.
//   • cross_chain_cost_comparison — the rolling on-chain settlement cost in USD
//     the cross-chain-cost pipeline measures hourly. Multiplied by the settled
//     payment count it yields the settlement fee the platform actually bears, so
//     net = gross − settlement fees is grounded in measured gas, not a guess.
//
// The report shape is consumed by:
//   • POST /api/x402/analytics  — the paid x402 endpoint that returns it.
//   • the `platform-revenue-analytics` autonomous-loop entry, whose extractSignal
//     lifts { total_usd, top_endpoint, fee_collected } into oracle_intel_signals
//     (topic 'platform-revenue') so the sniper gate sees live platform health.

import { sql } from '../db.js';
import { atomicsToUsdc } from '../agent-paid-services.js';

// Supported report periods → lookback in hours (null = all-time).
const PERIOD_HOURS = {
	'1h': 1,
	'6h': 6,
	'24h': 24,
	'7d': 24 * 7,
	'30d': 24 * 30,
	all: null,
};

/**
 * Normalize a requested period string to a canonical key + ISO `since` bound.
 * Unknown / malformed inputs fall back to 24h (the dashboard default).
 * @param {string} raw
 * @returns {{ key: string, hours: number|null, since: string|null }}
 */
export function resolvePeriod(raw) {
	const key = String(raw || '24h').toLowerCase().trim();
	const hours = key in PERIOD_HOURS ? PERIOD_HOURS[key] : 24;
	const canonical = key in PERIOD_HOURS ? key : '24h';
	const since = hours == null ? null : new Date(Date.now() - hours * 3600_000).toISOString();
	return { key: canonical, hours, since };
}

// 6-decimal USD string for money fields (matches the audit-log dashboard format).
function usd(n) {
	return (Number(n) || 0).toFixed(6);
}

/**
 * Mean per-settlement on-chain cost (USD) over the window, from the cross-chain
 * cost pipeline's measurements. Prefers the windowed average and falls back to
 * the latest snapshot; returns { perTxUsd, source } where source documents which
 * measurement was used (or 'none' when the pipeline has no data yet).
 *
 * @param {number|null} windowHours lookback for the average (null → all-time)
 */
async function settlementCostPerTx(windowHours) {
	try {
		const rows = windowHours == null
			? await sql`
				SELECT avg(solana_gas_usd) FILTER (WHERE solana_gas_usd IS NOT NULL) AS avg_usd,
				       count(*) FILTER (WHERE solana_gas_usd IS NOT NULL)::int AS samples
				FROM cross_chain_cost_comparison`
			: await sql`
				SELECT avg(solana_gas_usd) FILTER (WHERE solana_gas_usd IS NOT NULL) AS avg_usd,
				       count(*) FILTER (WHERE solana_gas_usd IS NOT NULL)::int AS samples
				FROM cross_chain_cost_comparison
				WHERE checked_at >= now() - (${windowHours} || ' hours')::interval`;
		const avg = rows?.[0]?.avg_usd;
		if (avg != null && Number(avg) > 0) {
			return { perTxUsd: Number(avg), source: 'window_avg', samples: rows[0].samples || 0 };
		}
		// Window empty — fall back to the most recent measured settlement cost.
		const latest = await sql`
			SELECT solana_gas_usd FROM cross_chain_cost_comparison
			WHERE solana_gas_usd IS NOT NULL
			ORDER BY checked_at DESC LIMIT 1`;
		const last = latest?.[0]?.solana_gas_usd;
		if (last != null && Number(last) > 0) {
			return { perTxUsd: Number(last), source: 'latest_snapshot', samples: 1 };
		}
	} catch (err) {
		// Table may not exist in a fresh env — treat as "no cost data".
		if (!err?.message?.includes('does not exist')) throw err;
	}
	return { perTxUsd: 0, source: 'none', samples: 0 };
}

/**
 * Build the revenue report for a period.
 *
 * @param {object} opts
 * @param {string} [opts.period='24h']
 * @returns {Promise<object>} the full report (see the endpoint's OUTPUT_SCHEMA)
 */
export async function buildRevenueReport({ period = '24h' } = {}) {
	const { key, hours, since } = resolvePeriod(period);

	// ── Gross totals over the window (settled payments only). ────────────────
	const [totals] = await sql`
		SELECT
			count(*)::int AS payments,
			count(DISTINCT payer)::int AS unique_payers,
			coalesce(sum(
				CASE WHEN amount_atomics ~ '^[0-9]+$' THEN amount_atomics::numeric ELSE 0 END
			), 0) AS gross_atomics
		FROM x402_audit_log
		WHERE event_type = 'payment_settled'
			AND (${since}::timestamptz IS NULL OR created_at >= ${since}::timestamptz)
	`;
	const payments = totals?.payments || 0;
	const grossAtomics = Number(totals?.gross_atomics || 0);
	const grossUsd = atomicsToUsdc(grossAtomics);

	// ── Per-endpoint earnings, highest gross first. ──────────────────────────
	const routeRows = await sql`
		SELECT
			route,
			count(*)::int AS count,
			coalesce(sum(
				CASE WHEN amount_atomics ~ '^[0-9]+$' THEN amount_atomics::numeric ELSE 0 END
			), 0) AS gross_atomics
		FROM x402_audit_log
		WHERE event_type = 'payment_settled'
			AND (${since}::timestamptz IS NULL OR created_at >= ${since}::timestamptz)
		GROUP BY route
		ORDER BY gross_atomics DESC, count DESC
	`;
	const byEndpoint = routeRows.map((r) => {
		const g = atomicsToUsdc(Number(r.gross_atomics || 0));
		return {
			endpoint: r.route || 'unknown',
			count: r.count,
			gross_usd: usd(g),
			share: grossUsd > 0 ? Number((g / grossUsd).toFixed(4)) : 0,
		};
	});
	const topEndpoint = byEndpoint[0]
		? { endpoint: byEndpoint[0].endpoint, count: byEndpoint[0].count, gross_usd: byEndpoint[0].gross_usd }
		: null;

	// ── Settlement fee split: measured on-chain cost × settled payment count. ─
	const cost = await settlementCostPerTx(hours);
	const settlementFeeUsd = cost.perTxUsd * payments;
	const netPlatformUsd = Math.max(0, grossUsd - settlementFeeUsd);
	const effectiveFeeRate = grossUsd > 0 ? Number((settlementFeeUsd / grossUsd).toFixed(6)) : 0;

	const [failed] = await sql`
		SELECT count(*)::int AS n
		FROM x402_audit_log
		WHERE event_type = 'payment_failed'
			AND (${since}::timestamptz IS NULL OR created_at >= ${since}::timestamptz)
	`;

	return {
		report: 'revenue',
		period: key,
		since,
		generated_at: new Date().toISOString(),
		totals: {
			gross_usd: usd(grossUsd),
			net_platform_usd: usd(netPlatformUsd),
			settlement_fee_usd: usd(settlementFeeUsd),
			total_payments: payments,
			failed_payments: failed?.n || 0,
			unique_payers: totals?.unique_payers || 0,
			avg_payment_usd: usd(payments > 0 ? grossUsd / payments : 0),
		},
		fee_splits: {
			gross_usd: usd(grossUsd),
			settlement_fee_usd: usd(settlementFeeUsd),
			net_platform_usd: usd(netPlatformUsd),
			effective_fee_rate: effectiveFeeRate,
			fee_per_settlement_usd: usd(cost.perTxUsd),
			fee_source: cost.source,
		},
		by_endpoint: byEndpoint,
		top_endpoint: topEndpoint,
	};
}

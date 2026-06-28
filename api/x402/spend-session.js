// POST /api/x402/spend-session
//
// Paid endpoint: Spend Session Audit — $0.005 USDC per call.
//
// Queries the platform's payment_sessions ledger and returns a live snapshot
// of all agent spend sessions: how many are currently active, how much budget
// remains across them, and how many have expired (in the last 24h).
//
// The autonomous loop calls this every 15 minutes (mode:"audit") to watch for
// a spike in expired_count — a leading indicator that session cleanup is broken
// or agents are not renewing sessions before they lapse. Signal recorded to
// x402_autonomous_log.signal_data and the health pipeline.
//
// Request body:
//   { "mode": "audit" }    — aggregate session health snapshot (only mode today)
//
// Response (mode=audit):
//   {
//     mode:                     "audit",
//     active_count:             <int>,        — sessions with status='active', expires_at > now
//     exhausted_count:          <int>,        — sessions with status='exhausted'
//     expired_count_24h:        <int>,        — sessions that expired in the last 24 hours
//     total_budget_remaining_usdc: <number>,  — sum of (budget_usdc - spent_usdc) / 1e6, active sessions
//     avg_budget_remaining_usd: <number|null>,— average remaining per active session
//     total_spent_usdc:         <number>,     — total USDC spent across all active sessions
//     ts:                       <ISO string>
//   }

import { paidEndpoint } from '../_lib/x402-paid-endpoint.js';
import { buildBazaarSchema } from '../_lib/x402-spec.js';
import { installAccessControl } from '../_lib/x402/access-control.js';
import { withService } from '../_lib/x402/bazaar-helpers.js';
import { priceFor } from '../_lib/x402-prices.js';
import { sql } from '../_lib/db.js';

const ROUTE = '/api/x402/spend-session';

const DESCRIPTION =
	'three.ws Spend Session Audit — pay $0.005 USDC per call to receive a live ' +
	'snapshot of all agent payment-session health on the platform: active session ' +
	'count, total remaining USDC budget, and how many sessions expired in the last ' +
	'24 hours. An expired_count spike signals that agents are not renewing sessions ' +
	'before they lapse or that the session-expiry sweep is failing.';

const INPUT_SCHEMA = {
	$schema: 'https://json-schema.org/draft/2020-12/schema',
	type: 'object',
	properties: {
		mode: {
			type: 'string',
			enum: ['audit'],
			default: 'audit',
			description: 'Audit mode: returns aggregate session health snapshot.',
		},
	},
};

const OUTPUT_SCHEMA = {
	$schema: 'https://json-schema.org/draft/2020-12/schema',
	type: 'object',
	properties: {
		mode: { type: 'string' },
		active_count: { type: 'integer', description: 'Sessions currently active and not expired.' },
		exhausted_count: { type: 'integer', description: 'Sessions with status exhausted.' },
		expired_count_24h: { type: 'integer', description: 'Sessions that expired in the last 24 hours.' },
		total_budget_remaining_usdc: { type: 'number', description: 'Sum of remaining budget (USD) across active sessions.' },
		avg_budget_remaining_usd: { type: ['number', 'null'], description: 'Average remaining budget per active session.' },
		total_spent_usdc: { type: 'number', description: 'Total USDC spent across all active sessions.' },
		ts: { type: 'string', format: 'date-time' },
	},
};

const PRICE_ATOMICS = priceFor('spend-session', '5000'); // $0.005 USDC default

export default paidEndpoint(
	{
		route: ROUTE,
		priceAtomics: PRICE_ATOMICS,
		networks: ['base', 'solana'],
		description: DESCRIPTION,
		inputSchema: INPUT_SCHEMA,
		outputSchema: OUTPUT_SCHEMA,
		inputExample: { mode: 'audit' },
		outputExample: {
			mode: 'audit',
			active_count: 14,
			exhausted_count: 2,
			expired_count_24h: 1,
			total_budget_remaining_usdc: 3.42,
			avg_budget_remaining_usd: 0.244,
			total_spent_usdc: 0.88,
			ts: '2026-06-28T12:00:00.000Z',
		},
		bazaarSchema: buildBazaarSchema({
			route: ROUTE,
			name: 'Spend Session Audit',
			description: DESCRIPTION,
			priceAtomics: PRICE_ATOMICS,
			inputSchema: INPUT_SCHEMA,
			outputSchema: OUTPUT_SCHEMA,
			inputExample: { mode: 'audit' },
		}),
		accessControl: installAccessControl({ route: ROUTE }),
		service: withService(ROUTE),
	},
	async (req, body) => {
		const mode = body?.mode ?? 'audit';
		if (mode !== 'audit') {
			return { status: 400, body: { error: 'invalid_mode', message: 'Only mode="audit" is supported.' } };
		}

		// Active sessions: status='active' and not yet expired
		const [activeSummary] = await sql`
			SELECT
				count(*)                                              AS active_count,
				coalesce(sum(budget_usdc - spent_usdc), 0)           AS remaining_atomics,
				coalesce(sum(spent_usdc), 0)                         AS spent_atomics,
				coalesce(avg(budget_usdc - spent_usdc), null)        AS avg_remaining_atomics
			FROM payment_sessions
			WHERE status = 'active'
			  AND expires_at > now()
		`;

		// Exhausted sessions
		const [exhaustedSummary] = await sql`
			SELECT count(*) AS exhausted_count
			FROM payment_sessions
			WHERE status = 'exhausted'
		`;

		// Sessions that expired naturally (status changed to 'expired') in the last 24h
		const [expiredSummary] = await sql`
			SELECT count(*) AS expired_count_24h
			FROM payment_sessions
			WHERE status = 'expired'
			  AND updated_at >= now() - interval '24 hours'
		`;

		const activeCount = Number(activeSummary?.active_count ?? 0);
		const exhaustedCount = Number(exhaustedSummary?.exhausted_count ?? 0);
		const expiredCount24h = Number(expiredSummary?.expired_count_24h ?? 0);
		const remainingAtomics = BigInt(activeSummary?.remaining_atomics ?? 0);
		const spentAtomics = BigInt(activeSummary?.spent_atomics ?? 0);
		const avgRemainingAtomics = activeSummary?.avg_remaining_atomics != null
			? Number(activeSummary.avg_remaining_atomics)
			: null;

		return {
			mode: 'audit',
			active_count: activeCount,
			exhausted_count: exhaustedCount,
			expired_count_24h: expiredCount24h,
			total_budget_remaining_usdc: Number(remainingAtomics) / 1e6,
			avg_budget_remaining_usd: avgRemainingAtomics != null ? avgRemainingAtomics / 1e6 : null,
			total_spent_usdc: Number(spentAtomics) / 1e6,
			ts: new Date().toISOString(),
		};
	},
);

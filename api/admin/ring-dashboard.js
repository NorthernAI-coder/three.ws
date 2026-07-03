// GET /api/admin/ring-dashboard — aggregate read model for the /admin/ring
// operator dashboard (the eyes on the closed-loop x402 ring economy).
//
// One authed call returns everything the dashboard renders, so the page polls a
// single endpoint instead of seven:
//
//   report          — the public /api/x402-ring net-position report, composed
//                     (fetched, not forked) so the two surfaces can never drift
//   pulse           — settlements per minute over the last 60 minutes plus
//                     minutes_since_last_settle with a green/amber/red status
//   fees            — lamports per settlement vs the 5,000-lamport 1-sig floor,
//                     SOL burned per $100 of volume, today's burn vs the daily
//                     budget (X402_RING_DAILY_FEE_BUDGET_LAMPORTS)
//   activity        — last 100 x402_autonomous_log rows with agent attribution,
//                     endpoint slug, kind classification, and skip/fail reasons
//   endpoints       — per-endpoint coverage from x402_volume_metrics with
//                     last-paid age (stale > 2h = the hourly guarantee broke)
//   reconciliation  — open payment_reconciliation verdicts split into ring
//                     leak-scan findings (x402_ring_* sources) vs revenue
//                     reconciliation, with counts by chain_status
//   config          — ring config validation findings (validateRingConfig when
//                     task 02's module is present, built-in checks otherwise)
//
// Auth: a real admin session OR `Bearer $CRON_SECRET` — the same contract as
// /api/admin/seeder. Balances and pubkeys are returned; secret names never are.

import { sql, isDbUnavailableError } from '../_lib/db.js';
import { requireAdmin } from '../_lib/admin.js';
import { cors, json, method, wrap } from '../_lib/http.js';
import { env } from '../_lib/env.js';
import { constantTimeEquals } from '../_lib/crypto.js';
import * as selfFacilitator from '../_lib/x402/self-facilitator.js';
import { loadSeedKeypair } from '../_lib/x402/pay.js';
import {
	PULSE_WINDOW_MIN,
	buildPulseStrip,
	classifyKind,
	activityStatus,
	slugFromUrl,
	endpointAge,
	buildFeesPanel,
	splitIntegrity,
	pulseStatus,
} from '../_lib/x402/ring-dashboard-model.js';

const PERIODS = new Set(['24h', '7d', '30d', 'all']);
const ACTIVITY_LIMIT = 100;

function isCronAuth(req) {
	const auth = req.headers.authorization || '';
	const bearer = auth.toLowerCase().startsWith('bearer ') ? auth.slice(7).trim() : '';
	return !!env.CRON_SECRET && constantTimeEquals(bearer, env.CRON_SECRET);
}

// ── Config validation ────────────────────────────────────────────────────────

// Prefer task 02's validateRingConfig() when its module exists; otherwise run
// the built-in checks so the panel is never blind. Findings use role language
// (payer/treasury/sponsor), never secret env-var names.
async function configFindings(report) {
	const external = await externalRingValidation();
	if (external) return external;

	const warnings = [];
	if (!selfFacilitator.SELF_FACILITATOR_ENABLED) {
		warnings.push({
			level: 'error',
			code: 'facilitator_disabled',
			message: 'Self-hosted facilitator is disabled — no ring settlement can occur.',
		});
	}
	if (!env.X402_PAY_TO_SOLANA) {
		warnings.push({
			level: 'error',
			code: 'treasury_unset',
			message: 'Treasury address (X402_PAY_TO_SOLANA) is not configured.',
		});
	}
	try {
		loadSeedKeypair();
	} catch {
		warnings.push({
			level: 'error',
			code: 'payer_key_missing',
			message: 'Ring payer keypair is not configured in this environment.',
		});
	}
	const selfPay = String(process.env.X402_RING_SELF_PAY || '').toLowerCase() === 'true';
	if (!selfPay && !env.X402_FEE_PAYER_SOLANA) {
		warnings.push({
			level: 'warn',
			code: 'sponsor_unset',
			message:
				'Sponsor mode (2 signatures) without a sponsor address — enable self-pay or configure the sponsor wallet.',
		});
	}
	if (report?.wallets?.sponsor?.below_floor === true) {
		warnings.push({
			level: 'error',
			code: 'sponsor_below_floor',
			message: `Fee wallet is below its SOL floor (${report.wallets.sponsor.sol} < ${report.wallets.sponsor.floor_sol} SOL) — settlement is paused.`,
		});
	}
	if (!Number(process.env.X402_RING_DAILY_FEE_BUDGET_LAMPORTS)) {
		warnings.push({
			level: 'info',
			code: 'fee_budget_unset',
			message: 'X402_RING_DAILY_FEE_BUDGET_LAMPORTS is unset — daily burn has no configured ceiling.',
		});
	}
	// Tasks 02/05 surface config_warnings on the public report — merge them in.
	for (const w of report?.config_warnings || []) {
		warnings.push(
			typeof w === 'string' ? { level: 'warn', code: 'ring_config', message: w } : w,
		);
	}
	return { validator: 'built-in', self_pay: selfPay, warnings };
}

async function externalRingValidation() {
	// Static: self-facilitator.js (where task 02 exports would live today).
	if (typeof selfFacilitator.validateRingConfig === 'function') {
		try {
			return normalizeExternalValidation(await selfFacilitator.validateRingConfig());
		} catch {
			/* fall through to built-in */
		}
	}
	// Dynamic: a dedicated ring-config module, if task 02 lands one.
	try {
		const mod = await import('../_lib/x402/ring-config.js');
		if (typeof mod.validateRingConfig === 'function') {
			return normalizeExternalValidation(await mod.validateRingConfig());
		}
	} catch {
		/* module not present — expected until task 02 lands */
	}
	return null;
}

function normalizeExternalValidation(out) {
	const list = Array.isArray(out) ? out : out?.warnings || out?.findings || [];
	return {
		validator: 'validateRingConfig',
		self_pay: String(process.env.X402_RING_SELF_PAY || '').toLowerCase() === 'true',
		warnings: list.map((w) =>
			typeof w === 'string' ? { level: 'warn', code: 'ring_config', message: w } : w,
		),
	};
}

// ── Data loads (each degrades independently; one broken table ≠ blank page) ──

async function fetchRingReport(period) {
	try {
		const r = await fetch(`${env.APP_ORIGIN}/api/x402-ring?period=${encodeURIComponent(period)}`, {
			headers: { accept: 'application/json' },
			signal: AbortSignal.timeout(8000),
		});
		if (!r.ok) return { report: null, error: `report HTTP ${r.status}` };
		return { report: await r.json(), error: null };
	} catch (err) {
		return { report: null, error: err?.message?.slice(0, 140) || 'report unreachable' };
	}
}

async function loadPulseRows() {
	return sql`
		SELECT date_trunc('minute', ts) AS minute,
		       count(*)::int AS n,
		       COALESCE(sum(fee_lamports), 0)::bigint AS fee
		FROM x402_self_facilitator_log
		WHERE action = 'settle' AND ok = true
		  AND ts >= now() - interval '60 minutes'
		GROUP BY 1
	`;
}

async function loadLastSettle() {
	const [r] = await sql`
		SELECT max(ts) AS last
		FROM x402_self_facilitator_log
		WHERE action = 'settle' AND ok = true
	`;
	return r?.last ?? null;
}

async function loadTodayBurn() {
	const [r] = await sql`
		SELECT COALESCE(sum(fee_lamports), 0)::bigint AS fee, count(*)::int AS n
		FROM x402_self_facilitator_log
		WHERE action = 'settle' AND ok = true AND ts >= date_trunc('day', now())
	`;
	return { fee_lamports: Number(r?.fee ?? 0), settles: Number(r?.n ?? 0) };
}

async function loadActivity() {
	// Agent attribution: task 09 wires buyer personas through signal_data /
	// value_extracted; coalesce the known spots so pre- and post-09 rows render.
	const rows = await sql`
		SELECT id, ts, endpoint_type, service_name, endpoint_url, network, amount_atomic,
		       asset, tx_signature, duration_ms, success, error_msg, pipeline,
		       COALESCE(
		         signal_data->>'agent_id', signal_data->>'agent', signal_data->>'persona',
		         value_extracted->>'agent_id', value_extracted->>'agent'
		       ) AS agent
		FROM x402_autonomous_log
		ORDER BY ts DESC
		LIMIT ${ACTIVITY_LIMIT}
	`;
	return rows.map((r) => ({
		id: r.id,
		ts: r.ts,
		agent: r.agent || null,
		service: r.service_name,
		slug: slugFromUrl(r.endpoint_url),
		kind: classifyKind(r.endpoint_url),
		usdc: r.amount_atomic != null ? Number(r.amount_atomic) / 1e6 : null,
		asset: r.asset || null,
		tx_sig: r.tx_signature || null,
		duration_ms: r.duration_ms != null ? Number(r.duration_ms) : null,
		status: activityStatus(r),
		error: r.success ? null : r.error_msg || null,
		pipeline: r.pipeline || null,
	}));
}

async function loadEndpoints(now) {
	const rows = await sql`
		SELECT endpoint_key, service_name, endpoint_path, call_count, success_count,
		       fail_count, total_spent_atomic, last_amount_atomic, last_success,
		       last_error, last_tx_signature, last_called_at
		FROM x402_volume_metrics
		ORDER BY last_called_at DESC
	`;
	return rows.map((r) => {
		const calls = Number(r.call_count) || 0;
		return {
			key: r.endpoint_key,
			name: r.service_name,
			path: r.endpoint_path,
			calls,
			successes: Number(r.success_count) || 0,
			fails: Number(r.fail_count) || 0,
			success_pct: calls ? Math.round((Number(r.success_count) / calls) * 100) : null,
			total_usdc: Number(r.total_spent_atomic || 0) / 1e6,
			last_usdc: Number(r.last_amount_atomic || 0) / 1e6,
			last_success: r.last_success,
			last_error: r.last_error || null,
			last_tx: r.last_tx_signature || null,
			last_called_at: r.last_called_at,
			...endpointAge(r.last_called_at, now),
		};
	});
}

async function loadReconciliation() {
	const [bySource, byStatus, openRows] = await Promise.all([
		sql`
			SELECT source, count(*)::int AS total,
			       count(*) FILTER (WHERE reconciled = false)::int AS open,
			       max(checked_at) AS last_checked
			FROM payment_reconciliation
			GROUP BY source
		`,
		sql`
			SELECT chain_status, count(*)::int AS n
			FROM payment_reconciliation
			WHERE reconciled = false
			GROUP BY chain_status
		`,
		sql`
			SELECT source, source_ref, tx_signature, amount_atomic, db_status, chain_status,
			       discrepancy, checked_at
			FROM payment_reconciliation
			WHERE reconciled = false
			ORDER BY checked_at DESC
			LIMIT 20
		`,
	]);
	return {
		available: true,
		...splitIntegrity(bySource),
		open_by_status: Object.fromEntries(byStatus.map((r) => [r.chain_status, Number(r.n)])),
		open_rows: openRows.map((r) => ({
			source: r.source,
			ref: r.source_ref,
			tx_sig: r.tx_signature,
			usdc: r.amount_atomic != null ? Number(r.amount_atomic) / 1e6 : null,
			db_status: r.db_status,
			chain_status: r.chain_status,
			discrepancy: r.discrepancy,
			checked_at: r.checked_at,
		})),
	};
}

// A query against a table another ring task creates lazily must not blank the
// dashboard before that task's first run. Missing relation → honest empty.
function isMissingRelation(err) {
	return err?.code === '42P01' || /does not exist/i.test(String(err?.message || ''));
}

async function tolerant(promise, fallback) {
	try {
		return { value: await promise, dbDown: false };
	} catch (err) {
		if (isDbUnavailableError(err)) return { value: fallback, dbDown: true };
		if (isMissingRelation(err)) return { value: fallback, dbDown: false };
		throw err;
	}
}

// ── Handler ──────────────────────────────────────────────────────────────────

export default wrap(async (req, res) => {
	if (cors(req, res, { methods: 'GET,OPTIONS', credentials: true })) return;
	if (!method(req, res, ['GET'])) return;

	if (!isCronAuth(req)) {
		const admin = await requireAdmin(req, res);
		if (!admin) return; // requireAdmin already wrote 401/403
	}

	const period = PERIODS.has(String(req.query?.period || '').toLowerCase())
		? String(req.query.period).toLowerCase()
		: '24h';
	const now = new Date();

	const [reportOut, pulseRows, lastSettle, todayBurn, activity, endpoints, reconciliation] =
		await Promise.all([
			fetchRingReport(period),
			tolerant(loadPulseRows(), []),
			tolerant(loadLastSettle(), null),
			tolerant(loadTodayBurn(), { fee_lamports: 0, settles: 0 }),
			tolerant(loadActivity(), []),
			tolerant(loadEndpoints(now), []),
			tolerant(loadReconciliation(), {
				available: false,
				...splitIntegrity([]),
				open_by_status: {},
				open_rows: [],
			}),
		]);

	const dbAvailable = ![pulseRows, lastSettle, todayBurn, activity, endpoints, reconciliation].some(
		(r) => r.dbDown,
	);
	const report = reportOut.report;
	const minutesSince =
		lastSettle.value != null
			? Math.floor((now.getTime() - new Date(lastSettle.value).getTime()) / 60_000)
			: null;

	const strip = buildPulseStrip(pulseRows.value, now);
	const config = await configFindings(report);
	const budgetRaw = Number(process.env.X402_RING_DAILY_FEE_BUDGET_LAMPORTS);

	return json(res, 200, {
		ok: true,
		generated_at: now.toISOString(),
		period,
		db_available: dbAvailable,
		internal: true,
		note: 'Self-cycled internal ring volume — dogfooding, not organic third-party demand.',
		report,
		report_error: reportOut.error,
		pulse: {
			window_minutes: PULSE_WINDOW_MIN,
			minutes: strip,
			settles_last_60m: strip.reduce((a, m) => a + m.count, 0),
			last_settle_at: lastSettle.value,
			minutes_since_last_settle: minutesSince,
			status: pulseStatus(minutesSince),
		},
		fees: buildFeesPanel({
			feeLamports24h: Number(report?.fees?.sol_burned_lamports ?? 0),
			settles24h: Number(report?.fees?.tx_count ?? 0),
			grossUsdc24h: Number(report?.settlements?.gross_usdc ?? 0),
			burnedTodayLamports: todayBurn.value.fee_lamports,
			budgetLamports: Number.isFinite(budgetRaw) && budgetRaw > 0 ? budgetRaw : null,
			solUsd: report?.fees?.sol_usd ?? null,
		}),
		activity: activity.value,
		endpoints: endpoints.value,
		reconciliation: reconciliation.value,
		config,
	});
});

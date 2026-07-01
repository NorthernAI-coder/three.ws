// api/_lib/x402/pipelines/volume-bootstrap-loop.js
//
// x402 Volume Bootstrap Loop — autonomous pipeline (self/026).
//
// The core volume engine. Round-robins through the full catalog of paid, cheap
// three.ws self x402 endpoints, paying each one a real on-chain USDC payment from
// the seed wallet. It is NOT a single endpoint call — it is the sweep that proves
// every paid endpoint is live and continuously settles small ($0.001-$0.01)
// payments across all of them so the platform accrues genuine agent-to-agent
// transaction volume (the metric agentic.market ranks facilitators on).
//
// On each run it:
//   1. Advances a Redis-backed round-robin cursor and reserves the next window of
//      VOLUME_BATCH_PER_RUN endpoints from VOLUME_ENDPOINTS (stable across warm
//      instances; in-memory fallback when Redis is absent).
//   2. Pays each selected endpoint via the shared payX402 client — real 402
//      probe → signed Solana USDC transfer → replay with X-PAYMENT. Never mocked.
//   3. Respects two budgets: the loop's remaining daily cap AND a self-imposed
//      per-run cap (VOLUME_PER_RUN_CAP_ATOMIC) so one tick can't drain the day.
//   4. Records a row in x402_autonomous_log for EVERY call (success or failure),
//      with the per-endpoint cumulative volume snapshot in value_extracted.
//   5. Upserts the per-endpoint volume ledger into x402_volume_metrics — call /
//      success / fail counts, total + last USDC spent, last tx signature, last
//      status, last error, first/last call timestamps.
//
// Wiring: declared as a run()-style entry in autonomous-registry.js
// (`volume-bootstrap-loop`). The per-tick spend loop (api/cron/x402-autonomous-loop.js)
// hands run() a shared payment context (buyer, conn, blockhash, mintInfo,
// remainingCap); called standalone (manual test) it bootstraps its own via
// bootstrapSolanaContext(), degrading gracefully if the wallet is unconfigured.
//
// Downstream consumer: x402_volume_metrics is the per-endpoint volume ledger the
// platform's growth + status surfaces read — total settled calls and USDC volume
// per endpoint (the proof-of-volume that bootstraps agentic.market ranking) and
// the per-endpoint last_success / last_called_at that confirms each paid endpoint
// is live. It complements x402_autonomous_log (per-call history) with a compact
// rolling aggregate keyed on endpoint.

import { randomUUID } from 'node:crypto';

import { sql as defaultSql } from '../../db.js';
import { env } from '../../env.js';
import { logger } from '../../usage.js';
import { payX402, bootstrapSolanaContext, USDC_MINT } from '../pay.js';

const log = logger('x402-volume-bootstrap');

const ASSET = USDC_MINT || 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';

// How many endpoints to sweep per run (cursor advances by this each tick). With
// the catalog below (~11 endpoints) a batch of 4 covers the full set in ~3 runs.
export const VOLUME_BATCH_PER_RUN = Math.max(
	1,
	Number(process.env.X402_VOLUME_BATCH_PER_RUN || 4),
);

// Self-imposed per-run USDC budget (atomics, 6dp). Bounds a single tick on top of
// the loop's daily cap so one run can't drain the day. Default $0.05 = 50_000.
export const VOLUME_PER_RUN_CAP_ATOMIC = Math.max(
	0,
	Number(process.env.X402_VOLUME_PER_RUN_CAP_ATOMIC || 50_000),
);

// The canonical catalog of paid self x402 endpoints the loop round-robins. Each
// body is a proven, harmless canary payload (mirrors the per-endpoint health
// entries in autonomous-registry.js) so every sweep call is a valid paid request.
// To add an endpoint to the bootstrap volume, add it here — the cursor and the
// metrics ledger pick it up automatically. The volume loop itself is never listed
// (it is not an HTTP endpoint; no self-recursion).
export const VOLUME_ENDPOINTS = [
	// Ring-settle is the price-configurable, INTERNAL settlement primitive — the
	// fee-optimal way to move real volume (fewer, larger payments). By default
	// ($0.10) it is skipped when the per-run cap is the stock $0.05; raise
	// X402_PRICE_RING_SETTLE + the caps to make it the volume engine. See
	// api/x402/ring-settle.js.
	{ key: 'ring-settle',         name: 'Ring Settlement',      path: '/api/x402/ring-settle',         method: 'POST', body: { note: 'ring-cycle' } },
	{ key: 'dance-tip',           name: 'Dance Tip',            path: '/api/x402/dance-tip',           method: 'POST', body: { dancer: '1', dance: 'hiphop' } },
	{ key: 'crypto-intel',        name: 'Crypto Intel',         path: '/api/x402/crypto-intel',        method: 'POST', body: { topic: 'solana' } },
	{ key: 'three-intel',         name: '$THREE Signal Feed',   path: '/api/x402/three-intel',         method: 'POST', body: {} },
	{ key: 'token-intel',         name: 'Token Intel',          path: '/api/x402/token-intel',         method: 'POST', body: { mint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', network: 'mainnet' } },
	{ key: 'fact-check',          name: 'Fact Check',           path: '/api/x402/fact-check',          method: 'POST', body: { claim: 'The sky is blue' } },
	{ key: 'symbol-availability', name: 'Symbol Availability',  path: '/api/x402/symbol-availability', method: 'POST', body: { symbol: 'HEALTH' } },
	{ key: 'pay-by-name',         name: 'Pay By Name',          path: '/api/x402/pay-by-name?name=threews.sol', method: 'GET',  body: null },
	{ key: 'skill-marketplace',   name: 'Skill Marketplace',    path: '/api/x402/skill-marketplace',   method: 'GET',  body: null },
	{ key: 'agent-reputation',    name: 'Agent Reputation',     path: '/api/x402/agent-reputation',    method: 'GET',  body: null },
	{ key: 'club-cover',          name: 'Club Cover Charge',    path: '/api/x402/club-cover',          method: 'POST', body: { club: 'canary_test' } },
	{ key: 'cosmetic-purchase',   name: 'Cosmetic Purchase',    path: '/api/x402/cosmetic-purchase',   method: 'POST', body: { item: 'canary_test', quantity: 1, _health_check: true } },
];

const CURSOR_KEY = 'x402:auto:volume:cursor';
let _memCursor = 0;

// Reserve the next window of `batch` endpoint indices, advancing the cursor
// atomically. Redis INCRBY gives a stable rotation across warm instances; the
// in-memory counter is the single-process fallback.
async function reserveWindow(redis, batch, len) {
	let end;
	if (redis) {
		try {
			end = Number(await redis.incrby(CURSOR_KEY, batch));
		} catch {
			end = (_memCursor += batch);
		}
	} else {
		end = (_memCursor += batch);
	}
	const start = end - batch;
	const out = [];
	for (let i = 0; i < batch; i++) out.push(((start + i) % len + len) % len);
	return out;
}

// One-time DDL guard per warm instance (mirrors the loop's ensureSchema idiom).
let _schemaReady = false;
async function ensureSchema(sql) {
	if (_schemaReady) return;
	// Per-endpoint cumulative volume ledger. PRIMARY KEY endpoint_key → one row
	// per paid endpoint, accumulated across every sweep.
	await sql`
		CREATE TABLE IF NOT EXISTS x402_volume_metrics (
			endpoint_key        text PRIMARY KEY,
			service_name        text,
			endpoint_path       text,
			network             text NOT NULL DEFAULT 'solana:mainnet',
			asset               text,
			call_count          bigint NOT NULL DEFAULT 0,
			success_count       bigint NOT NULL DEFAULT 0,
			fail_count          bigint NOT NULL DEFAULT 0,
			total_spent_atomic  bigint NOT NULL DEFAULT 0,
			last_amount_atomic  bigint NOT NULL DEFAULT 0,
			last_success        boolean,
			last_status         int,
			last_tx_signature   text,
			last_error          text,
			last_run_id         uuid,
			first_called_at     timestamptz DEFAULT now(),
			last_called_at      timestamptz DEFAULT now()
		)
	`;
	await sql`CREATE INDEX IF NOT EXISTS x402_volume_metrics_last_called ON x402_volume_metrics (last_called_at DESC)`;
	// The autonomous log predates value_extracted; ensure the column exists
	// (idempotent — shared with other pipelines).
	await sql`ALTER TABLE x402_autonomous_log ADD COLUMN IF NOT EXISTS value_extracted jsonb`;
	_schemaReady = true;
}

// Compact, generic liveness summary of a paid response — keeps the log row small
// while still proving the endpoint returned something usable.
function summarizeResponse(body) {
	if (body == null) return { ok: false, shape: 'empty' };
	if (typeof body === 'string') return { ok: body.length > 0, shape: 'text', length: body.length };
	if (Array.isArray(body)) return { ok: body.length > 0, shape: 'array', length: body.length };
	if (typeof body === 'object') {
		const keys = Object.keys(body);
		return { ok: keys.length > 0 && !body.error, shape: 'object', keys: keys.slice(0, 12) };
	}
	return { ok: true, shape: typeof body };
}

// Upsert the per-endpoint volume ledger and return the resulting cumulative row.
// Wrapped by the caller so a DB fault is logged, never fatal.
async function upsertVolumeMetric(sql, ep, { amountAtomic, txSig, success, status, errorMsg, runId }) {
	const rows = await sql`
		INSERT INTO x402_volume_metrics
			(endpoint_key, service_name, endpoint_path, network, asset,
			 call_count, success_count, fail_count, total_spent_atomic,
			 last_amount_atomic, last_success, last_status, last_tx_signature,
			 last_error, last_run_id, first_called_at, last_called_at)
		VALUES
			(${ep.key}, ${ep.name}, ${ep.path}, ${'solana:mainnet'}, ${ASSET},
			 ${1}, ${success ? 1 : 0}, ${success ? 0 : 1}, ${amountAtomic || 0},
			 ${amountAtomic || 0}, ${success}, ${status ?? null}, ${txSig || null},
			 ${errorMsg || null}, ${runId}, now(), now())
		ON CONFLICT (endpoint_key) DO UPDATE SET
			service_name       = EXCLUDED.service_name,
			endpoint_path      = EXCLUDED.endpoint_path,
			asset              = EXCLUDED.asset,
			call_count         = x402_volume_metrics.call_count + 1,
			success_count      = x402_volume_metrics.success_count + ${success ? 1 : 0},
			fail_count         = x402_volume_metrics.fail_count + ${success ? 0 : 1},
			total_spent_atomic = x402_volume_metrics.total_spent_atomic + ${amountAtomic || 0},
			last_amount_atomic = EXCLUDED.last_amount_atomic,
			last_success       = EXCLUDED.last_success,
			last_status        = EXCLUDED.last_status,
			last_tx_signature  = EXCLUDED.last_tx_signature,
			last_error         = EXCLUDED.last_error,
			last_run_id        = EXCLUDED.last_run_id,
			last_called_at     = now()
		RETURNING call_count, success_count, fail_count, total_spent_atomic
	`;
	return rows[0] || null;
}

// Per-call row into x402_autonomous_log. The loop records one aggregate summary
// row for the run() entry; these are the granular per-endpoint sweep rows.
async function recordCall(sql, runId, ep, { endpointUrl, amountAtomic, txSig, responseData, durationMs, success, errorMsg, valueExtracted }) {
	try {
		await sql`
			INSERT INTO x402_autonomous_log
				(run_id, endpoint_type, service_name, endpoint_url,
				 network, amount_atomic, asset, tx_signature,
				 response_data, value_extracted, duration_ms, success, error_msg, pipeline)
			VALUES
				(${runId}, ${'self'}, ${`Volume: ${ep.name}`}, ${endpointUrl},
				 ${'solana:mainnet'}, ${amountAtomic || 0}, ${ASSET}, ${txSig || null},
				 ${responseData ? JSON.stringify(responseData) : null},
				 ${valueExtracted ? JSON.stringify(valueExtracted) : null},
				 ${durationMs || 0}, ${success}, ${errorMsg || null}, ${'volume'})
		`;
	} catch (err) {
		log.warn('volume_bootstrap_log_insert_failed', { endpoint: ep.key, message: err?.message });
	}
}

/**
 * Run the volume bootstrap sweep. Conforms to the run()-style registry contract:
 * the loop hands over { origin, buyer, conn, blockhash, mintInfo, remainingCap,
 * runId, sql }; standalone callers (manual test) get a bootstrapped context.
 *
 * Returns the aggregate outcome the loop records as one summary row:
 *   { success, amountAtomic, txSig, errorMsg, responseData, skipped, note }
 */
export async function run(ctx = {}) {
	const sql = ctx.sql || defaultSql;
	const runId = ctx.runId || randomUUID();
	const origin = ctx.origin || env.APP_ORIGIN || 'https://three.ws';
	const redis = ctx.redis || null;

	// ── Schema first: without the sink there is nothing to extract value into, so
	//    don't pay. A schema failure is a graceful skip (no spend).
	try {
		await ensureSchema(sql);
	} catch (err) {
		log.warn('volume_bootstrap_schema_failed', { message: err?.message });
		return { success: false, skipped: true, amountAtomic: 0, errorMsg: `schema_failed: ${err?.message}` };
	}

	// ── Solana payment context: reuse the loop's, else bootstrap. A bootstrap
	//    failure (wallet/RPC unconfigured) exits logged, without paying.
	let { buyer, conn, blockhash, mintInfo } = ctx;
	if (!buyer || !conn || !blockhash || !mintInfo) {
		try {
			({ buyer, conn, blockhash, mintInfo } = await bootstrapSolanaContext({ buyer }));
		} catch (err) {
			log.info('volume_bootstrap_skipped', { reason: err.message });
			return { success: false, skipped: true, amountAtomic: 0, errorMsg: err.message, note: 'wallet_or_rpc_unconfigured' };
		}
	}

	// ── Budget: the smaller of the loop's remaining daily cap and our per-run cap.
	const loopCap = ctx.remainingCap ?? Number.POSITIVE_INFINITY;
	let remaining = VOLUME_PER_RUN_CAP_ATOMIC > 0
		? Math.min(loopCap, VOLUME_PER_RUN_CAP_ATOMIC)
		: loopCap;

	// ── Select this run's window of endpoints (round-robin).
	const indices = await reserveWindow(redis, VOLUME_BATCH_PER_RUN, VOLUME_ENDPOINTS.length);

	let spentAtomic = 0;
	let paid = 0;
	let calls = 0;
	let errors = 0;
	let lastTxSig = null;
	const swept = [];

	for (const idx of indices) {
		const ep = VOLUME_ENDPOINTS[idx];
		if (remaining <= 0) {
			log.info('volume_bootstrap_cap_reached', { endpoint: ep.key, spent_atomic: spentAtomic });
			break;
		}

		const endpointUrl = `${origin}${ep.path}`;
		const t0 = Date.now();

		// Pay (or detect free / skip). payX402 never throws for protocol/network
		// faults — it returns a structured outcome; a thrown error (rare) is still
		// caught so the sweep continues and the failure is recorded.
		let result;
		try {
			result = await payX402({
				url: endpointUrl,
				method: ep.method || 'POST',
				body: ep.body,
				buyer, conn, blockhash, mintInfo,
				remainingCap: remaining,
			});
		} catch (err) {
			result = { success: false, paid: false, amountAtomic: 0, txSig: null, status: 0, responseBody: null, errorMsg: err?.message || 'fetch_failed' };
		}

		calls += 1;
		if (!result.success) errors += 1;
		if (result.paid) {
			spentAtomic += result.amountAtomic;
			remaining -= result.amountAtomic;
			paid += 1;
			if (result.txSig) lastTxSig = result.txSig;
		}

		// Upsert the per-endpoint volume ledger; DB faults are logged, never fatal.
		let metric = null;
		try {
			metric = await upsertVolumeMetric(sql, ep, {
				amountAtomic: result.amountAtomic,
				txSig: result.txSig,
				success: result.success,
				status: result.status,
				errorMsg: result.errorMsg,
				runId,
			});
		} catch (err) {
			log.warn('volume_metric_upsert_failed', { endpoint: ep.key, message: err?.message });
		}

		const valueExtracted = {
			endpoint_key: ep.key,
			paid: result.paid === true,
			amount_atomic: result.amountAtomic || 0,
			liveness: summarizeResponse(result.responseBody),
			...(metric ? {
				cumulative_calls: Number(metric.call_count),
				cumulative_success: Number(metric.success_count),
				cumulative_spent_atomic: Number(metric.total_spent_atomic),
			} : {}),
		};

		await recordCall(sql, runId, ep, {
			endpointUrl,
			amountAtomic: result.amountAtomic,
			txSig: result.txSig,
			// Trim the (possibly bulky) endpoint payload — the ledger holds the
			// useful aggregate; keep just the call status + liveness here.
			responseData: { status: result.status, liveness: valueExtracted.liveness },
			durationMs: Date.now() - t0,
			success: result.success,
			errorMsg: result.errorMsg,
			valueExtracted,
		});

		swept.push({ key: ep.key, paid: result.paid === true, success: result.success, status: result.status });
	}

	log.info('volume_bootstrap_complete', {
		run_id: runId,
		window: indices.length,
		calls,
		paid,
		errors,
		spent_usdc: (spentAtomic / 1e6).toFixed(4),
	});

	// Aggregate outcome for the loop's single summary row. success=true when at
	// least one endpoint settled or answered; per-call detail lives in the rows
	// above. skipped only when the window produced no calls at all.
	return {
		success: paid > 0 || (calls > 0 && errors < calls),
		amountAtomic: spentAtomic,
		txSig: lastTxSig,
		errorMsg: paid === 0 && errors > 0 ? `volume_bootstrap_calls_failed:${errors}/${calls}` : null,
		skipped: calls === 0,
		responseData: { window: indices.length, calls, paid, errors, swept },
		signalData: { calls, paid, errors, spent_atomic: spentAtomic },
		note: `volume_bootstrap calls=${calls} paid=${paid} errors=${errors}`,
	};
}

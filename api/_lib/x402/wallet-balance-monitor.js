// api/_lib/x402/wallet-balance-monitor.js
//
// Agent Wallet Balance Monitor — autonomous pipeline (self).
//
// The autonomous spend loop pays for everything else from the platform seed
// wallet. If that wallet runs dry, every other autonomous call silently starts
// failing with insufficient-funds. This monitor is the early-warning system:
// once every 10 minutes it reads the wallet's live USDC + SOL balance, records
// a time-series sample, derives the spend rate since the previous sample, and
// raises a low-balance alert before the autonomous loop can be starved.
//
// Endpoint: GET /api/x402-pay?balance=1 — a FREE read (no 402, no payment). It
// returns { configured, address, sol, usdc } for the wallet backed by
// X402_AGENT_SOLANA_SECRET_BASE58 (the same secret loadSeedKeypair() falls back
// to), i.e. the wallet that funds the autonomous loop. Because the call is free,
// this pipeline moves no funds — amountAtomic is always 0.
//
// Wiring: declared as a run()-style entry in autonomous-registry.js
// (`agent-wallet-balance-monitor`). The per-tick loop
// (api/cron/x402-autonomous-loop.js) hands run() { origin, redis, sql, log,
// runId } and records the returned outcome as one row in x402_autonomous_log.
// Called standalone (manual test) it derives its own origin/sql and still works.
//
// Value extracted & where it lands:
//   • agent_wallet_balance_log — one time-series row per run. Columns:
//       usdc, sol            → the live balances
//       low_balance          → alert flag (usdc < threshold)
//       threshold_usdc       → the alert threshold in force at sample time
//       usdc_delta           → usdc change vs the previous sample (− = spent)
//       spend_rate_usdc_hr   → derived burn rate (USDC/hour) since last sample
//   • Redis x402:wallet-balance:latest — newest sample (configured, usdc, sol,
//     low_balance, ts) for cheap dashboard reads without a DB round-trip.
//   • Redis x402:wallet-balance:alert  — present (with TTL) only while the wallet
//     is below threshold, so a consumer can detect the alert state in one GET.
//
// Downstream consumer: api/ops/health.js reads the latest balance sample and
// folds a low / unconfigured wallet into the internal health verdict, so the
// status dashboard and on-call alerting surface "top up the agent wallet"
// before autonomous calls begin to fail. The time-series rows back the spend-
// rate trend an operator reads to decide how much to top up.

import { randomUUID } from 'node:crypto';

import { fetchWithTimeout, loadSeedKeypair, USDC_MINT } from './pay.js';
import { SPONSOR_SOL_FLOOR_LAMPORTS } from './self-facilitator.js';
import { sql as defaultSql } from '../db.js';
import { env } from '../env.js';
import { sendOpsAlert } from '../alerts.js';
import { solanaConnection } from '../solana/connection.js';
import { logger } from '../usage.js';

const log = logger('x402-wallet-balance-monitor');

const LAMPORTS_PER_SOL = 1_000_000_000;

// ── Ring-wallet floors ──────────────────────────────────────────────────────
// The closed-loop ring has three platform-controlled wallets (payer, treasury,
// sponsor). Each has a role-appropriate floor the monitor watches so the loop
// never silently halts on a drained fee wallet or an empty USDC float:
//   • sponsor SOL — the fee wallet. At/below the facilitator's own hard floor
//     (X402_SPONSOR_SOL_FLOOR_LAMPORTS, default 0.02 SOL) settlement is refused
//     and the ring pauses. Alert BEFORE that so an operator (or the economy
//     master's treasury-topup cron) can refill first. Watched at 1.5× the floor.
//   • payer SOL — in self-pay mode (X402_RING_SELF_PAY) the payer pays its own
//     1-signature fee, so it needs the same SOL headroom as the sponsor.
//   • payer USDC — the recirculating float. Below this the daily volume cap can
//     no longer be funded. New env X402_RING_PAYER_USDC_FLOOR_ATOMIC, default $5.
//   • treasury — UNBOUNDED. It only receives ring payments and gets swept back
//     to the payer by the rebalancer, so a low balance is its healthy resting
//     state, not an alert condition.
const RING_SOL_FLOOR_LAMPORTS = Math.round(SPONSOR_SOL_FLOOR_LAMPORTS * 1.5);
const RING_PAYER_USDC_FLOOR_ATOMIC = Number(
	env.X402_RING_PAYER_USDC_FLOOR_ATOMIC || process.env.X402_RING_PAYER_USDC_FLOOR_ATOMIC || 5_000_000,
);

const REDIS_RING_KEY = 'x402:ring-wallets:latest';

// Low-balance alert threshold (USDC). Default $5 — below this the autonomous
// loop's own daily cap ($5) can no longer be fully funded, so it's the natural
// "top up now" line. Override via env without a redeploy.
const ALERT_THRESHOLD_USDC = Number(env.X402_WALLET_BALANCE_ALERT_USDC || process.env.X402_WALLET_BALANCE_ALERT_USDC || 5);

const REDIS_LATEST_KEY = 'x402:wallet-balance:latest';
const REDIS_ALERT_KEY = 'x402:wallet-balance:alert';
// Alert key TTL: a little over two monitor cycles (10 min) so a missed run
// lets the flag lapse to "unknown" rather than latching a stale alert forever.
const ALERT_TTL_SECONDS = 25 * 60;

// One-time DDL guard per warm instance (mirrors the loop's ensureSchema idiom).
let _schemaReady = false;
async function ensureSchema(sql) {
	if (_schemaReady) return;
	await sql`
		CREATE TABLE IF NOT EXISTS agent_wallet_balance_log (
			id                 bigserial PRIMARY KEY,
			ts                 timestamptz NOT NULL DEFAULT now(),
			run_id             uuid,
			address            text,
			configured         boolean NOT NULL DEFAULT true,
			usdc               numeric(20,6),
			sol                numeric(20,9),
			low_balance        boolean NOT NULL DEFAULT false,
			threshold_usdc     numeric(20,6),
			usdc_delta         numeric(20,6),
			spend_rate_usdc_hr numeric(20,6),
			source             text
		)
	`;
	await sql`CREATE INDEX IF NOT EXISTS agent_wallet_balance_log_ts ON agent_wallet_balance_log (ts DESC)`;
	_schemaReady = true;
}

// Most-recent prior sample, for delta + spend-rate derivation. Returns null on
// first run or any DB hiccup (the monitor still records the current sample).
async function previousSample(sql) {
	try {
		const [row] = await sql`
			SELECT usdc, extract(epoch FROM ts) AS ts_epoch
			FROM agent_wallet_balance_log
			WHERE configured = true AND usdc IS NOT NULL
			ORDER BY ts DESC
			LIMIT 1
		`;
		if (!row) return null;
		return { usdc: Number(row.usdc), tsEpoch: Number(row.ts_epoch) };
	} catch (err) {
		if (!/does not exist/i.test(err?.message || '')) {
			log.warn('balance_prev_sample_failed', { message: err?.message });
		}
		return null;
	}
}

// Persist the alert/latest state to Redis for cheap, DB-free consumer reads.
async function writeRedisState(redis, sample) {
	if (!redis) return;
	try {
		await redis.set(REDIS_LATEST_KEY, JSON.stringify(sample), { ex: ALERT_TTL_SECONDS });
		if (sample.low_balance) {
			await redis.set(REDIS_ALERT_KEY, JSON.stringify({
				usdc: sample.usdc,
				threshold: sample.threshold_usdc,
				address: sample.address,
				ts: sample.ts,
			}), { ex: ALERT_TTL_SECONDS });
		} else {
			// Cleared — wallet is healthy again, drop any lingering alert flag.
			await redis.del(REDIS_ALERT_KEY);
		}
	} catch (err) {
		log.warn('balance_redis_write_failed', { message: err?.message });
	}
}

/**
 * Run the wallet balance monitor. Conforms to the run()-style registry contract.
 *
 * @param {object} ctx — supplied by the autonomous loop:
 *   { origin, redis, sql, log, runId }. All optional for standalone/manual runs.
 * @returns the aggregate outcome the loop records to x402_autonomous_log:
 *   { success, amountAtomic, txSig, responseData, signalData, errorMsg, note }
 */
export async function run(ctx = {}) {
	const runId = ctx.runId || randomUUID();
	const origin = ctx.origin || env.APP_ORIGIN || 'https://three.ws';
	const sql = ctx.sql || defaultSql;
	const redis = ctx.redis || null;
	const endpointUrl = `${origin}/api/x402-pay?balance=1`;

	// Schema first: without the sink there's no time-series to write.
	try {
		await ensureSchema(sql);
	} catch (err) {
		log.warn('balance_schema_failed', { message: err?.message });
		return { success: false, amountAtomic: 0, txSig: null, skipped: true, errorMsg: `schema_failed: ${err?.message}` };
	}

	// ── Read the live balance (free GET — no 402, no payment) ─────────────────
	let body;
	try {
		const res = await fetchWithTimeout(endpointUrl, {
			method: 'GET',
			headers: { 'user-agent': 'threews-x402-wallet-monitor/1.0' },
		});
		if (!res.ok) {
			const errorMsg = `balance_http_${res.status}`;
			log.warn('balance_read_non_ok', { status: res.status });
			return {
				success: false, amountAtomic: 0, txSig: null,
				responseData: { status: res.status }, errorMsg, note: errorMsg,
			};
		}
		body = res.body;
	} catch (err) {
		// Network failure / timeout — never crash the loop.
		const errorMsg = `balance_fetch_failed: ${err?.message || 'network'}`;
		log.warn('balance_fetch_failed', { message: err?.message });
		return { success: false, amountAtomic: 0, txSig: null, errorMsg, note: 'fetch_failed' };
	}

	const configured = body?.configured === true;
	const address = body?.address || null;
	const usdc = configured ? Number(body?.usdc ?? 0) : null;
	const sol = configured ? Number(body?.sol ?? 0) : null;
	const lowBalance = configured && Number.isFinite(usdc) && usdc < ALERT_THRESHOLD_USDC;

	// ── Derive spend rate vs the previous sample ──────────────────────────────
	let usdcDelta = null;
	let spendRateUsdcHr = null;
	if (configured && Number.isFinite(usdc)) {
		const prev = await previousSample(sql);
		if (prev && Number.isFinite(prev.usdc)) {
			usdcDelta = usdc - prev.usdc; // negative = spent since last sample
			const hours = (Date.now() / 1000 - prev.tsEpoch) / 3600;
			if (hours > 0) {
				// Positive burn rate = USDC leaving the wallet per hour.
				spendRateUsdcHr = -usdcDelta / hours;
			}
		}
	}

	// ── Persist the time-series sample ────────────────────────────────────────
	try {
		await sql`
			INSERT INTO agent_wallet_balance_log
				(ts, run_id, address, configured, usdc, sol,
				 low_balance, threshold_usdc, usdc_delta, spend_rate_usdc_hr, source)
			VALUES
				(now(), ${runId}, ${address}, ${configured}, ${usdc}, ${sol},
				 ${lowBalance}, ${ALERT_THRESHOLD_USDC}, ${usdcDelta}, ${spendRateUsdcHr}, ${endpointUrl})
		`;
	} catch (err) {
		// DB failure on the sink is logged but must not crash the loop; the call
		// itself succeeded, so report the read result with a recording note.
		log.warn('balance_insert_failed', { message: err?.message });
	}

	// ── Publish alert/latest state for cheap consumer reads ───────────────────
	const sample = {
		ts: new Date().toISOString(),
		address,
		configured,
		usdc,
		sol,
		low_balance: lowBalance,
		threshold_usdc: ALERT_THRESHOLD_USDC,
		usdc_delta: usdcDelta,
		spend_rate_usdc_hr: spendRateUsdcHr,
	};
	await writeRedisState(redis, sample);

	if (lowBalance) {
		log.warn('agent_wallet_low_balance', {
			run_id: runId, address, usdc, threshold: ALERT_THRESHOLD_USDC,
			spend_rate_usdc_hr: spendRateUsdcHr,
		});
	} else if (!configured) {
		log.info('agent_wallet_unconfigured', { run_id: runId });
	} else {
		log.info('agent_wallet_balance_ok', {
			run_id: runId, usdc, sol, spend_rate_usdc_hr: spendRateUsdcHr,
		});
	}

	const signalData = {
		configured,
		address,
		usdc,
		sol,
		low_balance: lowBalance,
		threshold_usdc: ALERT_THRESHOLD_USDC,
		usdc_delta: usdcDelta,
		spend_rate_usdc_hr: spendRateUsdcHr,
	};

	return {
		// success = we obtained a live, usable reading from a configured wallet.
		// An unconfigured wallet is a real, recorded state (not a crash) but not a
		// healthy reading — surface it as not-success so health can flag it.
		success: configured,
		amountAtomic: 0,
		txSig: null,
		responseData: { configured, address, usdc, sol },
		signalData,
		errorMsg: configured ? null : (body?.code || 'wallet_unconfigured'),
		note: configured
			? `usdc=${usdc?.toFixed?.(4) ?? usdc} sol=${sol?.toFixed?.(4) ?? sol}${lowBalance ? ' LOW_BALANCE' : ''}`
			: 'wallet_unconfigured',
	};
}

export const WALLET_BALANCE = Object.freeze({
	endpoint: '/api/x402-pay?balance=1',
	alertThresholdUsdc: ALERT_THRESHOLD_USDC,
	redisLatestKey: REDIS_LATEST_KEY,
	redisAlertKey: REDIS_ALERT_KEY,
});

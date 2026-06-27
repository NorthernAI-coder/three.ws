// GET /api/cron/x402-autonomous-loop
//
// Scheduled autonomous agent spend loop — the engine that makes three.ws an
// active participant in the x402 agent-to-agent economy rather than just a
// passive facilitator.
//
// Each tick:
//   1. Selects up to MAX_PER_TICK ready entries from autonomous-registry.js
//      (entries whose cooldown has elapsed, sorted by priority desc).
//   2. For each entry, probes the endpoint for a 402 challenge, builds a
//      Solana USDC payment, fires the request with X-PAYMENT header.
//   3. Records every call to x402_autonomous_log (success AND failure).
//   4. For oracle/sniper pipeline entries, extracts signal data and upserts
//      into oracle_intel_signals for the sniper oracle gate to consume.
//   5. Enforces a daily USDC spend cap across all calls in this loop.
//
// Real on-chain payments only — no mocks, no simulations.
//
// Env:
//   X402_SEED_SOLANA_SECRET_BASE58     seeder keypair (preferred)
//   X402_AGENT_SOLANA_SECRET_BASE58    fallback agent keypair
//   X402_AUTONOMOUS_ENABLED            'false' to pause (default: enabled)
//   X402_AUTONOMOUS_MAX_PER_TICK       max calls per cron tick (default: 8)
//   X402_AUTONOMOUS_DAILY_CAP_ATOMIC   daily USDC cap in atomics (default: 5000000 = $5)
//   CRON_SECRET                        required Vercel cron auth

import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import bs58 from 'bs58';
import {
	Connection, PublicKey, Keypair, TransactionMessage, VersionedTransaction,
	ComputeBudgetProgram,
} from '@solana/web3.js';
import {
	getAssociatedTokenAddressSync, createTransferCheckedInstruction,
	createAssociatedTokenAccountIdempotentInstruction,
	TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID, getMint,
} from '@solana/spl-token';

import { json, wrapCron } from '../_lib/http.js';
import { env } from '../_lib/env.js';
import { constantTimeEquals } from '../_lib/crypto.js';
import { getRedis } from '../_lib/redis.js';
import { sql } from '../_lib/db.js';
import { solanaConnection } from '../_lib/solana/connection.js';
import { logger } from '../_lib/usage.js';
import {
	getFullRegistry,
	MAX_PER_TICK,
	DAILY_CAP_ATOMIC,
} from '../_lib/x402/autonomous-registry.js';

const log = logger('x402-autonomous-loop');

const ORIGIN = () => env.APP_ORIGIN || 'https://three.ws';
const USDC_MINT = env.X402_ASSET_MINT_SOLANA;
const SOLANA_RPC = env.SOLANA_RPC_URL;
const FETCH_TIMEOUT_MS = 20_000;

// Redis key prefix for cooldown tracking.
const COOLDOWN_PREFIX = 'x402:auto:last:';
// Redis key for daily spend accumulator (resets each UTC calendar day).
const DAILY_SPEND_KEY = () => `x402:auto:daily:${new Date().toISOString().slice(0, 10)}`;

function requireCron(req, res) {
	const secret = process.env.CRON_SECRET || env.CRON_SECRET;
	if (!secret) { json(res, 503, { error: 'CRON_SECRET unset' }); return false; }
	const auth = req.headers['authorization'] || '';
	const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
	if (!constantTimeEquals(token, secret)) { json(res, 401, { error: 'unauthorized' }); return false; }
	return true;
}

function loadSeedKeypair() {
	const b58 = process.env.X402_SEED_SOLANA_SECRET_BASE58
		|| process.env.X402_AGENT_SOLANA_SECRET_BASE58;
	if (b58) {
		const raw = bs58.decode(b58);
		if (raw.length !== 64) throw new Error(`seed keypair: expected 64 bytes, got ${raw.length}`);
		return Keypair.fromSecretKey(raw);
	}
	if (process.env.NODE_ENV !== 'production') {
		try {
			const arr = JSON.parse(readFileSync('/home/codespace/.config/x402-test-wallets/solana.json', 'utf8'));
			return Keypair.fromSecretKey(Uint8Array.from(arr));
		} catch { /* fall through */ }
	}
	throw new Error('autonomous loop: seed keypair not configured (set X402_SEED_SOLANA_SECRET_BASE58)');
}

async function fetchWithTimeout(url, opts = {}) {
	const ctrl = new AbortController();
	const t = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
	try {
		const res = await fetch(url, { ...opts, signal: ctrl.signal, redirect: 'manual' });
		let body = null;
		try { body = await res.json(); } catch { try { body = await res.text(); } catch { body = null; } }
		return { ok: res.ok, status: res.status, headers: res.headers, body };
	} finally {
		clearTimeout(t);
	}
}

function parseSolanaAccept(challenge) {
	if (!challenge || !Array.isArray(challenge.accepts)) return null;
	return challenge.accepts.find(
		(a) => typeof a?.network === 'string' && a.network.startsWith('solana'),
	) || null;
}

function buildPaymentTx({ accept, buyer, blockhash, mintInfo, receiverAtaExists }) {
	const mint = new PublicKey(accept.asset);
	const payTo = new PublicKey(accept.payTo);
	const feePayer = new PublicKey(accept.extra.feePayer);
	const amount = BigInt(accept.amount);

	const senderAta = getAssociatedTokenAddressSync(
		mint, buyer.publicKey, false, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID,
	);
	const receiverAta = getAssociatedTokenAddressSync(
		mint, payTo, false, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID,
	);

	const ixs = [
		ComputeBudgetProgram.setComputeUnitLimit({ units: 60_000 }),
		ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 5 }),
	];
	if (!receiverAtaExists) {
		ixs.push(createAssociatedTokenAccountIdempotentInstruction(
			feePayer, receiverAta, payTo, mint, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID,
		));
	}
	ixs.push(createTransferCheckedInstruction(
		senderAta, mint, receiverAta, buyer.publicKey,
		amount, mintInfo.decimals, [], TOKEN_PROGRAM_ID,
	));

	const msg = new TransactionMessage({
		payerKey: feePayer,
		recentBlockhash: blockhash,
		instructions: ixs,
	}).compileToV0Message();
	const vtx = new VersionedTransaction(msg);
	vtx.sign([buyer]);
	return Buffer.from(vtx.serialize()).toString('base64');
}

async function recordLog(runId, entry, { amountAtomic, txSig, responseData, durationMs, success, errorMsg, signalData }) {
	try {
		await sql`
			INSERT INTO x402_autonomous_log
				(run_id, endpoint_type, service_name, endpoint_url,
				 network, amount_atomic, asset, tx_signature,
				 response_data, signal_data, duration_ms, success, error_msg, pipeline)
			VALUES
				(${runId}, ${entry.url ? 'external' : 'self'},
				 ${entry.name}, ${entry.url || entry.path},
				 ${'solana:mainnet'}, ${amountAtomic || 0},
				 ${USDC_MINT || 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'},
				 ${txSig || null},
				 ${responseData ? JSON.stringify(responseData) : null},
				 ${signalData ? JSON.stringify(signalData) : null},
				 ${durationMs || 0}, ${success}, ${errorMsg || null},
				 ${entry.pipeline || 'unknown'})
		`;
	} catch (err) {
		log.warn('autonomous_log_insert_failed', { id: entry.id, message: err?.message });
	}
}

async function upsertOracleSignal(entry, signalData) {
	if (!signalData || entry.pipeline !== 'oracle') return;
	try {
		await sql`
			INSERT INTO oracle_intel_signals
				(source_id, topic, signal, headline, confidence, price_usd, raw, ts)
			VALUES
				(${entry.id}, ${signalData.topic || entry.id},
				 ${signalData.signal || null}, ${signalData.headline || null},
				 ${signalData.confidence || null}, ${signalData.price_usd || null},
				 ${JSON.stringify(signalData)}, now())
			ON CONFLICT (source_id, topic)
			DO UPDATE SET
				signal     = EXCLUDED.signal,
				headline   = EXCLUDED.headline,
				confidence = EXCLUDED.confidence,
				price_usd  = EXCLUDED.price_usd,
				raw        = EXCLUDED.raw,
				ts         = now()
		`;
	} catch (err) {
		// Table may not exist yet — suppress, it will be created by the migration.
		if (!err?.message?.includes('does not exist')) {
			log.warn('oracle_signal_upsert_failed', { id: entry.id, message: err?.message });
		}
	}
}

async function ensureSchema() {
	// x402_autonomous_log: records every autonomous loop call.
	try {
		await sql`
			CREATE TABLE IF NOT EXISTS x402_autonomous_log (
				id              bigserial PRIMARY KEY,
				run_id          uuid NOT NULL,
				ts              timestamptz DEFAULT now(),
				endpoint_type   text NOT NULL CHECK (endpoint_type IN ('self', 'external')),
				service_name    text NOT NULL,
				endpoint_url    text NOT NULL,
				network         text NOT NULL DEFAULT 'solana:mainnet',
				amount_atomic   bigint NOT NULL DEFAULT 0,
				asset           text,
				tx_signature    text,
				response_data   jsonb,
				signal_data     jsonb,
				duration_ms     int,
				success         boolean NOT NULL,
				error_msg       text,
				pipeline        text
			)
		`;
	} catch { /* already exists or migration system handles it */ }

	// oracle_intel_signals: deduped latest signal per source+topic.
	// The sniper oracle gate queries this to enrich conviction scores.
	try {
		await sql`
			CREATE TABLE IF NOT EXISTS oracle_intel_signals (
				source_id   text NOT NULL,
				topic       text NOT NULL,
				signal      text,
				headline    text,
				confidence  numeric(5,2),
				price_usd   numeric(20,8),
				raw         jsonb,
				ts          timestamptz DEFAULT now(),
				PRIMARY KEY (source_id, topic)
			)
		`;
	} catch { /* already exists */ }
}

async function getDailySpend(redis) {
	if (!redis) return 0;
	try {
		const val = await redis.get(DAILY_SPEND_KEY());
		return val ? Number(val) : 0;
	} catch { return 0; }
}

async function incrementDailySpend(redis, atomics) {
	if (!redis || !atomics) return;
	try {
		const key = DAILY_SPEND_KEY();
		await redis.incrby(key, atomics);
		await redis.expire(key, 86400 * 2); // 2-day TTL (covers UTC rollover)
	} catch { /* non-fatal */ }
}

async function isCoolingDown(redis, entry) {
	if (!redis) return false;
	try {
		const val = await redis.get(`${COOLDOWN_PREFIX}${entry.id}`);
		return !!val;
	} catch { return false; }
}

async function setCooldown(redis, entry) {
	if (!redis || !entry.cooldown_s) return;
	try {
		await redis.set(`${COOLDOWN_PREFIX}${entry.id}`, '1', { ex: entry.cooldown_s });
	} catch { /* non-fatal */ }
}

// ── Main handler ──────────────────────────────────────────────────────────────

export default wrapCron(async (req, res) => {
	if (req.method !== 'GET') return json(res, 405, { error: 'method_not_allowed' });
	if (!requireCron(req, res)) return;

	if (process.env.X402_AUTONOMOUS_ENABLED === 'false') {
		return json(res, 200, { ok: true, skipped: true, reason: 'X402_AUTONOMOUS_ENABLED=false' });
	}

	const runId = randomUUID();
	const origin = ORIGIN();
	const redis = getRedis();

	// ── Pre-flight checks ─────────────────────────────────────────────────────
	let buyer;
	try { buyer = loadSeedKeypair(); } catch (err) {
		return json(res, 200, { ok: false, skipped: true, reason: err.message });
	}

	if (redis) {
		try { await redis.ping(); } catch (err) {
			return json(res, 200, { ok: false, skipped: true, reason: `redis_unavailable: ${err?.message}` });
		}
	}

	// ── Daily spend cap check ─────────────────────────────────────────────────
	const dailySpentSoFar = await getDailySpend(redis);
	if (dailySpentSoFar >= DAILY_CAP_ATOMIC) {
		log.info('autonomous_daily_cap_reached', { spent: dailySpentSoFar, cap: DAILY_CAP_ATOMIC });
		return json(res, 200, { ok: true, skipped: true, reason: 'daily_cap_reached', spent_usdc: dailySpentSoFar / 1e6 });
	}

	// ── Ensure schema exists ──────────────────────────────────────────────────
	await ensureSchema();

	// ── Select ready entries ──────────────────────────────────────────────────
	const registry = getFullRegistry();
	const readyChecks = await Promise.all(
		registry.map(async (entry) => {
			const cooling = await isCoolingDown(redis, entry);
			return { entry, ready: !cooling };
		}),
	);
	const ready = readyChecks
		.filter((e) => e.ready)
		.map((e) => e.entry)
		.sort((a, b) => (b.priority || 0) - (a.priority || 0))
		.slice(0, MAX_PER_TICK);

	if (ready.length === 0) {
		return json(res, 200, { ok: true, skipped: true, reason: 'all_cooling_down', run_id: runId });
	}

	// ── Shared Solana state (one blockhash per tick, shared across all calls) ─
	const conn = solanaConnection({ url: SOLANA_RPC, commitment: 'confirmed' });
	let blockhash, mintInfo;
	try {
		[{ blockhash }, mintInfo] = await Promise.all([
			conn.getLatestBlockhash('confirmed'),
			getMint(conn, new PublicKey(USDC_MINT)),
		]);
	} catch (err) {
		return json(res, 200, { ok: false, reason: `solana_preflight_failed: ${err?.message}`, run_id: runId });
	}

	// ── Process each entry ────────────────────────────────────────────────────
	const results = [];
	let remainingCap = DAILY_CAP_ATOMIC - dailySpentSoFar;

	for (const entry of ready) {
		if (remainingCap <= 0) break;

		const endpointUrl = entry.url || `${origin}${entry.path}`;
		const t0 = Date.now();
		let amountAtomic = 0;
		let txSig = null;
		let success = false;
		let errorMsg = null;
		let responseBody = null;
		let signalData = null;

		try {
			// Step 1: probe for 402 challenge
			const probeRes = await fetchWithTimeout(endpointUrl, {
				method: entry.method || 'POST',
				headers: { 'content-type': 'application/json', 'user-agent': 'threews-x402-autonomous/1.0' },
				...(entry.body != null ? { body: JSON.stringify(entry.body) } : {}),
			});

			if (probeRes.status !== 402) {
				// Free endpoint — record as success without payment.
				success = true;
				responseBody = probeRes.body;
				if (entry.extractSignal) signalData = entry.extractSignal(responseBody);
				results.push({ id: entry.id, status: 'free', success });
				await recordLog(runId, entry, { amountAtomic: 0, txSig: null, responseData: responseBody, durationMs: Date.now() - t0, success, signalData });
				if (signalData) await upsertOracleSignal(entry, signalData);
				await setCooldown(redis, entry);
				continue;
			}

			const accept = parseSolanaAccept(probeRes.body);
			if (!accept) {
				errorMsg = 'no_solana_accept';
				results.push({ id: entry.id, status: 'skip', reason: errorMsg });
				continue;
			}
			if (!USDC_MINT || accept.asset !== USDC_MINT) {
				errorMsg = `unexpected_asset:${accept.asset}`;
				results.push({ id: entry.id, status: 'skip', reason: errorMsg });
				continue;
			}
			if (!accept.extra?.feePayer) {
				errorMsg = 'missing_fee_payer';
				results.push({ id: entry.id, status: 'skip', reason: errorMsg });
				continue;
			}

			amountAtomic = Number(accept.amount || 0);
			if (amountAtomic > remainingCap) {
				log.info('autonomous_cap_would_exceed', { id: entry.id, amount: amountAtomic, remaining: remainingCap });
				results.push({ id: entry.id, status: 'skip', reason: 'cap_would_exceed' });
				continue;
			}

			// Step 2: check if receiver ATA exists (optimization — share lookup)
			const receiverAta = getAssociatedTokenAddressSync(
				new PublicKey(accept.asset), new PublicKey(accept.payTo),
				false, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID,
			);
			const receiverAtaInfo = await conn.getAccountInfo(receiverAta).catch(() => null);

			// Step 3: build signed tx
			const txBase64 = buildPaymentTx({
				accept, buyer, blockhash, mintInfo,
				receiverAtaExists: receiverAtaInfo !== null,
			});

			const xPayment = Buffer.from(JSON.stringify({
				x402Version: 2,
				scheme: 'exact',
				network: accept.network,
				resource: { url: endpointUrl, mimeType: 'application/json' },
				payload: { transaction: txBase64 },
				accepted: accept,
			})).toString('base64');

			// Step 4: fire with payment
			const paidRes = await fetchWithTimeout(endpointUrl, {
				method: entry.method || 'POST',
				headers: {
					'content-type': 'application/json',
					'user-agent': 'threews-x402-autonomous/1.0',
					'x-payment': xPayment,
				},
				...(entry.body != null ? { body: JSON.stringify(entry.body) } : {}),
			});

			responseBody = paidRes.body;
			success = paidRes.ok;

			if (success) {
				// Extract tx signature from X-PAYMENT-RESPONSE header if present.
				const responseHeader = paidRes.headers?.get?.('x-payment-response');
				if (responseHeader) {
					try {
						const settled = JSON.parse(Buffer.from(responseHeader, 'base64').toString('utf8'));
						txSig = settled?.transaction || null;
					} catch { /* non-fatal */ }
				}

				remainingCap -= amountAtomic;
				await incrementDailySpend(redis, amountAtomic);
				if (entry.extractSignal) signalData = entry.extractSignal(responseBody);
				await setCooldown(redis, entry);
				if (signalData) await upsertOracleSignal(entry, signalData);
			} else {
				errorMsg = `http_${paidRes.status}`;
			}

			results.push({ id: entry.id, status: success ? 'paid' : 'error', amount_usdc: amountAtomic / 1e6, tx: txSig });
		} catch (err) {
			errorMsg = err?.message || 'unknown_error';
			results.push({ id: entry.id, status: 'error', reason: errorMsg });
		}

		await recordLog(runId, entry, {
			amountAtomic,
			txSig,
			responseData: responseBody,
			durationMs: Date.now() - t0,
			success,
			errorMsg,
			signalData,
		});
	}

	const paid = results.filter((r) => r.status === 'paid');
	const totalUsdc = paid.reduce((s, r) => s + (r.amount_usdc || 0), 0);

	log.info('autonomous_tick_complete', {
		run_id: runId,
		ready: ready.length,
		called: results.length,
		paid: paid.length,
		total_usdc: totalUsdc.toFixed(4),
		payer: buyer.publicKey.toBase58(),
	});

	return json(res, 200, {
		ok: true,
		run_id: runId,
		ready: ready.length,
		called: results.length,
		paid: paid.length,
		total_usdc: totalUsdc.toFixed(4),
		daily_spent_usdc: (dailySpentSoFar / 1e6 + totalUsdc).toFixed(4),
		daily_cap_usdc: (DAILY_CAP_ATOMIC / 1e6).toFixed(2),
		results,
	});
});

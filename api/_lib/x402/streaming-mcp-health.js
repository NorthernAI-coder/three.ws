// api/_lib/x402/streaming-mcp-health.js
//
// SSE Streaming MCP Health — a custom-execution entry for the x402 autonomous
// spend loop (see autonomous-registry.js → entry `mcp-sse-stream-health`).
//
// What it does, on every run:
//   1. Probes POST /api/mcp as a plain x402 agent to obtain the 402 challenge.
//   2. Builds a REAL Solana USDC payment for a single priced tools/call
//      (validate_model on a tiny, public, self-hosted canary GLB).
//   3. Fires the paid request in *SSE mode* — Accept: text/event-stream — and
//      reads the HTTP response as a STREAM, not a single buffered body. It
//      measures time-to-first-byte, per-chunk gaps, chunk count, and total
//      bytes, and classifies the stream as clean / stalled / dropped. This is
//      what verifies the streaming response arrives intact before close and
//      surfaces broken chunked encoding or a server that hangs mid-response.
//   4. Confirms settlement via the X-PAYMENT-RESPONSE header (the MCP server
//      only broadcasts the payment when the tool actually produced a result),
//      and pulls the on-chain tx signature out of it.
//   5. Stores the streaming-integrity metrics to `mcp_stream_health` and fires
//      an ops alert when a stream stalls or drops.
//
// Reality note: the /api/mcp POST handler returns a single JSON body (it does
// not yet emit token-by-token SSE frames), and GET /api/mcp answers 405 after
// auth — there is no long-lived server→client subscription to read. So this
// check honestly exercises the *paid streaming transport*: it advertises SSE
// support, streams the chunked response, and validates TTFB / inter-chunk
// liveness / complete delivery / chunked-encoding integrity. It does not fake
// token frames the server never sends.
//
// The autonomous loop owns recording to x402_autonomous_log, cooldown, and
// daily-spend accounting. This module owns the probe, the payment, the
// streaming read, and the value extraction/storage. It returns a result the
// loop records:
//   { success, amountAtomic, txSig, responseData, signalData, errorMsg,
//     skipped?, cooldown? }

import {
	PublicKey,
} from '@solana/web3.js';
import {
	getAssociatedTokenAddressSync,
	TOKEN_PROGRAM_ID,
	ASSOCIATED_TOKEN_PROGRAM_ID,
} from '@solana/spl-token';
import { sendOpsAlert } from '../alerts.js';

// Tiny, public, self-hosted Khronos sample (~160 KB) — always available at the
// canonical origin, validates cleanly, and keeps fetch+validate time low so the
// canary measures transport latency, not model size. Pinned to the canonical
// public origin (not the loop's runtime origin) so validate_model's SSRF guard
// — which only fetches public https URLs — always has a real public asset to
// pull, regardless of where the loop executes.
const CANARY_TOOL = 'validate_model';
const CANARY_GLB = 'https://three.ws/avatars/fox.glb';

// Overall wall-clock budget for the paid streaming call (must fit inside the
// loop's per-tick budget). A stall is a quieter failure: no bytes for this long
// while the connection is still open is treated as a stalled stream.
const STREAM_TIMEOUT_MS = 18_000;
const STALL_MS = 8_000;

function buildToolCallBody() {
	return {
		jsonrpc: '2.0',
		id: 1,
		method: 'tools/call',
		params: {
			name: CANARY_TOOL,
			arguments: { url: CANARY_GLB, max_issues: 5 },
		},
	};
}

// Parse whatever the streaming read accumulated. The server returns a JSON body
// today, but a future SSE upgrade would frame it as `data: {...}` lines — handle
// both so the canary keeps working across that change.
function parseStreamPayload(raw) {
	if (!raw || typeof raw !== 'string') return null;
	const trimmed = raw.trim();
	if (!trimmed) return null;
	try {
		return JSON.parse(trimmed);
	} catch { /* maybe SSE-framed */ }
	const dataLines = trimmed
		.split('\n')
		.filter((l) => l.startsWith('data:'))
		.map((l) => l.slice(5).trim())
		.filter(Boolean);
	for (let i = dataLines.length - 1; i >= 0; i--) {
		try { return JSON.parse(dataLines[i]); } catch { /* try the next-to-last frame */ }
	}
	return null;
}

// Read an HTTP response body as a stream, recording streaming-integrity metrics.
// Resolves with metrics even on stall/drop — the caller decides health from them.
async function readStream(res, { stallMs, startedAt }) {
	const metrics = {
		status: res.status,
		ttfbMs: null,
		totalMs: 0,
		chunkCount: 0,
		totalBytes: 0,
		maxGapMs: 0,
		stalled: false,
		dropped: false,
		raw: '',
	};

	if (!res.body || typeof res.body.getReader !== 'function') {
		// No readable stream (e.g. an error envelope) — fall back to buffered read.
		try { metrics.raw = await res.text(); } catch { metrics.dropped = true; }
		metrics.totalBytes = Buffer.byteLength(metrics.raw || '');
		metrics.chunkCount = metrics.raw ? 1 : 0;
		metrics.ttfbMs = Date.now() - startedAt;
		metrics.totalMs = Date.now() - startedAt;
		return metrics;
	}

	const reader = res.body.getReader();
	const decoder = new TextDecoder();
	let lastChunkAt = startedAt;

	try {
		for (;;) {
			let stallTimer = null;
			const stall = new Promise((_, reject) => {
				stallTimer = setTimeout(() => reject(new Error('stall_timeout')), stallMs);
			});
			let chunk;
			try {
				chunk = await Promise.race([reader.read(), stall]);
			} finally {
				if (stallTimer) clearTimeout(stallTimer);
			}

			if (chunk.done) break;
			const now = Date.now();
			if (metrics.ttfbMs === null) {
				metrics.ttfbMs = now - startedAt;
			} else {
				const gap = now - lastChunkAt;
				if (gap > metrics.maxGapMs) metrics.maxGapMs = gap;
			}
			lastChunkAt = now;
			metrics.chunkCount++;
			metrics.totalBytes += chunk.value?.byteLength || 0;
			metrics.raw += decoder.decode(chunk.value, { stream: true });
		}
		metrics.raw += decoder.decode();
	} catch (err) {
		if (err?.message === 'stall_timeout') metrics.stalled = true;
		else metrics.dropped = true; // abort / connection reset / overall timeout
		try { await reader.cancel(); } catch { /* already torn down */ }
	}

	if (metrics.ttfbMs === null) metrics.ttfbMs = Date.now() - startedAt;
	metrics.totalMs = Date.now() - startedAt;
	return metrics;
}

async function ensureStreamHealthTable(sql) {
	try {
		await sql`
			CREATE TABLE IF NOT EXISTS mcp_stream_health (
				id            bigserial PRIMARY KEY,
				ts            timestamptz DEFAULT now(),
				endpoint      text NOT NULL,
				tool          text NOT NULL,
				status_code   int,
				ttfb_ms       int,
				total_ms      int,
				chunk_count   int,
				total_bytes   bigint,
				max_gap_ms    int,
				stalled       boolean NOT NULL DEFAULT false,
				dropped       boolean NOT NULL DEFAULT false,
				settled       boolean NOT NULL DEFAULT false,
				healthy       boolean NOT NULL,
				tx_signature  text,
				error_msg     text
			)
		`;
	} catch { /* already exists or migration system handles it */ }
}

async function storeStreamHealth(sql, log, row) {
	try {
		await ensureStreamHealthTable(sql);
		await sql`
			INSERT INTO mcp_stream_health
				(endpoint, tool, status_code, ttfb_ms, total_ms, chunk_count,
				 total_bytes, max_gap_ms, stalled, dropped, settled, healthy,
				 tx_signature, error_msg)
			VALUES
				(${row.endpoint}, ${row.tool}, ${row.status_code},
				 ${row.ttfb_ms}, ${row.total_ms}, ${row.chunk_count},
				 ${row.total_bytes}, ${row.max_gap_ms}, ${row.stalled},
				 ${row.dropped}, ${row.settled}, ${row.healthy},
				 ${row.tx_signature || null}, ${row.error_msg || null})
		`;
	} catch (err) {
		// DB failure must never crash the loop — log and move on.
		log?.warn?.('mcp_stream_health_insert_failed', { message: err?.message });
	}
}

/**
 * Custom-execution handler invoked by the autonomous loop for the
 * `mcp-sse-stream-health` registry entry.
 *
 * @param {object} ctx — supplied by the loop:
 *   origin, endpointUrl, buyer (Keypair), conn, blockhash, mintInfo,
 *   usdcMint, remainingCap, fetchWithTimeout, parseSolanaAccept,
 *   buildPaymentTx, sql, log, redis
 * @returns {Promise<object>} result the loop records to x402_autonomous_log
 */
export async function runStreamingMcpHealth(ctx) {
	const {
		endpointUrl, buyer, conn, blockhash, mintInfo, usdcMint, remainingCap,
		fetchWithTimeout, parseSolanaAccept, buildPaymentTx, sql, log,
	} = ctx;

	const fail = (errorMsg, extra = {}) => ({
		success: false, amountAtomic: 0, txSig: null,
		responseData: null, signalData: { alive: false, error: errorMsg },
		errorMsg, ...extra,
	});

	// Wallet guard (defence in depth — the loop already pre-flights the keypair).
	if (!buyer) return { ...fail('wallet_unconfigured'), cooldown: false };

	// ── Step 1: probe for the 402 challenge (plain x402 agent → real 402) ──────
	let probe;
	try {
		probe = await fetchWithTimeout(endpointUrl, {
			method: 'POST',
			headers: {
				'content-type': 'application/json',
				'user-agent': 'threews-x402-autonomous/1.0',
			},
			body: JSON.stringify(buildToolCallBody()),
		});
	} catch (err) {
		return { ...fail(`probe_failed:${err?.message || 'network'}`), cooldown: false };
	}

	// 402 (plain agent) or 401 (the server's MCP/OAuth challenge) both carry the
	// x402 envelope with `accepts` in the body. Anything else means the price
	// gate isn't where we expect — record and skip.
	if (probe.status !== 402 && probe.status !== 401) {
		return fail(`unexpected_probe_status:${probe.status}`);
	}
	const accept = parseSolanaAccept(probe.body);
	if (!accept) return fail('no_solana_accept');
	if (!usdcMint || accept.asset !== usdcMint) return fail(`unexpected_asset:${accept.asset}`);
	if (!accept.extra?.feePayer) return fail('missing_fee_payer');

	const amountAtomic = Number(accept.amount || 0);
	if (!(amountAtomic > 0)) return fail('zero_price');
	if (amountAtomic > remainingCap) {
		// Honor the loop's daily cap — skip without paying, retry next tick.
		return { ...fail('cap_would_exceed'), skipped: true, cooldown: false };
	}

	// ── Step 2: build the signed payment tx ────────────────────────────────────
	let xPayment;
	try {
		const receiverAta = getAssociatedTokenAddressSync(
			new PublicKey(accept.asset), new PublicKey(accept.payTo),
			false, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID,
		);
		const receiverAtaInfo = await conn.getAccountInfo(receiverAta).catch(() => null);
		const txBase64 = buildPaymentTx({
			accept, buyer, blockhash, mintInfo,
			receiverAtaExists: receiverAtaInfo !== null,
		});
		xPayment = Buffer.from(JSON.stringify({
			x402Version: 2,
			scheme: 'exact',
			network: accept.network,
			resource: { url: endpointUrl, mimeType: 'application/json' },
			payload: { transaction: txBase64 },
			accepted: accept,
		})).toString('base64');
	} catch (err) {
		return { ...fail(`build_payment_failed:${err?.message || 'unknown'}`), cooldown: false };
	}

	// ── Step 3: fire the paid call in SSE mode and read the response as a stream ─
	const startedAt = Date.now();
	const controller = new AbortController();
	const overall = setTimeout(() => controller.abort(), STREAM_TIMEOUT_MS);
	let metrics;
	try {
		const res = await fetch(endpointUrl, {
			method: 'POST',
			headers: {
				'content-type': 'application/json',
				// Advertise SSE support — this is the "SSE mode" request. The server
				// negotiates the response transport off Accept.
				accept: 'text/event-stream, application/json',
				'user-agent': 'threews-x402-autonomous/1.0',
				'x-payment': xPayment,
			},
			body: JSON.stringify(buildToolCallBody()),
			signal: controller.signal,
		});
		metrics = await readStream(res, { stallMs: STALL_MS, startedAt });
		// Settlement is proven by the X-PAYMENT-RESPONSE header — the MCP server
		// only broadcasts the payment after the tool produced a result.
		const xpr = res.headers?.get?.('x-payment-response');
		metrics.settled = !!xpr;
		metrics.txSig = null;
		if (xpr) {
			try {
				const settled = JSON.parse(Buffer.from(xpr, 'base64').toString('utf8'));
				metrics.txSig = settled?.transaction || null;
			} catch { /* header present but unparseable — still settled */ }
		}
	} catch (err) {
		// Abort fires as an error here when the overall budget is exceeded before
		// any headers arrive — treat as a dropped connection.
		metrics = {
			status: 0, ttfbMs: Date.now() - startedAt, totalMs: Date.now() - startedAt,
			chunkCount: 0, totalBytes: 0, maxGapMs: 0, stalled: false,
			dropped: true, raw: '', settled: false, txSig: null,
			abortMsg: err?.message || 'request_failed',
		};
	} finally {
		clearTimeout(overall);
	}

	// ── Step 4: classify health and extract value ──────────────────────────────
	const parsed = parseStreamPayload(metrics.raw);
	const rpcError = parsed?.error?.message || null;
	const toolError = parsed?.result?.isError === true;
	const hasResult = !!parsed?.result && !toolError && !rpcError;
	const streamClean = metrics.status === 200 && !metrics.stalled && !metrics.dropped && metrics.chunkCount > 0;
	const healthy = streamClean && hasResult && metrics.settled;

	// Payment-rejected paths: a 402/401 on the *paid* request means the payment
	// was not accepted; no settlement, so nothing was charged.
	let errorMsg = null;
	if (metrics.status === 402 || metrics.status === 401) errorMsg = `payment_rejected:${metrics.status}`;
	else if (metrics.dropped) errorMsg = `stream_dropped${metrics.abortMsg ? `:${metrics.abortMsg}` : ''}`;
	else if (metrics.stalled) errorMsg = 'stream_stalled';
	else if (rpcError) errorMsg = `rpc_error:${rpcError}`;
	else if (toolError) errorMsg = 'tool_error';
	else if (!metrics.settled) errorMsg = 'not_settled';
	else if (!hasResult) errorMsg = 'no_result';

	const signalData = {
		alive: healthy,
		tool: CANARY_TOOL,
		status: metrics.status,
		ttfb_ms: metrics.ttfbMs,
		total_ms: metrics.totalMs,
		chunk_count: metrics.chunkCount,
		total_bytes: metrics.totalBytes,
		max_gap_ms: metrics.maxGapMs,
		stalled: metrics.stalled,
		dropped: metrics.dropped,
		settled: metrics.settled,
	};

	// ── Step 5: persist the streaming-integrity metrics + alert on degradation ──
	await storeStreamHealth(sql, log, {
		endpoint: '/api/mcp',
		tool: CANARY_TOOL,
		status_code: metrics.status,
		ttfb_ms: metrics.ttfbMs,
		total_ms: metrics.totalMs,
		chunk_count: metrics.chunkCount,
		total_bytes: metrics.totalBytes,
		max_gap_ms: metrics.maxGapMs,
		stalled: metrics.stalled,
		dropped: metrics.dropped,
		settled: metrics.settled,
		healthy,
		tx_signature: metrics.txSig,
		error_msg: errorMsg,
	});

	if (metrics.stalled || metrics.dropped) {
		// Fire-and-forget: alerting must never block or crash the loop.
		sendOpsAlert(
			'MCP SSE stream degraded',
			`POST /api/mcp (${CANARY_TOOL}) ${metrics.stalled ? 'STALLED' : 'DROPPED'} — ` +
				`status ${metrics.status}, ttfb ${metrics.ttfbMs}ms, ${metrics.chunkCount} chunks, ` +
				`${metrics.totalBytes}B, max gap ${metrics.maxGapMs}ms`,
			{ signature: `mcp-sse-stream:${metrics.stalled ? 'stalled' : 'dropped'}` },
		).catch(() => {});
	}

	// `amountAtomic` reported to the loop reflects what was actually charged:
	// only a settled payment moved USDC on-chain.
	return {
		success: healthy,
		amountAtomic: metrics.settled ? amountAtomic : 0,
		txSig: metrics.txSig,
		responseData: parsed ?? (metrics.raw ? { raw: metrics.raw.slice(0, 2000) } : null),
		signalData,
		errorMsg,
	};
}

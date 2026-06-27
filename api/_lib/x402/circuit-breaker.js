// api/_lib/x402/circuit-breaker.js
//
// Cross-Network Payment Circuit Breaker — the cheapest possible end-to-end
// proof that the entire x402 payment stack is alive.
//
// Once per hour the autonomous loop calls runCircuitBreaker() via the registry
// entry's run() hook. It:
//
//   1. Probes a real $0.001 402-gated three.ws endpoint (dance-tip) for a live
//      payment challenge.
//   2. Inspects the challenge's `accepts` array and confirms the facilitator
//      advertises a well-formed route for EVERY supported network — Solana
//      (scheme=exact), Base (scheme=exact), and BSC (scheme=direct). A missing
//      or malformed accept means a facilitator/config route has gone dark: the
//      breaker trips for that network.
//   3. Settles a REAL $0.001 USDC payment on Solana — the only network with a
//      configured autonomous outbound keypair (X402_AGENT_SOLANA_SECRET_BASE58)
//      — to prove that build → verify → settle → receipt works end-to-end, not
//      just that the route is advertised. Base/BSC outbound settlement is not
//      attempted because no autonomous EVM signing wallet is provisioned; their
//      route health is verified from the live challenge instead (real data, no
//      mock). The moment an autonomous EVM payer is configured, settlement for
//      those networks can be switched on here without touching the loop.
//   4. Upserts per-network status into `x402_circuit_breaker` (latest snapshot
//      keyed by network) and returns a compact summary the loop records to
//      `x402_autonomous_log`.
//
// Downstream consumer: api/ops/health.js reads `x402_circuit_breaker` and
// surfaces the payment-stack liveness (per-network route + Solana settlement)
// in the internal health dashboard, and folds a tripped breaker into the
// overall `ok` verdict. The status page / on-call alerting consume that.
//
// No mocks. Every check reads live challenge data or makes a real on-chain
// payment. If the Solana settlement fails the breaker is recorded as tripped.

// Stable network identifiers — source of truth is api/_lib/x402-spec.js
// (NETWORK_SOLANA_MAINNET / NETWORK_BASE_MAINNET / NETWORK_BSC_MAINNET). Matched
// here by chain id so this module stays free of the heavy x402-spec import graph.
const NET_SOLANA_PREFIX = 'solana';
const NET_BASE = 'eip155:8453';
const NET_BSC = 'eip155:56';

// The probe target: the cheapest real 402-gated endpoint on the platform
// ($0.001 USDC). A successful pay books one dance on the club stage — the same
// real side effect the volume entries already produce, so an hourly breaker tip
// is consistent with existing traffic.
const PROBE_PATH = '/api/x402/dance-tip';
const PROBE_METHOD = 'POST';
const PROBE_BODY = { dancer: '4', dance: 'hiphop' };

// Networks the breaker expects the platform to advertise. `settle` flags the one
// network we actually pay on (Solana) vs. those we only route-verify (Base/BSC).
const TARGET_NETWORKS = [
	{
		key: 'solana',
		label: 'Solana',
		scheme: 'exact',
		settle: true,
		match: (a) => typeof a?.network === 'string' && a.network.startsWith(NET_SOLANA_PREFIX),
		// Solana accepts must carry a fee payer for the facilitator co-sign path.
		extraValid: (a) => !!a?.extra?.feePayer,
	},
	{
		key: 'base',
		label: 'Base',
		scheme: 'exact',
		settle: false,
		match: (a) => a?.network === NET_BASE,
		extraValid: () => true,
	},
	{
		key: 'bsc',
		label: 'BSC',
		scheme: 'direct',
		settle: false,
		match: (a) => a?.network === NET_BSC,
		// Direct-scheme BSC accepts must name the payments contract + method.
		extraValid: (a) => !!a?.extra?.contract && !!a?.extra?.method,
	},
];

function validateAccept(target, accept) {
	if (!accept) {
		return { advertised: false, route_ok: false, reason: 'route_not_advertised' };
	}
	const reasons = [];
	if (accept.scheme !== target.scheme) reasons.push(`scheme:${accept.scheme || 'none'}`);
	if (!accept.payTo) reasons.push('missing_payTo');
	if (!accept.asset) reasons.push('missing_asset');
	const amount = Number(accept.amount);
	if (!Number.isFinite(amount) || amount <= 0) reasons.push('bad_amount');
	if (!target.extraValid(accept)) reasons.push('missing_extra');
	return {
		advertised: true,
		route_ok: reasons.length === 0,
		network: accept.network,
		scheme: accept.scheme,
		asset: accept.asset,
		pay_to: accept.payTo,
		amount_atomic: Number.isFinite(amount) ? amount : null,
		reason: reasons.length ? reasons.join(',') : null,
	};
}

async function upsertStatus(ctx, runId, row) {
	// Latest-status-per-network table consumed by api/ops/health.js.
	await ctx.sql`
		INSERT INTO x402_circuit_breaker
			(network, label, scheme, advertised, route_ok, settled,
			 receipt_valid, tx_signature, amount_atomic, error, run_id, checked_at)
		VALUES
			(${row.network}, ${row.label}, ${row.scheme}, ${row.advertised},
			 ${row.route_ok}, ${row.settled}, ${row.receipt_valid},
			 ${row.tx_signature || null}, ${row.amount_atomic || null},
			 ${row.error || null}, ${runId}, now())
		ON CONFLICT (network) DO UPDATE SET
			label         = EXCLUDED.label,
			scheme        = EXCLUDED.scheme,
			advertised    = EXCLUDED.advertised,
			route_ok      = EXCLUDED.route_ok,
			settled       = EXCLUDED.settled,
			receipt_valid = EXCLUDED.receipt_valid,
			tx_signature  = EXCLUDED.tx_signature,
			amount_atomic = EXCLUDED.amount_atomic,
			error         = EXCLUDED.error,
			run_id        = EXCLUDED.run_id,
			checked_at    = now()
	`;
}

/**
 * Cross-network payment circuit breaker executor.
 *
 * @param {object} ctx  Capabilities injected by the autonomous loop:
 *   - runId            string
 *   - origin           string (e.g. 'https://three.ws')
 *   - sql              db tagged-template
 *   - log              logger
 *   - fetchWithTimeout (url, opts) => { ok, status, headers, body }
 *   - parseSolanaAccept(challenge) => accept | null
 *   - settleSolana(accept, endpointUrl, entry) =>
 *         { success, txSig, amountAtomic, responseBody, errorMsg, status }
 *   - remainingCap     number (atomics still spendable under the daily cap)
 * @returns result consumed by the loop for x402_autonomous_log:
 *   { success, amountAtomic, txSig, responseData, errorMsg, signalData, network, summary }
 */
export async function runCircuitBreaker(ctx) {
	const { runId, origin, fetchWithTimeout, parseSolanaAccept, settleSolana, log } = ctx;
	const endpointUrl = `${origin}${PROBE_PATH}`;

	// ── Step 1: probe for the live multi-network challenge ─────────────────────
	let challenge;
	try {
		const probe = await fetchWithTimeout(endpointUrl, {
			method: PROBE_METHOD,
			headers: {
				'content-type': 'application/json',
				'user-agent': 'threews-x402-circuit-breaker/1.0',
			},
			body: JSON.stringify(PROBE_BODY),
		});
		if (probe.status !== 402) {
			// A $0.001 paid endpoint that does NOT challenge is itself a stack fault.
			const errorMsg = `probe_not_402:http_${probe.status}`;
			await safeUpsertTrip(ctx, runId, errorMsg);
			return {
				success: false,
				amountAtomic: 0,
				errorMsg,
				network: 'multi',
				responseData: { stage: 'probe', status: probe.status },
				signalData: { tripped: true, reason: errorMsg },
				summary: errorMsg,
			};
		}
		challenge = probe.body;
	} catch (err) {
		const errorMsg = `probe_failed:${err?.message || 'unknown'}`;
		await safeUpsertTrip(ctx, runId, errorMsg);
		return {
			success: false,
			amountAtomic: 0,
			errorMsg,
			network: 'multi',
			responseData: { stage: 'probe' },
			signalData: { tripped: true, reason: errorMsg },
			summary: errorMsg,
		};
	}

	const accepts = Array.isArray(challenge?.accepts) ? challenge.accepts : [];

	// ── Step 2: verify each network route from the live challenge ──────────────
	const networks = [];
	let solanaTarget = null;
	let solanaAccept = null;
	for (const target of TARGET_NETWORKS) {
		const accept = accepts.find((a) => target.match(a)) || null;
		const v = validateAccept(target, accept);
		const row = {
			key: target.key,
			network: accept?.network || target.label.toLowerCase(),
			label: target.label,
			scheme: target.scheme,
			advertised: v.advertised,
			route_ok: v.route_ok,
			settled: false,
			receipt_valid: false,
			tx_signature: null,
			amount_atomic: v.amount_atomic || null,
			error: v.reason,
		};
		networks.push(row);
		if (target.settle && accept && v.route_ok) {
			solanaTarget = row;
			solanaAccept = accept;
		}
	}

	// ── Step 3: settle the real $0.001 payment on Solana ───────────────────────
	let amountAtomic = 0;
	let txSig = null;
	let settleResp = null;
	if (solanaAccept) {
		if (ctx.remainingCap != null && Number(solanaAccept.amount || 0) > ctx.remainingCap) {
			solanaTarget.error = 'daily_cap_would_exceed';
		} else {
			try {
				const r = await settleSolana(solanaAccept, endpointUrl, {
					method: PROBE_METHOD,
					body: PROBE_BODY,
				});
				amountAtomic = r.amountAtomic || 0;
				txSig = r.txSig || null;
				settleResp = r.responseBody || null;
				solanaTarget.settled = !!r.success;
				solanaTarget.receipt_valid = !!(r.success && r.txSig);
				solanaTarget.tx_signature = txSig;
				solanaTarget.amount_atomic = amountAtomic || solanaTarget.amount_atomic;
				if (!r.success) solanaTarget.error = r.errorMsg || `settle_http_${r.status || '0'}`;
			} catch (err) {
				solanaTarget.error = `settle_threw:${err?.message || 'unknown'}`;
			}
		}
	}

	// ── Step 4: persist per-network status (downstream: ops/health) ────────────
	for (const row of networks) {
		try {
			await upsertStatus(ctx, runId, row);
		} catch (err) {
			// Table may not exist before its migration runs — the loop's ensureSchema
			// creates it, so this is only a first-boot race. Never crash the loop.
			if (!err?.message?.includes('does not exist')) {
				log?.warn?.('circuit_breaker_upsert_failed', { network: row.network, message: err?.message });
			}
		}
	}

	const routesOk = networks.filter((n) => n.route_ok).length;
	const allRoutesOk = routesOk === TARGET_NETWORKS.length;
	const solanaSettled = !!(solanaTarget && solanaTarget.settled);
	const tripped = !allRoutesOk || !solanaSettled;

	const signalData = {
		tripped,
		all_routes_ok: allRoutesOk,
		routes_ok: routesOk,
		routes_total: TARGET_NETWORKS.length,
		solana_settled: solanaSettled,
		solana_tx: txSig,
		networks: networks.map((n) => ({ network: n.network, route_ok: n.route_ok, settled: n.settled, error: n.error })),
	};

	const summary = `routes ${routesOk}/${TARGET_NETWORKS.length} ok, solana ${solanaSettled ? 'settled' : 'FAILED'}`;
	log?.info?.('circuit_breaker_complete', { run_id: runId, ...signalData, tx: txSig });

	return {
		// success = the breaker's job (proving liveness) completed: all routes
		// advertised + the real Solana settlement landed. A trip => success:false
		// so the loop records it as a failure row and does not cool down — the
		// breaker retries next tick instead of waiting the full hour.
		success: !tripped,
		amountAtomic,
		txSig,
		network: 'multi',
		responseData: { challenge_resource: challenge?.resource || endpointUrl, networks, settle_response: settleResp },
		errorMsg: tripped ? `breaker_tripped:${summary}` : null,
		signalData,
		summary,
	};
}

// Record a trip across all networks when we never reached the per-network stage
// (e.g. the probe itself failed) so ops/health still sees a fresh, failing row.
async function safeUpsertTrip(ctx, runId, error) {
	for (const target of TARGET_NETWORKS) {
		try {
			await upsertStatus(ctx, runId, {
				network: target.label.toLowerCase(),
				label: target.label,
				scheme: target.scheme,
				advertised: false,
				route_ok: false,
				settled: false,
				receipt_valid: false,
				tx_signature: null,
				amount_atomic: null,
				error,
			});
		} catch { /* table may not exist yet — non-fatal */ }
	}
}

export const CIRCUIT_BREAKER_PROBE = Object.freeze({ path: PROBE_PATH, method: PROBE_METHOD, body: PROBE_BODY });

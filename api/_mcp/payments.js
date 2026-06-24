import { X402Error, send402 } from '../_lib/x402-spec.js';
import { reportServerError } from '../_lib/http.js';
import {
	hashPaymentProof,
	reserveSlot,
	releaseSlot,
} from '../_lib/x402/payment-identifier-server.js';

// Always-on replay guard for the raw-verify MCP paid path.
//
// The paidEndpoint() wrapper closes the verify→deliver→settle window with a
// proof-hash reservation; the MCP servers hand-roll that dance, so they need the
// same guard. We reserve a single-use lock keyed on the SHA-256 of the signed
// X-PAYMENT proof — only the original payer can reproduce it — so a captured or
// retried payment can't re-run the (often expensive: LLM / RPC / generation) tool
// dispatch before the first settle lands.
//
// Double-CHARGE is already prevented downstream (the on-chain EIP-3009 nonce /
// Solana blockhash + the deterministic facilitator Idempotency-Key); this guard
// closes the remaining gap — free re-delivery / compute amplification from a
// concurrent replay in the narrow window before settlement broadcasts. Once a
// payment settles, the consumed nonce makes any later /verify fail, so the lock
// only needs to span dispatch+settle and the caller releases it as soon as the
// request finishes (success or failure) — leaving a transient failure free to be
// retried with the same payment.
//
// Fails OPEN: no header, or a store with no Redis, degrades to the best-effort
// in-process claim in idempotency-cache.reserve — it never blocks a legitimate
// payment, matching the paidEndpoint stance (a Redis blip must not 5xx a paid
// call when double-charge is already protected on-chain).
//
// Returns { ok, release }:
//   ok=false  → a concurrent request already holds the slot for this exact
//               payment; reject with a JSON-RPC "payment_in_flight" error.
//   release() → idempotent; call it once the request finishes (a finally block).
export async function reservePaymentProof(route, paymentHeader) {
	const hash = hashPaymentProof(paymentHeader);
	if (!hash) return { ok: true, release: async () => {} };
	const paymentId = `proof:${hash}`;
	const owns = await reserveSlot({ route, paymentId });
	let released = false;
	return {
		ok: owns,
		release: async () => {
			if (!owns || released) return;
			released = true;
			await releaseSlot({ route, paymentId });
		},
	};
}

export function sendX402Error(res, { resourceUrl, accepts }, err) {
	if (err instanceof X402Error) {
		if (err.status === 402) return send402(res, { resourceUrl, accepts, error: err.message });
		res.statusCode = err.status;
		res.setHeader('content-type', 'application/json; charset=utf-8');
		res.end(JSON.stringify({ error: err.code, error_description: err.message }));
		return;
	}
	// Unexpected (non-X402) fault — route it through the shared boundary so the
	// MCP payment path gets the same ref + Sentry capture + deduped ops alert as
	// an HTTP 5xx, then echo the ref so an agent can quote it to support.
	const ref = reportServerError(err, { code: 'mcp_x402_failed', context: { resourceUrl } });
	res.statusCode = 500;
	res.setHeader('content-type', 'application/json; charset=utf-8');
	res.end(JSON.stringify({ error: 'internal', error_description: `x402 processing failed — quote ref ${ref} to support`, ref }));
}

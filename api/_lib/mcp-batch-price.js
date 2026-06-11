// Total x402 charge for a (possibly batched) JSON-RPC MCP body.
//
// A single X-PAYMENT must cover EVERY priced tools/call the batch will execute.
// Pricing only the lone-call case (and letting multi-call batches fall back to
// the flat env default) let a caller run N priced tools — up to the batch cap —
// for one tool's price, a ~1000–3000× underpayment. We instead SUM the per-tool
// price across all tools/call so the advertised 402 amount, the verified
// payment, and the settled charge all equal the true cost of the batch.
//
// `priceForTool(name)` → atomic-unit price string for a tool, or null if free.
// `isFreeName(name)`   → true only for an explicitly public/free tool that may
//                        be served with no payment at all (e.g. getting_started).
//
// Returns { totalAmount, allFree }:
//   totalAmount — atomic-unit string sum of every priced call, or null if the
//                 batch is entirely free. Passed to authenticateRequest as the
//                 per-request x402 price.
//   allFree     — true when there is ≥1 tools/call, nothing is priced, and every
//                 call targets an explicit free/public tool → serve anonymously.
export function priceBatch(body, { priceForTool, isFreeName }) {
	const batch = Array.isArray(body) ? body : [body];
	const names = batch
		.filter((m) => m && m.method === 'tools/call')
		.map((c) => (typeof c?.params?.name === 'string' ? c.params.name : null));

	let totalAtomic = 0n;
	for (const name of names) {
		const atomic = name ? priceForTool(name) : null;
		if (!atomic) continue;
		try {
			totalAtomic += BigInt(atomic);
		} catch {
			// Non-numeric price string can't be summed; the dispatcher rejects the
			// call as unknown/invalid, so it never executes paid work uncharged.
		}
	}

	const totalAmount = totalAtomic > 0n ? totalAtomic.toString() : null;
	const allFree =
		names.length > 0 && totalAmount === null && names.every((n) => n && isFreeName(n));

	return { totalAmount, allFree };
}

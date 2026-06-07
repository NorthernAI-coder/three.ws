// Per-tool x402 pricing for the hosted IBM Granite MCP server (/api/ibm-mcp).
//
// These prices mirror the per-call USDC prices of the @three-ws/ibm-x402-mcp
// npm package (the stdio transport of the same tool suite) so the hosted
// Streamable HTTP endpoint and the local stdio server charge identically. The
// advertised 402 amount and the settled charge are both derived from this map,
// keyed by the tool actually called — see api/ibm-mcp.js.

export const TOOL_PRICING = Object.freeze({
	ibm_granite_chat: {
		amount_usdc: 0.02,
		description: 'Per call — IBM Granite 3 chat completion',
	},
	ibm_granite_code: {
		amount_usdc: 0.025,
		description: 'Per call — code generate/review/refactor/explain/test/document',
	},
	ibm_granite_embed: {
		amount_usdc: 0.005,
		description: 'Per call — batch text embeddings (≤64 inputs)',
	},
	ibm_granite_analyze: {
		amount_usdc: 0.04,
		description: 'Per call — structured document analysis',
	},
	ibm_granite_forecast: {
		amount_usdc: 0.05,
		description: 'Per call — zero-shot time-series forecast',
	},
});

export function priceFor(toolName) {
	return TOOL_PRICING[toolName] || null;
}

// USDC (and the platform's other supported stables) are 6-decimal. The x402 wire
// `amount` is an atomic-unit string; round to the nearest atomic unit so
// fractional-cent prices (e.g. 0.005) map exactly.
const USDC_DECIMALS = 6;
function usdcToAtomicString(amountUsdc) {
	return String(Math.round(Number(amountUsdc) * 10 ** USDC_DECIMALS));
}

// The x402 `amount` (atomic-unit string) to charge for a Granite tools/call.
// Derived from the advertised per-tool price so the 402 challenge and the
// settled charge agree. Returns null for unpriced tools (no charge).
export function graniteX402Amount(toolName) {
	const price = priceFor(toolName);
	if (!price || !(price.amount_usdc > 0)) return null;
	return usdcToAtomicString(price.amount_usdc);
}

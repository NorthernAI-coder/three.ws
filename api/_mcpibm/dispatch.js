// JSON-RPC dispatch for the hosted IBM Granite MCP server — a thin binding of
// the shared payment-free dispatcher (api/_lib/mcp-dispatch.js) to this server's
// Granite catalog. Per-call x402 payment is enforced at the HTTP layer
// (api/ibm-mcp.js) before dispatch, so the dispatcher itself stays payment-free.
import { makeDispatcher, PROTOCOL_VERSION } from '../_lib/mcp-dispatch.js';
import { TOOL_CATALOG, TOOLS } from './catalog.js';

export { PROTOCOL_VERSION };

const INSTRUCTIONS = [
	'x402 pay-per-use IBM Granite AI from three.ws — each tool lists its USDC price; pay per call on Base or Solana, no IBM Cloud account required.',
	'New here? Call ibm_granite_getting_started — FREE, no payment or account — for an overview, prices, and the payment flow.',
	'ibm_granite_chat(messages) — conversational AI ($0.02).',
	'ibm_granite_code(task, prompt) — generate/review/refactor/explain/test/document code ($0.025).',
	'ibm_granite_embed(inputs) — batch multilingual embeddings for RAG/search ($0.005).',
	'ibm_granite_analyze(document) — structured entities/sentiment/risk/summary/next-steps JSON ($0.04).',
	'ibm_granite_forecast(timestamps, values, freq) — zero-shot time-series forecast via Granite TTM ($0.05).',
	'Powered by IBM Granite foundation models served on IBM watsonx.ai.',
].join(' ');

export const dispatch = makeDispatcher({
	serverInfo: { name: 'ibm-x402-mcp', version: '1.0.0' },
	instructions: INSTRUCTIONS,
	catalog: TOOL_CATALOG,
	tools: TOOLS,
	logName: 'mcpibm',
});

// IBM Granite x402 MCP server — Streamable HTTP transport (MCP 2025-06-18,
// JSON-RPC 2.0). POST /api/ibm-mcp — tool calls   GET — SSE   DELETE — terminate.
//
// The hosted (remote) transport for the @three-ws/ibm-x402-mcp tool suite: five
// IBM Granite tools (chat, code, embed, analyze, forecast) gated by per-call
// x402 payments. End users pay USDC on Base or Solana per call — no IBM Cloud
// account required; the operator funds watsonx.ai via WATSONX_* env vars.
// Authenticated three.ws principals (Bearer / OAuth) call without per-call
// payment — the operator-funded path for watsonx Orchestrate connections.
// Registered with the MCP Registry as io.github.nirholas/ibm-x402-mcp-remote
// (see server-ibm.json).
import { cors, readJson, wrap } from './_lib/http.js';
import { limits, clientIp } from './_lib/rate-limit.js';
import { settlePayment, encodePaymentResponseHeader } from './_lib/x402-spec.js';
import { PROTOCOL_VERSION, dispatch } from './_mcpibm/dispatch.js';
import { graniteX402Amount } from './_mcpibm/pricing.js';
import { GRANITE_CHALLENGE } from './_mcpibm/discovery.js';
import {
	send401,
	sendJsonRpcError,
	authenticateRequest,
	handleSse,
	handleTerminate,
} from './_mcp/auth.js';
import { sendX402Error } from './_mcp/payments.js';

const RESOURCE_PATH = '/api/ibm-mcp';

// Peek the single called tool from a (possibly batched) JSON-RPC body so the
// x402 challenge advertises — and the settle path charges — exactly the per-tool
// price. Only a request calling ONE tool is priced per-tool; mixed batches and
// non-tools/call requests (initialize, tools/list, ping) yield null → no charge.
function peekCalledTool(body) {
	const batch = Array.isArray(body) ? body : [body];
	const calls = batch.filter((m) => m && m.method === 'tools/call');
	if (calls.length === 1) {
		const name = calls[0]?.params?.name;
		return { toolName: typeof name === 'string' ? name : null };
	}
	return { toolName: null };
}

export default wrap(async (req, res) => {
	if (cors(req, res, { methods: 'GET,HEAD,POST,DELETE,OPTIONS', origins: '*' })) return;

	if (req.method === 'GET' || req.method === 'HEAD')
		return handleSse(req, res, { resourcePath: RESOURCE_PATH, challenge: GRANITE_CHALLENGE });
	if (req.method === 'DELETE') return handleTerminate(req, res);
	if (req.method !== 'POST') return send401(res, 'method not supported');

	// Read + parse the body BEFORE the x402 challenge so the 402 is priced by the
	// tool actually being called. Malformed JSON throws (status 400) → wrap().
	const body = await readJson(req, 2_000_000);

	// Per-tool x402 price. A non-tools/call request (initialize, tools/list) or a
	// mixed batch yields null → the flat env default, which the auth-gated
	// discovery path never actually charges.
	const { toolName } = peekCalledTool(body);
	const x402Amount = toolName ? graniteX402Amount(toolName) : null;

	const result = await authenticateRequest(req, res, {
		x402Amount,
		resourcePath: RESOURCE_PATH,
		challenge: GRANITE_CHALLENGE,
	});
	if (!result) return;
	const { auth, x402Ctx } = result;

	const ipRl = await limits.mcpIp(clientIp(req));
	if (!ipRl.success)
		return sendJsonRpcError(res, null, -32000, 'rate_limited', {
			retry_after: Math.ceil((ipRl.reset - Date.now()) / 1000),
		});
	const userRl = await limits.mcpUser(auth.userId || auth.rateKey || clientIp(req));
	if (!userRl.success)
		return sendJsonRpcError(res, null, -32000, 'rate_limited', {
			retry_after: Math.ceil((userRl.reset - Date.now()) / 1000),
		});

	const batch = Array.isArray(body) ? body : [body];
	// Per-request batch cap — each message can trigger an IBM inference call, so
	// an unbounded batch multiplies billable work against the user's budget.
	if (batch.length > 16) return sendJsonRpcError(res, null, -32600, 'batch too large (max 16)');

	const responses = [];
	for (const msg of batch) {
		const r = await dispatch(msg, auth, req);
		if (r !== null) responses.push(r);
	}

	// Settle the x402 payment AFTER the work succeeded — atomic from the caller's
	// perspective: if settle fails, the payer's signed payload is not broadcast
	// and they get an error instead of having paid for nothing.
	if (x402Ctx) {
		try {
			const settled = await settlePayment({ verified: x402Ctx.verified });
			res.setHeader('x-payment-response', encodePaymentResponseHeader(settled));
		} catch (err) {
			return sendX402Error(
				res,
				{ resourceUrl: x402Ctx.resourceUrl, accepts: x402Ctx.requirements },
				err,
			);
		}
	}

	res.statusCode = 200;
	res.setHeader('content-type', 'application/json; charset=utf-8');
	res.setHeader('mcp-protocol-version', PROTOCOL_VERSION);
	res.end(JSON.stringify(Array.isArray(body) ? responses : (responses[0] ?? null)));
});

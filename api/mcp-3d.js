// three.ws 3D Studio — MCP server (Streamable HTTP transport, MCP 2025-06-18).
// POST /api/mcp-3d — tool calls   GET /api/mcp-3d — SSE   DELETE — terminate.
//
// A second, focused MCP server alongside /api/mcp: it does one thing — turn
// text or images into interactive 3D models — and shares the main server's
// OAuth/x402 auth, rate limiting, and transport plumbing. Registered with the
// MCP Registry as io.github.nirholas/three-ws-3d-studio (see server-3d.json).
import { cors, readJson, wrap } from './_lib/http.js';
import { limits, clientIp } from './_lib/rate-limit.js';
import { peekCalledTool } from './_lib/mcp-dispatch.js';
import { settlePayment, encodePaymentResponseHeader } from './_lib/x402-spec.js';
import { PROTOCOL_VERSION, dispatch, isPublicTool } from './_mcp3d/dispatch.js';
import {
	send401,
	sendJsonRpcError,
	authenticateRequest,
	handleSse,
	handleTerminate,
} from './_mcp/auth.js';
import { sendX402Error } from './_mcp/payments.js';

export default wrap(async (req, res) => {
	if (cors(req, res, { methods: 'GET,HEAD,POST,DELETE,OPTIONS', origins: '*' })) return;

	if (req.method === 'GET' || req.method === 'HEAD') return handleSse(req, res);
	if (req.method === 'DELETE') return handleTerminate(req, res);
	if (req.method !== 'POST') return send401(res, 'method not supported');

	// Read + parse the body before auth so a call to the free public
	// getting_started tool can be served without an OAuth token or x402 payment.
	const body = await readJson(req, 1_000_000);
	const { toolName } = peekCalledTool(body);

	const result = await authenticateRequest(req, res, {
		allowFree: Boolean(toolName && isPublicTool(toolName)),
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
	if (batch.length > 16) return sendJsonRpcError(res, null, -32600, 'batch too large (max 16)');

	const responses = [];
	for (const msg of batch) {
		const r = await dispatch(msg, auth, req);
		if (r !== null) responses.push(r);
	}

	// 3D Studio is operator-funded: OAuth users run tools for free (bounded by
	// rate limits), and connecting "with an x402 wallet" is honored. When a caller
	// DID present an x402 payment, settle it so the connection actually costs the
	// nominal minimum and the same signed payment can't be replayed for unlimited
	// free GPU work. Only settle if a call succeeded — a wholesale failure is free.
	if (x402Ctx) {
		const anySuccess = responses.some((r) => r && !r.error && !(r.result && r.result.isError));
		if (anySuccess) {
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
	}

	res.statusCode = 200;
	res.setHeader('content-type', 'application/json; charset=utf-8');
	res.setHeader('mcp-protocol-version', PROTOCOL_VERSION);
	res.end(JSON.stringify(Array.isArray(body) ? responses : (responses[0] ?? null)));
});

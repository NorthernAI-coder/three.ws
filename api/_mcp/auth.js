import { env } from '../_lib/env.js';
import { authenticateBearer, extractBearer } from '../_lib/auth.js';
import {
	paymentRequirements,
	verifyPayment,
	send402,
	build402Body,
	resolveResourceUrl,
} from '../_lib/x402-spec.js';
import { sendX402Error } from './payments.js';

function quoteString(s) {
	return `"${String(s).replace(/[\\"]/g, '\\$&')}"`;
}

export function send401(res, msg) {
	const resource = env.MCP_RESOURCE;
	res.statusCode = 401;
	res.setHeader(
		'www-authenticate',
		`Bearer resource_metadata=${quoteString(`${env.APP_ORIGIN}/.well-known/oauth-protected-resource`)}, resource=${quoteString(resource)}`,
	);
	res.setHeader('content-type', 'application/json; charset=utf-8');
	res.end(JSON.stringify({ error: 'unauthorized', error_description: msg }));
}

// MCP clients speaking Streamable HTTP MUST advertise SSE support in Accept
// (spec 2025-06-18 §Transports), and post-initialize requests carry the
// MCP-Protocol-Version / Mcp-Session-Id headers. x402 agents, Bazaar
// validators, and registry crawlers (zauth) send none of these — they expect
// a plain 402 Payment Required.
//
// Exported so endpoints can scope free-discovery to plain (non-protocol)
// clients: an OAuth-capable MCP client must still receive the 401 on
// initialize, or it never starts the OAuth flow and dies later at tools/call.
export function isMcpProtocolClient(req) {
	const h = req?.headers || {};
	if (h['mcp-protocol-version'] || h['mcp-session-id']) return true;
	const accept = String(h.accept || '');
	return accept.includes('text/event-stream');
}

// Challenge for an unauthenticated request with no payment. MCP/OAuth clients
// (claude.ai connectors, the MCP TS SDK) get 401 with a WWW-Authenticate
// header so they can discover the protected-resource metadata and start the
// OAuth flow — they require status 401 per the MCP authorization spec
// (RFC 9728). Everything else (x402 agents, Bazaar validators, the zauth
// registry) gets the same envelope as a proper 402 Payment Required, which is
// what x402 tooling keys on. (A bare 402 for everyone made the connector
// probe spin; a blanket 401 made x402 crawlers misclassify the endpoints.)
//
// Both shapes ship the x402 payment envelope in the body + PAYMENT-REQUIRED
// header, and both carry WWW-Authenticate, so either kind of client can
// recover from a mismatched guess.
export function sendAuthChallenge(res, { req, resourceUrl, requirements, challenge }) {
	const resource = env.MCP_RESOURCE;
	res.statusCode = isMcpProtocolClient(req) ? 401 : 402;
	res.setHeader(
		'www-authenticate',
		`Bearer resource_metadata=${quoteString(`${env.APP_ORIGIN}/.well-known/oauth-protected-resource`)}, resource=${quoteString(resource)}`,
	);
	// `challenge` (optional) lets a dedicated MCP endpoint advertise its own
	// service metadata + bazaar discovery in the 402 envelope (the Granite
	// server at /api/ibm-mcp, the 3D Studio at /api/mcp-3d). Omitted →
	// build402Body's defaults, used by the main /api/mcp server.
	const body = build402Body({ resourceUrl, accepts: requirements, ...(challenge || {}) });
	res.setHeader('PAYMENT-REQUIRED', Buffer.from(JSON.stringify(body), 'utf8').toString('base64'));
	res.setHeader('content-type', 'application/json; charset=utf-8');
	res.setHeader('cache-control', 'no-store');
	res.end(JSON.stringify(body));
}

export function sendJsonRpcError(res, id, code, message, data) {
	res.statusCode = 200;
	res.setHeader('content-type', 'application/json; charset=utf-8');
	res.end(JSON.stringify({ jsonrpc: '2.0', id: id ?? null, error: { code, message, data } }));
}

// Returns { auth, x402Ctx } on success, or null if a response was already sent.
//
// `opts.x402Amount` (atomic-unit string | null) is the per-tool price for the
// tools/call being made. When provided it overrides the flat env price in the
// 402 challenge AND in the requirements used to verify the X-PAYMENT, so the
// advertised price and the charged price agree. null = use the flat default
// (initialize / tools/list / free tools / mixed batches).
export async function authenticateRequest(
	req,
	res,
	{ x402Amount, resourcePath = '/api/mcp', challenge, allowFree = false } = {},
) {
	const bearer = extractBearer(req);
	const paymentHeader = req.headers['x-payment'];

	if (bearer) {
		const auth = await authenticateBearer(bearer, { audience: env.MCP_RESOURCE });
		if (!auth) {
			send401(res, 'missing or invalid access token');
			return null;
		}
		return { auth, x402Ctx: null };
	}

	// Free, public entry point. When the caller has no bearer/payment AND the
	// request targets an explicitly-public tool (the endpoint passes
	// allowFree=true only for those — never for merely-unpriced scoped tools), we
	// serve as an anonymous principal instead of issuing the OAuth/x402 challenge.
	// scope '' means scoped tools stay locked; rateKey null so per-user limits key
	// off the caller IP. This is what lets getting_started work with no credentials.
	if (allowFree) {
		return {
			auth: { userId: null, rateKey: null, scope: '', source: 'free' },
			x402Ctx: null,
		};
	}

	const resourceUrl = resolveResourceUrl(req, resourcePath);
	const requirements = paymentRequirements(
		resourceUrl,
		x402Amount != null ? { amount: x402Amount } : {},
	);

	if (paymentHeader) {
		try {
			const verified = await verifyPayment({ paymentHeader, requirements });
			const x402Ctx = {
				resourceUrl,
				requirements,
				requirement: verified.requirement,
				paymentPayload: verified.paymentPayload,
				payer: verified.payer,
				// Carry the full verified envelope so the settle path can
				// pass it to settlePayment({ verified }) and enforce
				// payer-binding on the facilitator's response.
				verified,
			};
			// Anonymous paid caller — synthesize an auth principal scoped to public-read tools.
			// userId is null because usage_events.user_id is a UUID FK; the payer wallet is
			// kept on the auth object so handlers and rate limits can key off of it.
			return {
				auth: {
					userId: null,
					rateKey: `x402:${x402Ctx.payer || 'anon'}`,
					// Pay-per-call callers have no user account, so they cannot read or
					// write account-scoped data. They get only the no-scope public tools
					// (search_public_avatars, validate/inspect/optimize_model, solana_*).
					scope: '',
					source: 'x402',
					payer: x402Ctx.payer,
					// The HTTP layer verified this X-PAYMENT against the per-tool
					// price (paymentRequirements amount === x402AmountForTool). The
					// dispatcher reads this to avoid double-billing the caller with a
					// redundant pump-agent-payments subscription demand.
					x402Paid: true,
				},
				x402Ctx,
			};
		} catch (err) {
			sendX402Error(res, { resourceUrl, accepts: requirements }, err);
			return null;
		}
	}

	sendAuthChallenge(res, { req, resourceUrl, requirements, challenge });
	return null;
}

export async function handleSse(req, res, { resourcePath = '/api/mcp', challenge } = {}) {
	// We don't hold long-lived server→client subscriptions yet; respond politely.
	const bearer = extractBearer(req);
	// Unauthenticated callers without an X-PAYMENT header get a 401 +
	// WWW-Authenticate so OAuth clients (claude.ai) can discover the auth
	// server, with the x402 envelope still attached for x402 clients. Invalid
	// bearers also get 401 with WWW-Authenticate so they can re-auth correctly.
	if (!bearer && !req.headers['x-payment']) {
		const sseResourceUrl = resolveResourceUrl(req, resourcePath);
		return sendAuthChallenge(res, {
			req,
			resourceUrl: sseResourceUrl,
			requirements: paymentRequirements(sseResourceUrl),
			challenge,
		});
	}
	const auth = await authenticateBearer(bearer, { audience: env.MCP_RESOURCE });
	if (!auth) return send401(res, 'missing or invalid access token');
	res.statusCode = 405;
	res.setHeader('allow', 'POST, DELETE');
	res.end();
}

export function handleTerminate(_req, res) {
	// Stateless per-request server — nothing to tear down.
	res.statusCode = 204;
	res.end();
}

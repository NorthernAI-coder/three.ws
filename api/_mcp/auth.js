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

// Challenge for an unauthenticated request with no payment. Returns 401 with a
// WWW-Authenticate header so MCP/OAuth clients (claude.ai connectors, the MCP
// TS SDK) can discover the protected-resource metadata and start the OAuth
// flow — they require status 401 per the MCP authorization spec (RFC 9728).
//
// We ALSO ship the x402 payment envelope in the body + PAYMENT-REQUIRED header,
// so x402-aware clients and Bazaar validators can still read the price/accepts
// from this same response. (Previously this path returned a bare 402, which
// OAuth clients couldn't interpret — the connector probe just spun.)
export function sendAuthChallenge(res, { resourceUrl, requirements }) {
	const resource = env.MCP_RESOURCE;
	res.statusCode = 401;
	res.setHeader(
		'www-authenticate',
		`Bearer resource_metadata=${quoteString(`${env.APP_ORIGIN}/.well-known/oauth-protected-resource`)}, resource=${quoteString(resource)}`,
	);
	const body = build402Body({ resourceUrl, accepts: requirements });
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
export async function authenticateRequest(req, res) {
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

	const resourceUrl = resolveResourceUrl(req, '/api/mcp');
	const requirements = paymentRequirements(resourceUrl);

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
				},
				x402Ctx,
			};
		} catch (err) {
			sendX402Error(res, { resourceUrl, accepts: requirements }, err);
			return null;
		}
	}

	sendAuthChallenge(res, { resourceUrl, requirements });
	return null;
}

export async function handleSse(req, res) {
	// We don't hold long-lived server→client subscriptions yet; respond politely.
	const bearer = extractBearer(req);
	// Unauthenticated callers without an X-PAYMENT header get a 401 +
	// WWW-Authenticate so OAuth clients (claude.ai) can discover the auth
	// server, with the x402 envelope still attached for x402 clients. Invalid
	// bearers also get 401 with WWW-Authenticate so they can re-auth correctly.
	if (!bearer && !req.headers['x-payment']) {
		const sseResourceUrl = resolveResourceUrl(req, '/api/mcp');
		return sendAuthChallenge(res, {
			resourceUrl: sseResourceUrl,
			requirements: paymentRequirements(sseResourceUrl),
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

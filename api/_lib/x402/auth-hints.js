// x402 `auth-hints` extension — declare authentication paths a client can use
// instead of (or in addition to) paying via x402.
//
// Spec: /tmp/x402-docs/specs/extensions/extension-auth-hints.md
//
// The extension surfaces in a 402 response under `extensions["auth-hints"]`
// and maps specific `accepts[]` entries to required authentication methods.
// Per spec, when a client picks an entry referenced by `acceptIndexes`, the
// listed authentication is REQUIRED for that entry.
//
// We use the extension to advertise FREE-tier accept entries (amount=0) that
// require either an OAuth 2.0 access token or a Sign-In-With-X proof. The
// paid-endpoint helper short-circuits the payment dance when a valid auth
// header is present, granting access without settling on-chain.
//
// Auth credentials travel as standard HTTP headers — NOT inside the x402
// PaymentPayload:
//
//   OAuth 2.0 (Bearer):   Authorization: Bearer <access-token>
//   Sign-In-With-X:       SIGN-IN-WITH-X: <base64-encoded-siwx-proof>
//
// The base64 SIWX proof is JSON-encoded with the shape:
//   { "type": "siwe"|"siws", "message": "...", "signature": "..." }
// matching the existing /api/auth/{siwe,siws} verification flows.

import { verifyMessage, getAddress } from 'ethers';
import { env } from '../env.js';
import { authenticateBearer, hasScope } from '../auth.js';
import { parseSiweMessage } from '../siwe.js';
import { parseSiwsMessage, verifySiwsSignature } from '../siws.js';

export const AUTH_HINTS_EXTENSION_KEY = 'auth-hints';
export const SIWX_HEADER = 'sign-in-with-x';

// JSON-Schema for the extension body, kept inline so the 402 response is
// self-describing for validators that don't fetch the spec separately. Mirrors
// the schema fragment from the auth-hints spec.
const AUTH_HINTS_SCHEMA = {
	$schema: 'https://json-schema.org/draft/2020-12/schema',
	type: 'object',
	required: ['authRequirements'],
	properties: {
		authRequirements: {
			type: 'array',
			minItems: 1,
			items: {
				type: 'object',
				required: ['acceptIndexes', 'methods'],
				properties: {
					acceptIndexes: {
						type: 'array',
						items: { type: 'integer', minimum: 0 },
						description: 'Indexes into accepts[] this requirement applies to.',
					},
					methods: {
						type: 'array',
						minItems: 1,
						items: {
							type: 'object',
							required: ['type'],
							properties: {
								type: { type: 'string' },
							},
						},
					},
				},
			},
		},
	},
};

function buildOauth2Method({
	tokenType = 'Bearer',
	authorizationServer = env.APP_ORIGIN,
	tokenEndpoint = `${env.APP_ORIGIN}/api/oauth/token`,
	registrationEndpoint = `${env.APP_ORIGIN}/api/oauth/register`,
} = {}) {
	const method = {
		type: 'oauth2',
		tokenType,
		authorizationServer,
		tokenEndpoint,
	};
	if (registrationEndpoint) method.registrationEndpoint = registrationEndpoint;
	return method;
}

function buildSiwxMethod() {
	return { type: 'sign-in-with-x' };
}

// Validate that the requirements reference at least one accept entry and that
// each method has a recognized shape. Throws when misconfigured so the route
// fails closed at boot instead of silently emitting an invalid 402.
function validateAuthRequirements(authRequirements) {
	if (!Array.isArray(authRequirements) || authRequirements.length === 0) {
		throw new Error('declareAuthHintsExtension: authRequirements must be a non-empty array');
	}
	for (const r of authRequirements) {
		if (!Array.isArray(r.acceptIndexes) || r.acceptIndexes.length === 0) {
			throw new Error('declareAuthHintsExtension: acceptIndexes must be a non-empty array');
		}
		if (!Array.isArray(r.methods) || r.methods.length === 0) {
			throw new Error('declareAuthHintsExtension: methods must be a non-empty array');
		}
		for (const m of r.methods) {
			if (!m || typeof m.type !== 'string') {
				throw new Error('declareAuthHintsExtension: each method needs a string `type`');
			}
		}
	}
}

/**
 * Build the `auth-hints` extension entry for a 402 PaymentRequired body.
 *
 * Two calling conventions:
 *   • Pass `{ authRequirements: [...] }` to declare requirements verbatim.
 *   • Pass `{ oauth2, siwx }` as shorthand where each entry is
 *     `{ acceptIndexes: number[], ...methodFields }`. We expand each into a
 *     full authRequirements entry with one method.
 *
 * Returns an object suitable for spreading into `build402Body`'s `extensions`
 * argument, e.g. `extensions: { ...declareAuthHintsExtension({...}) }`.
 */
export function declareAuthHintsExtension(input) {
	if (!input || typeof input !== 'object') {
		throw new Error('declareAuthHintsExtension: input is required');
	}

	let authRequirements;
	if (Array.isArray(input.authRequirements)) {
		authRequirements = input.authRequirements;
	} else {
		authRequirements = [];
		if (input.oauth2) {
			if (!Array.isArray(input.oauth2.acceptIndexes)) {
				throw new Error('declareAuthHintsExtension: oauth2.acceptIndexes is required');
			}
			authRequirements.push({
				acceptIndexes: input.oauth2.acceptIndexes,
				methods: [buildOauth2Method(input.oauth2)],
			});
		}
		if (input.siwx) {
			if (!Array.isArray(input.siwx.acceptIndexes)) {
				throw new Error('declareAuthHintsExtension: siwx.acceptIndexes is required');
			}
			authRequirements.push({
				acceptIndexes: input.siwx.acceptIndexes,
				methods: [buildSiwxMethod()],
			});
		}
	}

	validateAuthRequirements(authRequirements);

	return {
		[AUTH_HINTS_EXTENSION_KEY]: {
			info: { authRequirements },
			schema: AUTH_HINTS_SCHEMA,
		},
	};
}

// ─── Header verification ────────────────────────────────────────────────────

function extractBearerToken(req) {
	const h = req.headers.authorization || req.headers.Authorization || '';
	if (typeof h !== 'string') return null;
	if (!h.toLowerCase().startsWith('bearer ')) return null;
	return h.slice(7).trim() || null;
}

function readSiwxHeader(req) {
	const raw =
		req.headers[SIWX_HEADER] ||
		req.headers['SIGN-IN-WITH-X'] ||
		req.headers['Sign-In-With-X'];
	return typeof raw === 'string' && raw.length > 0 ? raw : null;
}

function decodeSiwxProof(raw) {
	let json;
	try {
		json = Buffer.from(String(raw), 'base64').toString('utf8');
	} catch {
		return null;
	}
	let parsed;
	try {
		parsed = JSON.parse(json);
	} catch {
		return null;
	}
	if (!parsed || typeof parsed !== 'object') return null;
	const { type, message, signature } = parsed;
	if (typeof message !== 'string' || typeof signature !== 'string') return null;
	if (type !== 'siwe' && type !== 'siws') return null;
	return { type, message, signature };
}

// Domain check matches /api/auth/siwe + /api/auth/siws — the SIWX message
// MUST be addressed to this deployment's host (or localhost in dev) so a
// proof issued for another resource can't be replayed here.
function siwxDomainOk(domain) {
	if (!domain) return false;
	let appHost;
	try {
		appHost = new URL(env.APP_ORIGIN).host;
	} catch {
		return false;
	}
	const vercelHost = process.env.VERCEL_URL || null;
	const isLocalDev =
		process.env.VERCEL_ENV !== 'production' && process.env.VERCEL_ENV !== 'preview';
	const allowedHosts = new Set([appHost, vercelHost].filter(Boolean));
	if (allowedHosts.has(domain)) return true;
	if (isLocalDev && /^localhost(:\d+)?$/.test(domain)) return true;
	return false;
}

function withinTemporalBounds(fields) {
	const now = Date.now();
	if (fields.expirationTime && Date.parse(fields.expirationTime) < now) return false;
	if (fields.notBefore && Date.parse(fields.notBefore) > now) return false;
	if (fields.issuedAt) {
		const issued = Date.parse(fields.issuedAt);
		if (Number.isFinite(issued)) {
			const skew = 10 * 60 * 1000;
			if (issued < now - skew) return false;
			if (issued > now + skew) return false;
		}
	}
	return true;
}

async function verifySiweProof({ message, signature }) {
	const fields = parseSiweMessage(message);
	if (!fields) return null;
	if (!siwxDomainOk(fields.domain)) return null;
	if (!withinTemporalBounds(fields)) return null;
	let recovered;
	try {
		recovered = verifyMessage(message, signature);
	} catch {
		return null;
	}
	let claimed;
	try {
		claimed = getAddress(fields.address);
	} catch {
		return null;
	}
	if (recovered.toLowerCase() !== claimed.toLowerCase()) return null;
	return {
		method: 'sign-in-with-x',
		chain: 'eip155',
		address: claimed,
		chainId: fields.chainId || null,
	};
}

function verifySiwsProof({ message, signature }) {
	const fields = parseSiwsMessage(message);
	if (!fields) return null;
	if (!siwxDomainOk(fields.domain)) return null;
	if (!withinTemporalBounds(fields)) return null;
	let valid;
	try {
		valid = verifySiwsSignature(message, signature, fields.address);
	} catch {
		return null;
	}
	if (!valid) return null;
	return {
		method: 'sign-in-with-x',
		chain: 'solana',
		address: fields.address,
		chainId: fields.chainId || null,
	};
}

/**
 * Attempt to authenticate a request via the headers signaled by an `auth-hints`
 * extension. Tries OAuth Bearer first (cheap, in-process verify), then SIWX.
 *
 * Returns `null` when no auth header was presented (so the caller can fall
 * through to the regular x402 payment flow). Returns
 *   `{ ok: true, principal: {...} }` on success and
 *   `{ ok: false, reason: '...' }` when a header was presented but failed to
 * verify — callers should reject the request rather than silently downgrading
 * to the payment flow (otherwise an invalid Bearer would be quietly ignored).
 *
 * @param {import('http').IncomingMessage} req
 * @param {object} [opts]
 * @param {string} [opts.audience]    — OAuth token audience (defaults to MCP resource).
 * @param {string} [opts.requiredScope] — OAuth scope required for this route.
 */
export async function authenticateAuthHintsRequest(req, opts = {}) {
	const bearer = extractBearerToken(req);
	if (bearer) {
		const audience = opts.audience || env.MCP_RESOURCE;
		const principal = await authenticateBearer(bearer, { audience });
		if (!principal) return { ok: false, reason: 'invalid_token' };
		if (opts.requiredScope && !hasScope(principal.scope, opts.requiredScope)) {
			return { ok: false, reason: 'insufficient_scope' };
		}
		return {
			ok: true,
			principal: {
				method: 'oauth2',
				source: principal.source,
				userId: principal.userId,
				scope: principal.scope,
				clientId: principal.clientId || null,
			},
		};
	}

	const siwxRaw = readSiwxHeader(req);
	if (siwxRaw) {
		const proof = decodeSiwxProof(siwxRaw);
		if (!proof) return { ok: false, reason: 'invalid_siwx_proof' };
		const verified =
			proof.type === 'siwe'
				? await verifySiweProof(proof)
				: verifySiwsProof(proof);
		if (!verified) return { ok: false, reason: 'invalid_siwx_signature' };
		return { ok: true, principal: verified };
	}

	return null;
}

// ─── Helpers for building free accept entries paired with auth-hints ───────

// Zero-amount EVM accept that signals "free when authenticated". The payment
// dance for such entries is short-circuited in paid-endpoint.js when a valid
// auth header is presented. The asset + payTo still need to be valid for
// schema validators that don't know to special-case amount=0.
export function freeEvmAcceptForAuth({ network, asset, payTo, authType }) {
	return {
		scheme: 'exact',
		network,
		amount: '0',
		asset,
		payTo,
		maxTimeoutSeconds: 60,
		extra: {
			name: 'USD Coin',
			version: '2',
			decimals: 6,
			authRequired: authType,
		},
	};
}

export const __test = {
	AUTH_HINTS_SCHEMA,
	buildOauth2Method,
	buildSiwxMethod,
	decodeSiwxProof,
	siwxDomainOk,
	withinTemporalBounds,
};

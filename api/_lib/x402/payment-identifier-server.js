// Server-side glue for the x402 payment-identifier extension (USE-15).
//
// Three concerns:
//   1. Declare the extension on the 402 challenge (`extensions['payment-identifier']`).
//   2. Look the incoming payment header up in the idempotency cache before
//      hitting the facilitator — same id + same payload → replay the cached
//      response with no on-chain settlement.
//   3. Write each successful (settled) response into the cache, tagged with
//      the SHA-256 of the request bytes so a second hit with the same id but
//      different payload returns 409 Conflict.
//
// The functions here are deliberately framework-free — they operate on a
// decoded payload + a small request descriptor — so they can be wired into
// both the `paidEndpoint()` wrapper and the standalone endpoints that hand-
// roll their 402 dance (model-check, mint-to-mesh, revenue-vision).

import {
	PAYMENT_IDENTIFIER,
	declarePaymentIdentifierExtension as declareExt,
	extractPaymentIdentifier,
	isValidPaymentId,
} from '@x402/extensions/payment-identifier';

import { env } from '../env.js';
import { X402Error } from '../x402-errors.js';
import * as cache from './idempotency-cache.js';

export { PAYMENT_IDENTIFIER, extractPaymentIdentifier, isValidPaymentId };

// Default TTL — overridable per-route via `paidEndpoint({ paymentIdentifier:
// { ttlSeconds } })`. 3600s matches the spec's "Long TTL" guidance for
// infrequently changing resources.
const DEFAULT_TTL_SECONDS = 3600;

function envTtl() {
	const raw = env.X402_IDEMPOTENCY_TTL_SECONDS;
	const n = Number.parseInt(raw, 10);
	return Number.isFinite(n) && n > 0 ? n : DEFAULT_TTL_SECONDS;
}

// Build the extension object that goes onto the 402 challenge.
// `required=true` makes clients fail-fast with 400 if they don't send an ID
// — use this on endpoints where a duplicate call is materially expensive or
// observable (e.g. oracle attestations, fact-check submissions).
export function paymentIdentifierExtension(required = false) {
	return declareExt(Boolean(required));
}

// Decode an X-PAYMENT header without verifying it. Returns null if the
// header is malformed — we don't want a cache hit to mask a legit 400 from
// the facilitator, so we always fall through to the normal verify flow on
// decode failure.
function tryDecode(paymentHeader) {
	try {
		const json = Buffer.from(String(paymentHeader), 'base64').toString('utf8');
		const parsed = JSON.parse(json);
		return parsed && typeof parsed === 'object' ? parsed : null;
	} catch {
		return null;
	}
}

// Pull the payment-identifier from the header (if present and valid).
// Returns null when the client didn't include one — that means "no
// idempotency for this call", not an error.
export function extractIdFromHeader(paymentHeader) {
	if (!paymentHeader) return null;
	const payload = tryDecode(paymentHeader);
	if (!payload) return null;
	return extractPaymentIdentifier(payload);
}

// Enforce required=true. Throws an X402Error(400) the caller can map to a
// clean response. The extension self-validates ID format on extract, so we
// only need to check presence here.
export function enforceRequired({ paymentHeader, required }) {
	if (!required) return;
	const id = extractIdFromHeader(paymentHeader);
	if (!id) {
		throw new X402Error(
			'payment_identifier_required',
			'this route requires a payment-identifier extension on the payment payload',
			400,
		);
	}
}

// Look up a cached response. Returns:
//   { kind: 'miss' }                                — no cached entry; proceed.
//   { kind: 'hit', entry }                          — replay entry; skip settle.
//   { kind: 'conflict', existingHash, attemptedHash } — same id, different payload.
//
// Security: a cache hit MUST be bound to the signed payment proof, not just the
// client-chosen id. We require `paymentHash` (sha256 of the X-PAYMENT header)
// to match the hash stored when the entry was written — only the original
// payer can reproduce that exact signed proof. A caller who knows the id but
// presents a different payment hashes differently and gets a `conflict`, never
// the cached body. `payloadHash` (request method+url) is an additional binding.
//
// When `payloadHash`/`paymentHash` is omitted we treat a cache entry with a
// non-null stored hash as a conflict — pass both whenever you can compute them.
export async function checkCache({ route, paymentId, payloadHash, paymentHash }) {
	if (!paymentId) return { kind: 'miss' };
	const entry = await cache.get(route, paymentId);
	if (!entry) return { kind: 'miss' };
	// Payment-proof binding: a stored entry written with a paymentHash only
	// replays to a caller presenting the same signed proof. A mismatch (or a
	// caller that omits the proof against a proof-bound entry) is a conflict —
	// this is the guard against a stolen/guessed id being redeemed for free.
	if (entry.paymentHash && entry.paymentHash !== (paymentHash || null)) {
		return {
			kind: 'conflict',
			existingHash: entry.payloadHash || null,
			attemptedHash: payloadHash || null,
			reason: 'payment_proof_mismatch',
		};
	}
	// Stored hash may be null on legacy/unknown-payload entries; treat
	// "no stored hash" as compatible with any incoming request so older
	// cached entries don't suddenly start 409ing.
	if (entry.payloadHash && payloadHash && entry.payloadHash !== payloadHash) {
		return {
			kind: 'conflict',
			existingHash: entry.payloadHash,
			attemptedHash: payloadHash,
		};
	}
	return { kind: 'hit', entry };
}

// Persist a settled response so a same-id retry can be served from the cache.
// Failure to write is logged inside idempotency-cache.js — never thrown,
// since the caller has already taken the user's money and must respond 2xx.
export async function storeResponse({
	route,
	paymentId,
	payloadHash,
	paymentHash,
	status,
	body,
	contentType,
	paymentResponseHeader,
	ttlSeconds,
}) {
	if (!paymentId) return;
	const ttl = Number.isFinite(ttlSeconds) && ttlSeconds > 0 ? ttlSeconds : envTtl();
	await cache.set(
		route,
		paymentId,
		{
			status,
			body,
			contentType,
			paymentResponseHeader,
			payloadHash: payloadHash || null,
			// Bind the entry to the signed payment proof so only the original
			// payer (who can reproduce the exact X-PAYMENT) can replay it.
			paymentHash: paymentHash || null,
			storedAt: new Date().toISOString(),
		},
		ttl,
	);
}

// Flush a cached entry back onto the wire. Mirrors the headers the live path
// would have set (cache-control: no-store, x-payment-response, etc.) and
// tags the response with `x-x402-idempotent: replay` so the caller can tell
// they got a cached body.
export function writeCachedResponse(res, entry) {
	res.statusCode = Number.isInteger(entry.status) ? entry.status : 200;
	res.setHeader('content-type', entry.contentType || 'application/json; charset=utf-8');
	res.setHeader('cache-control', 'no-store');
	res.setHeader('x-x402-idempotent', 'replay');
	if (entry.paymentResponseHeader) {
		res.setHeader('x-payment-response', entry.paymentResponseHeader);
	}
	res.end(entry.body ?? '');
}

// Write a 409 Conflict explaining the mismatch. `reason` distinguishes a
// request-payload mismatch (same id reused for a different call) from a
// payment-proof mismatch (a stolen/guessed id presented with a different
// payment) — the latter is the security-relevant denial.
export function writeConflict(res, { route, attemptedHash, existingHash, reason }) {
	res.statusCode = 409;
	res.setHeader('content-type', 'application/json; charset=utf-8');
	res.setHeader('cache-control', 'no-store');
	res.setHeader('x-x402-idempotent', 'conflict');
	const description =
		reason === 'payment_proof_mismatch'
			? 'this payment-identifier was already used by a different payment; ' +
				'generate a fresh id and pay again'
			: 'a different request body was already processed under this payment-identifier; ' +
				'either retry the original payload or generate a new id';
	res.end(
		JSON.stringify({
			error: 'payment_identifier_conflict',
			error_description: description,
			route,
			attemptedPayloadHash: attemptedHash,
			existingPayloadHash: existingHash,
		}),
	);
}

export { hashRequestPayload, hashPaymentProof } from './idempotency-cache.js';
export const ttlSeconds = envTtl;

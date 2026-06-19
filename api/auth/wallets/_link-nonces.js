// Nonce store for wallet linking. Separate from login nonces.
// Used by [action].js (issuer + validator).
//
// Durable single-use + TTL via Upstash Redis (shared getRedis() singleton). A
// nonce is issued with SET key value EX (TTL) and burned with an atomic GETDEL
// on consume — so a nonce works exactly once even across serverless instances,
// closing the replay window the old per-instance Map left open (instance A
// issues, instance B can't see it to burn). When Redis is unconfigured (local
// dev / tests) it falls back to a per-instance in-memory Map with a sweep, which
// is correct for a single process and keeps the dev/test flow working.

import { randomToken } from '../../_lib/crypto.js';
import { getRedis } from '../../_lib/redis.js';

export const NONCE_TTL_SEC = 5 * 60;
const REDIS_PREFIX = 'wallet:link:nonce:';

// In-memory fallback (only used when Redis is unconfigured).
const nonceStore = new Map();
setInterval(() => {
	const now = Date.now();
	for (const [nonce, data] of nonceStore) {
		if (now - data.issuedAt > NONCE_TTL_SEC * 1000) {
			nonceStore.delete(nonce);
		}
	}
}, 30_000).unref?.();

function generateNonce() {
	let nonce = '';
	while (nonce.length < 16) {
		nonce += randomToken(24).replace(/[^A-Za-z0-9]/g, '');
	}
	return nonce.slice(0, 16);
}

// Issue a per-user link nonce. Bound to the issuing user's id so a captured
// nonce can only be consumed for the same session user (consumeNonce checks it).
export async function issueNonce(userId) {
	const nonce = generateNonce();
	const r = getRedis();
	if (r) {
		// SET key=userId EX TTL — single-use enforced by GETDEL on consume.
		await r.set(`${REDIS_PREFIX}${nonce}`, String(userId), { ex: NONCE_TTL_SEC });
	} else {
		nonceStore.set(nonce, { userId: String(userId), issuedAt: Date.now() });
	}
	return nonce;
}

// Atomically burn the nonce and return its data iff it exists and was issued to
// this user. A second call for the same nonce always returns null (single-use).
export async function consumeNonce(nonce, userId) {
	if (typeof nonce !== 'string' || !nonce) return null;
	const r = getRedis();
	if (r) {
		// GETDEL: read-and-delete in one round trip so two concurrent consumers
		// can't both succeed on the same nonce.
		const stored = await r.getdel(`${REDIS_PREFIX}${nonce}`);
		if (stored === null || stored === undefined) return null;
		if (String(stored) !== String(userId)) return null;
		return { userId: String(stored) };
	}
	const data = nonceStore.get(nonce);
	if (!data) return null;
	if (data.userId !== String(userId)) return null;
	nonceStore.delete(nonce);
	return data;
}

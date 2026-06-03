// Realm-transfer tokens — the trust boundary for portal traversal.
//
// When a player steps onto a portal, the source GameRoom snapshots their full
// state (inventory, hotbar, bank, gold, skills, hp, cosmetic) and reserves a
// seat in the destination realm room. The snapshot can't ride along as plain
// join options: a client could call client.joinOrCreate('game', { realm, carry })
// directly and mint gold or items out of thin air. So we seal the snapshot into
// an HMAC-SHA256 token here — identical construction to holder-pass.js — and the
// destination room refuses any carry that isn't signed with the shared secret.
//
// The token is short-lived (TTL below): a transfer is consumed within a couple
// of network round-trips, so a long window only widens the replay surface (e.g.
// banking a token at high gold, spending, then replaying to restore it).

import crypto from 'node:crypto';

const DEV_SECRET = 'three-ws-realm-transfer-dev-secret';
const TTL_SECONDS = 60; // a transfer is consumed in milliseconds; 60s covers any reconnect hiccup

let _warned = false;
function secret() {
	// Prefer a dedicated secret, but fall back to the holder-pass secret so a
	// single env var secures both gates in the common single-secret deployment.
	const s = process.env.REALM_TRANSFER_SECRET || process.env.HOLDER_PASS_SECRET;
	if (s) return s;
	if (process.env.NODE_ENV === 'production') {
		throw new Error(
			'[realm-transfer] REALM_TRANSFER_SECRET (or HOLDER_PASS_SECRET) is required in production — ' +
				'refusing to sign transfers with the dev secret.',
		);
	}
	if (!_warned) {
		_warned = true;
		console.warn(
			'[realm-transfer] no REALM_TRANSFER_SECRET/HOLDER_PASS_SECRET set — using the insecure dev secret. ' +
				'Set one in production or portal carries can be forged.',
		);
	}
	return DEV_SECRET;
}

function b64url(buf) {
	return Buffer.from(buf).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
}
function b64urlDecode(str) {
	return Buffer.from(str.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
}
function hmac(body) {
	return b64url(crypto.createHmac('sha256', secret()).update(body).digest());
}
function safeEqual(a, b) {
	const ba = Buffer.from(a);
	const bb = Buffer.from(b);
	if (ba.length !== bb.length) return false;
	return crypto.timingSafeEqual(ba, bb);
}

// Single-use guard. A transfer token seals a full carry snapshot (gold, items,
// bank, skills) and is otherwise replayable for its whole TTL — letting a player
// transfer at high gold, spend/bank it, then replay the same token to restore the
// snapshot and dupe the difference. So every token carries a random nonce (`jti`)
// and the destination room consumes it on arrival; a nonce seen twice is rejected.
// This shared map is the single source of truth across every room in the process
// (a portal handoff lands in a different GameRoom instance), mirroring the
// spin-wheel/marketplace replay guards. Entries are swept after a TTL beyond the
// token window so the set never grows unbounded. (Horizontal scale would back this
// with the same Redis the presence/profile layers use; the interface is unchanged.)
const _consumedNonces = new Map(); // jti -> consumedAt (ms)
const NONCE_TTL_MS = (TTL_SECONDS + 30) * 1000; // cover the token window + clock skew

/**
 * Atomically consume a transfer nonce. Returns true the first time a given nonce
 * is presented (the carry may be applied) and false on every subsequent attempt
 * within the TTL (a replay — the carry must be ignored). Synchronous, so two joins
 * racing the same token can't both win. A falsy nonce is rejected outright so an
 * old token minted before nonces existed can never apply a carry.
 * @param {unknown} jti
 * @returns {boolean}
 */
export function consumeTransferNonce(jti) {
	if (typeof jti !== 'string' || !jti) return false;
	const now = Date.now();
	const prev = _consumedNonces.get(jti);
	if (prev !== undefined && now - prev <= NONCE_TTL_MS) return false; // already used
	_consumedNonces.set(jti, now);
	return true;
}

// Sweep expired nonces so a long-lived process doesn't accumulate them forever.
setInterval(() => {
	const now = Date.now();
	for (const [jti, at] of _consumedNonces) if (now - at > NONCE_TTL_MS) _consumedNonces.delete(jti);
}, NONCE_TTL_MS).unref?.();

/**
 * Seal a portal transfer into a signed token.
 * @param {{ to: string, tx: number, ty: number, carry: object, account: string }} payload
 * @returns {string} `${base64url(body)}.${signature}`
 */
export function signTransfer(payload) {
	const now = Math.floor(Date.now() / 1000);
	const body = b64url(
		JSON.stringify({
			to: payload.to,
			tx: payload.tx,
			ty: payload.ty,
			carry: payload.carry,
			// The verified account that minted this transfer (a play-pass wallet or a
			// server-signed guest id). A portal handoff is a trusted server-to-server
			// seat reservation that carries no play pass / guest token, so the
			// destination room's onAuth re-binds the account from this signed field —
			// the only path by which an account is trusted without a fresh pass/token.
			account: payload.account,
			// Random single-use id so the destination room can reject a replayed token
			// even within its TTL. Bound to the signature, so it can't be swapped.
			jti: crypto.randomBytes(16).toString('hex'),
			iat: now,
			exp: now + TTL_SECONDS,
		}),
	);
	return `${body}.${hmac(body)}`;
}

/**
 * Verify a transfer token and return its payload, or null if missing, malformed,
 * tampered with, or expired.
 * @param {unknown} token
 * @returns {{ to: string, tx: number, ty: number, carry: object, iat: number, exp: number } | null}
 */
export function verifyTransfer(token) {
	if (typeof token !== 'string' || token.length < 16 || token.length > 65536) return null;
	const dot = token.indexOf('.');
	if (dot <= 0) return null;
	const body = token.slice(0, dot);
	const sig = token.slice(dot + 1);
	if (!safeEqual(sig, hmac(body))) return null;

	let payload;
	try {
		payload = JSON.parse(b64urlDecode(body));
	} catch {
		return null;
	}
	if (!payload || typeof payload !== 'object') return null;
	if (typeof payload.to !== 'string' || !payload.to) return null;
	if (!Number.isFinite(payload.tx) || !Number.isFinite(payload.ty)) return null;
	if (!payload.carry || typeof payload.carry !== 'object') return null;
	// Every legitimate token carries a single-use nonce; its absence means a forged
	// or pre-nonce token, which must not be honoured.
	if (typeof payload.jti !== 'string' || !payload.jti) return null;
	// The minting account rides along so the destination can re-bind it across the
	// passless handoff; require it so an old/forged token can't land account-less.
	if (typeof payload.account !== 'string' || !payload.account) return null;

	const now = Date.now() / 1000;
	if (typeof payload.exp !== 'number' || payload.exp < now) return null;
	if (typeof payload.iat !== 'number' || payload.iat > now + 60) return null;
	if (payload.exp - payload.iat > TTL_SECONDS + 5) return null;
	return payload;
}

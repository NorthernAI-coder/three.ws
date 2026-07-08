/**
 * Buyer-proof for `POST /api/vault/unlock` (prompt 11): a plain EIP-191
 * personal-sign message the buyer's wallet signs, proving control of
 * `buyer` at request time. Deliberately reuses the SAME signature to also
 * recover the buyer's real secp256k1 public key (via
 * `recoverPublicKey`/`hashMessage`) — the exact key `vault-crypto.wrapKey`
 * needs — so there is no separate "register your vault pubkey" step: a
 * buyer who can sign as their BSC address can unlock to that same address's
 * real key, matching `specs/vault-manifest.md`'s "Recipient key" note that
 * the buyer's EVM signing key MAY be reused directly as the wrap-recipient
 * key (this module is the prompt-11 decision the spec deferred).
 */

import { hashMessage, recoverMessageAddress, recoverPublicKey } from 'viem';
import { getRedis } from '../redis.js';

export const UNLOCK_MESSAGE_WINDOW_MS = 10 * 60 * 1000; // 10 minutes
const CLOCK_SKEW_MS = 2 * 60 * 1000; // tolerate a buyer's clock running up to 2 min fast

// Single-use lock on the unlock-message nonce, same Redis-or-local-fallback
// posture as mpp-server.js's `reserveNonce` — unlike cache.js's `acquireLock`
// (which returns "acquired" unconditionally when Redis isn't configured, a
// fine trade-off for a best-effort cross-instance lock but wrong for a
// security-relevant replay guard), this ALWAYS enforces single-use locally
// even with no Redis, falling back to a process-local Map.
const localReplay = new Map();

async function reserveNonce(key, ttlMs) {
	const redis = getRedis();
	if (redis) {
		try {
			const ok = await redis.set(key, '1', { nx: true, px: ttlMs });
			return ok === 'OK' || ok === true;
		} catch {
			/* fall through to local */
		}
	}
	const now = Date.now();
	const prev = localReplay.get(key);
	if (prev && prev > now) return false;
	localReplay.set(key, now + ttlMs);
	return true;
}

export class VaultUnlockAuthError extends Error {
	/** @param {string} message @param {{ code?: string, cause?: unknown }} [info] */
	constructor(message, info = {}) {
		super(message);
		this.name = 'VaultUnlockAuthError';
		this.code = info.code || 'auth_error';
		if (info.cause) this.cause = info.cause;
	}
}

/**
 * Build the canonical unlock-request message. Exported so the vault UI
 * (prompt 12) and this module's tests construct byte-identical text.
 * @param {{ objectId:string, buyer:string, network:string, nonce:string, issuedAt:string }} p
 */
export function buildVaultUnlockMessage({ objectId, buyer, network, nonce, issuedAt }) {
	return [
		'three.ws vault unlock request',
		'',
		`Object: ${objectId}`,
		`Buyer: ${buyer}`,
		`Network: ${network}`,
		`Nonce: ${nonce}`,
		`Issued At: ${issuedAt}`,
	].join('\n');
}

/** Parse the canonical unlock message back into its fields. Throws if the shape doesn't match. */
export function parseVaultUnlockMessage(message) {
	const lines = String(message || '').split('\n');
	const field = (label) => {
		const line = lines.find((l) => l.startsWith(`${label}: `));
		if (!line) throw new VaultUnlockAuthError(`unlock message is missing "${label}:"`, { code: 'bad_message' });
		return line.slice(label.length + 2).trim();
	};
	if (lines[0] !== 'three.ws vault unlock request') {
		throw new VaultUnlockAuthError('unlock message has the wrong preamble', { code: 'bad_message' });
	}
	return {
		objectId: field('Object'),
		buyer: field('Buyer'),
		network: field('Network'),
		nonce: field('Nonce'),
		issuedAt: field('Issued At'),
	};
}

/**
 * Verify a buyer's unlock-request signature end-to-end: message shape,
 * field cross-check against the caller's stated `objectId`/`buyer`/
 * `network`, signature recovery + address match, freshness window, and a
 * single-use nonce lock (defence-in-depth against a captured
 * message+signature being replayed — Redis-backed when configured, a
 * process-local map otherwise, same posture as mpp-server.js's nonce guard).
 *
 * @param {{ objectId:string, buyer:string, network:string, message:string, signature:string }} input
 * @returns {Promise<{ pubKey: `0x${string}` }>} the buyer's recovered secp256k1 public key
 * @throws {VaultUnlockAuthError} typed, `code` ∈ bad_message|field_mismatch|expired|replay|bad_signature
 */
export async function verifyVaultUnlockAuth({ objectId, buyer, network, message, signature }) {
	if (typeof message !== 'string' || !message || typeof signature !== 'string' || !signature) {
		throw new VaultUnlockAuthError('message and signature are required', { code: 'bad_message' });
	}
	const parsed = parseVaultUnlockMessage(message);

	if (parsed.objectId.toLowerCase() !== String(objectId).toLowerCase()) {
		throw new VaultUnlockAuthError('message objectId does not match the request body', { code: 'field_mismatch' });
	}
	if (parsed.buyer.toLowerCase() !== String(buyer).toLowerCase()) {
		throw new VaultUnlockAuthError('message buyer does not match the request body', { code: 'field_mismatch' });
	}
	if (parsed.network !== network) {
		throw new VaultUnlockAuthError('message network does not match the request body', { code: 'field_mismatch' });
	}

	const issuedAtMs = Date.parse(parsed.issuedAt);
	if (!Number.isFinite(issuedAtMs)) {
		throw new VaultUnlockAuthError('message Issued At is not a valid timestamp', { code: 'bad_message' });
	}
	const now = Date.now();
	if (issuedAtMs > now + CLOCK_SKEW_MS || now - issuedAtMs > UNLOCK_MESSAGE_WINDOW_MS) {
		throw new VaultUnlockAuthError('unlock message has expired — sign a fresh one', { code: 'expired' });
	}

	if (!parsed.nonce || parsed.nonce.length < 8) {
		throw new VaultUnlockAuthError('message Nonce is missing or too short', { code: 'bad_message' });
	}
	const lockKey = `bnb:vault:unlock:nonce:${parsed.nonce}`;
	const fresh = await reserveNonce(lockKey, UNLOCK_MESSAGE_WINDOW_MS + CLOCK_SKEW_MS);
	if (!fresh) {
		throw new VaultUnlockAuthError('this unlock request was already used', { code: 'replay' });
	}

	let recovered;
	try {
		recovered = await recoverMessageAddress({ message, signature });
	} catch (err) {
		throw new VaultUnlockAuthError('signature recovery failed', { code: 'bad_signature', cause: err });
	}
	if (recovered.toLowerCase() !== String(buyer).toLowerCase()) {
		throw new VaultUnlockAuthError('signature does not match buyer', { code: 'bad_signature' });
	}

	let pubKey;
	try {
		pubKey = await recoverPublicKey({ hash: hashMessage(message), signature });
	} catch (err) {
		throw new VaultUnlockAuthError('public key recovery failed', { code: 'bad_signature', cause: err });
	}

	return { pubKey };
}

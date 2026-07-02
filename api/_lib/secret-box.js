// Secret box — the single AES-256-GCM encrypt/decrypt primitive for every
// custodial secret the platform stores at rest (agent wallet keys, pump.fun coin
// creator keys). Kept dependency-free (only `env` + webcrypto) so it can be
// imported by lean call sites — a Solana-only CLI or the coin treasury — without
// dragging in ethers/EVM providers.
//
// Key management (v2): the encryption key derives from a DEDICATED secret
// (WALLET_ENCRYPTION_KEY) — independent of JWT_SECRET — with a RANDOM per-record
// salt embedded in each ciphertext. v1 ciphertexts (no version tag, JWT_SECRET +
// constant salt) still decrypt via the legacy branch so older records keep
// working; new writes always use v2. Set WALLET_ENCRYPTION_KEY in every
// environment that holds custodial secrets; until it is set the code falls back
// to JWT_SECRET (with a one-time warning) so deploys don't break.
//
// Decryption is intentionally tolerant: a v2 record is tried against the
// dedicated key first, then against JWT_SECRET. That keeps v2 records written
// under the JWT_SECRET fallback (before a dedicated key existed) readable after a
// dedicated key is introduced. Encryption is NOT tolerant — it always uses the
// dedicated key (fail-closed in prod) so new secrets never depend on JWT_SECRET.

import { webcrypto } from 'node:crypto';
import { env } from './env.js';

const subtle = globalThis.crypto?.subtle || webcrypto.subtle;
const randomBytes = (n) => {
	const b = new Uint8Array(n);
	(globalThis.crypto || webcrypto).getRandomValues(b);
	return b;
};

export const V2_PREFIX = 'v2:';
const LEGACY_SALT = new TextEncoder().encode('agent-wallet-v1');
let _warnedFallback = false;

const IS_PROD =
	env.VERCEL_ENV === 'production' || env.NODE_ENV === 'production';

// Dedicated master secret for at-rest encryption, decoupled from JWT_SECRET.
//
// In production we FAIL CLOSED: a missing/short WALLET_ENCRYPTION_KEY must never
// silently downgrade custodial-secret confidentiality to JWT_SECRET (the most
// widely-handled secret on the platform — a JWT_SECRET leak would then decrypt
// every wallet, and rotating it to invalidate sessions would brick every wallet
// whose ciphertext used the fallback). The JWT_SECRET fallback survives only
// outside production so local/CI/preview keep working without extra setup.
function walletMasterSecret() {
	const dedicated = env.WALLET_ENCRYPTION_KEY;
	if (dedicated && dedicated.length >= 32) return dedicated;
	if (IS_PROD) {
		throw new Error(
			'[secret-box] WALLET_ENCRYPTION_KEY is required in production and must be ' +
				'>=32 chars. Refusing to encrypt/decrypt custodial secrets under the ' +
				'JWT_SECRET fallback. Set a dedicated WALLET_ENCRYPTION_KEY.',
		);
	}
	if (dedicated && dedicated.length >= 16) return dedicated;
	if (!_warnedFallback) {
		_warnedFallback = true;
		console.warn(
			'[secret-box] WALLET_ENCRYPTION_KEY is not set (or too short); falling back to ' +
				'JWT_SECRET for custodial secret encryption. Set a dedicated WALLET_ENCRYPTION_KEY ' +
				'(>=32 chars) so secret confidentiality does not depend on the session secret. ' +
				'(This fallback is disabled in production.)',
		);
	}
	return env.JWT_SECRET;
}

// Derive an AES-256 key from a secret + salt via HKDF-SHA256.
async function deriveKey(secret, salt) {
	const raw = new TextEncoder().encode(secret);
	const base = await subtle.importKey('raw', raw, 'HKDF', false, ['deriveKey']);
	return subtle.deriveKey(
		{ name: 'HKDF', hash: 'SHA-256', salt, info: new Uint8Array(0) },
		base,
		{ name: 'AES-GCM', length: 256 },
		false,
		['encrypt', 'decrypt'],
	);
}

// v2 layout: "v2:" + base64( salt[16] || iv[12] || ciphertext+tag ).
export async function encryptSecret(plaintext) {
	const salt = randomBytes(16);
	const iv = randomBytes(12);
	const key = await deriveKey(walletMasterSecret(), salt);
	const data = new TextEncoder().encode(plaintext);
	const ct = await subtle.encrypt({ name: 'AES-GCM', iv }, key, data);
	const buf = new Uint8Array(salt.length + iv.length + ct.byteLength);
	buf.set(salt, 0);
	buf.set(iv, salt.length);
	buf.set(new Uint8Array(ct), salt.length + iv.length);
	return V2_PREFIX + Buffer.from(buf).toString('base64');
}

export async function decryptSecret(ciphertext) {
	if (typeof ciphertext === 'string' && ciphertext.startsWith(V2_PREFIX)) {
		const raw = Buffer.from(ciphertext.slice(V2_PREFIX.length), 'base64');
		const salt = raw.subarray(0, 16);
		const iv = raw.subarray(16, 28);
		const ct = raw.subarray(28);
		// Try the configured master secret first (the dedicated WALLET_ENCRYPTION_KEY),
		// then fall back to JWT_SECRET. v2 records written *before* a dedicated key
		// existed used the JWT_SECRET fallback and are ONLY decryptable with it — once
		// a dedicated key is introduced they'd otherwise become unreadable, stranding
		// the custodial funds behind them. AES-GCM authenticates every attempt (a wrong
		// key throws, it never returns wrong plaintext), so trying a second candidate is
		// safe. This is a read-only migration affordance: encryptSecret still requires a
		// real dedicated key in production, so NEW writes stay independent of JWT_SECRET.
		// Retire the fallback after a re-encryption migration lifts every record to the
		// dedicated key.
		const candidates = [];
		try { candidates.push(walletMasterSecret()); } catch { /* prod w/o dedicated key — JWT_SECRET below */ }
		const jwt = env.JWT_SECRET;
		if (jwt && !candidates.includes(jwt)) candidates.push(jwt);
		let lastErr;
		for (const secret of candidates) {
			try {
				const key = await deriveKey(secret, salt);
				const plain = await subtle.decrypt({ name: 'AES-GCM', iv }, key, ct);
				return new TextDecoder().decode(plain);
			} catch (e) { lastErr = e; }
		}
		throw lastErr || new Error('[secret-box] v2 decrypt failed: no candidate key available');
	}
	// Legacy v1: JWT_SECRET + constant salt, no version tag.
	const raw = Buffer.from(ciphertext, 'base64');
	const iv = raw.subarray(0, 12);
	const ct = raw.subarray(12);
	const key = await deriveKey(env.JWT_SECRET, LEGACY_SALT);
	const plain = await subtle.decrypt({ name: 'AES-GCM', iv }, key, ct);
	return new TextDecoder().decode(plain);
}

/** True if a stored value is a v2 ciphertext (vs a legacy plaintext/base64 blob). */
export function isEncryptedSecret(value) {
	return typeof value === 'string' && value.startsWith(V2_PREFIX);
}

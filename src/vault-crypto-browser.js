/**
 * Browser-side counterpart to `api/_lib/bnb/vault-crypto.js` (prompts 08/12):
 * unwrap a vault content key and decrypt a GLB, entirely client-side, so the
 * plaintext model bytes and the raw content key never touch the network
 * after `POST /api/vault/unlock` returns the wrapped bundle.
 *
 * Byte-for-byte the SAME wire format as the server module (ECIES: ephemeral
 * secp256k1 ECDH -> HKDF-SHA256 -> AES-256-GCM) — verified by
 * `tests/bnb-vault-crypto-browser.test.js`, which wraps with the server's
 * real `wrapKey` and unwraps here. Two deliberate substitutions for
 * browser-only APIs (CLAUDE.md: never hand-roll a primitive a library
 * already provides):
 *   - ECDH + HKDF: `@noble/curves`/`@noble/hashes` — already a pinned
 *     workspace dependency, pure JS, identical behavior in Node and the
 *     browser (this is exactly why the server module picked them too).
 *   - AES-256-GCM: the browser's native `crypto.subtle` (Web Crypto API)
 *     instead of Node's `node:crypto` (unavailable in the browser). Web
 *     Crypto's `AES-GCM` expects the auth tag APPENDED to the ciphertext
 *     (not passed separately like Node's `createDecipheriv`/`setAuthTag`) —
 *     `concatCiphertextAndTag` below bridges that difference; the actual
 *     bytes on the wire are identical either way (GCM's tag is always the
 *     trailing 16 bytes of the sealed box).
 */

import { secp256k1 } from '@noble/curves/secp256k1.js';
import { hkdf } from '@noble/hashes/hkdf.js';
import { sha256 } from '@noble/hashes/sha2.js';

const AES_KEY_LEN = 32;
const GCM_IV_LEN = 12;
const GCM_TAG_LEN = 16;
const ECDH_SECRET_LEN = 32;
// Must match api/_lib/bnb/vault-crypto.js's ECIES_HKDF_INFO exactly — a
// mismatch here would silently derive a different wrap key and every unwrap
// would fail with a (correct, but confusing) auth_failed.
const ECIES_HKDF_INFO = 'three.ws/bnb-vault/ecies/v1';

export class VaultCryptoBrowserError extends Error {
	/** @param {string} message @param {{ code?: string, cause?: unknown }} [info] */
	constructor(message, info = {}) {
		super(message);
		this.name = 'VaultCryptoBrowserError';
		this.code = info.code || 'vault_crypto_error';
		if (info.cause) this.cause = info.cause;
	}
}

/** Coerce a hex string (with or without `0x`) or Uint8Array into a Uint8Array. */
function toBytes(input, label) {
	if (input instanceof Uint8Array) return input;
	if (typeof input === 'string') {
		const hex = input.startsWith('0x') ? input.slice(2) : input;
		if (hex.length === 0 || hex.length % 2 !== 0 || !/^[0-9a-fA-F]+$/.test(hex)) {
			throw new VaultCryptoBrowserError(`${label} must be a Uint8Array or hex string`, { code: 'bad_input' });
		}
		const out = new Uint8Array(hex.length / 2);
		for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
		return out;
	}
	throw new VaultCryptoBrowserError(`${label} must be a Uint8Array or hex string`, { code: 'bad_input' });
}

function assertLen(bytes, len, label) {
	if (bytes.length !== len) {
		throw new VaultCryptoBrowserError(`${label} must be ${len} bytes, got ${bytes.length}`, { code: 'bad_length' });
	}
	return bytes;
}

function concatBytes(...arrs) {
	const total = arrs.reduce((n, a) => n + a.length, 0);
	const out = new Uint8Array(total);
	let off = 0;
	for (const a of arrs) {
		out.set(a, off);
		off += a.length;
	}
	return out;
}

/**
 * Unwrap a content key previously wrapped by the server's `wrapKey`, using
 * the recipient's raw secp256k1 private key (hex or bytes). Wrong key derives
 * a different AES key — the GCM tag check fails and this throws
 * `VaultCryptoBrowserError{code:'auth_failed'}`, never silently returning
 * garbage bytes.
 * @param {{ ephemeralPublicKey: string|Uint8Array, iv: string|Uint8Array, authTag: string|Uint8Array, ciphertext: string|Uint8Array }} wrapped
 * @param {string|Uint8Array} recipientPrivKey
 * @returns {Promise<Uint8Array>} the original 32-byte content key
 */
export async function unwrapKey(wrapped, recipientPrivKey) {
	const privKey = assertLen(toBytes(recipientPrivKey, 'recipientPrivKey'), AES_KEY_LEN, 'recipientPrivKey');
	const ephemeralPub = toBytes(wrapped.ephemeralPublicKey, 'ephemeralPublicKey');
	const iv = assertLen(toBytes(wrapped.iv, 'iv'), GCM_IV_LEN, 'iv');
	const authTag = assertLen(toBytes(wrapped.authTag, 'authTag'), GCM_TAG_LEN, 'authTag');
	const ciphertext = toBytes(wrapped.ciphertext, 'ciphertext');

	let shared;
	try {
		shared = secp256k1.getSharedSecret(privKey, ephemeralPub, true);
	} catch (err) {
		throw new VaultCryptoBrowserError('invalid recipient private key or ephemeral public key', { code: 'bad_ecdh_input', cause: err });
	}
	const sharedX = shared.subarray(1, 1 + ECDH_SECRET_LEN);
	const wrapKeyBytes = hkdf(sha256, sharedX, undefined, ECIES_HKDF_INFO, AES_KEY_LEN);

	const cryptoKey = await crypto.subtle.importKey('raw', wrapKeyBytes, { name: 'AES-GCM' }, false, ['decrypt']);
	try {
		const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv, tagLength: GCM_TAG_LEN * 8 }, cryptoKey, concatBytes(ciphertext, authTag));
		return new Uint8Array(plaintext);
	} catch (err) {
		throw new VaultCryptoBrowserError('key-unwrap authentication failed — wrong recipient key or tampered wrapped key', { code: 'auth_failed', cause: err });
	}
}

/**
 * Decrypt a GLB envelope client-side. Verifies the GCM auth tag (tampered
 * ciphertext or wrong key throws `VaultCryptoBrowserError{code:'auth_failed'}`)
 * and, if given, the plaintext's sha256 against the manifest's recorded value.
 * @param {{ ciphertext: string|Uint8Array, contentKey: string|Uint8Array, iv: string|Uint8Array, authTag: string|Uint8Array }} envelope
 * @param {{ expectedSha256?: string }} [opts]
 * @returns {Promise<Uint8Array>} the original glbBytes
 */
export async function decryptGlb({ ciphertext, contentKey, iv, authTag }, opts = {}) {
	const key = assertLen(toBytes(contentKey, 'contentKey'), AES_KEY_LEN, 'contentKey');
	const nonce = assertLen(toBytes(iv, 'iv'), GCM_IV_LEN, 'iv');
	const tag = assertLen(toBytes(authTag, 'authTag'), GCM_TAG_LEN, 'authTag');
	const ct = toBytes(ciphertext, 'ciphertext');

	const cryptoKey = await crypto.subtle.importKey('raw', key, { name: 'AES-GCM' }, false, ['decrypt']);
	let plaintext;
	try {
		const buf = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: nonce, tagLength: GCM_TAG_LEN * 8 }, cryptoKey, concatBytes(ct, tag));
		plaintext = new Uint8Array(buf);
	} catch (err) {
		throw new VaultCryptoBrowserError('GCM authentication failed — ciphertext or key tampered/incorrect', { code: 'auth_failed', cause: err });
	}

	if (opts.expectedSha256) {
		const digest = await crypto.subtle.digest('SHA-256', plaintext);
		const actual = Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
		if (actual !== opts.expectedSha256) {
			throw new VaultCryptoBrowserError('decrypted plaintext sha256 does not match the manifest', { code: 'sha256_mismatch' });
		}
	}
	return plaintext;
}

/**
 * Sealed envelope — hybrid public-key encryption for one-time secret delivery.
 *
 * The vanity grinder hands a freshly-ground Solana secret key back to the
 * buyer. By default that secret travels in the response body in the clear
 * (TLS only). A caller who would rather the platform never see their secret in
 * plaintext — not in transit, not in a proxy log, not in an idempotency cache —
 * supplies an X25519 public key up front; the server seals the secret to it so
 * only the holder of the matching private key can open it.
 *
 * Scheme `x25519-hkdf-sha256-aes256gcm/v1` (ECIES over Curve25519):
 *   1. Generate an ephemeral X25519 keypair `e`.
 *   2. shared = X25519(e.secret, recipientPublicKey).
 *   3. key = HKDF-SHA256(ikm=shared, salt=e.public‖recipientPublicKey,
 *            info="three.ws sealed-envelope v1", 32 bytes).
 *   4. AES-256-GCM encrypt the plaintext under `key` with a random 12-byte
 *      nonce; the ephemeral public key is bound in as additional authenticated
 *      data so a swapped epk fails the tag check.
 *   5. Emit { scheme, epk, nonce, ciphertext, recipient } — all Base64url
 *      except `epk`/`recipient`, which are Base58 to match Solana tooling.
 *
 * The ephemeral secret is discarded immediately, so the sealed envelope is
 * forward-secret with respect to the server: nothing retained on our side can
 * reconstruct the key. `openSealed` is the inverse and ships so clients, the
 * SDK, and tests share one verified implementation rather than reinventing the
 * decrypt against a prose spec.
 *
 * Isomorphic by construction: ECDH/HKDF come from @noble (pure JS), AES-GCM
 * from WebCrypto (`globalThis.crypto.subtle`), so it runs unchanged in Node
 * serverless functions and in the browser.
 */

import bs58 from 'bs58';
import { x25519 } from '@noble/curves/ed25519.js';
import { hkdf } from '@noble/hashes/hkdf.js';
import { sha256 } from '@noble/hashes/sha2.js';

export const SEALED_ENVELOPE_SCHEME = 'x25519-hkdf-sha256-aes256gcm/v1';
const HKDF_INFO = new TextEncoder().encode('three.ws sealed-envelope v1');
const X25519_KEY_BYTES = 32;
const NONCE_BYTES = 12;

const cryptoObj = globalThis.crypto;

// WebCrypto is checked at call time (not import time) so merely importing this
// module never throws in an exotic bundle — only sealing/opening requires subtle.
function subtle() {
	if (!cryptoObj?.subtle) {
		throw new Error('sealed-envelope requires WebCrypto (globalThis.crypto.subtle)');
	}
	return cryptoObj.subtle;
}

function randomBytes(n) {
	const b = new Uint8Array(n);
	cryptoObj.getRandomValues(b);
	return b;
}

function toBase64url(bytes) {
	let bin = '';
	for (const b of bytes) bin += String.fromCharCode(b);
	return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64url(str) {
	const pad = str.length % 4 === 0 ? '' : '='.repeat(4 - (str.length % 4));
	const bin = atob(str.replace(/-/g, '+').replace(/_/g, '/') + pad);
	const out = new Uint8Array(bin.length);
	for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
	return out;
}

/**
 * Parse a 32-byte X25519 key supplied as a Uint8Array, Base58, Base64url, or
 * hex string. Throws a 400-tagged error on anything that isn't a 32-byte key.
 * @param {Uint8Array|string} key
 * @param {string} [label='key']
 * @returns {Uint8Array}
 */
export function parseX25519Key(key, label = 'key') {
	let bytes;
	if (key instanceof Uint8Array) {
		bytes = key;
	} else if (typeof key === 'string') {
		const s = key.trim();
		try {
			if (/^[0-9a-fA-F]{64}$/.test(s)) {
				bytes = Uint8Array.from(s.match(/.{2}/g).map((h) => parseInt(h, 16)));
			} else if (/^[1-9A-HJ-NP-Za-km-z]+$/.test(s) && !s.includes('-') && !s.includes('_')) {
				bytes = bs58.decode(s);
			} else {
				bytes = fromBase64url(s);
			}
		} catch {
			throw Object.assign(new Error(`${label} is not valid Base58/Base64/hex`), {
				status: 400,
				code: 'invalid_recipient_key',
			});
		}
	} else {
		throw Object.assign(new Error(`${label} must be a string or Uint8Array`), {
			status: 400,
			code: 'invalid_recipient_key',
		});
	}
	if (bytes.length !== X25519_KEY_BYTES) {
		throw Object.assign(
			new Error(`${label} must be a 32-byte X25519 key (got ${bytes.length} bytes)`),
			{ status: 400, code: 'invalid_recipient_key' },
		);
	}
	return bytes;
}

function toBytes(plaintext) {
	return typeof plaintext === 'string' ? new TextEncoder().encode(plaintext) : plaintext;
}

/**
 * Seal a plaintext to a recipient's X25519 public key.
 * @param {Uint8Array|string} plaintext
 * @param {Uint8Array|string} recipientPublicKey - 32-byte X25519 public key.
 * @returns {Promise<{scheme:string, epk:string, nonce:string, ciphertext:string, recipient:string}>}
 */
export async function sealToRecipient(plaintext, recipientPublicKey) {
	const recipientPub = parseX25519Key(recipientPublicKey, 'recipient public key');
	const ephemeralSecret = x25519.utils.randomSecretKey();
	const ephemeralPublic = x25519.getPublicKey(ephemeralSecret);
	const shared = x25519.getSharedSecret(ephemeralSecret, recipientPub);

	const salt = new Uint8Array(ephemeralPublic.length + recipientPub.length);
	salt.set(ephemeralPublic, 0);
	salt.set(recipientPub, ephemeralPublic.length);
	const keyBytes = hkdf(sha256, shared, salt, HKDF_INFO, 32);

	const key = await subtle().importKey('raw', keyBytes, 'AES-GCM', false, ['encrypt']);
	const nonce = randomBytes(NONCE_BYTES);
	const ct = await subtle().encrypt(
		{ name: 'AES-GCM', iv: nonce, additionalData: ephemeralPublic },
		key,
		toBytes(plaintext),
	);

	// Wipe the ephemeral secret + derived key from the local copy. (Best-effort:
	// GC'd byte arrays may linger, but we don't keep a live reference.)
	ephemeralSecret.fill(0);
	keyBytes.fill(0);

	return {
		scheme: SEALED_ENVELOPE_SCHEME,
		epk: bs58.encode(ephemeralPublic),
		nonce: toBase64url(nonce),
		ciphertext: toBase64url(new Uint8Array(ct)),
		recipient: bs58.encode(recipientPub),
	};
}

/**
 * Open a sealed envelope with the recipient's X25519 secret key.
 * @param {{scheme:string, epk:string, nonce:string, ciphertext:string}} envelope
 * @param {Uint8Array|string} recipientSecretKey - 32-byte X25519 secret key.
 * @returns {Promise<Uint8Array>} the decrypted plaintext bytes.
 */
export async function openSealed(envelope, recipientSecretKey) {
	if (!envelope || envelope.scheme !== SEALED_ENVELOPE_SCHEME) {
		throw Object.assign(new Error(`unsupported sealed-envelope scheme: ${envelope?.scheme}`), {
			code: 'unsupported_scheme',
		});
	}
	const secret = parseX25519Key(recipientSecretKey, 'recipient secret key');
	const ephemeralPublic = parseX25519Key(envelope.epk, 'ephemeral public key');
	const shared = x25519.getSharedSecret(secret, ephemeralPublic);
	const recipientPub = x25519.getPublicKey(secret);

	const salt = new Uint8Array(ephemeralPublic.length + recipientPub.length);
	salt.set(ephemeralPublic, 0);
	salt.set(recipientPub, ephemeralPublic.length);
	const keyBytes = hkdf(sha256, shared, salt, HKDF_INFO, 32);

	const key = await subtle().importKey('raw', keyBytes, 'AES-GCM', false, ['decrypt']);
	const pt = await subtle().decrypt(
		{ name: 'AES-GCM', iv: fromBase64url(envelope.nonce), additionalData: ephemeralPublic },
		key,
		fromBase64url(envelope.ciphertext),
	);
	keyBytes.fill(0);
	return new Uint8Array(pt);
}

/** Open a sealed envelope and decode the plaintext as UTF-8 text. */
export async function openSealedText(envelope, recipientSecretKey) {
	return new TextDecoder().decode(await openSealed(envelope, recipientSecretKey));
}

/**
 * Generate a throwaway X25519 recipient keypair (Base58-encoded). Clients that
 * don't already manage an X25519 key call this, pass `publicKey` as `sealTo`,
 * and keep `secretKey` to open the envelope.
 * @returns {{publicKey:string, secretKey:string}}
 */
export function generateRecipientKeypair() {
	const secret = x25519.utils.randomSecretKey();
	return {
		publicKey: bs58.encode(x25519.getPublicKey(secret)),
		secretKey: bs58.encode(secret),
	};
}

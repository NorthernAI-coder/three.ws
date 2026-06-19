/**
 * Open a three.ws sealed envelope (ECIES `x25519-hkdf-sha256-aes256gcm/v1`).
 *
 * Mirror of src/solana/vanity/sealed-envelope.js's openSealed, implemented with
 * @noble (X25519 + HKDF-SHA256 + AES-256-GCM) so it runs identically in Node and
 * the browser without depending on WebCrypto subtle being present. The buyer's
 * X25519 secret key never leaves the caller's process.
 */

import bs58 from "bs58";
import { x25519 } from "@noble/curves/ed25519.js";
import { hkdf } from "@noble/hashes/hkdf";
import { sha256 } from "@noble/hashes/sha256";
import { gcm } from "@noble/ciphers/aes.js";

export const SEALED_ENVELOPE_SCHEME = "x25519-hkdf-sha256-aes256gcm/v1";

const HKDF_INFO = new TextEncoder().encode("three.ws sealed-envelope v1");
const X25519_KEY_BYTES = 32;

export interface SealedEnvelope {
  scheme: string;
  epk: string;
  nonce: string;
  ciphertext: string;
  recipient?: string;
}

function fromBase64url(str: string): Uint8Array {
  const pad = str.length % 4 === 0 ? "" : "=".repeat(4 - (str.length % 4));
  const b64 = str.replace(/-/g, "+").replace(/_/g, "/") + pad;
  if (typeof atob === "function") {
    const bin = atob(b64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }
  // Node fallback.
  return new Uint8Array(Buffer.from(b64, "base64"));
}

function parseX25519Key(key: Uint8Array | string, label: string): Uint8Array {
  let bytes: Uint8Array;
  if (key instanceof Uint8Array) {
    bytes = key;
  } else {
    const s = key.trim();
    if (/^[0-9a-fA-F]{64}$/.test(s)) {
      bytes = Uint8Array.from(s.match(/.{2}/g)!.map((h) => parseInt(h, 16)));
    } else if (/^[1-9A-HJ-NP-Za-km-z]+$/.test(s) && !s.includes("-") && !s.includes("_")) {
      bytes = bs58.decode(s);
    } else {
      bytes = fromBase64url(s);
    }
  }
  if (bytes.length !== X25519_KEY_BYTES) {
    throw new Error(`${label} must be a 32-byte X25519 key (got ${bytes.length})`);
  }
  return bytes;
}

/** Open a sealed envelope with the recipient's X25519 secret key → plaintext bytes. */
export function openSealed(
  envelope: SealedEnvelope,
  recipientSecretKey: Uint8Array | string,
): Uint8Array {
  if (!envelope || envelope.scheme !== SEALED_ENVELOPE_SCHEME) {
    throw new Error(`unsupported sealed-envelope scheme: ${envelope?.scheme}`);
  }
  const secret = parseX25519Key(recipientSecretKey, "recipient secret key");
  const epk = parseX25519Key(envelope.epk, "ephemeral public key");
  const shared = x25519.getSharedSecret(secret, epk);
  const recipientPub = x25519.getPublicKey(secret);

  const salt = new Uint8Array(epk.length + recipientPub.length);
  salt.set(epk, 0);
  salt.set(recipientPub, epk.length);
  const keyBytes = hkdf(sha256, shared, salt, HKDF_INFO, 32);

  const nonce = fromBase64url(envelope.nonce);
  const ct = fromBase64url(envelope.ciphertext);
  // AAD = ephemeral public key, exactly as the server bound it on seal.
  const aead = gcm(keyBytes, nonce, epk);
  const pt = aead.decrypt(ct);
  keyBytes.fill(0);
  return pt;
}

/** Open a sealed envelope and decode the plaintext as UTF-8 JSON. */
export function openSealedJson<T = unknown>(
  envelope: SealedEnvelope,
  recipientSecretKey: Uint8Array | string,
): T {
  return JSON.parse(new TextDecoder().decode(openSealed(envelope, recipientSecretKey))) as T;
}

/** Generate a throwaway X25519 recipient keypair (Base58). Pass publicKey as sealTo. */
export function generateRecipientKeypair(): { publicKey: string; secretKey: string } {
  const secret = x25519.utils.randomSecretKey();
  return {
    publicKey: bs58.encode(x25519.getPublicKey(secret)),
    secretKey: bs58.encode(secret),
  };
}

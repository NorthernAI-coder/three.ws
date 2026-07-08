// Verifiable 3D provenance — the pure core of signed content credentials for
// AI-generated 3D. C2PA-style authenticity for GLBs: every asset three.ws
// generates can carry a signed credential (who made it, from what prompt, by
// which model, when, its full lineage, and the sha256 of the GLB bytes), whose
// hash is anchored on Solana so anyone can confirm the asset wasn't tampered with
// and genuinely originated here.
//
// This module is dependency-light (node crypto for sha256, @noble ed25519 for
// signatures) and side-effect-free — no fetch, no chain, no R2 — so the hashing,
// credential shape, and sign/verify logic are unit-tested in isolation and load
// unchanged in the api/ bundle and the free OpenAI track. It carries ZERO
// payment/wallet/coin surface: the FREE verify path uses only these primitives.
// Spec: specs/PROVENANCE_3D.md.

import { createHash } from 'node:crypto';
import { ed25519 } from '@noble/curves/ed25519.js';
import bs58 from 'bs58';

export const PROVENANCE_3D_VERSION = 'threews.provenance.3d.v1';

/** sha256 of raw bytes → lowercase hex. The GLB content hash. */
export function sha256Hex(bytes) {
	return createHash('sha256').update(Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes)).digest('hex');
}

// Deterministic JSON: object keys sorted recursively so the signed bytes are
// identical on both the signing and verifying side regardless of key order.
function canonicalize(value) {
	if (Array.isArray(value)) return `[${value.map(canonicalize).join(',')}]`;
	if (value && typeof value === 'object') {
		const keys = Object.keys(value).sort();
		return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalize(value[k])}`).join(',')}}`;
	}
	return JSON.stringify(value === undefined ? null : value);
}

/**
 * Build the unsigned credential body. Only the fields provided are included
 * (lineage/assetId are optional), and the shape is fixed so the canonical form is
 * stable. `glbSha256` and `createdAt` are required — a credential without the
 * content hash or a timestamp is meaningless.
 *
 * @param {{ glbSha256:string, createdAt:string, creator?:string, prompt?:string,
 *           model?:string, provider?:string, lineage?:Array, assetId?:string }} f
 * @returns {object} the unsigned credential
 */
export function buildCredential(f) {
	if (!f || typeof f.glbSha256 !== 'string' || !/^[0-9a-f]{64}$/.test(f.glbSha256)) {
		throw new Error('buildCredential: glbSha256 must be a 64-char hex sha256');
	}
	if (!f.createdAt) throw new Error('buildCredential: createdAt is required');
	const cred = {
		version: PROVENANCE_3D_VERSION,
		glbSha256: f.glbSha256,
		createdAt: f.createdAt,
	};
	if (f.assetId) cred.assetId = String(f.assetId);
	if (f.creator) cred.creator = String(f.creator);
	if (f.prompt) cred.prompt = String(f.prompt);
	if (f.model) cred.model = String(f.model);
	if (f.provider) cred.provider = String(f.provider);
	if (Array.isArray(f.lineage) && f.lineage.length) cred.lineage = f.lineage.map(String);
	return cred;
}

/** The canonical bytes signed/verified for a credential body. */
export function credentialCanonicalBytes(credential) {
	return Buffer.from(canonicalize(credential), 'utf8');
}

/** sha256 (hex) of the canonical credential — its content address (R2 key + anchor payload). */
export function credentialHash(credential) {
	return sha256Hex(credentialCanonicalBytes(credential));
}

/**
 * Sign a credential body with an ed25519 secret key (a Solana Keypair's 64-byte
 * secretKey or a raw 32-byte seed). Returns the base58 signature + issuer pubkey.
 */
export function signCredential(credential, secretKey) {
	const seed = secretKey.length >= 64 ? secretKey.slice(0, 32) : secretKey.slice(0, 32);
	const msg = credentialCanonicalBytes(credential);
	const sig = ed25519.sign(msg, seed);
	const pub = ed25519.getPublicKey(seed);
	return { signature: bs58.encode(sig), issuer: bs58.encode(pub) };
}

/**
 * Verify a credential's signature against an issuer's base58 ed25519 public key.
 * Pure and offline — no chain read. Returns true iff the signature is valid over
 * the canonical credential bytes.
 */
export function verifyCredentialSignature(credential, signatureBs58, issuerBs58) {
	try {
		const msg = credentialCanonicalBytes(credential);
		const sig = bs58.decode(signatureBs58);
		const pub = bs58.decode(issuerBs58);
		return ed25519.verify(sig, msg, pub);
	} catch {
		return false;
	}
}

/**
 * The core verify decision, given the GLB's actual sha256 and a stored, signed
 * credential envelope. Pure — the caller fetches bytes and the credential; this
 * decides the verdict.
 *
 * @param {string} glbSha256                 sha256 of the bytes actually served
 * @param {{ credential:object, signature:string, issuer:string }|null} envelope
 * @returns {{ status:'verified'|'tampered'|'unknown', reason:string }}
 */
export function decideVerdict(glbSha256, envelope) {
	if (!envelope || !envelope.credential) {
		return { status: 'unknown', reason: 'no provenance credential is on record for this asset' };
	}
	const { credential, signature, issuer } = envelope;
	if (!verifyCredentialSignature(credential, signature, issuer)) {
		return { status: 'tampered', reason: 'the credential signature does not verify — the record was altered' };
	}
	if (credential.glbSha256 !== glbSha256) {
		return { status: 'tampered', reason: 'the model bytes do not match the signed content hash — the asset was modified' };
	}
	return { status: 'verified', reason: 'the model matches its signed credential' };
}

/** R2 object key a credential envelope is stored at, addressed by the GLB hash. */
export function provenanceKey(glbSha256) {
	return `provenance/${glbSha256}.json`;
}

/** A Solana explorer URL for an anchor transaction on a given cluster. */
export function explorerTxUrl(signature, cluster = 'devnet') {
	const c = cluster === 'mainnet' || cluster === 'mainnet-beta' ? '' : `?cluster=${cluster}`;
	return `https://explorer.solana.com/tx/${signature}${c}`;
}

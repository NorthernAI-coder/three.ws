// Verifiable attestation ledger for governed agent turns.
// ----------------------------------------------------------------------------
// Every governed turn (user message + Granite reply + Guardian verdicts) is
// sealed into a receipt. Receipts are SHA-256 hash-chained — each carries the
// hash of its predecessor — so any later edit to any field breaks the chain.
// Each receipt's hash is then signed (Ed25519, the same curve Solana uses;
// ECDSA-P256 fallback for older runtimes) so the log is both tamper-evident and
// attributable. The chain head can be anchored on-chain to timestamp the whole
// log against an immutable ledger.
//
// Pure and isomorphic: uses only Web Crypto (globalThis.crypto.subtle), so it
// runs identically in the browser and under Node/vitest. No DOM, no network.

const subtle = globalThis.crypto?.subtle;
if (!subtle) {
	throw new Error('Web Crypto (crypto.subtle) is unavailable in this environment.');
}

export const VERSION = 'threews-attest-1';
// Genesis predecessor hash for the first receipt in a chain.
export const GENESIS = '0'.repeat(64);

const enc = new TextEncoder();

// ── Encoding helpers ─────────────────────────────────────────────────────────

export function bytesToHex(bytes) {
	const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
	let out = '';
	for (let i = 0; i < b.length; i++) out += b[i].toString(16).padStart(2, '0');
	return out;
}

export function hexToBytes(hex) {
	const clean = String(hex).trim();
	if (clean.length % 2 !== 0) throw new Error('hex string has odd length');
	const out = new Uint8Array(clean.length / 2);
	for (let i = 0; i < out.length; i++) out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
	return out;
}

// Deterministic JSON: object keys sorted recursively, undefined values dropped.
// Two semantically-equal objects always serialize identically, which is what
// makes the hash reproducible by a verifier.
export function canonicalize(value) {
	if (value === null || typeof value !== 'object') return JSON.stringify(value);
	if (Array.isArray(value)) return '[' + value.map(canonicalize).join(',') + ']';
	const keys = Object.keys(value)
		.filter((k) => value[k] !== undefined)
		.sort();
	return '{' + keys.map((k) => JSON.stringify(k) + ':' + canonicalize(value[k])).join(',') + '}';
}

export async function sha256Hex(input) {
	const data = typeof input === 'string' ? enc.encode(input) : input;
	const digest = await subtle.digest('SHA-256', data);
	return bytesToHex(new Uint8Array(digest));
}

// ── Receipts ─────────────────────────────────────────────────────────────────

// The signable body of a receipt: everything except the hash and signature it
// will later carry. Used both to compute and to verify the receipt hash.
function receiptBody(receipt) {
	const { hash, signature, ...body } = receipt;
	return body;
}

export async function computeReceiptHash(receipt) {
	return sha256Hex(canonicalize(receiptBody(receipt)));
}

// Build a receipt for one governed turn and stamp its hash. `turn` and
// `governance` are caller-shaped records; `prevHash` links it to the chain.
export async function buildReceipt({ seq, prevHash, ts, turn, governance }) {
	const receipt = {
		version: VERSION,
		seq,
		ts,
		prevHash: prevHash || GENESIS,
		turn,
		governance,
	};
	receipt.hash = await computeReceiptHash(receipt);
	return receipt;
}

// ── Signing ──────────────────────────────────────────────────────────────────
//
// Prefer Ed25519 (Solana's signature scheme — thematically and technically apt
// for anchoring on Solana). Fall back to ECDSA P-256 where Ed25519 Web Crypto
// is unavailable. The resolved algorithm travels with the public key so a
// verifier always knows how to check signatures.

let _algoPromise = null;
async function resolveAlgo() {
	if (_algoPromise) return _algoPromise;
	_algoPromise = (async () => {
		try {
			const kp = await subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify']);
			// Some runtimes expose the name but reject sign — probe once.
			await subtle.sign({ name: 'Ed25519' }, kp.privateKey, enc.encode('probe'));
			return {
				name: 'Ed25519',
				generate: { name: 'Ed25519' },
				sign: { name: 'Ed25519' },
				importPublic: { name: 'Ed25519' },
			};
		} catch {
			return {
				name: 'ECDSA-P256',
				generate: { name: 'ECDSA', namedCurve: 'P-256' },
				sign: { name: 'ECDSA', hash: 'SHA-256' },
				importPublic: { name: 'ECDSA', namedCurve: 'P-256' },
			};
		}
	})();
	return _algoPromise;
}

// Create a fresh signer for a ledger. Returns the algorithm name, the raw public
// key (hex) to publish alongside the log, and a sign(hashHex) function.
export async function createSigner() {
	const algo = await resolveAlgo();
	const keyPair = await subtle.generateKey(algo.generate, true, ['sign', 'verify']);
	const rawPub = new Uint8Array(await subtle.exportKey('raw', keyPair.publicKey));
	const publicKeyHex = bytesToHex(rawPub);

	return {
		alg: algo.name,
		publicKeyHex,
		keyPair,
		// Sign the receipt hash (hex string bytes). Returns signature hex.
		async sign(hashHex) {
			const sig = await subtle.sign(algo.sign, keyPair.privateKey, enc.encode(hashHex));
			return bytesToHex(new Uint8Array(sig));
		},
	};
}

// Build a verifier from a published { alg, publicKeyHex }.
export async function importVerifier({ alg, publicKeyHex }) {
	const spec =
		alg === 'Ed25519'
			? { importPublic: { name: 'Ed25519' }, sign: { name: 'Ed25519' } }
			: { importPublic: { name: 'ECDSA', namedCurve: 'P-256' }, sign: { name: 'ECDSA', hash: 'SHA-256' } };
	const key = await subtle.importKey('raw', hexToBytes(publicKeyHex), spec.importPublic, true, [
		'verify',
	]);
	return {
		async verify(hashHex, signatureHex) {
			return subtle.verify(spec.sign, key, hexToBytes(signatureHex), enc.encode(hashHex));
		},
	};
}

// ── Chain verification ───────────────────────────────────────────────────────
//
// Recompute every receipt hash, confirm each links to its predecessor, and —
// when the ledger is signed — verify every signature. Returns the first failure
// so the UI can point at the exact tampered receipt.
export async function verifyChain(receipts, { alg, publicKeyHex } = {}) {
	if (!Array.isArray(receipts)) return { valid: false, reason: 'not a chain', length: 0 };
	const signed = Boolean(alg && publicKeyHex);
	const verifier = signed ? await importVerifier({ alg, publicKeyHex }) : null;

	let prev = GENESIS;
	for (let i = 0; i < receipts.length; i++) {
		const r = receipts[i];
		if (r.seq !== i) {
			return { valid: false, brokenAt: i, reason: `sequence mismatch at ${i}`, length: receipts.length, signed };
		}
		if (r.prevHash !== prev) {
			return { valid: false, brokenAt: i, reason: `broken link at receipt ${i}`, length: receipts.length, signed };
		}
		const recomputed = await computeReceiptHash(r);
		if (recomputed !== r.hash) {
			return { valid: false, brokenAt: i, reason: `altered content at receipt ${i}`, length: receipts.length, signed };
		}
		if (verifier) {
			if (!r.signature) {
				return { valid: false, brokenAt: i, reason: `missing signature at receipt ${i}`, length: receipts.length, signed };
			}
			const ok = await verifier.verify(r.hash, r.signature);
			if (!ok) {
				return { valid: false, brokenAt: i, reason: `invalid signature at receipt ${i}`, length: receipts.length, signed };
			}
		}
		prev = r.hash;
	}
	return { valid: true, length: receipts.length, head: prev === GENESIS ? null : prev, signed };
}

// ── Ledger ───────────────────────────────────────────────────────────────────
//
// Stateful convenience wrapper used by the demo UI: holds the signer + receipts,
// appends governed turns, exports a self-contained verifiable document, and
// reports the current chain head (the value anchored on-chain).
export class AttestationLedger {
	constructor() {
		this.receipts = [];
		this.signer = null;
	}

	async init() {
		if (!this.signer) this.signer = await createSigner();
		return this;
	}

	get head() {
		return this.receipts.length ? this.receipts[this.receipts.length - 1].hash : GENESIS;
	}

	// Seal one governed turn into a signed receipt and append it.
	async append({ ts, turn, governance }) {
		if (!this.signer) await this.init();
		const receipt = await buildReceipt({
			seq: this.receipts.length,
			prevHash: this.head,
			ts,
			turn,
			governance,
		});
		// Only `signature` is added post-hash; receiptBody() strips it on verify.
		// The signing algorithm travels in the exported header, not per receipt,
		// so it never pollutes the hashed body.
		receipt.signature = await this.signer.sign(receipt.hash);
		this.receipts.push(receipt);
		return receipt;
	}

	// Self-contained, portable audit document.
	export() {
		return {
			version: VERSION,
			alg: this.signer?.alg || null,
			publicKey: this.signer?.publicKeyHex || null,
			head: this.head,
			count: this.receipts.length,
			receipts: this.receipts,
		};
	}

	verify() {
		return verifyChain(this.receipts, {
			alg: this.signer?.alg,
			publicKeyHex: this.signer?.publicKeyHex,
		});
	}
}

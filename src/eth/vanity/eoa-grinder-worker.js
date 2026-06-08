/**
 * EVM externally-owned-account (EOA) vanity grinder Web Worker.
 *
 * Unlike the CREATE2 grinder (which searches salts for a deterministic
 * *contract* address and never touches a private key), this worker searches
 * for a real keypair: a secp256k1 private key whose derived Ethereum address
 * matches the requested hex prefix/suffix.
 *
 * Hot loop — incremental point addition (the standard vanity speed trick):
 *   1. seed a random base scalar k0 and compute P = k0·G once.
 *   2. each step, the candidate private key is (k0 + i) mod n and its public
 *      point is the running P. Deriving the next point is a single point
 *      addition P += G — far cheaper than a fresh scalar multiplication.
 *   3. address = keccak256(uncompressedPubkey[1:])[12:] (last 20 bytes).
 *   4. case-INsensitive patterns compare the lowercase hex directly; any
 *      uppercase in the pattern switches to an EIP-55 checksum compare
 *      (one extra keccak over the 40-char ASCII address).
 *
 * The recovered private key is reconstructed from the scalar only when a
 * match is found, so the per-attempt cost stays at one point-add + one
 * keccak (+ the affine inversion inside toBytes).
 */

import { secp256k1 } from '@noble/curves/secp256k1.js';
import { keccak_256 } from '@noble/hashes/sha3';

const PROGRESS_INTERVAL = 2000;
const HEX_CHARS = '0123456789abcdef';
const Point = secp256k1.Point;
const N = Point.Fn.ORDER;

let running = false;
let paused = false;

self.onmessage = (e) => {
	const msg = e.data;
	if (msg?.type === 'start') {
		running = true;
		paused = false;
		grind(msg);
	} else if (msg?.type === 'stop') {
		running = false;
	} else if (msg?.type === 'pause') {
		paused = true;
	} else if (msg?.type === 'resume') {
		paused = false;
	}
};

function bytesToHex(bytes) {
	let s = '';
	for (let i = 0; i < bytes.length; i++) {
		const b = bytes[i];
		s += HEX_CHARS[b >> 4] + HEX_CHARS[b & 0xf];
	}
	return s;
}

/** EIP-55 checksum of a 40-char lowercase hex address (inlined for the hot loop). */
function eip55(lowerHex) {
	const ascii = new Uint8Array(40);
	for (let i = 0; i < 40; i++) ascii[i] = lowerHex.charCodeAt(i);
	const h = keccak_256(ascii);
	let out = '';
	for (let i = 0; i < 40; i++) {
		const c = lowerHex.charCodeAt(i);
		if (c < 0x61) { out += lowerHex[i]; continue; }       // digit — never cased
		const nibble = (i & 1) === 0 ? (h[i >> 1] >> 4) : (h[i >> 1] & 0xf);
		out += nibble >= 8 ? lowerHex[i].toUpperCase() : lowerHex[i];
	}
	return out;
}

/** A scalar (mod n) → 32 big-endian bytes — the canonical 0x private-key body. */
function scalarToBytes(k) {
	let hex = (((k % N) + N) % N).toString(16);
	if (hex.length < 64) hex = '0'.repeat(64 - hex.length) + hex;
	const out = new Uint8Array(32);
	for (let i = 0; i < 32; i++) out[i] = parseInt(hex.substring(i * 2, i * 2 + 2), 16);
	return out;
}

/**
 * @param {{ prefix: string, suffix: string, caseSensitive: boolean }} cfg
 */
async function grind(cfg) {
	const caseSensitive = !!cfg.caseSensitive;
	const wantPrefix = caseSensitive ? (cfg.prefix || '') : (cfg.prefix || '').toLowerCase();
	const wantSuffix = caseSensitive ? (cfg.suffix || '') : (cfg.suffix || '').toLowerCase();
	const pLen = wantPrefix.length;
	const sLen = wantSuffix.length;

	// Random base scalar k0 ∈ [1, n). 24 bytes of entropy is ample; we keep 32.
	const seed = new Uint8Array(32);
	crypto.getRandomValues(seed);
	let k0 = 0n;
	for (let i = 0; i < seed.length; i++) k0 = (k0 << 8n) | BigInt(seed[i]);
	k0 = k0 % N;
	if (k0 === 0n) k0 = 1n;

	let pt = Point.BASE.multiply(k0);
	let i = 0n;

	let attempts = 0;
	let intervalAttempts = 0;
	let intervalStart = performance.now();

	while (running) {
		if (paused) {
			await new Promise((r) => setTimeout(r, 80));
			intervalStart = performance.now();
			intervalAttempts = 0;
			continue;
		}

		const pub = pt.toBytes(false);                       // 65 bytes: 0x04 ‖ X ‖ Y
		const digest = keccak_256(pub.subarray(1));
		const lowerHex = bytesToHex(digest.subarray(12));

		attempts++;
		intervalAttempts++;

		const candidate = caseSensitive ? eip55(lowerHex) : lowerHex;
		const headOk = !pLen || candidate.startsWith(wantPrefix);
		const tailOk = !sLen || candidate.endsWith(wantSuffix);

		if (headOk && tailOk) {
			const priv = scalarToBytes(k0 + i);
			self.postMessage({
				type: 'match',
				address: '0x' + lowerHex,
				addressChecksum: '0x' + eip55(lowerHex),
				privateKey: '0x' + bytesToHex(priv),
				attempts,
			}, [priv.buffer]);
			running = false;
			return;
		}

		pt = pt.add(Point.BASE);
		i++;

		if (intervalAttempts >= PROGRESS_INTERVAL) {
			const now = performance.now();
			const elapsed = (now - intervalStart) / 1000;
			const rate = elapsed > 0 ? intervalAttempts / elapsed : 0;
			self.postMessage({
				type: 'progress',
				attempts,
				rate,
				sample: '0x' + (caseSensitive ? candidate : lowerHex),
			});
			intervalStart = now;
			intervalAttempts = 0;
			await new Promise((r) => setTimeout(r, 0));
		}
	}
}

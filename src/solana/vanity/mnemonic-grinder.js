/**
 * Vanity grinder that returns a BIP-39 SEED PHRASE (not just a raw keypair).
 *
 * The WASM grinder in grinder-node.js produces raw Ed25519 keypairs that have
 * no mnemonic — you can only import them as a private key. This grinder instead
 * rolls a fresh BIP-39 mnemonic each attempt, derives the Solana keypair at
 * m/44'/501'/0'/0' (Phantom's default), and checks the resulting address against
 * the requested prefix/suffix. A hit therefore yields a real seed phrase the
 * buyer can type into any wallet — at the same address.
 *
 * Cost model: each attempt runs PBKDF2-HMAC-SHA512 (2048 iterations) + an
 * HMAC-SHA512 chain, so throughput is ~200–250 keypairs/sec single-threaded —
 * roughly 100× slower than the WASM keypair grinder. The honest server ceiling
 * is therefore a 2-character combined pattern (~3.4k expected attempts, found
 * inside the default 45s budget the large majority of the time). On budget
 * exhaustion we throw GrindExhaustedError so the x402 endpoint declines to
 * charge the buyer. Longer mnemonic patterns belong on the user's own machine.
 */

import { validatePattern, expectedAttempts } from './validation.js';
import { generateMnemonic, deriveSolanaKeypair, DEFAULT_STRENGTH, STRENGTH_WORD_COUNTS } from './mnemonic.js';
import { GrindExhaustedError } from './grinder-node.js';

// Largest combined (prefix + suffix) length the server will grind in mnemonic
// mode. Held below the keypair grinder's limit of 3 because each attempt is
// ~100× more expensive — a 3-char mnemonic grind (~195k attempts) would need
// ~15 minutes single-threaded, far past any serverless budget.
export const MAX_MNEMONIC_PATTERN_LENGTH = 2;

const DEFAULT_TIME_BUDGET_MS = 45_000;

// How often to re-check the wall-clock budget. The per-attempt cost is high
// (~4–5ms), so a small batch keeps the budget check responsive without adding
// measurable overhead.
const BATCH_SIZE = 64;

/**
 * @typedef {object} MnemonicGrindResult
 * @property {string} mnemonic        - BIP-39 seed phrase (the secret).
 * @property {number} wordCount       - 12 / 15 / 18 / 21 / 24.
 * @property {string} derivationPath  - e.g. m/44'/501'/0'/0'.
 * @property {string} publicKey       - Base58 address.
 * @property {Uint8Array} secretKey   - 64-byte Ed25519 secret key (derived).
 * @property {number} attempts        - Mnemonics tried.
 * @property {number} durationMs      - Wall-clock duration.
 */

/**
 * Grind a vanity Solana address whose key is recoverable from a BIP-39 mnemonic.
 *
 * @param {object} opts
 * @param {string} [opts.prefix]             Base58 prefix to match.
 * @param {string} [opts.suffix]             Base58 suffix to match.
 * @param {boolean} [opts.ignoreCase=false]  Case-insensitive match.
 * @param {number} [opts.strength=128]       BIP-39 entropy bits (12–24 words).
 * @param {number} [opts.timeBudgetMs]       Wall-clock budget before giving up.
 * @returns {MnemonicGrindResult}
 * @throws {Error} invalid pattern (400) or exhausted budget (504).
 */
export function grindVanityMnemonic(opts = {}) {
	const prefix = opts.prefix || '';
	const suffix = opts.suffix || '';
	const ignoreCase = !!opts.ignoreCase;
	const strength = opts.strength || DEFAULT_STRENGTH;
	const timeBudgetMs = opts.timeBudgetMs || DEFAULT_TIME_BUDGET_MS;

	if (!prefix && !suffix) {
		throw Object.assign(new Error('prefix or suffix is required'), { status: 400, code: 'validation_error' });
	}
	if (!STRENGTH_WORD_COUNTS[strength]) {
		throw Object.assign(new Error(`invalid strength ${strength}`), { status: 400, code: 'validation_error' });
	}
	for (const [label, pattern] of [['prefix', prefix], ['suffix', suffix]]) {
		if (!pattern) continue;
		const v = validatePattern(pattern);
		if (!v.valid) {
			throw Object.assign(new Error(`invalid ${label}: ${v.errors.join('; ')}`), {
				status: 400,
				code: 'validation_error',
			});
		}
	}
	const combinedLength = prefix.length + suffix.length;
	if (combinedLength > MAX_MNEMONIC_PATTERN_LENGTH) {
		throw Object.assign(
			new Error(
				`combined pattern length ${combinedLength} exceeds the mnemonic-mode server limit of ` +
					`${MAX_MNEMONIC_PATTERN_LENGTH} characters — seed-phrase grinding is ~100× slower than ` +
					`raw keypair grinding. Grind longer mnemonic patterns on your own machine, or drop the ` +
					`mnemonic option to get a raw keypair (up to 3 chars server-side).`,
			),
			{ status: 400, code: 'pattern_too_long' },
		);
	}

	const wantPrefix = prefix ? (ignoreCase ? prefix.toLowerCase() : prefix) : null;
	const wantSuffix = suffix ? (ignoreCase ? suffix.toLowerCase() : suffix) : null;
	const pLen = wantPrefix?.length || 0;
	const sLen = wantSuffix?.length || 0;

	const startedAt = performance.now();
	let attempts = 0;

	while (performance.now() - startedAt < timeBudgetMs) {
		for (let i = 0; i < BATCH_SIZE; i++) {
			const mnemonic = generateMnemonic(strength);
			const { keypair, derivationPath } = deriveSolanaKeypair(mnemonic);
			const addr = keypair.publicKey.toBase58();
			attempts++;

			if (wantPrefix) {
				const head = ignoreCase ? addr.slice(0, pLen).toLowerCase() : addr.slice(0, pLen);
				if (head !== wantPrefix) continue;
			}
			if (wantSuffix) {
				const tail = ignoreCase ? addr.slice(addr.length - sLen).toLowerCase() : addr.slice(addr.length - sLen);
				if (tail !== wantSuffix) continue;
			}

			return {
				mnemonic,
				wordCount: STRENGTH_WORD_COUNTS[strength],
				derivationPath,
				publicKey: addr,
				secretKey: Uint8Array.from(keypair.secretKey),
				attempts,
				durationMs: performance.now() - startedAt,
			};
		}
	}

	throw new GrindExhaustedError(attempts, performance.now() - startedAt);
}

/**
 * Expected attempts for a mnemonic-mode pattern. Identical probability model to
 * the keypair grinder (base58, case-folding aware) — only throughput differs.
 * @param {string} prefix
 * @param {string} suffix
 * @param {boolean} [ignoreCase=false]
 * @returns {number}
 */
export function expectedMnemonicAttempts(prefix, suffix, ignoreCase = false) {
	return expectedAttempts(prefix || '', suffix || '', ignoreCase);
}

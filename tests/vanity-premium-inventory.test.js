/**
 * Premium vanity inventory — unit + (DB-gated) integration tests.
 *
 * Covers the security-critical guarantees of the sell-from-stock tier:
 *   1. Vault seal/open round-trips, and the sealed blob is NOT plaintext.
 *   2. A sealed keypair actually derives its address (the delivered key works).
 *   3. The difficulty→price curve is monotonic and clamped to [$1,$50].
 *   4. The batch grinder produces addresses that match the requested pattern.
 *   5. (DB-gated) single-use reveal + delete-after-reveal: a key is delivered
 *      exactly once and its ciphertext is destroyed — a second reveal gets nothing.
 *
 * The store test only runs when DATABASE_URL points at a throwaway DB/branch;
 * it self-cleans and skips cleanly in CI without one.
 */

// secret-box reads these lazily at seal/open time; set before anything imports it.
process.env.WALLET_ENCRYPTION_KEY ||= 'vitest-ephemeral-wallet-key-000000000000000000';
process.env.JWT_SECRET ||= 'vitest-ephemeral-jwt-secret-00000000000000';

import { describe, it, expect } from 'vitest';
import { Keypair } from '@solana/web3.js';
import bs58 from 'bs58';

import { sealSecret, openSecret, preferredScheme, SCHEME_SECRETBOX } from '../api/_lib/vanity-vault.js';
import { priceFromRarity, priceForPattern, MIN_PRICE_USD, MAX_PRICE_USD } from '../api/_lib/vanity-inventory-pricing.js';
import { computeRarity } from '../src/solana/vanity/rarity.js';
import { grindToCompletion } from '../workers/vanity-grinder/wasm-grind.mjs';

describe('vanity-vault: seal/open', () => {
	it('round-trips a secret and never stores plaintext', async () => {
		const kp = Keypair.generate();
		const bundle = JSON.stringify({
			format: 'keypair',
			address: kp.publicKey.toBase58(),
			secretKeyBase58: bs58.encode(kp.secretKey),
			secretKey: Array.from(kp.secretKey),
		});
		const { ciphertext, scheme } = await sealSecret(bundle);

		// Without KMS configured, the default scheme is secret-box AES-256-GCM.
		expect(scheme).toBe(SCHEME_SECRETBOX);
		expect(preferredScheme()).toBe(SCHEME_SECRETBOX);
		// The ciphertext must not leak the key material.
		expect(ciphertext).not.toContain(bundle);
		expect(ciphertext).not.toContain(bs58.encode(kp.secretKey));
		expect(/secretKey/.test(ciphertext)).toBe(false);

		const opened = JSON.parse(await openSecret(ciphertext, scheme));
		expect(opened.address).toBe(kp.publicKey.toBase58());
		// The delivered key actually reconstructs the keypair for the address.
		const restored = Keypair.fromSecretKey(Uint8Array.from(opened.secretKey));
		expect(restored.publicKey.toBase58()).toBe(kp.publicKey.toBase58());
	});

	it('fails to open a corrupted ciphertext (authenticated encryption)', async () => {
		const { ciphertext, scheme } = await sealSecret('top-secret');
		const corrupted = ciphertext.slice(0, -4) + 'AAAA';
		await expect(openSecret(corrupted, scheme)).rejects.toBeTruthy();
	});
});

describe('vanity-inventory-pricing: difficulty → price curve', () => {
	it('clamps to [MIN, MAX] and rises with difficulty', () => {
		const p2 = priceForPattern({ prefix: 'ab' });          // ~2 chars
		const p4 = priceForPattern({ prefix: 'PUMP' });        // 4 chars
		const p5 = priceForPattern({ prefix: 'THREE' });       // 5 chars

		for (const p of [p2, p4, p5]) {
			expect(p.priceUsd).toBeGreaterThanOrEqual(MIN_PRICE_USD);
			expect(p.priceUsd).toBeLessThanOrEqual(MAX_PRICE_USD);
			expect(p.priceAtomics).toBe(Math.round(p.priceUsd * 1e6));
		}
		// Monotonic in difficulty.
		expect(p4.priceUsd).toBeGreaterThan(p2.priceUsd);
		expect(p5.priceUsd).toBeGreaterThanOrEqual(p4.priceUsd);
		// A hard 5-char pattern lands in the upper band.
		expect(p5.priceUsd).toBeGreaterThan(20);
	});

	it('never exceeds the ceiling even for an absurd pattern', () => {
		const rarity = computeRarity({ prefix: 'ABCDEFGH', suffix: 'ZYXW' });
		const { priceUsd } = priceFromRarity(rarity);
		expect(priceUsd).toBe(MAX_PRICE_USD);
	});
});

describe('batch grinder: produced addresses match the pattern', () => {
	it('grinds a 2-char prefix whose address starts with it', () => {
		const res = grindToCompletion({ prefix: 'ab', ignoreCase: true }, { maxAttempts: 5_000_000 });
		expect(res.status).toBe('found');
		expect(res.publicKey.toLowerCase().startsWith('ab')).toBe(true);
		// The secret key is a valid 64-byte Ed25519 key that derives the address.
		const kp = Keypair.fromSecretKey(res.secretKey);
		expect(kp.publicKey.toBase58()).toBe(res.publicKey);
	}, 30_000);

	it('gives up (exhausted) instead of hanging on an impossible cap', () => {
		// Tiny cap → returns exhausted rather than looping forever.
		const res = grindToCompletion({ prefix: 'zzzzz' }, { maxAttempts: 50_000 });
		expect(res.status).toBe('exhausted');
	}, 15_000);
});

// ── DB-gated: single-use reveal + delete-after-reveal ────────────────────────
const HAS_DB = Boolean(process.env.DATABASE_URL);
describe.skipIf(!HAS_DB)('vanity-inventory-store: single-use delivery (needs DATABASE_URL)', () => {
	it('delivers a key exactly once and destroys the ciphertext', async () => {
		const store = await import('../api/_lib/vanity-inventory-store.js');
		const kp = Keypair.generate();
		const address = kp.publicKey.toBase58();
		const { ciphertext, scheme } = await sealSecret(
			JSON.stringify({ format: 'keypair', address, secretKeyBase58: bs58.encode(kp.secretKey), secretKey: Array.from(kp.secretKey) }),
		);

		await store.upsertInventoryItem({
			address, patternLabel: 'TEST…', prefix: null, suffix: null,
			difficultyAttempts: 1000, rarityBits: 6, rarityTier: 'uncommon', rarityScore: 600,
			secretCiphertext: ciphertext, secretScheme: scheme, priceUsd: 1, retentionDays: 0,
		});

		const paymentId = 'test-pay-' + address.slice(0, 8);
		const reserved = await store.reserveForPurchase(address, { paymentId, purchaser: 'tester' });
		expect(reserved.ok).toBe(true);

		// First reveal returns the ciphertext and (retention 0) destroys it.
		const first = await store.reserveAndReveal(address, { paymentId });
		expect(first.ok).toBe(true);
		expect(first.destroyed).toBe(true);
		const opened = JSON.parse(await openSecret(first.ciphertext, first.scheme));
		expect(Keypair.fromSecretKey(Uint8Array.from(opened.secretKey)).publicKey.toBase58()).toBe(address);

		// Second reveal gets nothing — single use enforced server-side.
		const second = await store.reserveAndReveal(address, { paymentId });
		expect(second.ok).toBe(false);
		expect(second.reason).toBe('already_revealed');

		// The public item is now destroyed and holds no ciphertext.
		const pub = await store.getPublicItem(address);
		expect(pub.status).toBe('destroyed');
	});
});

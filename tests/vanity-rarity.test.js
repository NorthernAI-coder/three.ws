// Pins the proof-of-grind rarity math + the gallery store's privacy boundary.
// The scoring is the trust surface for the gallery/leaderboard/share cards, so
// it is locked with fixed vectors; a change that inflates a score or leaks a
// secret must break a test here.

import { describe, it, expect } from 'vitest';
import {
	computeRarity,
	appraiseAddress,
	tierForBits,
	RARITY_TIERS,
	CHAR_BITS,
} from '../src/solana/vanity/rarity.js';
import { toPublicEntry, PUBLIC_FIELDS } from '../api/_lib/vanity-gallery-store.js';
import { expectedAttempts } from '../src/solana/vanity/validation.js';

describe('rarity base math is the honest difficulty model', () => {
	it('empty pattern is Common with zero score', () => {
		const r = computeRarity({});
		expect(r.tier).toBe('common');
		expect(r.rarityScore).toBe(0);
		expect(r.baseBits).toBe(0);
		expect(r.bonusBits).toBe(0);
	});

	it('baseBits is log2(expectedAttempts) — tied to the receipt difficulty', () => {
		for (const pat of [{ prefix: 'So' }, { prefix: 'abc' }, { prefix: 'ab', suffix: 'z' }]) {
			const r = computeRarity(pat);
			const expected = Math.log2(expectedAttempts(pat.prefix || '', pat.suffix || '', false));
			expect(r.baseBits).toBeCloseTo(Math.round(expected * 100) / 100, 2);
		}
	});

	it('tier cuts land on whole-character boundaries (58^n in bits)', () => {
		// 2 chars → 2·log2(58) ≈ 11.72 bits → Rare floor.
		expect(computeRarity({ prefix: 'So' }).tier).toBe('rare');
		expect(computeRarity({ prefix: 'So' }).rarityBits).toBeCloseTo(2 * CHAR_BITS, 1);
		// 3 chars no bonus → Epic floor (3·log2(58) ≈ 17.57).
		expect(computeRarity({ prefix: 'xqz' }).tier).toBe('epic');
		// 5 chars no bonus → Mythic floor (5·log2(58) ≈ 29.29).
		expect(computeRarity({ prefix: 'abcde' }).tier).toBe('mythic');
	});

	it('longer prefixes are categorically rarer (monotonic in base difficulty)', () => {
		const two = computeRarity({ prefix: 'ab' }).baseBits;
		const three = computeRarity({ prefix: 'abc' }).baseBits;
		const four = computeRarity({ prefix: 'abcd' }).baseBits;
		expect(three).toBeGreaterThan(two);
		expect(four).toBeGreaterThan(three);
	});

	it('case-insensitive matching lowers difficulty vs case-sensitive', () => {
		const ci = computeRarity({ prefix: 'abc', ignoreCase: true }).baseBits;
		const cs = computeRarity({ prefix: 'abc', ignoreCase: false }).baseBits;
		expect(ci).toBeLessThan(cs);
	});
});

describe('rarity bonuses are real, bounded, and documented', () => {
	it('a real BIP-39 word earns a dictionary bonus; a non-word does not', () => {
		const word = computeRarity({ prefix: 'cat' }); // "cat" ∈ BIP-39
		const nonWord = computeRarity({ prefix: 'xqz' }); // not a word
		expect(word.bonuses.some((b) => b.id.startsWith('dictionary'))).toBe(true);
		expect(nonWord.bonuses.some((b) => b.id.startsWith('dictionary'))).toBe(false);
		expect(word.rarityBits).toBeGreaterThan(nonWord.rarityBits);
	});

	it('palindromes earn a flat bonus', () => {
		const pal = computeRarity({ prefix: 'aba' });
		expect(pal.bonuses.some((b) => b.id.includes('palindrome'))).toBe(true);
	});

	it('a 3× repeat run earns a repeat bonus AND counts as a palindrome', () => {
		const r = computeRarity({ prefix: 'aaa' });
		const ids = r.bonuses.map((b) => b.id);
		expect(ids).toContain('repeat');
		expect(ids.some((i) => i.includes('palindrome'))).toBe(true);
	});

	it('dual-sided (prefix AND suffix) earns the bookended bonus', () => {
		const r = computeRarity({ prefix: 'xy', suffix: 'zw' });
		expect(r.bonuses.some((b) => b.id === 'dual-sided')).toBe(true);
	});

	it('bonuses can never out-rank raw difficulty: a 3-char word < a 5-char prefix', () => {
		const word3 = computeRarity({ prefix: 'cat' }).rarityBits;
		const brute5 = computeRarity({ prefix: 'abcde' }).rarityBits;
		expect(brute5).toBeGreaterThan(word3);
	});

	it('exact frozen vector for "cat" (regression lock)', () => {
		const r = computeRarity({ prefix: 'cat' });
		expect(r.tier).toBe('epic');
		expect(r.rarityScore).toBe(2037);
		expect(r.baseBits).toBe(17.57);
		expect(r.bonusBits).toBe(2.8);
	});
});

describe('tier ladder', () => {
	it('tierForBits is monotonic and bounded by Common…Mythic', () => {
		expect(tierForBits(-1).id).toBe('common');
		expect(tierForBits(0).id).toBe('common');
		expect(tierForBits(100).id).toBe('mythic');
		// Each defined floor resolves to its own tier.
		for (const t of RARITY_TIERS) {
			expect(tierForBits(t.minBits).id).toBe(t.id);
		}
	});
});

describe('appraisal of an arbitrary address', () => {
	it('returns a tier, score, and human grind-cost estimate', () => {
		const a = appraiseAddress('So11111111111111111111111111111111111111112');
		expect(a.tier).toBeTruthy();
		expect(typeof a.rarityScore).toBe('number');
		expect(typeof a.grindHuman).toBe('string');
		expect(a.grindSeconds).toBeGreaterThanOrEqual(0);
	});

	it('honors an explicit prefix/suffix split', () => {
		const a = appraiseAddress('AbcDeFgHiJkLmNoPqRsTuVwXyZ123456789ABCDEFGHJ', { prefixLen: 3, suffixLen: 0 });
		expect(a.prefix).toBe('Abc');
		expect(a.suffix).toBeNull();
	});

	it('a longer requested prefix yields a rarer appraisal', () => {
		const short = appraiseAddress('TestWalletXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX', { prefixLen: 2 });
		const long = appraiseAddress('TestWalletXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX', { prefixLen: 4 });
		expect(long.rarityBits).toBeGreaterThan(short.rarityBits);
	});
});

describe('privacy: the gallery store can never serialize a secret', () => {
	it('toPublicEntry drops every secret/seed/sealed field', () => {
		const poisoned = {
			address: 'So11111111111111111111111111111111111111112',
			rarityScore: 1172,
			tier: 'rare',
			pattern: { prefix: 'So', suffix: null, ignoreCase: false },
			// Attacker/caller-smuggled secrets — must NOT survive projection.
			secretKey: [1, 2, 3, 4],
			secretKeyBase58: 'NEVERLEAKME',
			seed: 'deadbeef'.repeat(8),
			serverSeed: 'cafe'.repeat(16),
			sealedSecret: { ciphertext: 'x', epk: 'y' },
			privateKey: 'nope',
			mnemonic: 'word word word',
		};
		const pub = toPublicEntry(poisoned);
		const serialized = JSON.stringify(pub);
		for (const leak of ['secretKey', 'secretKeyBase58', 'seed', 'serverSeed', 'sealedSecret', 'privateKey', 'mnemonic', 'NEVERLEAKME', 'deadbeef', 'cafe']) {
			expect(serialized).not.toContain(leak);
		}
		// And only allowlisted keys survive.
		for (const k of Object.keys(pub)) expect(PUBLIC_FIELDS).toContain(k);
	});

	it('rejects an entry without an address or a numeric score', () => {
		expect(toPublicEntry({ rarityScore: 5 })).toBeNull();
		expect(toPublicEntry({ address: 'So111' })).toBeNull();
		expect(toPublicEntry(null)).toBeNull();
	});

	it('clamps a runaway label and nested pattern', () => {
		const pub = toPublicEntry({
			address: 'So11111111111111111111111111111111111111112',
			rarityScore: 1,
			label: 'x'.repeat(500),
			pattern: { prefix: 'a'.repeat(100), suffix: 'b'.repeat(100), ignoreCase: true, secretSmuggle: 'leak' },
		});
		expect(pub.label.length).toBeLessThanOrEqual(80);
		expect(pub.pattern.prefix.length).toBeLessThanOrEqual(16);
		expect(JSON.stringify(pub.pattern)).not.toContain('leak');
	});
});

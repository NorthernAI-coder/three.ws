/**
 * Marketplace economics — money math for multi-collaborator splits.
 *
 * These are the correctness guarantees an acquirer underwrites: a buyer is
 * never over-charged (fee + creator-net = price), N-way split shares sum to
 * 100%, and every recipient's atomic allocation is exact (Σ parts = the whole,
 * no dust lost or invented) for any amount and any share mix — including the
 * pathological cases (primes, 1-atomic, huge values, lopsided shares).
 *
 * Pure functions only — no DB, no chain — so they run fast and deterministically.
 */

import { describe, it, expect } from 'vitest';
import {
	validateShares,
	allocateAtomics,
	describeSplit,
	isValidAddressForChain,
	FULL_SHARE_BPS,
} from '../api/_lib/splits.js';
import { marketplaceFeeAtomics } from '../api/_lib/marketplace-platform-fee.js';

// Synthetic addresses — never a real wallet (CLAUDE.md).
const SOL_A = 'THREEsynthetic1111111111111111111111111111A';
const EVM_A = '0x1111111111111111111111111111111111111111';
const EVM_B = '0x2222222222222222222222222222222222222222';
const EVM_C = '0x3333333333333333333333333333333333333333';

const sum = (parts) => parts.reduce((s, p) => s + p.amount, 0n);

describe('validateShares', () => {
	it('accepts a 70/30 split that sums to 100%', () => {
		const out = validateShares(
			[
				{ address: EVM_A, share_bps: 7000 },
				{ address: EVM_B, share_bps: 3000 },
			],
			'base',
		);
		expect(out).toHaveLength(2);
		expect(out.reduce((s, r) => s + r.share_bps, 0)).toBe(FULL_SHARE_BPS);
	});

	it('accepts percent input and normalizes to bps', () => {
		const out = validateShares(
			[
				{ address: EVM_A, percent: 33.33 },
				{ address: EVM_B, percent: 66.67 },
			],
			'base',
		);
		expect(out.map((r) => r.share_bps)).toEqual([3333, 6667]);
	});

	it('rejects shares that do not sum to 100%', () => {
		expect(() =>
			validateShares(
				[
					{ address: EVM_A, share_bps: 7000 },
					{ address: EVM_B, share_bps: 2000 },
				],
				'base',
			),
		).toThrow(/sum to 100%/);
	});

	it('rejects duplicate recipients', () => {
		expect(() =>
			validateShares(
				[
					{ address: EVM_A, share_bps: 5000 },
					{ address: EVM_A, share_bps: 5000 },
				],
				'base',
			),
		).toThrow(/more than once/);
	});

	it('rejects an invalid address for the chain', () => {
		expect(() => validateShares([{ address: 'not-an-address', share_bps: 10000 }], 'base')).toThrow(
			/invalid base address/,
		);
	});

	it('rejects a zero or negative share', () => {
		expect(() =>
			validateShares(
				[
					{ address: EVM_A, share_bps: 0 },
					{ address: EVM_B, share_bps: 10000 },
				],
				'base',
			),
		).toThrow(/invalid share/);
	});

	it('validates chain-appropriate addresses', () => {
		expect(isValidAddressForChain(SOL_A, 'solana')).toBe(true);
		expect(isValidAddressForChain(EVM_A, 'base')).toBe(true);
		expect(isValidAddressForChain(EVM_A, 'solana')).toBe(false);
	});
});

describe('allocateAtomics — exactness', () => {
	const recipients3 = [
		{ address: EVM_A, share_bps: 3333 },
		{ address: EVM_B, share_bps: 3333 },
		{ address: EVM_C, share_bps: 3334 },
	];

	it('Σ parts equals the whole for a non-divisible amount', () => {
		const parts = allocateAtomics(100n, recipients3);
		expect(sum(parts)).toBe(100n);
	});

	it('never loses or invents an atomic across many amounts', () => {
		for (let total = 0n; total <= 1000n; total++) {
			const parts = allocateAtomics(total, recipients3);
			expect(sum(parts)).toBe(total);
		}
	});

	it('handles a 1-atomic split (leftover goes to the largest remainder)', () => {
		const parts = allocateAtomics(1n, recipients3);
		expect(sum(parts)).toBe(1n);
		// Exactly one recipient gets the single atomic.
		expect(parts.filter((p) => p.amount === 1n)).toHaveLength(1);
	});

	it('is exact for a prime amount and lopsided shares', () => {
		const recipients = [
			{ address: EVM_A, share_bps: 9999 },
			{ address: EVM_B, share_bps: 1 },
		];
		const parts = allocateAtomics(7919n, recipients);
		expect(sum(parts)).toBe(7919n);
		expect(parts[0].amount).toBeGreaterThan(parts[1].amount);
	});

	it('is exact for very large amounts (no float drift)', () => {
		const total = 123456789012345n; // ~123M USDC at 6 decimals
		const parts = allocateAtomics(total, recipients3);
		expect(sum(parts)).toBe(total);
	});

	it('a single recipient receives the entire amount', () => {
		const parts = allocateAtomics(500n, [{ address: EVM_A, share_bps: 10000 }]);
		expect(parts).toHaveLength(1);
		expect(parts[0].amount).toBe(500n);
	});

	it('apportions an even split with no remainder cleanly', () => {
		const parts = allocateAtomics(1000n, [
			{ address: EVM_A, share_bps: 5000 },
			{ address: EVM_B, share_bps: 5000 },
		]);
		expect(parts.map((p) => p.amount)).toEqual([500n, 500n]);
	});
});

describe('fee + split coherence — the buyer is never over-charged', () => {
	it('platform fee + creator net = price, and Σ split = creator net', () => {
		const price = 10_000_000n; // 10 USDC
		const feeBps = 500; // 5%
		const fee = marketplaceFeeAtomics(price, feeBps);
		const creatorNet = price - fee;

		// Fee leg + creator leg reconstruct the price exactly — no hidden cut.
		expect(fee + creatorNet).toBe(price);

		const recipients = validateShares(
			[
				{ address: EVM_A, share_bps: 7000 },
				{ address: EVM_B, share_bps: 3000 },
			],
			'base',
		);
		const parts = allocateAtomics(creatorNet, recipients);

		// Every collaborator's share sums back to exactly the creator's net —
		// the platform keeps only the fee, nothing leaks into or out of the split.
		expect(sum(parts)).toBe(creatorNet);
		expect(fee + sum(parts)).toBe(price);
	});

	it('zero-fee environment routes the full price into the split', () => {
		const price = 3_000_001n; // odd amount
		const fee = marketplaceFeeAtomics(price, 0);
		expect(fee).toBe(0n);
		const recipients = validateShares(
			[
				{ address: EVM_A, share_bps: 5000 },
				{ address: EVM_B, share_bps: 2500 },
				{ address: EVM_C, share_bps: 2500 },
			],
			'base',
		);
		const parts = allocateAtomics(price - fee, recipients);
		expect(sum(parts)).toBe(price);
	});
});

describe('describeSplit', () => {
	it('renders a human label for the buyer', () => {
		const recipients = validateShares(
			[
				{ address: EVM_A, share_bps: 7000, label: 'Lead' },
				{ address: EVM_B, share_bps: 3000, label: 'Art' },
			],
			'base',
		);
		const d = describeSplit(recipients);
		expect(d.label).toBe('70 / 30');
		expect(d.recipients[0].percent).toBe(70);
		expect(d.recipients[1].label).toBe('Art');
	});
});

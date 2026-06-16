// Oracle known-wallet prior — lookup + pedigree enrichment (cold-start signal).

import { describe, it, expect } from 'vitest';
import { knownWallet, knownIsProven, KNOWN_META } from '../../api/_lib/oracle/known-wallets.js';
import { enrichWithKnownWallets } from '../../api/_lib/oracle/sources.js';

// Real seed addresses (from the bundled gmgn seed).
const SM = '8HcYptCBAaPFWkmupiSAmysZ6Z8jB7N1c4YhVjhX7zbg';
const KOL = '5M8ACGKEXG1ojKDTMH3sMqhTihTgHYMSsZc6W8i7QW3Y';

describe('knownWallet', () => {
	it('resolves a seeded smart-money wallet', () => {
		const k = knownWallet(SM);
		expect(k).toBeTruthy();
		expect(k.label).toBe('smart_money');
		expect(k.score).toBeGreaterThanOrEqual(70);
		expect(k.source).toBe('gmgn');
	});

	it('resolves a seeded KOL wallet', () => {
		expect(knownWallet(KOL).label).toBe('kol');
	});

	it('returns null for an unknown wallet', () => {
		expect(knownWallet('1'.repeat(44))).toBeNull();
	});

	it('exposes attribution + non-trivial counts', () => {
		expect(KNOWN_META.total).toBeGreaterThan(100);
		expect(KNOWN_META.source).toMatch(/gmgn/i);
	});

	it('treats smart_money and kol as proven, not sniper', () => {
		expect(knownIsProven('smart_money')).toBe(true);
		expect(knownIsProven('kol')).toBe(true);
		expect(knownIsProven('sniper')).toBe(false);
	});
});

describe('enrichWithKnownWallets', () => {
	it('injects a known wallet into pedigree and bumps the proven count', () => {
		const intel = { smartMoney: { smartWalletCount: 0, notable: [] } };
		enrichWithKnownWallets(intel, [{ wallet: SM, buy_lamports: '2000000000' }]);
		expect(intel.smartMoney.notable).toHaveLength(1);
		expect(intel.smartMoney.notable[0].label).toBe('smart_money');
		expect(intel.smartMoney.notable[0].source).toBe('gmgn');
		expect(intel.smartMoney.smartWalletCount).toBe(1);
	});

	it('upgrades an unproven brain entry with the known label', () => {
		const intel = { smartMoney: { smartWalletCount: 0, notable: [{ wallet: SM, label: 'unproven', score: 0 }] } };
		enrichWithKnownWallets(intel, [{ wallet: SM, buy_lamports: '1000000000' }]);
		expect(intel.smartMoney.notable[0].label).toBe('smart_money');
	});

	it('does not downgrade a real brain reputation', () => {
		const intel = { smartMoney: { smartWalletCount: 1, notable: [{ wallet: SM, label: 'smart_money', score: 95 }] } };
		enrichWithKnownWallets(intel, [{ wallet: SM, buy_lamports: '1000000000' }]);
		expect(intel.smartMoney.notable[0].score).toBe(95);
	});

	it('ignores unknown wallets', () => {
		const intel = { smartMoney: { smartWalletCount: 0, notable: [] } };
		enrichWithKnownWallets(intel, [{ wallet: '2'.repeat(44), buy_lamports: '5000000000' }]);
		expect(intel.smartMoney.notable).toHaveLength(0);
	});
});

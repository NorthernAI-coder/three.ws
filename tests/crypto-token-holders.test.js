import { describe, it, expect } from 'vitest';

import {
	pctOfSupply,
	rankHolders,
	top10PctOf,
	deriveConcentration,
	composeTokenHolders,
	CONCENTRATION_HIGH_PCT,
	CONCENTRATION_MEDIUM_PCT,
} from '../api/_lib/crypto-token-holders.js';

// Synthetic mints/wallets only — never a real third-party address (CLAUDE.md).
const THREE = 'FeMbDoX7R1Psc4GEcvJdsbNbZA3bfztcyDCatJVJpump';
const W1 = 'THREEsynthetic1111111111111111111111111111A';
const W2 = 'THREEsynthetic2222222222222222222222222222B';
const W3 = 'THREEsynthetic3333333333333333333333333333C';

const SUPPLY = '1000000000'; // 1e9 raw units

const mintAccount = () => ({
	result: {
		value: {
			data: {
				parsed: {
					type: 'mint',
					info: { mintAuthority: null, freezeAuthority: null, supply: SUPPLY, decimals: 6 },
				},
			},
		},
	},
});

const deps = (over = {}) => ({
	fetchMintAccount: async () => mintAccount(),
	fetchLargestAccounts: async () => ({
		result: {
			value: [
				{ address: 'acctA', amount: '400000000' },
				{ address: 'acctB', amount: '300000000' },
				{ address: 'acctC', amount: '100000000' },
			],
		},
	}),
	fetchAccountOwners: async (addrs) =>
		new Map(addrs.map((a, i) => [a, [W1, W2, W3][i]].filter(Boolean)).filter((p) => p[1]).map((p) => p)),
	fetchHelius: async () => null, // keyless by default
	...over,
});

describe('pctOfSupply / top10PctOf math', () => {
	it('computes 2-decimal percentages against raw supply', () => {
		expect(pctOfSupply('400000000', SUPPLY)).toBe(40);
		expect(pctOfSupply('1234567', SUPPLY)).toBe(0.12);
		expect(pctOfSupply('1', 0)).toBeNull();
		expect(pctOfSupply(null, SUPPLY)).toBeNull();
	});

	it('top10PctOf sums the top ten and ignores null pcts', () => {
		const ranked = [
			{ owner: W1, amount: 400, pct: 40 },
			{ owner: W2, amount: 300, pct: 30 },
			{ owner: W3, amount: 100, pct: null },
		];
		expect(top10PctOf(ranked)).toBe(70);
		expect(top10PctOf([])).toBeNull();
		expect(top10PctOf([{ owner: W1, amount: 1, pct: null }])).toBeNull();
	});
});

describe('rankHolders — owner aggregation', () => {
	it('aggregates multiple token accounts of one owner into one holder', () => {
		const ranked = rankHolders(
			[
				{ owner: W1, amount: '100000000' },
				{ owner: W1, amount: '150000000' },
				{ owner: W2, amount: '200000000' },
			],
			SUPPLY,
			10,
		);
		expect(ranked).toHaveLength(2);
		expect(ranked[0]).toEqual({ owner: W1, amount: 250000000, pct: 25 });
		expect(ranked[1].owner).toBe(W2);
	});

	it('caps at limit, drops zero balances, keys unresolved owners by account address', () => {
		const ranked = rankHolders(
			[
				{ owner: null, address: 'acctX', amount: '50' },
				{ owner: W1, amount: '0' },
				{ owner: W2, amount: '100' },
			],
			SUPPLY,
			1,
		);
		expect(ranked).toHaveLength(1);
		expect(ranked[0].owner).toBe(W2);
	});
});

describe('deriveConcentration — documented thresholds', () => {
	it('maps top10Pct through the documented rule', () => {
		expect(deriveConcentration(CONCENTRATION_HIGH_PCT + 0.01)).toBe('high');
		expect(deriveConcentration(CONCENTRATION_HIGH_PCT)).toBe('medium');
		expect(deriveConcentration(CONCENTRATION_MEDIUM_PCT + 0.01)).toBe('medium');
		expect(deriveConcentration(CONCENTRATION_MEDIUM_PCT)).toBe('low');
		expect(deriveConcentration(0)).toBe('low');
		expect(deriveConcentration(null)).toBe('unknown');
	});
});

describe('composeTokenHolders — keyless RPC fallback path', () => {
	it('resolves owners, ranks, and marks the keyless truth honestly', async () => {
		const r = await composeTokenHolders({ address: THREE, limit: 10 }, deps());
		expect(r.status).toBe('ok');
		expect(r.holderCount).toBeNull(); // unknowable keylessly — never guessed
		expect(r.top[0]).toEqual({ owner: W1, amount: 400000000, pct: 40 });
		expect(r.top10Pct).toBe(80);
		expect(r.concentration).toBe('medium');
		expect(r.sources).toEqual(['solana-rpc']);
		expect(r.note).toMatch(/keyless/);
	});

	it('caps limit and floors garbage to the default', async () => {
		const r = await composeTokenHolders({ address: THREE, limit: 999 }, deps());
		expect(r.top.length).toBeLessThanOrEqual(50);
	});

	it('owner resolution failing still returns top-N keyed by account address', async () => {
		const r = await composeTokenHolders({ address: THREE }, deps({
			fetchAccountOwners: async () => { throw new Error('rpc flake'); },
		}));
		expect(r.status).toBe('ok');
		expect(r.top[0].owner).toBe('acctA');
	});
});

describe('composeTokenHolders — helius path', () => {
	const heliusAccounts = [
		{ owner: W1, address: 'a1', amount: '500000000' },
		{ owner: W1, address: 'a2', amount: '100000000' },
		{ owner: W2, address: 'a3', amount: '250000000' },
		{ owner: W3, address: 'a4', amount: '50000000' },
	];

	it('aggregates by owner and reports an exact holder count when complete', async () => {
		const r = await composeTokenHolders({ address: THREE, limit: 2 }, deps({
			fetchHelius: async () => ({ accounts: heliusAccounts, complete: true }),
		}));
		expect(r.status).toBe('ok');
		expect(r.holderCount).toBe(3);
		expect(r.top).toHaveLength(2);
		expect(r.top[0]).toEqual({ owner: W1, amount: 600000000, pct: 60 });
		expect(r.sources).toContain('helius-das');
	});

	it('incomplete walk → holderCount null with a note, top-N still real', async () => {
		const r = await composeTokenHolders({ address: THREE }, deps({
			fetchHelius: async () => ({ accounts: heliusAccounts, complete: false }),
		}));
		expect(r.holderCount).toBeNull();
		expect(r.note).toMatch(/holder count omitted/);
		expect(r.top[0].owner).toBe(W1);
	});

	it('helius throwing falls back to the keyless path', async () => {
		const r = await composeTokenHolders({ address: THREE }, deps({
			fetchHelius: async () => { throw new Error('quota'); },
		}));
		expect(r.status).toBe('ok');
		expect(r.sources).toEqual(['solana-rpc']);
	});
});

describe('composeTokenHolders — states', () => {
	it('mint answered but not a mint → not_found', async () => {
		const r = await composeTokenHolders({ address: W1 }, deps({
			fetchMintAccount: async () => ({ result: { value: null } }),
		}));
		expect(r.status).toBe('not_found');
	});

	it('brand-new mint with zero token accounts → valid empty, not an error', async () => {
		const r = await composeTokenHolders({ address: THREE }, deps({
			fetchLargestAccounts: async () => ({ result: { value: [] } }),
		}));
		expect(r.status).toBe('ok');
		expect(r.top).toEqual([]);
		expect(r.concentration).toBe('unknown');
		expect(r.note).toMatch(/brand-new/);
	});

	it('everything down → upstream_down', async () => {
		const boom = async () => { throw new Error('down'); };
		const r = await composeTokenHolders({ address: THREE }, deps({
			fetchMintAccount: boom, fetchLargestAccounts: boom, fetchHelius: async () => null,
		}));
		expect(r.status).toBe('upstream_down');
	});

	it('mint readable but holder read down → upstream_down, never a false not-found', async () => {
		const r = await composeTokenHolders({ address: THREE }, deps({
			fetchLargestAccounts: async () => { throw new Error('throttled'); },
		}));
		expect(r.status).toBe('upstream_down');
	});

	it('a JSON-RPC error envelope is NOT an answer — throttling never fakes an empty holder set', async () => {
		const r = await composeTokenHolders({ address: THREE }, deps({
			fetchLargestAccounts: async () => ({ error: { code: -32429, message: 'Too many requests' } }),
		}));
		expect(r.status).toBe('upstream_down');
	});
});

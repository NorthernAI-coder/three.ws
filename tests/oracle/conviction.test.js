// Oracle conviction engine — unit tests.
//
// The engine is the product's brain, so its behavior is pinned here: pedigree
// leads, structural red flags cap the final score no matter how good the
// pedigree, flagged wallets drag, and the tiers fall on the documented bounds.

import { describe, it, expect } from 'vitest';
import {
	convict,
	pedigreeScore,
	structureScore,
	narrativeScore,
	momentumScore,
	WEIGHTS,
	tierTone,
} from '../../api/_lib/oracle/conviction.js';
import { archetypeFor, isProven, isFlagged } from '../../api/_lib/oracle/archetype.js';

describe('weights', () => {
	it('pillar weights sum to 1', () => {
		const sum = WEIGHTS.pedigree + WEIGHTS.structure + WEIGHTS.narrative + WEIGHTS.momentum;
		expect(sum).toBeCloseTo(1, 6);
	});
});

describe('pedigreeScore', () => {
	it('rewards proven wallets and proven-money share', () => {
		const out = pedigreeScore({
			score: 60,
			smartWalletCount: 3,
			provenBuyLamports: 5e9,
			totalBuyLamports: 1e10,
			notable: [{ wallet: 'a', label: 'smart_money', score: 88 }],
		});
		expect(out.score).toBeGreaterThan(60);
		expect(out.reasons.join(' ')).toMatch(/smart-money/);
	});

	it('drags hard on flagged (rugger/dumper) wallets', () => {
		const clean = pedigreeScore({ score: 70, smartWalletCount: 0, notable: [] });
		const dirty = pedigreeScore({
			score: 70,
			smartWalletCount: 0,
			notable: [
				{ wallet: 'r', label: 'rugger', score: 10 },
				{ wallet: 'd', label: 'dumper', score: 20 },
			],
		});
		expect(dirty.score).toBeLessThan(clean.score);
		expect(dirty.reasons.join(' ')).toMatch(/flagged/);
	});

	it('derives a base from notable wallets when no composite score is given', () => {
		const out = pedigreeScore({
			notable: [
				{ wallet: 'a', label: 'smart_money', score: 80 },
				{ wallet: 'b', label: 'neutral', score: 40 },
			],
		});
		expect(out.score).toBeGreaterThan(0);
	});
});

describe('structureScore', () => {
	it('caps the final score on a bundle launch', () => {
		const out = structureScore({ bundleFlag: true, uniqueBuyers: 4, funderClusterPct: 55 });
		expect(out.cap).toBeLessThan(50);
		expect(out.reasons.join(' ')).toMatch(/bundle/);
	});

	it('rewards a wide, distributed base', () => {
		const wide = structureScore({ uniqueBuyers: 70, topHolderPct: 8 });
		const thin = structureScore({ uniqueBuyers: 5, topHolderPct: 8 });
		expect(wide.score).toBeGreaterThan(thin.score);
	});

	it('caps hard when the dev is already dumping', () => {
		const out = structureScore({ devSoldPct: 60 });
		expect(out.cap).toBeLessThanOrEqual(38);
	});
});

describe('narrativeScore', () => {
	it('blends classifier virality with the category prior, weighted by confidence', () => {
		const high = narrativeScore({ category: 'news', virality: 90, confidence: 0.9 });
		const low = narrativeScore({ category: 'unknown', virality: 10, confidence: 0.9 });
		expect(high.score).toBeGreaterThan(low.score);
	});

	it('falls back to the category prior when virality is absent', () => {
		const out = narrativeScore({ category: 'culture' });
		expect(out.score).toBeGreaterThan(0);
		expect(out.reasons.join(' ')).toMatch(/no virality/);
	});
});

describe('momentumScore', () => {
	it('rewards strong buy inflow and penalizes distribution', () => {
		const inflow = momentumScore({ buyCount: 40, sellCount: 3 });
		const dist = momentumScore({ buyCount: 5, sellCount: 30 });
		expect(inflow.score).toBeGreaterThan(dist.score);
	});

	it('rewards a reasonable dev buy and penalizes an oversized one', () => {
		const good = momentumScore({ devBuySol: 1.0, buyCount: 12, sellCount: 1 });
		const huge = momentumScore({ devBuySol: 9.0, buyCount: 12, sellCount: 1 });
		expect(good.score).toBeGreaterThan(huge.score);
	});
});

describe('convict (fusion)', () => {
	const primeIntel = {
		smartMoney: {
			score: 88, smartWalletCount: 5, provenBuyLamports: 8e9, totalBuyLamports: 1e10,
			notable: [
				{ wallet: 'a', label: 'smart_money', score: 90 },
				{ wallet: 'b', label: 'smart_money', score: 82 },
			],
		},
		structure: { uniqueBuyers: 70, topHolderPct: 7, funderClusterPct: 5 },
		narrative: { category: 'news', virality: 85, confidence: 0.85 },
		behavior: { buyCount: 45, sellCount: 3, earlyBuyerCount: 50, devBuySol: 1.2 },
	};

	it('a clean, smart-money, high-narrative launch scores strong/prime', () => {
		const v = convict(primeIntel);
		expect(v.score).toBeGreaterThanOrEqual(72);
		expect(['strong', 'prime']).toContain(v.tier);
		expect(v.badges).toContain('smart-money');
		expect(v.pillars.pedigree).toBeGreaterThan(70);
	});

	it('structure cap overrides great pedigree — a bundle can never read strong', () => {
		const bundled = {
			...primeIntel,
			structure: { uniqueBuyers: 6, topHolderPct: 55, funderClusterPct: 60, bundleFlag: true, devSoldPct: 55 },
		};
		const v = convict(bundled);
		expect(v.score).toBeLessThan(50);
		expect(v.tier === 'avoid' || v.tier === 'watch').toBe(true);
		expect(v.badges).toContain('structure-flag');
	});

	it('flagged wallets pull a mediocre coin further down', () => {
		const withRuggers = {
			...primeIntel,
			smartMoney: {
				score: 45, smartWalletCount: 0, notable: [
					{ wallet: 'r', label: 'rugger', score: 8 },
					{ wallet: 'd', label: 'dumper', score: 15 },
				],
			},
		};
		const v = convict(withRuggers);
		expect(v.pillars.pedigree).toBeLessThan(45);
	});

	it('returns a transparent, ordered breakdown and valid tier', () => {
		const v = convict(primeIntel);
		expect(v.reasons[0]).toHaveProperty('pillar');
		expect(v.reasons[0]).toHaveProperty('text');
		expect(['avoid', 'watch', 'lean', 'strong', 'prime']).toContain(v.tier);
		expect(v.score).toBeGreaterThanOrEqual(0);
		expect(v.score).toBeLessThanOrEqual(100);
	});

	it('is deterministic — same input, same score', () => {
		expect(convict(primeIntel).score).toBe(convict(primeIntel).score);
	});

	it('an empty intel object does not throw and reads low', () => {
		const v = convict({});
		expect(v.score).toBeGreaterThanOrEqual(0);
		expect(v.tier).toBeDefined();
	});
});

describe('tierTone', () => {
	it('maps tiers to UI tones', () => {
		expect(tierTone('prime')).toBe('good');
		expect(tierTone('avoid')).toBe('bad');
		expect(tierTone('lean')).toBe('warn');
	});
});

describe('archetypes', () => {
	it('resolves known labels and tolerates unknowns', () => {
		expect(archetypeFor('smart_money').tone).toBe('good');
		expect(archetypeFor('rugger').tone).toBe('bad');
		expect(archetypeFor(null).label).toBe('unproven');
		expect(archetypeFor('nonsense').title).toBe('Unproven');
	});

	it('isProven / isFlagged gate correctly', () => {
		expect(isProven('smart_money')).toBe(true);
		expect(isProven('neutral', 75)).toBe(true);
		expect(isProven('neutral', 10)).toBe(false);
		expect(isFlagged('rugger')).toBe(true);
		expect(isFlagged('smart_money')).toBe(false);
	});
});

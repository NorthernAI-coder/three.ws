// Unit tests for the wallet reputation scoring engine.
//
// The pure computeReputation() function is the trust primitive — these tests pin
// the properties the score must hold to be credible: a new agent reads as new,
// costly signals dominate cheap ones, self-tips and single-counterparty volume
// are discounted, and the tier ladder requires real counterparty diversity.

import { describe, it, expect } from 'vitest';
import { computeReputation, tierFor, MAX_SCORE, PILLARS } from '../api/_lib/trust/wallet-reputation.js';

const NEW_AGENT = {
	ageDays: 0,
	activeDays90: 0,
	externalTipUsd: 0,
	settledUsd: 0,
	tipCount: 0,
	distinctTippers: 0,
	selfTipCount: 0,
	confirmedPayments: 0,
	failedPayments: 0,
	distinctPayers: 0,
	distributionSuccess: 0,
	forkCount: 0,
	hasOnchainIdentity: false,
	registryAverage: 0,
	registryCount: 0,
	validationCount: 0,
	feedbackCount: 0,
	hasSkillCollection: false,
};

const ESTABLISHED = {
	...NEW_AGENT,
	ageDays: 220,
	activeDays90: 40,
	externalTipUsd: 1200,
	settledUsd: 3500,
	tipCount: 18,
	distinctTippers: 9,
	confirmedPayments: 24,
	failedPayments: 1,
	distinctPayers: 11,
	distributionSuccess: 1,
	forkCount: 5,
	hasOnchainIdentity: true,
	registryAverage: 4.6,
	registryCount: 7,
	validationCount: 2,
	feedbackCount: 5,
	hasSkillCollection: true,
};

describe('computeReputation — pillar maxima', () => {
	it('pillar maxima sum to 100', () => {
		expect(MAX_SCORE).toBe(100);
		expect(PILLARS.reduce((s, p) => s + p.max, 0)).toBe(100);
	});

	it('no pillar can exceed its max even with absurd inputs', () => {
		const r = computeReputation({
			...ESTABLISHED,
			ageDays: 1e9,
			settledUsd: 1e12,
			externalTipUsd: 1e12,
			distinctTippers: 1e6,
			forkCount: 1e6,
			registryAverage: 100,
			registryCount: 1e6,
			validationCount: 1e6,
		});
		for (const p of r.pillars) expect(p.points).toBeLessThanOrEqual(p.max);
		expect(r.score).toBeLessThanOrEqual(100);
	});
});

describe('new-agent honesty', () => {
	it('a brand-new agent reads as "new" with a near-zero score', () => {
		const r = computeReputation(NEW_AGENT);
		expect(r.isNew).toBe(true);
		expect(r.tier).toBe('new');
		expect(r.score).toBeLessThan(2);
	});

	it('age alone does not manufacture peer trust', () => {
		// An old, verified wallet with NO counterparties cannot reach "trusted".
		const r = computeReputation({
			...NEW_AGENT,
			ageDays: 900,
			activeDays90: 30,
			hasOnchainIdentity: true,
			registryAverage: 5,
			registryCount: 3,
		});
		expect(['emerging', 'established']).toContain(r.tier);
		expect(r.tier).not.toBe('trusted');
		expect(r.tier).not.toBe('elite');
	});
});

describe('anti-gaming', () => {
	it('self-tips are ignored and surfaced as discounted', () => {
		const withSelf = computeReputation({ ...NEW_AGENT, ageDays: 100, selfTipCount: 50, tipCount: 50, distinctTippers: 0 });
		const without = computeReputation({ ...NEW_AGENT, ageDays: 100 });
		// Self-tips contribute nothing to the score.
		expect(withSelf.score).toBeCloseTo(without.score, 1);
		expect(withSelf.discounted.some((d) => d.kind === 'self_tips')).toBe(true);
	});

	it('single-counterparty volume is discounted vs many distinct tippers', () => {
		const concentrated = computeReputation({
			...NEW_AGENT,
			ageDays: 100,
			tipCount: 40,
			distinctTippers: 1,
			externalTipUsd: 5000,
			settledUsd: 5000,
		});
		const diverse = computeReputation({
			...NEW_AGENT,
			ageDays: 100,
			tipCount: 40,
			distinctTippers: 20,
			externalTipUsd: 5000,
			settledUsd: 5000,
		});
		expect(diverse.score).toBeGreaterThan(concentrated.score);
		expect(concentrated.discounted.some((d) => d.kind === 'concentration')).toBe(true);
	});
});

describe('costly signals dominate', () => {
	it('an established, diverse, verified agent scores well and earns a real tier', () => {
		const r = computeReputation(ESTABLISHED);
		expect(r.score).toBeGreaterThan(55);
		expect(['trusted', 'elite']).toContain(r.tier);
		expect(r.isNew).toBe(false);
	});

	it('reliability is zero until there is real settlement volume', () => {
		const r = computeReputation({ ...NEW_AGENT, ageDays: 100, confirmedPayments: 2, failedPayments: 0 });
		const rel = r.pillars.find((p) => p.key === 'reliability');
		expect(rel.points).toBe(0);
	});
});

describe('tierFor gating', () => {
	it('requires counterparty diversity for trusted/elite', () => {
		expect(tierFor({ score: 80, isNew: false, distinctTippers: 0, confirmedPayments: 0 })).toBe('established');
		expect(tierFor({ score: 80, isNew: false, distinctTippers: 5, confirmedPayments: 0 })).toBe('elite');
		expect(tierFor({ score: 60, isNew: false, distinctTippers: 0, confirmedPayments: 12 })).toBe('trusted');
	});
});

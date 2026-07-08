// Tests for the fact-check accuracy benchmark (prompt 20 core: the checkable
// quality bar) — the curated fixture's schema/coverage and the runner's pure
// scoring math, which ship independent of the live LLM chain.
//
// Kept separate from tests/api/fact-check-v2.test.js (the free-lane/quota suite
// owned by the concurrent storefront work) so the two layer cleanly.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { scoreResults, validateFixture } from '../../scripts/fact-check-benchmark.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const fixture = JSON.parse(readFileSync(join(HERE, '../fixtures/fact-check-benchmark.json'), 'utf8'));

const CLASSES = ['supported', 'contradicted', 'mixed', 'insufficient'];

describe('fact-check benchmark fixture', () => {
	it('has ≥40 claims with ≥10 per verdict class and passes validation', () => {
		const claims = validateFixture(fixture); // throws if malformed
		expect(claims.length).toBeGreaterThanOrEqual(40);
		for (const cls of CLASSES) {
			expect(claims.filter((c) => c.expected_verdict === cls).length).toBeGreaterThanOrEqual(10);
		}
	});

	it('every claim is fully specified (claim, expected_verdict, rationale, difficulty)', () => {
		for (const c of fixture.claims) {
			expect(typeof c.claim).toBe('string');
			expect(c.claim.length).toBeGreaterThan(0);
			expect(CLASSES).toContain(c.expected_verdict);
			expect(typeof c.rationale).toBe('string');
			expect(['easy', 'medium', 'hard']).toContain(c.difficulty);
		}
	});

	it('rejects a fixture that starves a verdict class (≥40 total but <10 mixed)', () => {
		// Keep the full 40 so the count check passes, then reclassify every mixed
		// claim as supported — the per-class floor for "mixed" must still fail.
		const broken = { claims: fixture.claims.map((c) => (c.expected_verdict === 'mixed' ? { ...c, expected_verdict: 'supported' } : c)) };
		expect(() => validateFixture(broken)).toThrow(/mixed/);
	});

	it('rejects a fixture with an invalid verdict', () => {
		const broken = { claims: [...fixture.claims, { claim: 'x', expected_verdict: 'nonsense', rationale: 'y', difficulty: 'easy' }] };
		expect(() => validateFixture(broken)).toThrow(/invalid/);
	});
});

describe('scoreResults', () => {
	const results = [
		{ claim: 'a', expected_verdict: 'supported', difficulty: 'easy', actual_verdict: 'supported' },
		{ claim: 'b', expected_verdict: 'contradicted', difficulty: 'medium', actual_verdict: 'contradicted' },
		{ claim: 'c', expected_verdict: 'mixed', difficulty: 'hard', actual_verdict: 'supported' }, // miss
		{ claim: 'd', expected_verdict: 'insufficient', difficulty: 'easy', actual_verdict: null }, // error
	];

	it('computes overall accuracy, correct count, and error count', () => {
		const s = scoreResults(results);
		expect(s.total).toBe(4);
		expect(s.correct).toBe(2);
		expect(s.errors).toBe(1);
		expect(s.accuracy_pct).toBe(50);
	});

	it('breaks accuracy down per verdict class', () => {
		const s = scoreResults(results);
		expect(s.by_class.supported).toEqual({ total: 1, correct: 1, accuracy_pct: 100 });
		expect(s.by_class.mixed).toEqual({ total: 1, correct: 0, accuracy_pct: 0 });
		expect(s.by_class.insufficient).toEqual({ total: 1, correct: 0, accuracy_pct: 0 });
	});

	it('breaks accuracy down per difficulty', () => {
		const s = scoreResults(results);
		expect(s.by_difficulty.easy.total).toBe(2);
		expect(s.by_difficulty.easy.correct).toBe(1);
		expect(s.by_difficulty.hard).toEqual({ total: 1, correct: 0, accuracy_pct: 0 });
	});

	it('builds an expected→actual confusion matrix over checked claims only', () => {
		const s = scoreResults(results);
		expect(s.confusion.supported.supported).toBe(1);
		expect(s.confusion.mixed.supported).toBe(1);
		expect(s.confusion.insufficient).toEqual({}); // null actual excluded
	});

	it('scores a perfect run at 100% and an all-error run at 0%', () => {
		const perfect = fixture.claims.map((c) => ({ ...c, actual_verdict: c.expected_verdict }));
		expect(scoreResults(perfect).accuracy_pct).toBe(100);
		const zero = fixture.claims.map((c) => ({ ...c, actual_verdict: null }));
		expect(scoreResults(zero).accuracy_pct).toBe(0);
		expect(scoreResults(zero).errors).toBe(fixture.claims.length);
	});
});

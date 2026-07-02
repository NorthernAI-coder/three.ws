// Guard-logic tests for the economy funding root (api/_lib/economy-master.js).
// planTopUps is pure, so we can assert the reserve floor, per-engine cap, per-run
// cap, dust skip, and neediest-first ordering without any RPC or key.
import { test } from 'vitest';
import assert from 'node:assert/strict';
import {
	planTopUps,
	RESERVE_SOL,
	PER_TOPUP_MAX_SOL,
	RUN_CAP_SOL,
} from '../api/_lib/economy-master.js';

// Defaults (no env overrides): reserve 1, per-engine 0.5, run cap 2.
test('defaults are the documented guard values', () => {
	assert.equal(RESERVE_SOL, 1);
	assert.equal(PER_TOPUP_MAX_SOL, 0.5);
	assert.equal(RUN_CAP_SOL, 2);
});

test('reserve floor: a master below reserve funds nothing', () => {
	const { plan, totalSol, spendableSol } = planTopUps(0.5, [
		{ name: 'a', pubkey: 'A', currentSol: 0, refillToSol: 0.3 },
	]);
	assert.equal(spendableSol, 0);
	assert.equal(plan.length, 0);
	assert.equal(totalSol, 0);
});

test('per-engine cap: one engine gets at most PER_TOPUP_MAX_SOL', () => {
	const { plan } = planTopUps(10, [
		{ name: 'greedy', pubkey: 'G', currentSol: 0, refillToSol: 3 },
	]);
	assert.equal(plan.length, 1);
	assert.equal(plan[0].sol, 0.5); // capped from a 3 SOL deficit
});

test('per-run cap: a sweep spends at most RUN_CAP_SOL total', () => {
	const targets = Array.from({ length: 6 }, (_, i) => ({
		name: `e${i}`,
		pubkey: `P${i}`,
		currentSol: 0,
		refillToSol: 0.5,
	}));
	const { plan, totalSol, skipped } = planTopUps(10, targets); // spendable 9, runCap 2
	assert.equal(totalSol, 2);
	assert.equal(plan.length, 4); // 4 × 0.5 = 2.0
	assert.ok(skipped.some((s) => s.reason === 'run_cap_reached'));
});

test('dust: a sub-threshold deficit is skipped, not churned', () => {
	const { plan, skipped } = planTopUps(10, [
		{ name: 'hair', pubkey: 'H', currentSol: 0.499, refillToSol: 0.5 },
	]);
	assert.equal(plan.length, 0);
	assert.deepEqual(skipped, [{ name: 'hair', reason: 'below_dust_threshold' }]);
});

test('neediest first: the most-drained engine wins a tight run cap', () => {
	// spendable makes runCap = 0.5 → only one engine can be funded this sweep.
	const { plan } = planTopUps(1.5, [
		{ name: 'small', pubkey: 'S', currentSol: 0.4, refillToSol: 0.5 }, // deficit 0.1
		{ name: 'big', pubkey: 'B', currentSol: 0.0, refillToSol: 0.5 }, // deficit 0.5
	]);
	assert.equal(plan[0].name, 'big');
});

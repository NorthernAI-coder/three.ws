// Guard-logic tests for the consolidation sweep (api/_lib/economy-sweepback.js)
// and its ledger rows (buildSweepbackRows in api/_lib/economy-ledger.js). Both
// planSweepback and buildSweepbackRows are pure, so the floors, dust guard,
// drain headroom, and the rising running balance are asserted without RPC, keys,
// or a database.
import { test } from 'vitest';
import assert from 'node:assert/strict';
import {
	planSweepback,
	MIN_SWEEP_SOL,
	DRAIN_HEADROOM_LAMPORTS,
} from '../api/_lib/economy-sweepback.js';
import { ECONOMY_MASTER_ADDRESS } from '../api/_lib/economy-master.js';
import { buildSweepbackRows, hashEntry } from '../api/_lib/economy-ledger.js';
import { SOLANA_SIGNERS } from '../api/_lib/solana-signers.js';

test('defaults are the documented guard values', () => {
	assert.equal(MIN_SWEEP_SOL, 0.01);
	// Must stay above the ~890,880-lamport rent-exempt minimum: the runtime
	// rejects a transfer that leaves a system account above zero but below rent
	// exemption, so a smaller headroom would make every drain transaction fail.
	assert.equal(DRAIN_HEADROOM_LAMPORTS, 1_000_000);
	assert.ok(DRAIN_HEADROOM_LAMPORTS > 890_880);
});

test('excess mode: sweeps only what is above the float', () => {
	const { plan, totalSol } = planSweepback([
		{ name: 'a', pubkey: 'A', currentSol: 0.5, floorSol: 0.15 },
	]);
	assert.equal(plan.length, 1);
	assert.equal(plan[0].sol, 0.35);
	assert.equal(totalSol, 0.35);
});

test('excess mode: a signer at or below its float is never touched', () => {
	const { plan, skipped } = planSweepback([
		{ name: 'at-float', pubkey: 'A', currentSol: 0.15, floorSol: 0.15 },
		{ name: 'below-float', pubkey: 'B', currentSol: 0.05, floorSol: 0.15 },
	]);
	assert.equal(plan.length, 0);
	assert.deepEqual(
		skipped.map((s) => s.reason),
		['at_or_below_float', 'at_or_below_float'],
	);
});

test('excess mode: dust above the float is skipped (fee churn guard)', () => {
	const { plan, skipped } = planSweepback([
		{ name: 'dusty', pubkey: 'A', currentSol: 0.155, floorSol: 0.15 },
	]);
	assert.equal(plan.length, 0);
	assert.equal(skipped[0].reason, 'at_or_below_float');
});

test('drain mode: ignores the float, keeps only fee headroom', () => {
	const { plan } = planSweepback(
		[{ name: 'a', pubkey: 'A', currentSol: 0.15, floorSol: 0.15 }],
		{ mode: 'drain' },
	);
	assert.equal(plan.length, 1);
	assert.equal(plan[0].sol, 0.15 - DRAIN_HEADROOM_LAMPORTS / 1e9);
});

test('drain mode: an empty wallet is skipped, not overdrawn', () => {
	const { plan, skipped } = planSweepback(
		[{ name: 'empty', pubkey: 'A', currentSol: 0.000005, floorSol: 0.15 }],
		{ mode: 'drain' },
	);
	assert.equal(plan.length, 0);
	assert.equal(skipped[0].reason, 'below_dust_threshold');
});

test('minSweepSol override tightens the dust guard', () => {
	const { plan } = planSweepback(
		[{ name: 'a', pubkey: 'A', currentSol: 1.04, floorSol: 1 }],
		{ minSweepSol: 0.05 },
	);
	assert.equal(plan.length, 0);
});

test('registry: token-holding wallets are flagged so excess mode spares their tokens', () => {
	const flagged = SOLANA_SIGNERS.filter((s) => s.holdsTokens).map((s) => s.name);
	for (const name of ['three-buyback', 'club-treasury', 'platform-treasury', 'coin-treasury']) {
		assert.ok(flagged.includes(name), `${name} must keep its operational token float`);
	}
});

test('registry: the circulation treasury is funded and swept like any engine', () => {
	const spec = SOLANA_SIGNERS.find((s) => s.name === 'circulation-treasury');
	assert.ok(spec, 'circulation-treasury must be in the registry');
	assert.equal(spec.env, 'CIRCULATION_TREASURY_SECRET');
	assert.ok(spec.refillTo > spec.minSol);
});

test('ledger rows: inflows raise the running balance and the summary closes the batch', () => {
	const rows = buildSweepbackRows({
		masterPubkey: ECONOMY_MASTER_ADDRESS,
		result: {
			mode: 'excess',
			masterSolBefore: 10,
			masterSolAfter: 10.35,
			sweptSol: [
				{ name: 'a', pubkey: 'A', sol: 0.2, signature: 'sigA' },
				{ name: 'b', pubkey: 'B', sol: 0.15, signature: 'sigB' },
			],
			sweptTokens: [{ name: 'a', pubkey: 'A', mint: 'M', amount: '5', decimals: 6, signature: 'sigT' }],
			failed: [{ name: 'c', pubkey: 'C', sol: 0.1, reason: 'send_failed' }],
			skipped: [],
			receivedSol: 0.35,
		},
		solUsd: 100,
		now: 1_700_000_000_000,
	});
	assert.equal(rows.length, 5);
	assert.equal(rows[0].event, 'inflow');
	assert.equal(rows[0].master_sol_after, 10.2);
	assert.equal(rows[1].master_sol_after, 10.35);
	assert.equal(rows[1].usd_value, 15);
	assert.equal(rows[2].event, 'inflow_token');
	assert.deepEqual(rows[2].detail, { mint: 'M', amount: '5', decimals: 6 });
	assert.equal(rows[3].event, 'inflow_failed');
	assert.equal(rows[3].reason, 'send_failed');
	const summary = rows[4];
	assert.equal(summary.event, 'sweepback');
	assert.equal(summary.sol, 0.35);
	assert.equal(summary.master_sol_after, 10.35);
	assert.equal(summary.detail.sol_transfers, 2);
	assert.equal(summary.detail.token_transfers, 1);
});

test('ledger rows: a no-op sweep still writes the sweepback heartbeat', () => {
	const rows = buildSweepbackRows({
		masterPubkey: ECONOMY_MASTER_ADDRESS,
		result: { mode: 'excess', sweptSol: [], sweptTokens: [], failed: [], skipped: [], receivedSol: 0 },
		now: 1_700_000_000_000,
	});
	assert.equal(rows.length, 1);
	assert.equal(rows[0].event, 'sweepback');
	assert.equal(rows[0].sol, 0);
});

test('ledger rows: hash-chainable with the same hashEntry the topup uses', () => {
	const rows = buildSweepbackRows({
		masterPubkey: ECONOMY_MASTER_ADDRESS,
		result: {
			mode: 'excess',
			masterSolBefore: 1,
			sweptSol: [{ name: 'a', pubkey: 'A', sol: 0.2, signature: 'sig' }],
			sweptTokens: [],
			failed: [],
			skipped: [],
			receivedSol: 0.2,
		},
		now: 1_700_000_000_000,
	});
	let prev = '';
	for (const [i, r] of rows.entries()) {
		const row = { ...r, seq: i + 1 };
		const hash = hashEntry(prev, row);
		assert.equal(typeof hash, 'string');
		assert.equal(hash.length, 64);
		prev = hash;
	}
});

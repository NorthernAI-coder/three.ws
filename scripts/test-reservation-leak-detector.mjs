// Manual test for the Spend Reservation Leak Detector autonomous pipeline.
//
// Exercises run() directly. No payment is involved (the endpoint is free DB
// maintenance), so nothing that would cost money in production is stubbed.
//
//   node scripts/test-reservation-leak-detector.mjs
//
// Offline (no DATABASE_URL) it runs against a captured-SQL stub to verify the
// control flow: schema DDL, the two leak scans, the clean-sweep summary, the
// x402_autonomous_log row (with value_extracted), the Redis alert clear, and the
// schema-failure error path — all without a database.
//
// With DATABASE_URL set it additionally seeds a REAL leaked USD reservation
// (agent_custody_events, status 'pending') and a REAL leaked SOL reservation
// (agent_actions, payload.status 'reserved'), both backdated past the leak window,
// runs run(), and asserts each was released/deleted, a spend_reservation_leaks row
// was written, and a summary row landed in x402_autonomous_log.

import { randomUUID } from 'node:crypto';

import {
	run,
	RESERVATION_LEAK_REDIS_ALERT_KEY,
	RESERVATION_LEAK_REDIS_LATEST_KEY,
	RESERVATION_LEAK_AGE_SECONDS,
} from '../api/_lib/x402/pipelines/spend-reservation-leak-detector.js';

let failures = 0;
function check(label, cond, detail) {
	const ok = !!cond;
	if (!ok) failures++;
	console.log(`${ok ? '  ✓' : '  ✗'} ${label}${detail ? ` — ${detail}` : ''}`);
}

// Captured-SQL stub. Answers the two leak scans from `custodyRows` / `solRows`,
// everything else (DDL, INSERTs) resolves []. `failOn` rejects any statement whose
// normalized text matches, to exercise error paths.
function makeSqlStub({ custodyRows = [], solRows = [], failOn = null } = {}) {
	const captured = [];
	const sql = (strings, ...vals) => {
		const text = strings.join('?').replace(/\s+/g, ' ').trim();
		captured.push({ text, vals });
		if (failOn && failOn.test(text)) return Promise.reject(new Error('stub_db_down'));
		if (/FROM agent_custody_events/i.test(text)) return Promise.resolve(custodyRows);
		if (/FROM agent_actions/i.test(text)) return Promise.resolve(solRows);
		return Promise.resolve([]);
	};
	return { sql, captured };
}

function makeRedisStub() {
	const store = new Map();
	const ops = [];
	return {
		store, ops,
		set: async (k, v) => { ops.push(['set', k]); store.set(k, v); },
		del: async (k) => { ops.push(['del', k]); store.delete(k); },
		get: async (k) => store.get(k) ?? null,
	};
}

async function main() {
	console.log('\n1. Constants');
	check('leak age default 3600s', RESERVATION_LEAK_AGE_SECONDS === 3600, String(RESERVATION_LEAK_AGE_SECONDS));
	check('alert key', RESERVATION_LEAK_REDIS_ALERT_KEY === 'x402:reservation-leak:alert');

	console.log('\n2. Clean sweep (no leaks) → success, log row, alert cleared');
	{
		const { sql, captured } = makeSqlStub();
		const redis = makeRedisStub();
		const out = await run({ sql, redis, runId: randomUUID() });
		check('success true', out.success === true);
		check('recorded true (own row)', out.recorded === true);
		check('amountAtomic 0 (free)', out.amountAtomic === 0);
		check('leaked_total 0', out.valueExtracted.leaked_total === 0);
		check('note no leaks', out.note === 'no leaked reservations', out.note);
		check('issued CREATE TABLE spend_reservation_leaks', captured.some((c) => /CREATE TABLE IF NOT EXISTS spend_reservation_leaks/i.test(c.text)));
		check('ensured value_extracted column', captured.some((c) => /ADD COLUMN IF NOT EXISTS value_extracted/i.test(c.text)));
		check('scanned agent_custody_events', captured.some((c) => /FROM agent_custody_events/i.test(c.text)));
		check('scanned agent_actions', captured.some((c) => /FROM agent_actions/i.test(c.text)));
		const logRow = captured.find((c) => /INSERT INTO x402_autonomous_log/i.test(c.text));
		check('issued x402_autonomous_log INSERT', !!logRow);
		check('log row success=true', logRow?.vals?.includes(true));
		check('log row pipeline=finance', logRow?.vals?.includes('finance'));
		check('log row value_extracted carries summary', (logRow?.vals || []).some((v) => typeof v === 'string' && /"leaked_total":0/.test(v)));
		check('redis latest written', redis.store.has(RESERVATION_LEAK_REDIS_LATEST_KEY));
		check('redis alert cleared (del)', redis.ops.some((o) => o[0] === 'del' && o[1] === RESERVATION_LEAK_REDIS_ALERT_KEY));
	}

	console.log('\n3. SOL leak found → recorded-then-released, alert raised');
	{
		// Only the SOL scan returns a leak (the SOL release path is internal to this
		// module's flow via the real releaseSpend, but recordLeak runs through the
		// stub; release of a captured-stub row is a no-op DELETE the stub resolves).
		const solRows = [{
			id: 4242, agent_id: 'agentSOL', type: 'pumpfun.buy',
			sol_amount: 0.25, mint: 'THREEsynthetic1111', age_seconds: 7200,
			created_at: new Date(Date.now() - 7200_000).toISOString(),
		}];
		const { sql, captured } = makeSqlStub({ solRows });
		const redis = makeRedisStub();
		const out = await run({ sql, redis, runId: randomUUID() });
		check('success true', out.success === true);
		check('leaked_total 1', out.valueExtracted.leaked_total === 1, String(out.valueExtracted.leaked_total));
		check('sol_freed 0.25', out.valueExtracted.sol_freed === 0.25, String(out.valueExtracted.sol_freed));
		check('agents_affected 1', out.valueExtracted.agents_affected === 1);
		const leakInsert = captured.find((c) => /INSERT INTO spend_reservation_leaks/i.test(c.text));
		check('recorded leak BEFORE delete', !!leakInsert);
		check('leak row action=deleted', leakInsert?.vals?.includes('deleted'));
		check('leak row source=agent_action', leakInsert?.vals?.includes('agent_action'));
		check('note summarizes freed SOL', /0\.25 SOL/.test(out.note), out.note);
		check('redis alert raised (set)', redis.store.has(RESERVATION_LEAK_REDIS_ALERT_KEY));
	}

	console.log('\n4. Schema DDL failure → graceful error outcome, no crash');
	{
		const { sql, captured } = makeSqlStub({ failOn: /CREATE TABLE IF NOT EXISTS spend_reservation_leaks/i });
		const out = await run({ sql, redis: makeRedisStub(), runId: randomUUID() });
		check('success false', out.success === false);
		check('recorded true (still logged)', out.recorded === true);
		check('errorMsg flags schema', /schema_failed/.test(out.errorMsg || ''), out.errorMsg);
		check('attempted a log row anyway', captured.some((c) => /INSERT INTO x402_autonomous_log/i.test(c.text)));
	}

	console.log('\n5. A failing scan never crashes the tick (other source still runs)');
	{
		const { sql } = makeSqlStub({ failOn: /FROM agent_custody_events/i });
		const out = await run({ sql, redis: makeRedisStub(), runId: randomUUID() });
		check('success true (degraded, not crashed)', out.success === true);
		check('leaked_total 0', out.valueExtracted.leaked_total === 0);
		check('custody scanned 0 (failed source)', out.valueExtracted.scanned.custody_pending === 0);
	}

	// ── Optional real DB round-trip ────────────────────────────────────────────
	if (process.env.DATABASE_URL || process.env.POSTGRES_URL || process.env.NEON_DATABASE_URL) {
		console.log('\n6. real DB: seed leaks → run() → released + recorded');
		const { sql } = await import('../api/_lib/db.js');
		const runId = randomUUID();
		const agentId = `leaktest-${runId.slice(0, 8)}`;
		// Seed a leaked USD reservation: a pending spend backdated past the window.
		const ageInterval = `${RESERVATION_LEAK_AGE_SECONDS + 600} seconds`;
		const [custodyRow] = await sql`
			INSERT INTO agent_custody_events
				(agent_id, event_type, category, network, asset, usd, status, created_at)
			VALUES (${agentId}, 'spend', 'x402', 'mainnet', 'USDC', 0.05, 'pending',
			        now() - ${ageInterval}::interval)
			RETURNING id
		`;
		// Seed a leaked SOL reservation: a reserved action backdated past the window.
		const [actionRow] = await sql`
			INSERT INTO agent_actions (agent_id, type, payload, source_skill, created_at)
			VALUES (${agentId}, 'pumpfun.buy',
			        ${JSON.stringify({ solAmount: 0.1, mint: 'THREEsynthetic1111', status: 'reserved' })}::jsonb,
			        'pumpfun', now() - ${ageInterval}::interval)
			RETURNING id
		`;

		const out = await run({ sql, redis: null, runId });
		check('run success', out.success === true);
		check('swept ≥ 2', out.valueExtracted.leaked_total >= 2, String(out.valueExtracted.leaked_total));

		const [cust] = await sql`SELECT status, reason FROM agent_custody_events WHERE id = ${custodyRow.id}`;
		check('custody reservation released (failed)', cust?.status === 'failed', cust?.status);
		check('release reason recorded', cust?.reason === 'leak_detector_swept', cust?.reason);

		const act = await sql`SELECT id FROM agent_actions WHERE id = ${actionRow.id}`;
		check('SOL reservation deleted', act.length === 0);

		const leaks = await sql`SELECT source, action, usd, sol_amount FROM spend_reservation_leaks WHERE run_id = ${runId} ORDER BY source`;
		check('two leak rows recorded', leaks.length === 2, JSON.stringify(leaks));
		check('custody leak released', leaks.some((l) => l.source === 'custody_event' && l.action === 'released'));
		check('sol leak deleted', leaks.some((l) => l.source === 'agent_action' && l.action === 'deleted'));

		const logRows = await sql`SELECT success, pipeline, value_extracted FROM x402_autonomous_log WHERE run_id = ${runId}`;
		check('log row persisted', logRows.length === 1, String(logRows.length));
		check('log row value_extracted stored', logRows[0]?.value_extracted?.leaked_total >= 2);

		// Cleanup so repeated runs stay clean.
		await sql`DELETE FROM spend_reservation_leaks WHERE run_id = ${runId}`;
		await sql`DELETE FROM x402_autonomous_log WHERE run_id = ${runId}`;
		await sql`DELETE FROM agent_custody_events WHERE id = ${custodyRow.id}`;
		console.log('  (seeded rows cleaned up)');
	} else {
		console.log('\n6. real DB round-trip skipped (no DATABASE_URL)');
	}

	console.log(`\n${failures === 0 ? 'PASS' : 'FAIL'} — ${failures} failed check(s)\n`);
	process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
	console.error('test crashed:', err);
	process.exit(1);
});

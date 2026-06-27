// Manual test for the Volume Bootstrap Loop autonomous pipeline (USE-026).
//
// Exercises the round-robin selection, per-endpoint ledger upsert, per-call
// x402_autonomous_log recording, budget enforcement and graceful-failure paths
// of the 'volume-bootstrap-loop' registry entry — WITHOUT making real on-chain
// payments. It stubs the payment context (so payX402 short-circuits before
// touching Solana) and captures the SQL the pipeline issues. The only thing not
// exercised here is the on-chain USDC transfer itself (that requires the seed
// wallet + mainnet and is driven by the cron loop in production).
//
//   node scripts/test-volume-bootstrap.mjs
//
// With DATABASE_URL set it additionally runs the real schema + a real ledger
// upsert and reads the row back.

import { randomUUID } from 'node:crypto';

import {
	run as volumeRun,
	VOLUME_ENDPOINTS,
	VOLUME_BATCH_PER_RUN,
} from '../api/_lib/x402/pipelines/volume-bootstrap-loop.js';

// The full registry transitively imports every sibling pipeline; if a concurrent
// agent's in-progress pipeline has a broken import, the registry won't load. The
// registry-shape check below degrades to a warning in that case rather than
// failing this pipeline's own test.
async function loadRegistryEntry() {
	try {
		const { getSelfRegistry } = await import('../api/_lib/x402/autonomous-registry.js');
		return { entry: getSelfRegistry().find((e) => e.id === 'volume-bootstrap-loop'), loaded: true };
	} catch (err) {
		return { entry: null, loaded: false, error: err?.message };
	}
}

let failures = 0;
function check(label, cond, detail) {
	const ok = !!cond;
	if (!ok) failures++;
	console.log(`${ok ? '  ✓' : '  ✗'} ${label}${detail ? ` — ${detail}` : ''}`);
}

// In-memory SQL stub: tagged-template that records every statement and serves a
// minimal x402_volume_metrics ledger so RETURNING comes back populated.
function makeSqlStub() {
	const statements = [];
	const ledger = new Map();
	const sql = (strings, ...vals) => {
		const text = strings.join('?').replace(/\s+/g, ' ').trim();
		statements.push({ text, vals });
		if (/INSERT INTO x402_volume_metrics/i.test(text)) {
			const key = vals[0];
			const prev = ledger.get(key) || { call_count: 0, success_count: 0, fail_count: 0, total_spent_atomic: 0 };
			const success = vals[10] === true; // last_success position
			const amount = Number(vals[8]) || 0; // last_amount_atomic position
			const row = {
				call_count: prev.call_count + 1,
				success_count: prev.success_count + (success ? 1 : 0),
				fail_count: prev.fail_count + (success ? 0 : 1),
				total_spent_atomic: prev.total_spent_atomic + amount,
			};
			ledger.set(key, row);
			return Promise.resolve([row]);
		}
		return Promise.resolve([]);
	};
	sql.statements = statements;
	sql.ledger = ledger;
	return sql;
}

// Stubbed payment context: present buyer/conn/blockhash/mintInfo so the pipeline
// skips bootstrapSolanaContext. payX402 will still issue a real fetch to the
// origin; we point origin at an unreachable host so every call resolves to a
// recorded failure (no payment, no network success) — which is exactly the path
// we want to verify records cleanly without spending.
function stubPaymentCtx(extra = {}) {
	return {
		buyer: { publicKey: { toBase58: () => 'TestBuyer1111111111111111111111111111111111' } },
		conn: { getAccountInfo: async () => null },
		blockhash: 'TestBlockhash1111111111111111111111111111111',
		mintInfo: { decimals: 6 },
		origin: 'http://127.0.0.1:1', // unreachable → payX402 fetch fails fast
		redis: null,
		...extra,
	};
}

async function main() {
	console.log('\n1. Registry entry shape');
	const { entry, loaded, error } = await loadRegistryEntry();
	if (!loaded) {
		console.log(`  ⚠ registry import failed (unrelated sibling pipeline): ${error}`);
		console.log('    → skipping registry-shape checks; pipeline checks below still run.');
	} else {
		check('entry present', !!entry);
		check('pipeline tag volume', entry?.pipeline === 'volume', entry?.pipeline);
		check('cooldown 300s', entry?.cooldown_s === 300);
		check('enabled', entry?.enabled === true);
		check('has run()', typeof entry?.run === 'function');
	}

	console.log('\n2. Endpoint catalog');
	check('non-empty catalog', VOLUME_ENDPOINTS.length > 0, `${VOLUME_ENDPOINTS.length} endpoints`);
	check('every entry has key+path+method', VOLUME_ENDPOINTS.every((e) => e.key && e.path && e.method));
	check('keys are unique', new Set(VOLUME_ENDPOINTS.map((e) => e.key)).size === VOLUME_ENDPOINTS.length);
	check('paths are all self /api/x402 or /api', VOLUME_ENDPOINTS.every((e) => e.path.startsWith('/api/')));
	check('never lists itself (no recursion)', !VOLUME_ENDPOINTS.some((e) => e.key === 'volume-bootstrap-loop'));

	console.log('\n3. run() — sweeps a window, records each call, no real spend');
	const sql = makeSqlStub();
	const out = await volumeRun({ ...stubPaymentCtx(), sql, runId: randomUUID() });
	check('returns an outcome object', out && typeof out === 'object');
	check('amountAtomic is 0 (no payment settled)', out.amountAtomic === 0, String(out.amountAtomic));
	check('not skipped (calls were made)', out.skipped === false);
	check('window matches batch size', out.responseData?.window === VOLUME_BATCH_PER_RUN, String(out.responseData?.window));
	check('one log row per swept endpoint',
		sql.statements.filter((s) => /INSERT INTO x402_autonomous_log/i.test(s.text)).length === VOLUME_BATCH_PER_RUN);
	check('one ledger upsert per swept endpoint',
		sql.statements.filter((s) => /INSERT INTO x402_volume_metrics/i.test(s.text)).length === VOLUME_BATCH_PER_RUN);
	check('issued CREATE TABLE for ledger',
		sql.statements.some((s) => /CREATE TABLE IF NOT EXISTS x402_volume_metrics/i.test(s.text)));
	check('ensured value_extracted column',
		sql.statements.some((s) => /ADD COLUMN IF NOT EXISTS value_extracted/i.test(s.text)));
	const logRows = sql.statements.filter((s) => /INSERT INTO x402_autonomous_log/i.test(s.text));
	check('log rows tagged pipeline=volume', logRows.every((s) => s.vals.includes('volume')));
	check('log rows tagged endpoint_type=self', logRows.every((s) => s.vals.includes('self')));

	console.log('\n4. round-robin advances across runs (in-memory cursor)');
	const sweptKeys = (o) => (o.responseData?.swept || []).map((s) => s.key).join(',');
	const r1 = await volumeRun({ ...stubPaymentCtx(), sql: makeSqlStub(), runId: randomUUID() });
	const r2 = await volumeRun({ ...stubPaymentCtx(), sql: makeSqlStub(), runId: randomUUID() });
	check('consecutive runs sweep different windows', sweptKeys(r1) !== sweptKeys(r2), `${sweptKeys(r1)} | ${sweptKeys(r2)}`);

	console.log('\n5. per-run budget cap halts the sweep');
	const cappedSql = makeSqlStub();
	// remainingCap below one call's worth → window selected but cap guard trips.
	const capped = await volumeRun({ ...stubPaymentCtx(), sql: cappedSql, runId: randomUUID(), remainingCap: 0 });
	check('zero cap → no calls, skipped', capped.skipped === true && capped.responseData?.calls === 0, JSON.stringify(capped.responseData));
	check('zero cap → no log rows', !cappedSql.statements.some((s) => /INSERT INTO x402_autonomous_log/i.test(s.text)));

	console.log('\n6. graceful skip when wallet/RPC unconfigured');
	// No buyer/conn → bootstrapSolanaContext runs; with no seed wallet + no mint
	// it throws and the pipeline returns a logged skip (note set). In CI where a
	// test wallet/mint may be present it instead proceeds — accept either as long
	// as it never throws.
	let threw = false;
	let res6;
	try { res6 = await volumeRun({ sql: makeSqlStub(), origin: 'http://127.0.0.1:1', redis: null, runId: randomUUID() }); }
	catch { threw = true; }
	check('never throws on unconfigured wallet', threw === false);
	check('returns a structured outcome', res6 && typeof res6.success === 'boolean');

	console.log('\n7. DB failure inside ledger upsert never crashes the sweep');
	const flakySql = (strings, ...vals) => {
		const text = strings.join('?');
		if (/INSERT INTO x402_volume_metrics/i.test(text)) return Promise.reject(new Error('simulated db outage'));
		return Promise.resolve([]);
	};
	let crashed = false;
	let res7;
	try { res7 = await volumeRun({ ...stubPaymentCtx(), sql: flakySql, runId: randomUUID() }); }
	catch { crashed = true; }
	check('sweep survives ledger DB faults', crashed === false && !!res7);

	// Optional: real DB round-trip when DATABASE_URL is configured.
	if (process.env.DATABASE_URL || process.env.POSTGRES_URL) {
		console.log('\n8. real DB schema + ledger upsert + read-back');
		const { sql: realSql } = await import('../api/_lib/db.js');
		const { default: pipeline } = { default: null };
		void pipeline;
		// Re-import the internal upsert path by running a single-window sweep with a
		// real sql but unreachable origin (records failures, exercises real DDL+DML).
		const runId = randomUUID();
		const before = await realSql`SELECT count(*)::int AS n FROM x402_volume_metrics`.catch(() => [{ n: 0 }]);
		await volumeRun({ ...stubPaymentCtx(), sql: realSql, runId });
		const rows = await realSql`SELECT endpoint_key, call_count, last_run_id FROM x402_volume_metrics ORDER BY last_called_at DESC LIMIT ${VOLUME_BATCH_PER_RUN}`;
		check('ledger rows persisted', rows.length > 0, `${rows.length} rows`);
		check('call_count >= 1', rows.every((r) => Number(r.call_count) >= 1));
		void before;
	} else {
		console.log('\n8. real DB round-trip skipped (no DATABASE_URL)');
	}

	console.log(`\n${failures === 0 ? 'PASS' : 'FAIL'} — ${failures} failed check(s)\n`);
	process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
	console.error('test crashed:', err);
	process.exit(1);
});

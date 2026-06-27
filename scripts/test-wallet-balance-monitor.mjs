// Manual test for the Agent Wallet Balance Monitor autonomous pipeline.
//
// Exercises run() end-to-end against a REAL local HTTP stub of the free
// GET /api/x402-pay?balance=1 endpoint (the actual call the pipeline makes —
// no payment is involved, so nothing is mocked that wouldn't be free in prod)
// and a captured-SQL stub standing in for Postgres. Verifies the time-series
// row, the low-balance alert flag, the derived spend rate, the Redis state
// writes, and every error path (non-200, network failure, unconfigured wallet).
//
//   node scripts/test-wallet-balance-monitor.mjs
//
// With DATABASE_URL set it additionally inserts a real row into
// agent_wallet_balance_log and reads it back.

import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';

import { run, WALLET_BALANCE } from '../api/_lib/x402/wallet-balance-monitor.js';

let failures = 0;
function check(label, cond, detail) {
	const ok = !!cond;
	if (!ok) failures++;
	console.log(`${ok ? '  ✓' : '  ✗'} ${label}${detail ? ` — ${detail}` : ''}`);
}

// Capture every SQL statement; answer previousSample's SELECT from `prevRow`.
function makeSqlStub({ prevRow = null } = {}) {
	const captured = [];
	const sql = (strings, ...vals) => {
		const text = strings.join('?').replace(/\s+/g, ' ').trim();
		captured.push({ text, vals });
		if (/^SELECT usdc/i.test(text)) return Promise.resolve(prevRow ? [prevRow] : []);
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
	};
}

// Spin up a one-route stub of /api/x402-pay?balance=1 returning `payload`
// (or a chosen status). Returns { origin, close }.
async function stubBalanceServer({ payload, status = 200 }) {
	const server = createServer((req, res) => {
		res.statusCode = status;
		res.setHeader('content-type', 'application/json');
		res.end(JSON.stringify(payload));
	});
	await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
	const { port } = server.address();
	return { origin: `http://127.0.0.1:${port}`, close: () => new Promise((r) => server.close(r)) };
}

async function main() {
	console.log('\n1. Constants');
	check('endpoint', WALLET_BALANCE.endpoint === '/api/x402-pay?balance=1');
	check('default threshold $5', WALLET_BALANCE.alertThresholdUsdc === 5, String(WALLET_BALANCE.alertThresholdUsdc));

	console.log('\n2. Healthy wallet → row stored, no alert');
	{
		const srv = await stubBalanceServer({ payload: { configured: true, address: 'Wallet111', sol: 0.5, usdc: 42.5 } });
		const { sql, captured } = makeSqlStub();
		const redis = makeRedisStub();
		const out = await run({ origin: srv.origin, sql, redis, runId: randomUUID() });
		await srv.close();
		check('success true', out.success === true);
		check('amountAtomic 0 (free read)', out.amountAtomic === 0);
		check('signal usdc', out.signalData.usdc === 42.5);
		check('signal not low', out.signalData.low_balance === false);
		const insert = captured.find((c) => /INSERT INTO agent_wallet_balance_log/i.test(c.text));
		check('issued CREATE TABLE', captured.some((c) => /CREATE TABLE IF NOT EXISTS agent_wallet_balance_log/i.test(c.text)));
		check('issued INSERT', !!insert);
		check('INSERT carries usdc', insert?.vals?.includes(42.5));
		check('INSERT carries low_balance=false', insert?.vals?.includes(false));
		check('redis latest written', redis.store.has(WALLET_BALANCE.redisLatestKey));
		check('redis alert cleared (del)', redis.ops.some((o) => o[0] === 'del' && o[1] === WALLET_BALANCE.redisAlertKey));
	}

	console.log('\n3. Low balance → alert raised + spend rate derived');
	{
		const srv = await stubBalanceServer({ payload: { configured: true, address: 'Wallet111', sol: 0.01, usdc: 2.0 } });
		// Previous sample: $7 one hour ago → spent $5 → rate ≈ $5/hr.
		const prevRow = { usdc: 7.0, ts_epoch: Math.floor(Date.now() / 1000) - 3600 };
		const { sql, captured } = makeSqlStub({ prevRow });
		const redis = makeRedisStub();
		const out = await run({ origin: srv.origin, sql, redis, runId: randomUUID() });
		await srv.close();
		check('success true', out.success === true);
		check('low_balance true', out.signalData.low_balance === true);
		check('usdc_delta ≈ -5', Math.abs(out.signalData.usdc_delta - -5) < 1e-6, String(out.signalData.usdc_delta));
		check('spend_rate ≈ 5/hr', Math.abs(out.signalData.spend_rate_usdc_hr - 5) < 0.1, String(out.signalData.spend_rate_usdc_hr));
		check('note flags LOW_BALANCE', /LOW_BALANCE/.test(out.note), out.note);
		const insert = captured.find((c) => /INSERT INTO agent_wallet_balance_log/i.test(c.text));
		check('INSERT low_balance=true', insert?.vals?.includes(true));
		check('redis alert key set', redis.store.has(WALLET_BALANCE.redisAlertKey));
	}

	console.log('\n4. Unconfigured wallet → recorded, not success');
	{
		const srv = await stubBalanceServer({ payload: { configured: false, code: 'wallet_unconfigured', address: null, sol: 0, usdc: 0 } });
		const { sql, captured } = makeSqlStub();
		const redis = makeRedisStub();
		const out = await run({ origin: srv.origin, sql, redis, runId: randomUUID() });
		await srv.close();
		check('success false', out.success === false);
		check('errorMsg wallet_unconfigured', out.errorMsg === 'wallet_unconfigured', out.errorMsg);
		check('still recorded a row', captured.some((c) => /INSERT INTO agent_wallet_balance_log/i.test(c.text)));
		check('signal configured=false', out.signalData.configured === false);
	}

	console.log('\n5. Endpoint non-200 → graceful failure');
	{
		const srv = await stubBalanceServer({ payload: { error: 'boom' }, status: 500 });
		const { sql } = makeSqlStub();
		const out = await run({ origin: srv.origin, sql, redis: makeRedisStub() });
		await srv.close();
		check('success false', out.success === false);
		check('errorMsg http status', /balance_http_500/.test(out.errorMsg || ''), out.errorMsg);
	}

	console.log('\n6. Network failure → graceful failure (no throw)');
	{
		const { sql } = makeSqlStub();
		// Unroutable port — connection refused.
		const out = await run({ origin: 'http://127.0.0.1:1', sql, redis: makeRedisStub() });
		check('success false', out.success === false);
		check('note fetch_failed', out.note === 'fetch_failed', out.note);
	}

	console.log('\n7. DB insert failure mid-run does not crash');
	{
		const srv = await stubBalanceServer({ payload: { configured: true, address: 'W', sol: 1, usdc: 10 } });
		const sql = (strings, ...vals) => {
			const text = strings.join('?');
			if (/INSERT INTO agent_wallet_balance_log/i.test(text)) return Promise.reject(new Error('db down'));
			if (/^\s*SELECT usdc/i.test(text)) return Promise.resolve([]);
			return Promise.resolve([]);
		};
		const out = await run({ origin: srv.origin, sql, redis: makeRedisStub() });
		await srv.close();
		check('still returns success (read worked)', out.success === true);
		check('signal usdc present', out.signalData.usdc === 10);
	}

	// Optional real DB round-trip.
	if (process.env.DATABASE_URL || process.env.POSTGRES_URL) {
		console.log('\n8. real DB insert + read-back');
		const srv = await stubBalanceServer({ payload: { configured: true, address: 'WalletReal', sol: 0.2, usdc: 3.3 } });
		const { sql } = await import('../api/_lib/db.js');
		const runId = randomUUID();
		const out = await run({ origin: srv.origin, sql, redis: null, runId });
		await srv.close();
		const rows = await sql`SELECT usdc, low_balance, run_id FROM agent_wallet_balance_log WHERE run_id = ${runId}`;
		check('row persisted', rows.length === 1, JSON.stringify(rows[0]));
		check('usdc stored', Number(rows[0]?.usdc) === 3.3);
		check('low_balance true (3.3 < 5)', rows[0]?.low_balance === true);
		check('outcome low', out.signalData.low_balance === true);
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

// Manual test for the External x402 Service Uptime Monitor autonomous pipeline.
//
// Exercises run() end-to-end against REAL local HTTP stubs that stand in for
// external x402 services (one returns 402 = live paywall, one 5xx = down, one
// HEAD-405-then-GET-402, and one unroutable port = timeout/unreachable), plus a
// captured-SQL stub standing in for Postgres. Nothing the pipeline does in
// production is mocked away — the probe is an UNPAID HEAD/OPTIONS/GET, so no
// payment is ever involved. Verifies classification, the x402_service_uptime
// upsert, a per-probe x402_autonomous_log row, the Redis dead/latest writes, the
// consumer helpers (isServiceLive / classifyProbe), and every error path.
//
//   node scripts/test-service-uptime-monitor.mjs
//
// With DATABASE_URL set it additionally probes a real stub, persists rows into
// x402_service_uptime + x402_autonomous_log, and reads them back.

import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';

import {
	run,
	probeService,
	classifyProbe,
	collectExternalTargets,
	isServiceLive,
	SERVICE_UPTIME,
} from '../api/_lib/x402/pipelines/service-uptime-monitor.js';

let failures = 0;
function check(label, cond, detail) {
	const ok = !!cond;
	if (!ok) failures++;
	console.log(`${ok ? '  ✓' : '  ✗'} ${label}${detail ? ` — ${detail}` : ''}`);
}

// SQL stub: captures statements; answers the bazaar-catalog SELECT from
// `catalogRows`, the uptime upsert's RETURNING from a per-resource streak map,
// and isServiceLive's SELECT from `uptimeRows`.
function makeSqlStub({ catalogRows = [], uptimeRows = {} } = {}) {
	const captured = [];
	const streaks = new Map();
	const sql = (strings, ...vals) => {
		const text = strings.join('?').replace(/\s+/g, ' ').trim();
		captured.push({ text, vals });
		if (/FROM x402_bazaar_catalog/i.test(text)) return Promise.resolve(catalogRows);
		if (/INSERT INTO x402_service_uptime/i.test(text)) {
			// vals[0] = resource, vals[3] = alive (per the INSERT column order)
			const resource = vals[0];
			const alive = vals[3];
			const prev = streaks.get(resource) || 0;
			const next = alive ? 0 : prev + 1;
			streaks.set(resource, next);
			return Promise.resolve([{ consecutive_failures: next }]);
		}
		if (/SELECT alive, consecutive_failures FROM x402_service_uptime/i.test(text)) {
			const resource = vals[0];
			const row = uptimeRows[resource];
			return Promise.resolve(row ? [row] : []);
		}
		return Promise.resolve([]);
	};
	return { sql, captured, streaks };
}

function makeRedisStub() {
	const store = new Map();
	const ops = [];
	let counter = 0;
	return {
		store, ops,
		set: async (k, v) => { ops.push(['set', k]); store.set(k, v); },
		del: async (k) => { ops.push(['del', k]); store.delete(k); },
		incrby: async (k, n) => { counter += n; return counter; },
	};
}

// One-route stub. `handler(method)` returns { status } for a given HTTP method,
// letting a single server return 405 for HEAD but 402 for GET, etc.
async function stubService(handler) {
	const server = createServer((req, res) => {
		const { status, body } = handler(req.method) || { status: 200 };
		res.statusCode = status;
		res.setHeader('content-type', 'application/json');
		res.end(body ? JSON.stringify(body) : (req.method === 'HEAD' ? null : '{}'));
	});
	await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
	const { port } = server.address();
	return { url: `http://127.0.0.1:${port}/svc`, close: () => new Promise((r) => server.close(r)) };
}

async function main() {
	console.log('\n1. Constants + classification');
	check('endpoint label', SERVICE_UPTIME.endpoint.includes('HEAD/OPTIONS'));
	check('price 0 (free probe)', SERVICE_UPTIME.priceAtomic === 0);
	check('402 → live_paywall', classifyProbe(402).classification === 'live_paywall' && classifyProbe(402).alive === true);
	check('200 → live_free', classifyProbe(200).classification === 'live_free' && classifyProbe(200).alive === true);
	check('503 → server_error (down)', classifyProbe(503).classification === 'server_error' && classifyProbe(503).alive === false);
	check('404 → reachable_unexpected (up)', classifyProbe(404).classification === 'reachable_unexpected' && classifyProbe(404).alive === true);
	check('null → unreachable (down)', classifyProbe(null, 'timeout').classification === 'unreachable' && classifyProbe(null).alive === false);

	console.log('\n2. probeService — HEAD 402 (live x402 endpoint)');
	{
		const svc = await stubService(() => ({ status: 402, body: { accepts: [] } }));
		const v = await probeService(svc.url);
		await svc.close();
		check('method HEAD', v.method === 'HEAD', v.method);
		check('alive live_paywall', v.alive && v.classification === 'live_paywall');
		check('latency recorded', Number.isFinite(v.latency_ms));
	}

	console.log('\n3. probeService — HEAD 405 falls back to GET 402');
	{
		const svc = await stubService((m) => (m === 'HEAD' ? { status: 405 } : { status: 402, body: { accepts: [] } }));
		const v = await probeService(svc.url);
		await svc.close();
		check('fell back past HEAD', v.method !== 'HEAD', v.method);
		check('verdict live_paywall', v.alive && v.classification === 'live_paywall');
	}

	console.log('\n4. probeService — 5xx is down');
	{
		const svc = await stubService(() => ({ status: 503 }));
		const v = await probeService(svc.url);
		await svc.close();
		check('not alive', v.alive === false);
		check('server_error', v.classification === 'server_error', v.classification);
	}

	console.log('\n5. probeService — unroutable host is unreachable');
	{
		const v = await probeService('http://127.0.0.1:1/svc');
		check('not alive', v.alive === false);
		check('unreachable', v.classification === 'unreachable', v.classification);
	}

	console.log('\n6. collectExternalTargets — catalog ∪ excludes own host');
	{
		const { sql } = makeSqlStub({
			catalogRows: [
				{ category: 'trading', resources: [
					{ resource: 'https://ext-a.example/x402', tool_name: 'a', networks: ['solana'] },
					{ resource: 'https://three.ws/api/x402/dance-tip', tool_name: 'self', networks: ['solana'] }, // excluded
				] },
				{ category: 'llm', resources: [
					{ resource: 'https://ext-b.example/pay', tool_name: 'b', networks: ['base'] },
					{ resource: 'not-a-url', tool_name: 'bad' }, // excluded
				] },
			],
		});
		const targets = await collectExternalTargets({ sql, origin: 'https://three.ws' });
		const urls = targets.map((t) => t.resource).sort();
		check('two external targets', targets.length === 2, JSON.stringify(urls));
		check('own host excluded', !urls.some((u) => u.includes('three.ws')));
		check('non-url excluded', !urls.includes('not-a-url'));
	}

	console.log('\n7. run() — mixed live + down sweep records + stores');
	{
		const live = await stubService(() => ({ status: 402, body: { accepts: [] } }));
		const dead = await stubService(() => ({ status: 500 }));
		const { sql, captured } = makeSqlStub({
			catalogRows: [
				{ category: 'trading', resources: [
					{ resource: live.url, tool_name: 'live', networks: ['solana'] },
					{ resource: dead.url, tool_name: 'dead', networks: ['solana'] },
				] },
			],
		});
		const redis = makeRedisStub();
		const out = await run({ origin: 'https://three.ws', sql, redis, runId: randomUUID() });
		await live.close(); await dead.close();

		check('amountAtomic 0 (never pays)', out.amountAtomic === 0);
		check('probed 2', out.responseData.probed === 2, String(out.responseData.probed));
		check('alive 1', out.responseData.alive === 1, String(out.responseData.alive));
		check('down 1', out.responseData.down === 1, String(out.responseData.down));
		check('success true (not all down)', out.success === true);
		check('errorMsg flags down', /services_down:1/.test(out.errorMsg || ''), out.errorMsg);
		check('CREATE TABLE x402_service_uptime', captured.some((c) => /CREATE TABLE IF NOT EXISTS x402_service_uptime/i.test(c.text)));
		check('upsert issued (2x)', captured.filter((c) => /INSERT INTO x402_service_uptime/i.test(c.text)).length === 2);
		check('per-probe log rows (2x)', captured.filter((c) => /INSERT INTO x402_autonomous_log/i.test(c.text)).length === 2);
		check('log pipeline=reliability', captured.some((c) => /INSERT INTO x402_autonomous_log/i.test(c.text) && c.vals.includes('reliability')));
		check('redis dead list written', redis.store.has(SERVICE_UPTIME.redisDeadKey));
		check('redis latest written', redis.store.has(SERVICE_UPTIME.redisLatestKey));
	}

	console.log('\n8. run() — no external services → graceful skip, no spend');
	{
		const { sql } = makeSqlStub({ catalogRows: [] });
		const out = await run({ origin: 'https://three.ws', sql, redis: makeRedisStub() });
		check('skipped', out.skipped === true);
		check('note no_external_services', out.note === 'no_external_services', out.note);
		check('amountAtomic 0', out.amountAtomic === 0);
	}

	console.log('\n9. isServiceLive — unknown allows, dead-beyond-threshold blocks');
	{
		const { sql } = makeSqlStub({
			uptimeRows: {
				'https://up.example/x': { alive: true, consecutive_failures: 0 },
				'https://flap.example/x': { alive: false, consecutive_failures: 1 },
				'https://dead.example/x': { alive: false, consecutive_failures: 5 },
			},
		});
		check('unknown → true', (await isServiceLive(sql, 'https://new.example/x')) === true);
		check('alive → true', (await isServiceLive(sql, 'https://up.example/x')) === true);
		check('one failure (< threshold) → true', (await isServiceLive(sql, 'https://flap.example/x')) === true);
		check('hard-dead → false', (await isServiceLive(sql, 'https://dead.example/x')) === false);
	}

	console.log('\n10. DB upsert failure mid-run does not crash');
	{
		const live = await stubService(() => ({ status: 402, body: { accepts: [] } }));
		const sql = (strings, ...vals) => {
			const text = strings.join('?');
			if (/FROM x402_bazaar_catalog/i.test(text)) return Promise.resolve([{ category: 't', resources: [{ resource: live.url, tool_name: 'l', networks: ['solana'] }] }]);
			if (/INSERT INTO x402_service_uptime/i.test(text)) return Promise.reject(new Error('db down'));
			return Promise.resolve([]);
		};
		const out = await run({ origin: 'https://three.ws', sql, redis: makeRedisStub() });
		await live.close();
		check('still resolves (no throw)', out.responseData.probed === 1);
		check('probe still alive', out.responseData.alive === 1);
	}

	// Optional real DB round-trip.
	if (process.env.DATABASE_URL || process.env.POSTGRES_URL) {
		console.log('\n11. real DB upsert + read-back');
		const live = await stubService(() => ({ status: 402, body: { accepts: [] } }));
		const { sql } = await import('../api/_lib/db.js');
		const runId = randomUUID();
		// Seed the catalog with our stub so collectExternalTargets finds it.
		await sql`CREATE TABLE IF NOT EXISTS x402_bazaar_catalog (id bigserial PRIMARY KEY, run_id uuid, ts timestamptz DEFAULT now(), category text, resources jsonb DEFAULT '[]'::jsonb)`;
		await sql`INSERT INTO x402_bazaar_catalog (run_id, category, resources) VALUES (${runId}, ${'manual-test'}, ${JSON.stringify([{ resource: live.url, tool_name: 'live', networks: ['solana'] }])})`;
		const out = await run({ origin: 'https://three.ws', sql, redis: null, runId });
		await live.close();
		const rows = await sql`SELECT alive, classification FROM x402_service_uptime WHERE resource = ${live.url}`;
		check('uptime row persisted', rows.length === 1, JSON.stringify(rows[0]));
		check('classified live_paywall', rows[0]?.classification === 'live_paywall');
		const logRows = await sql`SELECT pipeline, amount_atomic FROM x402_autonomous_log WHERE run_id = ${runId} AND service_name LIKE 'Uptime:%'`;
		check('autonomous_log row written', logRows.length >= 1);
		check('amount 0 in log', Number(logRows[0]?.amount_atomic) === 0);
		check('outcome alive', out.responseData.alive === 1);
		// Cleanup the synthetic catalog row.
		await sql`DELETE FROM x402_bazaar_catalog WHERE run_id = ${runId}`;
	} else {
		console.log('\n11. real DB round-trip skipped (no DATABASE_URL)');
	}

	console.log(`\n${failures === 0 ? 'PASS' : 'FAIL'} — ${failures} failed check(s)\n`);
	process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
	console.error('test crashed:', err);
	process.exit(1);
});

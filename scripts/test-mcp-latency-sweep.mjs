// Manual test for the MCP Tool Latency Monitor sweep (USE-006).
//
//   node scripts/test-mcp-latency-sweep.mjs
//
// Stands up a local server that emulates /api/mcp (tools/list + tools/call with
// a realistic mix of priced 402s, a free public tool, and a deliberately slow
// tool) and drives mcpLatencySweep() against it. Verifies the sweep enumerates
// every tool, assembles the canary + discovery + per-tool samples, computes
// p50/p95/p99, flags the SLA breach, and never throws — independent of whether a
// DATABASE_URL is configured (DB writes are best-effort and caught).

import http from 'node:http';
import { mcpLatencySweep, PERF_SLA_P95_MS } from '../api/_lib/x402/mcp-latency-sweep.js';

const TOOLS = [
	{ name: 'getting_started', priced: false, status: 200, delay: 5 },
	{ name: 'validate_model', priced: true, status: 402, delay: 8 },
	{ name: 'render_avatar', priced: true, status: 402, delay: 8 },
	{ name: 'pumpfun_token_intel', priced: false, status: 200, delay: 12 },
	{ name: 'oracle_coin', priced: false, status: 401, delay: 6 },
	{ name: 'slow_tool', priced: false, status: 200, delay: PERF_SLA_P95_MS + 400 }, // forces a breach
];

function startMockMcp() {
	return new Promise((resolve) => {
		const server = http.createServer((req, res) => {
			let raw = '';
			req.on('data', (c) => (raw += c));
			req.on('end', () => {
				let msg = {};
				try { msg = JSON.parse(raw); } catch { /* ignore */ }
				if (msg.method === 'tools/list') {
					res.setHeader('content-type', 'application/json');
					res.end(JSON.stringify({
						jsonrpc: '2.0', id: msg.id,
						result: { tools: TOOLS.map((t) => ({ name: t.name, ...(t.priced ? { pricing: { amount_usdc: 0.005 } } : {}) })) },
					}));
					return;
				}
				if (msg.method === 'tools/call') {
					const tool = TOOLS.find((t) => t.name === msg.params?.name);
					const delay = tool?.delay ?? 5;
					setTimeout(() => {
						res.statusCode = tool?.status ?? 200;
						res.setHeader('content-type', 'application/json');
						res.end(JSON.stringify({ jsonrpc: '2.0', id: msg.id, result: { ok: true } }));
					}, delay);
					return;
				}
				res.statusCode = 400;
				res.end('{}');
			});
		});
		server.listen(0, '127.0.0.1', () => resolve(server));
	});
}

function assert(cond, label) {
	if (!cond) { console.error(`  ✗ ${label}`); process.exitCode = 1; }
	else console.log(`  ✓ ${label}`);
}

const server = await startMockMcp();
const { port } = server.address();
const origin = `http://127.0.0.1:${port}`;
console.log(`mock /api/mcp on ${origin}\n`);

const summary = await mcpLatencySweep({
	runId: '00000000-0000-4000-8000-000000000006',
	origin,
	durationMs: 1234, // simulated canary paid round-trip
	success: true,
});

console.log('sweep summary:', JSON.stringify(summary), '\n');

// Expected samples: 1 canary paid + 1 tools/list + N per-tool probes.
const expectedSamples = TOOLS.length + 2;
assert(summary.skipped === undefined, 'sweep did not skip');
assert(summary.tools === TOOLS.length, `enumerated all ${TOOLS.length} tools`);
assert(summary.samples === expectedSamples, `assembled ${expectedSamples} samples (canary + list + ${TOOLS.length} tools)`);
assert(summary.breaches >= 1, 'detected the slow_tool SLA breach (p95 > 2s)');
assert(summary.alerted === true, 'raised an SLA alert');
console.log(`\n  (note: inserted=${summary.inserted} — 0 is expected without DATABASE_URL; DB writes are best-effort)`);

server.close();
console.log(process.exitCode ? '\nFAIL' : '\nPASS');

#!/usr/bin/env node
// Live health probe for every three.ws remote MCP endpoint.
//
// Free endpoints (no x402 gate) must answer initialize + tools/list and run a
// read-only tool. Paid endpoints (whole transport gated by x402) must answer a
// bare request with a well-formed 401/402 payment challenge whose `accepts[]`
// carries valid requirements — proof the server is live and the gate is wired.
// No real payment is ever sent.
//
//   node scripts/smoke-mcp-remotes.mjs                    # against https://three.ws
//   node scripts/smoke-mcp-remotes.mjs http://localhost:3000
//
// Exit code is non-zero if any endpoint is unhealthy.

const BASE = (process.argv[2] || 'https://three.ws').replace(/\/$/, '');

// USDC on Base mainnet — the only asset a paid challenge should price in.
const USDC_BASE = '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913';

const ENDPOINTS = [
	{
		path: '/api/pump-fun-mcp',
		type: 'free',
		// On-chain tool that needs no external indexer — $THREE is the only mint we touch.
		probe: { name: 'get_token_details', args: { mint: 'FeMbDoX7R1Psc4GEcvJdsbNbZA3bfztcyDCatJVJpump' } },
	},
	{ path: '/api/mcp', type: 'paid' },
	{ path: '/api/mcp-3d', type: 'paid' },
	{ path: '/api/mcp-agent', type: 'paid' },
	{ path: '/api/ibm-mcp', type: 'paid' },
	{ path: '/api/mcp-bazaar', type: 'paid' },
];

function rpc(method, params, id = 1) {
	return { jsonrpc: '2.0', id, method, params };
}

// MCP Streamable HTTP may answer as application/json or as an SSE stream
// (text/event-stream). Parse the first JSON-RPC payload out of either.
function parseBody(text, contentType) {
	if (contentType.includes('text/event-stream')) {
		for (const line of text.split('\n')) {
			const t = line.trim();
			if (t.startsWith('data:')) {
				try {
					return JSON.parse(t.slice(5).trim());
				} catch {
					/* keep scanning */
				}
			}
		}
		return null;
	}
	try {
		return JSON.parse(text);
	} catch {
		return null;
	}
}

async function post(path, payload) {
	const res = await fetch(`${BASE}${path}`, {
		method: 'POST',
		headers: {
			'content-type': 'application/json',
			accept: 'application/json, text/event-stream',
		},
		body: JSON.stringify(payload),
	});
	const text = await res.text();
	return { status: res.status, body: parseBody(text, res.headers.get('content-type') || ''), raw: text };
}

function validateChallenge(body) {
	if (!body || !Array.isArray(body.accepts) || body.accepts.length === 0) {
		return 'no accepts[] in challenge body';
	}
	for (const a of body.accepts) {
		if (!a.scheme || !a.network || !a.payTo || !a.asset) {
			return `accept entry missing scheme/network/payTo/asset: ${JSON.stringify(a).slice(0, 80)}`;
		}
	}
	const base = body.accepts.find((a) => a.network === 'eip155:8453');
	if (base && base.asset.toLowerCase() !== USDC_BASE) {
		return `Base accept asset is not USDC: ${base.asset}`;
	}
	return null;
}

const results = [];

async function checkFree(ep) {
	const checks = [];
	const init = await post(ep.path, rpc('initialize', {
		protocolVersion: '2025-06-18',
		capabilities: {},
		clientInfo: { name: 'smoke', version: '0' },
	}));
	const name = init.body?.result?.serverInfo?.name;
	checks.push(['initialize', init.status === 200 && !!name, name ? `serverInfo=${name}` : `status ${init.status}`]);

	const list = await post(ep.path, rpc('tools/list', {}, 2));
	const tools = list.body?.result?.tools;
	checks.push(['tools/list', Array.isArray(tools) && tools.length > 0, `${tools?.length ?? 0} tools`]);

	const call = await post(ep.path, rpc('tools/call', { name: ep.probe.name, arguments: ep.probe.args }, 3));
	const isErr = !!call.body?.error;
	checks.push([`call ${ep.probe.name}`, !isErr, isErr ? call.body.error.message?.slice(0, 60) : 'ok']);
	return checks;
}

async function checkPaid(ep) {
	const res = await post(ep.path, rpc('initialize', {
		protocolVersion: '2025-06-18',
		capabilities: {},
		clientInfo: { name: 'smoke', version: '0' },
	}));
	const gated = res.status === 401 || res.status === 402;
	const challengeErr = validateChallenge(res.body);
	return [
		['payment-gated', gated, `HTTP ${res.status}`],
		['valid x402 challenge', gated && !challengeErr, challengeErr || `${res.body?.accepts?.length} accept(s)`],
	];
}

console.log(`\nMCP remote smoke → ${BASE}\n`);
let failures = 0;
for (const ep of ENDPOINTS) {
	let checks;
	try {
		checks = ep.type === 'free' ? await checkFree(ep) : await checkPaid(ep);
	} catch (e) {
		checks = [['reachable', false, e.message]];
	}
	const epOk = checks.every((c) => c[1]);
	if (!epOk) failures++;
	console.log(`${epOk ? '✓' : '✗'} ${ep.path}  (${ep.type})`);
	for (const [label, ok, detail] of checks) {
		console.log(`    ${ok ? 'ok  ' : 'FAIL'}  ${label.padEnd(22)} ${detail}`);
	}
	results.push({ path: ep.path, ok: epOk });
}

console.log(`\n${failures === 0 ? '✓ all remotes healthy' : `✗ ${failures} endpoint(s) unhealthy`} (${results.length} checked)\n`);
process.exit(failures === 0 ? 0 : 1);

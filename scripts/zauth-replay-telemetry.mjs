// Replay production 402 challenges through the REAL zauth SDK from a
// long-lived process, with the real ZAUTH_API_KEY from .env.local.
//
//   node scripts/zauth-replay-telemetry.mjs
//
// Purpose: distinguish "Vercel drops telemetry before flush" from "zauth's
// backend doesn't register endpoints off bare 402 challenges". Each paid
// surface is fetched from production (no X-PAYMENT → zero cost), and the
// genuine response (status, PAYMENT-REQUIRED header, body) is replayed
// through api/_lib/zauth.js instrument()/drain() so the SDK observes it
// exactly as the deployed middleware would — but from a process that
// cannot be frozen mid-flush. Debug output prints the backend's
// accepted-event counts, which is ground truth on delivery.
import { EventEmitter } from 'node:events';
import { readFileSync } from 'node:fs';

// Load ZAUTH_* from .env.local before importing the adapter (env.js reads
// process.env live; the middleware builds lazily on first instrument()).
for (const line of readFileSync(new URL('../.env.local', import.meta.url), 'utf8').split('\n')) {
	const m = line.match(/^\s*(ZAUTH_[A-Z_]+)\s*=\s*(.*)\s*$/);
	if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}
if (!process.env.ZAUTH_API_KEY) {
	console.error('ZAUTH_API_KEY not found in environment or .env.local');
	process.exit(1);
}
process.env.ZAUTH_DEBUG = '1';
// Label events as production — they describe the deployed endpoints.
process.env.VERCEL_ENV = process.env.VERCEL_ENV || 'production';

const { instrument, drain, status } = await import('../api/_lib/zauth.js');

const BASE = process.env.THREE_WS_BASE || 'https://three.ws';
const MCP_BODY = JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' });

// Same catalog as zauth-register-endpoints.mjs.
const ENDPOINTS = [
	{ path: '/api/mcp', method: 'POST', body: MCP_BODY, json: true },
	{ path: '/api/mcp-3d', method: 'POST', body: MCP_BODY, json: true },
	{ path: '/api/mcp-agent', method: 'POST', body: MCP_BODY, json: true },
	{ path: '/api/mcp-bazaar', method: 'POST', body: MCP_BODY, json: true },
	// Gated tools/call — tools/list is free on this server; only gated tools 402.
	{
		path: '/api/pump-fun-mcp',
		method: 'POST',
		body: JSON.stringify({
			jsonrpc: '2.0',
			id: 1,
			method: 'tools/call',
			params: { name: 'pumpfun_vanity_mint', arguments: {} },
		}),
		json: true,
	},
	{ path: '/api/ibm-mcp', method: 'POST', body: MCP_BODY, json: true },
	{ path: '/api/wk-x402', method: 'GET' },
	{ path: '/api/x402/agent-reputation', method: 'GET' },
	{ path: '/api/x402/asset-download?slug=pole-dancer-rumba', method: 'GET' },
	{ path: '/api/x402/cosmetic-purchase?id=skin-midnight&account=g_5f3c9a21b8', method: 'GET' },
	{ path: '/api/x402/crypto-intel', method: 'POST', json: true, body: '{}' },
	{ path: '/api/x402/dance-tip', method: 'GET' },
	{ path: '/api/x402/fact-check', method: 'POST', json: true, body: '{}' },
	{ path: '/api/x402/forge', method: 'POST', json: true, body: '{}' },
	{ path: '/api/x402/mint-to-mesh', method: 'GET' },
	{ path: '/api/x402/mint-to-mesh-batch', method: 'POST', json: true, body: '{}' },
	{ path: '/api/x402/model-check', method: 'GET' },
	{ path: '/api/x402/onchain-identity-verify', method: 'GET' },
	{ path: '/api/x402/permit2-paid-demo', method: 'GET' },
	{ path: '/api/x402/pump-agent-audit', method: 'GET' },
	{ path: '/api/x402/pump-launch', method: 'POST', json: true, body: '{}' },
	{ path: '/api/x402/skill-call?skill=wallet-balance', method: 'GET' },
	{ path: '/api/x402/skill-marketplace', method: 'GET' },
	{ path: '/api/x402/symbol-availability', method: 'GET' },
	{ path: '/api/x402/tutor', method: 'POST', json: true, body: '{}' },
	{ path: '/api/x402/vanity', method: 'GET' },
];

function makeReq({ path, method }) {
	return {
		url: path,
		method,
		headers: {
			host: 'three.ws',
			'x-forwarded-proto': 'https',
			'user-agent': 'three.ws-zauth-replay',
		},
		socket: { remoteAddress: '203.0.113.7' },
	};
}

function makeRes() {
	const res = new EventEmitter();
	const headersStore = {};
	res.statusCode = 200;
	res.headersSent = false;
	res.writableEnded = false;
	res.setHeader = (k, v) => {
		headersStore[String(k).toLowerCase()] = v;
	};
	res.getHeader = (k) => headersStore[String(k).toLowerCase()];
	res.getHeaders = () => ({ ...headersStore });
	res.removeHeader = (k) => delete headersStore[String(k).toLowerCase()];
	res.write = () => true;
	res.end = function end() {
		res.writableEnded = true;
		res.headersSent = true;
		res.emit('finish');
		res.emit('close');
		return res;
	};
	return res;
}

console.log('— zauth telemetry replay —');
console.log('status():', JSON.stringify(status()));

let replayed = 0;
for (const ep of ENDPOINTS) {
	const headers = { 'user-agent': 'three.ws-zauth-replay' };
	if (ep.json) headers['content-type'] = 'application/json';
	let upstream;
	try {
		upstream = await fetch(BASE + ep.path, {
			method: ep.method,
			headers,
			body: ep.body,
			signal: AbortSignal.timeout(20_000),
		});
	} catch (err) {
		console.log(`  SKIP ${ep.path} — upstream fetch failed: ${err.message}`);
		continue;
	}
	const bodyText = await upstream.text().catch(() => '');

	const req = makeReq(ep);
	const res = makeRes();
	const monitored = instrument(req, res);
	if (!monitored) {
		console.log(`  SKIP ${ep.path} — not monitored?!`);
		continue;
	}
	res.statusCode = upstream.status;
	for (const name of ['content-type', 'payment-required', 'www-authenticate']) {
		const v = upstream.headers.get(name);
		if (v) res.setHeader(name, v);
	}
	res.end(bodyText);
	await drain();
	replayed++;
	console.log(`  replayed ${upstream.status} ${ep.method.padEnd(4)} ${ep.path}`);
}

// Let the SDK finish any trailing batch work, then shut down cleanly.
await new Promise((r) => setTimeout(r, 2000));
await drain();
console.log(`\nreplayed ${replayed}/${ENDPOINTS.length} endpoints through the live SDK`);

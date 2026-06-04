// End-to-end verification for the zauthx402 telemetry integration.
//
// Drives the REAL @zauthx402/sdk through our Vercel adapter (api/_lib/zauth.js)
// with a synthetic x402 request, then watches whether the SDK forms and sends a
// telemetry POST to https://back.zauthx402.com/api/sdk/events.
//
// Usage:
//   ZAUTH_API_KEY=zx_live_... node scripts/verify-zauth.mjs
//   node scripts/verify-zauth.mjs                # probe with a dummy key
//
// A real key should yield HTTP 200 from the events endpoint. A dummy key
// proves the request is well-formed and reaches zauth (expect 401/403).

import { EventEmitter } from 'node:events';

process.env.ZAUTH_DEBUG = '1';
if (!process.env.ZAUTH_API_KEY) {
	process.env.ZAUTH_API_KEY = 'zx_test_verify_dummy_key';
	console.log('[verify] no ZAUTH_API_KEY set — using dummy key (expect auth rejection from backend)\n');
}

// Capture the real outbound telemetry POST without mocking the SDK internals.
const realFetch = globalThis.fetch;
let telemetry = null;
globalThis.fetch = async (url, init) => {
	const u = typeof url === 'string' ? url : url?.url;
	if (u && u.includes('zauthx402.com')) {
		telemetry = { url: u, status: null, body: null, headers: init?.headers, payload: init?.body };
		try {
			const res = await realFetch(url, init);
			telemetry.status = res.status;
			telemetry.body = await res.clone().text().catch(() => '');
			return res;
		} catch (err) {
			telemetry.status = 'NETWORK_ERROR';
			telemetry.body = err.message;
			throw err;
		}
	}
	return realFetch(url, init);
};

const { instrument, drain, status } = await import('../api/_lib/zauth.js');

console.log('[verify] adapter status:', JSON.stringify(status()), '\n');

// Build a Vercel-shaped (raw Node http) req/res for a monitored x402 path.
function makeReqRes(path) {
	const req = new EventEmitter();
	Object.assign(req, {
		method: 'POST',
		url: path,
		headers: {
			host: 'three.ws',
			'x-forwarded-proto': 'https',
			'x-forwarded-for': '203.0.113.7',
			'content-type': 'application/json',
			// Simulate an x402 settlement so shouldMonitor() matches on header too.
			'x-payment': 'eyJzY2hlbWUiOiJ0ZXN0In0=',
		},
		socket: { remoteAddress: '203.0.113.7' },
	});

	const res = new EventEmitter();
	const chunks = [];
	Object.assign(res, {
		statusCode: 200,
		headersSent: false,
		writableEnded: false,
		_headers: {},
		setHeader(k, v) { this._headers[k.toLowerCase()] = v; },
		getHeader(k) { return this._headers[k.toLowerCase()]; },
		end(chunk) {
			if (chunk) chunks.push(chunk);
			this.headersSent = true;
			this.writableEnded = true;
			this.emit('finish');
			return this;
		},
	});
	return { req, res };
}

const path = '/api/agents/x402/run';
const { req, res } = makeReqRes(path);

const monitored = instrument(req, res);
console.log(`[verify] instrument("${path}") → monitored=${monitored}`);
console.log(`[verify] shimmed req.path=${req.path} protocol=${req.protocol} ip=${req.ip}`);

// Produce a realistic paid response, then drain so the lambda-style flush lands.
res.statusCode = 200;
res.setHeader('content-type', 'application/json');
res.end(JSON.stringify({ data: { ok: true, result: 'verification probe' } }));

await drain();
// Give a little extra headroom for the network round-trip in this CLI context.
await new Promise((r) => setTimeout(r, 1500));

console.log('\n[verify] ---- result ----');
if (!monitored) {
	console.log('FAIL: request was not selected for monitoring (shouldMonitor returned false).');
	process.exit(1);
}
if (!telemetry) {
	console.log('FAIL: SDK never attempted a telemetry POST to zauthx402.com.');
	process.exit(1);
}
console.log(`telemetry POST → ${telemetry.url}`);
console.log(`HTTP status   → ${telemetry.status}`);
console.log(`response body → ${String(telemetry.body).slice(0, 300)}`);
const okStatuses = [200, 201, 202];
if (okStatuses.includes(telemetry.status)) {
	console.log('\nPASS: telemetry accepted by zauth backend. Integration is live and working.');
	process.exit(0);
} else if ([401, 403].includes(telemetry.status)) {
	console.log('\nPARTIAL PASS: request is well-formed and reached zauth, but the key was rejected.');
	console.log('Wiring is correct — set a valid ZAUTH_API_KEY from https://zauth.inc/provider-hub to go live.');
	process.exit(0);
} else {
	console.log(`\nWARN: unexpected backend status ${telemetry.status}. Inspect the body above.`);
	process.exit(2);
}

// Smoke harness for the free 3D Studio MCP endpoint.
//   1. Drives the real HTTP handler (api/mcp-studio.js) with mock req/res for
//      initialize, tools/list, and resources/read — proving the transport.
//   2. Calls forge_free through the dispatcher pointed at the PRODUCTION free
//      NVIDIA lane (https://three.ws/api/forge) to capture a REAL GLB response.
//
// Usage: node scripts/mcp-studio-smoke.mjs [--gen]
//   --gen  also run a real generation (slow, ~15-60s; hits the prod free lane).

import { Readable } from 'node:stream';

process.env.STUDIO_API_BASE = process.env.STUDIO_API_BASE || 'https://three.ws';

const { default: handler } = await import('../api/mcp-studio.js');

function mockReq(body) {
	const buf = Buffer.from(JSON.stringify(body));
	const r = Readable.from([buf]);
	r.method = 'POST';
	r.url = '/api/mcp-studio';
	r.headers = { 'content-type': 'application/json', host: 'three.ws', 'x-forwarded-proto': 'https', 'x-forwarded-for': '203.0.113.7' };
	return r;
}

function mockRes() {
	const res = {
		statusCode: 200,
		_headers: {},
		_body: '',
		setHeader(k, v) { this._headers[k.toLowerCase()] = v; },
		getHeader(k) { return this._headers[k.toLowerCase()]; },
		end(b) { if (b) this._body += b; this._ended = true; if (this._resolve) this._resolve(); },
		write(b) { this._body += b; },
	};
	res.done = new Promise((resolve) => (res._resolve = resolve));
	return res;
}

async function call(body) {
	const req = mockReq(body);
	const res = mockRes();
	await handler(req, res);
	await res.done;
	return { status: res.statusCode, json: res._body ? JSON.parse(res._body) : null };
}

console.log('# 1. initialize');
const init = await call({ jsonrpc: '2.0', id: 1, method: 'initialize' });
console.log('status', init.status, '— server', init.json.result.serverInfo.name);

console.log('\n# 2. tools/list');
const list = await call({ jsonrpc: '2.0', id: 2, method: 'tools/list' });
for (const t of list.json.result.tools) {
	console.log(`  - ${t.name} :: "${t.title}"  annotations=${JSON.stringify(t.annotations)}`);
}

console.log('\n# 3. resources/read (Apps SDK widget)');
const read = await call({ jsonrpc: '2.0', id: 3, method: 'resources/read', params: { uri: 'ui://widget/three-studio-model.html' } });
const html = read.json.result.contents[0];
console.log('  uri', html.uri, '— mime', html.mimeType, '— bytes', html.text.length);

if (process.argv.includes('--gen')) {
	console.log('\n# 4. forge_free (REAL generation via prod free NVIDIA lane) — this is slow…');
	const gen = await call({ jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'forge_free', arguments: { prompt: 'a friendly round robot mascot, glossy white plastic', tier: 'draft' } } });
	console.log('  status', gen.status);
	console.log(JSON.stringify(gen.json.result, null, 2));
}

console.log('\nOK');

// Smoke test the asset-download endpoint without a Vercel dev server.
// Calls the handler with a fake req/res and prints status, headers, body.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
for (const f of ['.env.local', '.env']) {
	try {
		const raw = readFileSync(resolve('/workspaces/three.ws', f), 'utf8');
		for (const line of raw.split('\n')) {
			const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
			if (!m || process.env[m[1]]) continue;
			let v = m[2].trim();
			if ((v.startsWith('"')&&v.endsWith('"'))||(v.startsWith("'")&&v.endsWith("'"))) v = v.slice(1,-1);
			process.env[m[1]] = v;
		}
		break;
	} catch {}
}
process.env.PUBLIC_APP_ORIGIN = process.env.PUBLIC_APP_ORIGIN || 'https://three.ws';

const { default: handler } = await import('../api/x402/asset-download.js');

function makeRes() {
	const headers = {};
	let statusCode = 200;
	let body = '';
	let ended = false;
	return {
		get statusCode() { return statusCode; },
		set statusCode(v) { statusCode = v; },
		get writableEnded() { return ended; },
		setHeader(k, v) { headers[k.toLowerCase()] = v; },
		getHeader(k) { return headers[k.toLowerCase()]; },
		end(b) { body = b || ''; ended = true; },
		_inspect: () => ({ statusCode, headers, body }),
	};
}

async function probe(slug) {
	const req = {
		method: 'GET',
		url: `/api/x402/asset-download?slug=${slug}`,
		headers: {},
		query: { slug },
	};
	const res = makeRes();
	await handler(req, res);
	const out = res._inspect();
	console.log(`\n=== slug=${slug} (no payment header) ===`);
	console.log('status:', out.statusCode);
	console.log('headers:', Object.keys(out.headers));
	try {
		const parsed = JSON.parse(out.body);
		console.log('body keys:', Object.keys(parsed));
		if (parsed.error) console.log('error:', parsed.error);
	} catch {
		console.log('body (first 200):', out.body.slice(0, 200));
	}
	const pr = out.headers['payment-required'];
	if (pr) {
		const decoded = JSON.parse(Buffer.from(pr, 'base64').toString('utf8'));
		console.log('PAYMENT-REQUIRED body:');
		console.log('  resource.url:', decoded.resource?.url);
		console.log('  accepts count:', decoded.accepts?.length);
		console.log('  accept[0]:', JSON.stringify({
			network: decoded.accepts?.[0]?.network,
			amount: decoded.accepts?.[0]?.amount,
			payTo: decoded.accepts?.[0]?.payTo,
		}));
		console.log('  extensions keys:', Object.keys(decoded.extensions || {}));
		console.log('  siwx?:', !!decoded.extensions?.['sign-in-with-x']);
		if (decoded.extensions?.['sign-in-with-x']) {
			const ext = decoded.extensions['sign-in-with-x'];
			console.log('  siwx.statement:', ext.statement);
			console.log('  siwx.supportedChains:', ext.supportedChains);
			console.log('  siwx.uri:', ext.uri);
		}
	}
}

await probe('pole-dancer-rumba');
await probe('cz-avatar');
await probe('does-not-exist');

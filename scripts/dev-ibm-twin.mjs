// Local API server for the Digital Twin (/ibm/twin).
//
// In normal `npm run dev`, /api/* proxies to production, so a brand-new endpoint
// like /api/ibm/twin isn't reachable until it ships. Run this tiny server and
// point Vite at it so the page exercises the REAL handler against live
// GeckoTerminal data (and, with WATSONX_* set, real Granite TimeSeries + Guardian):
//
//   node scripts/dev-ibm-twin.mjs            # API on :3015
//   DEV_API_PROXY=http://localhost:3015 npm run dev   # Vite on :3000 → /ibm/twin
//
// It serves /api/ibm/twin with the real handler and forwards every other /api/*
// to production, so the avatar runtime and any sibling endpoints keep working.
import { createServer } from 'node:http';
import twin from '../api/ibm/twin.js';

const PORT = Number(process.env.PORT || 3015);
const PROD = 'https://three.ws';

const server = createServer(async (req, res) => {
	const path = (req.url || '/').split('?')[0];

	if (path.startsWith('/api/ibm/twin')) {
		try {
			await twin(req, res);
		} catch (e) {
			res.statusCode = 500;
			res.setHeader('content-type', 'application/json');
			res.end(JSON.stringify({ error: 'handler_threw', message: String(e?.message || e) }));
		}
		return;
	}

	// Everything else (other /api/*, avatar runtime calls) goes to production.
	try {
		const chunks = [];
		for await (const c of req) chunks.push(c);
		const body = chunks.length ? Buffer.concat(chunks) : undefined;
		const headers = { ...req.headers };
		delete headers.host;
		const upstream = await fetch(PROD + req.url, {
			method: req.method,
			headers,
			body: ['GET', 'HEAD'].includes(req.method) ? undefined : body,
			redirect: 'manual',
		});
		res.statusCode = upstream.status;
		upstream.headers.forEach((v, k) => {
			if (k === 'content-encoding' || k === 'transfer-encoding') return;
			res.setHeader(k, v);
		});
		const buf = Buffer.from(await upstream.arrayBuffer());
		res.end(buf);
	} catch (e) {
		res.statusCode = 502;
		res.setHeader('content-type', 'application/json');
		res.end(JSON.stringify({ error: 'proxy_failed', message: String(e?.message || e) }));
	}
});

server.listen(PORT, () => {
	console.log(`Digital Twin dev API → http://localhost:${PORT}/api/ibm/twin`);
	console.log(`  run:  DEV_API_PROXY=http://localhost:${PORT} npm run dev   → http://localhost:3000/ibm/twin`);
});

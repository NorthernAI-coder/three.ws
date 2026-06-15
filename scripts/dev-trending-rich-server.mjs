// Dev-only API shim for verifying the pump-visualizer trending fix end-to-end.
// Serves /api/pump/trending* from the REAL api/pump/trending.js handler (so the
// new ?rich=1 path is exercised against live pump.fun data) and stream-proxies
// every other /api/* call — including the SSE firehose — to production, so the
// page behaves exactly as it will once deployed. Point Vite at it with
// DEV_API_PROXY=http://localhost:3031. Not committed to product surfaces.
import http from 'node:http';
import trendingHandler from '../api/pump/trending.js';

const UPSTREAM = process.env.UPSTREAM || 'https://three.ws';
const PORT = Number(process.env.PORT || 3031);

const server = http.createServer(async (req, res) => {
	const url = req.url || '/';
	try {
		if (req.method === 'GET' && url.startsWith('/api/pump/trending')) {
			// Pass the real Node req/res straight to the handler — its http
			// helpers (cors/json/method/wrap) and rate limiter speak this shape.
			await trendingHandler(req, res);
			return;
		}
		const chunks = [];
		if (req.method !== 'GET' && req.method !== 'HEAD') {
			for await (const c of req) chunks.push(c);
		}
		const headers = { ...req.headers };
		delete headers.host;
		headers['accept-encoding'] = 'identity'; // keep SSE/streams unbuffered
		const upstream = await fetch(UPSTREAM + url, {
			method: req.method,
			headers,
			body: chunks.length ? Buffer.concat(chunks) : undefined,
		});
		res.statusCode = upstream.status;
		upstream.headers.forEach((v, k) => {
			if (['content-encoding', 'content-length', 'transfer-encoding'].includes(k)) return;
			res.setHeader(k, v);
		});
		if (upstream.body) {
			const reader = upstream.body.getReader();
			for (;;) {
				const { done, value } = await reader.read();
				if (done) break;
				res.write(Buffer.from(value));
			}
		}
		res.end();
	} catch (err) {
		if (!res.headersSent) {
			res.statusCode = 502;
			res.setHeader('content-type', 'application/json');
			res.end(JSON.stringify({ error: 'shim_failed', message: String(err?.message || err) }));
		} else {
			res.end();
		}
	}
});

server.listen(PORT, () => console.log(`[rich-trending-shim] listening on http://localhost:${PORT} → ${UPSTREAM}`));

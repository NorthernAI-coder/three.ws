// Local dev server for /deal page.
// Serves /deal, /api/pay/deal, and /api/agent/wallet locally.
// Everything else redirects to production.
//
//   node scripts/dev-deal.mjs   → http://localhost:3389/deal
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import deal from '../api/pay/deal.js';
import wallet from '../api/agent/wallet.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.PORT || 3389);
const PROD = 'https://three.ws';

const FILES = {
	'/deal': ['pages/deal.html', 'text/html; charset=utf-8'],
	'/deal/': ['pages/deal.html', 'text/html; charset=utf-8'],
};

const server = createServer(async (req, res) => {
	const path = (req.url || '/').split('?')[0];

	if (path.startsWith('/api/pay/deal')) {
		try {
			await deal(req, res);
		} catch (e) {
			if (!res.headersSent)
				res.end(
					JSON.stringify({ error: 'handler_threw', message: String(e?.message || e) }),
				);
		}
		return;
	}

	if (path.startsWith('/api/agent/wallet')) {
		try {
			await wallet(req, res);
		} catch (e) {
			if (!res.headersSent)
				res.end(
					JSON.stringify({ error: 'handler_threw', message: String(e?.message || e) }),
				);
		}
		return;
	}

	const file = FILES[path];
	if (file) {
		try {
			const body = await readFile(resolve(ROOT, file[0]));
			res.statusCode = 200;
			res.setHeader('content-type', file[1]);
			res.end(body);
		} catch {
			res.statusCode = 404;
			res.end('not found');
		}
		return;
	}

	res.statusCode = 302;
	res.setHeader('Location', PROD + req.url);
	res.end();
});

server.listen(PORT, () => {
	console.log(`Deal dev server → http://localhost:${PORT}/deal`);
	console.log(`  /api/pay/deal served locally; other assets proxy to ${PROD}`);
});

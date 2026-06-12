// One-off stub upstream for the /forge health browser check: serves the REAL
// buildCatalog() plus a controlled ?health payload so the engine selector's
// down/degraded states can be exercised in a real browser before the endpoint
// is deployed. Point Vite at it with DEV_API_PROXY=http://localhost:3199.
import http from 'node:http';

process.env.NVIDIA_API_KEY = 'nvapi-stub';
process.env.REPLICATE_API_TOKEN = 'r8-stub';
const { buildCatalog } = await import('../api/_lib/forge-tiers.js');

const HEALTH = {
	status: 'degraded',
	generated_at: new Date().toISOString(),
	cached: false,
	backends: {
		nvidia: {
			id: 'nvidia',
			status: 'degraded',
			message: 'NVIDIA NIM is throttling — the free lane may queue.',
		},
		trellis: {
			id: 'trellis',
			status: 'down',
			message: 'The Replicate account is out of credit.',
		},
		meshy: { id: 'meshy', status: 'byok', message: 'Meshy 6 uses your own API key.' },
		tripo: { id: 'tripo', status: 'byok', message: 'Tripo v3.1 uses your own API key.' },
		hunyuan3d: { id: 'hunyuan3d', status: 'unconfigured', message: 'Not deployed.' },
		triposg: { id: 'triposg', status: 'unconfigured', message: 'Not deployed.' },
	},
};

http
	.createServer((req, res) => {
		const url = new URL(req.url, 'http://localhost');
		res.setHeader('content-type', 'application/json');
		if (url.pathname === '/api/forge' && url.searchParams.has('catalog')) {
			return res.end(JSON.stringify(buildCatalog()));
		}
		if (url.pathname === '/api/forge' && url.searchParams.has('health')) {
			return res.end(JSON.stringify(HEALTH));
		}
		res.statusCode = 404;
		res.end('{"error":"stub_unrouted"}');
	})
	.listen(3199, () => console.log('forge stub api on :3199'));

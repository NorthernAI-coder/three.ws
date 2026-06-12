/**
 * The 3D Studio MCP endpoint (api/mcp-3d.js) must issue its OWN auth/payment
 * challenge — resource URL /api/mcp-3d, a text→3D description, and a bazaar
 * discovery example that calls text_to_3d. Before STUDIO_CHALLENGE existed it
 * inherited the main /api/mcp envelope and advertised itself to x402
 * facilitators as the avatar/validation server, so agents indexed (and paid
 * against) the wrong resource.
 */
import { describe, it, expect, vi } from 'vitest';
import { Readable } from 'node:stream';

// Env the real 402 challenge builder reads. Set before importing the handler.
process.env.PUBLIC_APP_ORIGIN = 'https://three.ws';
process.env.X402_PAY_TO_BASE ||= '0x0000000000000000000000000000000000000001';
process.env.X402_ASSET_ADDRESS_BASE ||= '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';

// Bearer path is out of scope — no token is ever presented in these tests.
vi.mock('../../api/_lib/auth.js', () => ({
	extractBearer: () => null,
	authenticateBearer: vi.fn(async () => null),
}));

// No Upstash in unit tests.
vi.mock('../../api/_lib/rate-limit.js', () => ({
	limits: {
		mcpIp: vi.fn(async () => ({ success: true, reset: Date.now() + 1000 })),
		mcpUser: vi.fn(async () => ({ success: true, reset: Date.now() + 1000 })),
		mcp3dGenerate: vi.fn(async () => ({ success: true, reset: Date.now() + 1000 })),
		mcp3dStatus: vi.fn(async () => ({ success: true, reset: Date.now() + 1000 })),
		mcpInspect: vi.fn(async () => ({ success: true })),
		mcpOptimize: vi.fn(async () => ({ success: true })),
	},
	clientIp: vi.fn(() => '203.0.113.9'),
}));

// ── Heavy studio-tool dependencies (imported transitively by the catalog) ────
vi.mock('../../api/_lib/usage.js', () => ({
	recordEvent: vi.fn(),
	logger: () => ({ info: () => {}, warn: () => {}, error: () => {} }),
}));
vi.mock('../../api/_providers/replicate.js', () => ({
	createRegenProvider: vi.fn(() => ({
		submit: vi.fn(async () => ({ extJobId: 'pred_123', eta: 45 })),
		status: vi.fn(async () => ({ status: 'running' })),
	})),
}));
vi.mock('../../api/_mcp3d/text-to-image.js', () => ({
	textToImage: vi.fn(async () => ({ imageUrl: 'https://img.test/a.png', model: 'flux' })),
}));

const { default: handler } = await import('../../api/mcp-3d.js');

function makeRes() {
	return {
		statusCode: 200,
		headers: {},
		body: null,
		setHeader(name, value) {
			this.headers[String(name).toLowerCase()] = value;
		},
		end(body) {
			this.body = body ?? null;
		},
	};
}

function makeReq({ method = 'POST', headers = {}, body = null } = {}) {
	const payload = body == null ? '' : JSON.stringify(body);
	const req = Readable.from(payload ? [Buffer.from(payload, 'utf8')] : []);
	req.method = method;
	req.url = '/api/mcp-3d';
	req.headers = {
		'content-type': 'application/json',
		'x-forwarded-for': '203.0.113.9',
		...headers,
	};
	return req;
}

const TOOLS_LIST = { jsonrpc: '2.0', id: 1, method: 'tools/list' };

describe('POST /api/mcp-3d — unauthenticated challenge identity', () => {
	it('plain x402 clients get a 402 naming the 3D Studio resource', async () => {
		const res = makeRes();
		await handler(makeReq({ body: TOOLS_LIST }), res);
		expect(res.statusCode).toBe(402);
		const challenge = JSON.parse(res.body);
		expect(challenge.resource.url).toBe('https://three.ws/api/mcp-3d');
		expect(challenge.resource.description).toContain('text_to_3d');
		expect(challenge.resource.serviceName).toBe('three.ws 3D Studio MCP');
		expect(challenge.resource.tags).toContain('text-to-3d');
		for (const accept of challenge.accepts) {
			expect(accept.resource).toBe('https://three.ws/api/mcp-3d');
		}
	});

	it('bazaar discovery example calls text_to_3d, not a main-server tool', async () => {
		const res = makeRes();
		await handler(makeReq({ body: TOOLS_LIST }), res);
		const { extensions } = JSON.parse(res.body);
		expect(extensions.bazaar.discoverable).toBe(true);
		expect(extensions.bazaar.info.input.body.params.name).toBe('text_to_3d');
		expect(extensions.bazaar.info.output.example.result.structuredContent.job_id).toBeTruthy();
	});

	it('MCP protocol clients get a 401 with the same studio envelope', async () => {
		const res = makeRes();
		await handler(
			makeReq({ body: TOOLS_LIST, headers: { accept: 'application/json, text/event-stream' } }),
			res,
		);
		expect(res.statusCode).toBe(401);
		expect(res.headers['www-authenticate']).toContain('oauth-protected-resource');
		const challenge = JSON.parse(res.body);
		expect(challenge.resource.url).toBe('https://three.ws/api/mcp-3d');
		expect(challenge.resource.serviceName).toBe('three.ws 3D Studio MCP');
	});

	it('GET (SSE probe) advertises the studio resource as well', async () => {
		const res = makeRes();
		await handler(makeReq({ method: 'GET', body: null }), res);
		expect(res.statusCode).toBe(402);
		const challenge = JSON.parse(res.body);
		expect(challenge.resource.url).toBe('https://three.ws/api/mcp-3d');
		expect(challenge.resource.description).toContain('text_to_3d');
	});

	it('the free public getting_started tool is still served with no credentials', async () => {
		const res = makeRes();
		await handler(
			makeReq({
				body: {
					jsonrpc: '2.0',
					id: 2,
					method: 'tools/call',
					params: { name: 'getting_started', arguments: {} },
				},
			}),
			res,
		);
		expect(res.statusCode).toBe(200);
		const out = JSON.parse(res.body);
		expect(out.error).toBeUndefined();
		expect(out.result?.content?.[0]?.text).toBeTruthy();
	});
});

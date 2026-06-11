import { describe, it, expect, vi } from 'vitest';

// env throws if required vars are missing — stub before the module imports it.
vi.mock('../api/_lib/env.js', () => ({
	env: {
		APP_ORIGIN: 'https://three.ws',
		MCP_RESOURCE: 'https://three.ws/api/mcp',
		X402_PAY_TO_BASE: '0x4022de2d36c334e73c7a108805cea11c0564f402',
	},
}));

const { sendAuthChallenge } = await import('../api/_mcp/auth.js');

function mkRes() {
	const headers = {};
	return {
		statusCode: 200,
		body: null,
		setHeader(k, v) {
			headers[k.toLowerCase()] = v;
		},
		getHeader(k) {
			return headers[k.toLowerCase()];
		},
		end(body) {
			this.body = body;
		},
		headers,
	};
}

const REQUIREMENTS = [
	{
		scheme: 'exact',
		amount: '1000',
		network: 'eip155:8453',
		payTo: '0x4022de2d36c334e73c7a108805cea11c0564f402',
		asset: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
		resource: 'https://three.ws/api/mcp',
	},
];

function challengeFor(headers) {
	const res = mkRes();
	sendAuthChallenge(res, {
		req: { headers },
		resourceUrl: 'https://three.ws/api/mcp',
		requirements: REQUIREMENTS,
	});
	return res;
}

describe('sendAuthChallenge status negotiation', () => {
	it('returns 402 Payment Required to plain x402 clients (no MCP signals)', () => {
		const res = challengeFor({ accept: 'application/json' });
		expect(res.statusCode).toBe(402);
	});

	it('returns 402 when there is no accept header at all (crawlers)', () => {
		const res = challengeFor({});
		expect(res.statusCode).toBe(402);
	});

	it('returns 401 to MCP Streamable HTTP clients (Accept includes SSE)', () => {
		const res = challengeFor({ accept: 'application/json, text/event-stream' });
		expect(res.statusCode).toBe(401);
	});

	it('returns 401 when MCP-Protocol-Version header is present', () => {
		const res = challengeFor({ accept: 'application/json', 'mcp-protocol-version': '2025-06-18' });
		expect(res.statusCode).toBe(401);
	});

	it('returns 401 when Mcp-Session-Id header is present', () => {
		const res = challengeFor({ 'mcp-session-id': 'abc123' });
		expect(res.statusCode).toBe(401);
	});

	it('always ships the x402 envelope and discovery headers, on both statuses', () => {
		for (const headers of [{}, { accept: 'text/event-stream' }]) {
			const res = challengeFor(headers);
			expect(res.getHeader('www-authenticate')).toContain('resource_metadata=');
			const envelope = JSON.parse(
				Buffer.from(res.getHeader('payment-required'), 'base64').toString('utf8'),
			);
			expect(envelope.x402Version).toBeDefined();
			expect(envelope.accepts).toHaveLength(REQUIREMENTS.length);
			const body = JSON.parse(res.body);
			expect(body.accepts).toHaveLength(REQUIREMENTS.length);
		}
	});
});

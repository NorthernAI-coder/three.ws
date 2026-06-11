// Tests for POST /api/agents/:id/embed — the AgentMemory.recall() embedder.
// Pins the platform provider policy on this surface: the free NVIDIA NIM lane
// (baai/bge-m3) leads, paid Voyage is only a keyed fallback, a missing key is
// a designed 503 (never a crash), and the response names the model that
// produced the vector so callers can keep vector spaces consistent.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const sqlMock = vi.fn();
vi.mock('../../api/_lib/db.js', () => ({ sql: (...a) => sqlMock(...a) }));

const getSessionUserMock = vi.fn();
vi.mock('../../api/_lib/auth.js', () => ({
	getSessionUser: (...a) => getSessionUserMock(...a),
	authenticateBearer: vi.fn(async () => null),
	extractBearer: vi.fn(() => null),
	hasScope: vi.fn(() => true),
}));

vi.mock('../../api/_lib/rate-limit.js', () => ({
	limits: { embedUser: vi.fn(async () => ({ success: true })) },
}));

const { handleEmbed } = await import('../../api/agents/_id/embed.js');

function clearKeys() {
	delete process.env.NVIDIA_API_KEY;
	delete process.env.VOYAGE_API_KEY;
}

function mkReq(body) {
	const req = {
		method: 'POST',
		url: '/api/agents/a1/embed',
		headers: { 'content-type': 'application/json' },
		on(event, cb) {
			if (event === 'data') {
				queueMicrotask(() => {
					cb(Buffer.from(JSON.stringify(body)));
					this._endCb?.();
				});
			} else if (event === 'end') {
				this._endCb = cb;
			}
		},
		destroy() {},
	};
	return req;
}

function mkRes() {
	return {
		statusCode: 200,
		headers: {},
		body: '',
		setHeader(k, v) {
			this.headers[k.toLowerCase()] = v;
		},
		getHeader(k) {
			return this.headers[k.toLowerCase()];
		},
		end(chunk) {
			if (chunk !== undefined) this.body += String(chunk);
			this.writableEnded = true;
		},
	};
}

const VECTOR = Array.from({ length: 4 }, (_, i) => i / 10);
const okEmbedding = () => ({
	ok: true,
	status: 200,
	json: async () => ({ data: [{ embedding: VECTOR }] }),
	text: async () => '',
});
const errResp = (status) => ({ ok: false, status, json: async () => ({}), text: async () => 'boom' });

beforeEach(() => {
	clearKeys();
	getSessionUserMock.mockResolvedValue({ id: 'u1' });
	sqlMock.mockResolvedValue([{ id: 'a1' }]); // caller owns the agent
});
afterEach(() => {
	vi.restoreAllMocks();
	clearKeys();
});

async function invoke(body = { text: 'hello memory' }) {
	const res = mkRes();
	await handleEmbed(mkReq(body), res, 'a1');
	return { res, json: res.body ? JSON.parse(res.body) : null };
}

describe('POST /api/agents/:id/embed — free-first provider chain', () => {
	it('serves from the free NVIDIA lane when both keys are set', async () => {
		process.env.NVIDIA_API_KEY = 'nvapi-x';
		process.env.VOYAGE_API_KEY = 'pa-paid';
		const calls = [];
		globalThis.fetch = vi.fn(async (url) => {
			calls.push(String(url));
			return okEmbedding();
		});
		const { res, json } = await invoke();
		expect(res.statusCode).toBe(200);
		expect(json.embedding).toEqual(VECTOR);
		expect(json.provider).toBe('nvidia');
		expect(json.model).toBe('baai/bge-m3');
		// Paid Voyage was never touched while the free lane could serve.
		expect(calls).toHaveLength(1);
		expect(calls[0]).toContain('integrate.api.nvidia.com');
	});

	it('falls back to Voyage when NVIDIA errors', async () => {
		process.env.NVIDIA_API_KEY = 'nvapi-x';
		process.env.VOYAGE_API_KEY = 'pa-paid';
		globalThis.fetch = vi.fn(async (url) =>
			String(url).includes('integrate.api.nvidia.com') ? errResp(429) : okEmbedding(),
		);
		const { res, json } = await invoke();
		expect(res.statusCode).toBe(200);
		expect(json.provider).toBe('voyage');
		expect(json.model).toBe('voyage-3-lite');
	});

	it('returns a designed 503 (not a crash) when no embedding key is configured', async () => {
		globalThis.fetch = vi.fn(async () => {
			throw new Error('must not be called');
		});
		const { res, json } = await invoke();
		expect(res.statusCode).toBe(503);
		expect(json.error).toBe('not_configured');
		expect(globalThis.fetch).not.toHaveBeenCalled();
	});

	it('returns 502 with the last upstream status when every provider fails', async () => {
		process.env.NVIDIA_API_KEY = 'nvapi-x';
		process.env.VOYAGE_API_KEY = 'pa-paid';
		globalThis.fetch = vi.fn(async () => errResp(500));
		const { res, json } = await invoke();
		expect(res.statusCode).toBe(502);
		expect(json.error).toBe('upstream_error');
		expect(globalThis.fetch).toHaveBeenCalledTimes(2); // both lanes tried
	});

	it('still validates input before touching any provider', async () => {
		process.env.NVIDIA_API_KEY = 'nvapi-x';
		globalThis.fetch = vi.fn();
		const { res } = await invoke({ text: '' });
		expect(res.statusCode).toBe(400);
		expect(globalThis.fetch).not.toHaveBeenCalled();
	});
});

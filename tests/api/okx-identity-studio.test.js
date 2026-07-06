/**
 * Agent Identity Studio — the OKX.AI flagship A2MCP service
 * (/api/okx/3d/identity-studio, engine in api/_okx3d/identity.js, catalog row
 * in api/_lib/okx-catalog.js).
 *
 * Covers the catalog contract, the per-tool 402 pricing, the free lanes
 * (catalog/health/identity_status), the pipeline state machine over mocked
 * three.ws HTTP surfaces, and the honest edge cases the work order names:
 * Chinese brief, over-long brief (flagged truncation), and an unreachable
 * reference image failing BEFORE any payment settles.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Readable } from 'node:stream';

process.env.PUBLIC_APP_ORIGIN = 'https://three.ws';
process.env.X402_PAY_TO_BASE ||= '0x0000000000000000000000000000000000000001';
process.env.X402_ASSET_ADDRESS_BASE ||= '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
process.env.JWT_SECRET ||= 'okx-identity-test-secret';

vi.mock('../../api/_lib/auth.js', () => ({
	extractBearer: () => null,
	authenticateBearer: vi.fn(async () => null),
	hasScope: () => true,
}));

vi.mock('../../api/_lib/rate-limit.js', () => ({
	limits: {
		mcpIp: vi.fn(async () => ({ success: true, reset: Date.now() + 1000 })),
		mcpUser: vi.fn(async () => ({ success: true, reset: Date.now() + 1000 })),
	},
	clientIp: vi.fn(() => '203.0.113.9'),
}));

vi.mock('../../api/_lib/usage.js', () => ({
	recordEvent: vi.fn(),
	logger: () => ({ info: () => {}, warn: () => {}, error: () => {} }),
}));

// In-memory R2 so job state round-trips without creds.
const r2Store = new Map();
vi.mock('../../api/_lib/r2.js', () => ({
	putObject: vi.fn(async ({ key, body }) => {
		r2Store.set(key, Buffer.isBuffer(body) ? body : Buffer.from(body));
	}),
	getObjectBuffer: vi.fn(async (key) => {
		if (!r2Store.has(key)) throw new Error('NoSuchKey');
		return r2Store.get(key);
	}),
	headObject: vi.fn(async (key) => {
		if (!r2Store.has(key)) throw new Error('NotFound');
		return { ContentLength: r2Store.get(key).length };
	}),
	publicUrl: (key) => `https://cdn.test/${key}`,
}));

// Reference-image validation calls the real SSRF guard's public-URL check —
// stub it to a pass-through so tests control reachability via fetch alone.
vi.mock('../../api/_lib/ssrf-guard.js', () => ({
	assertSafePublicUrl: vi.fn(async () => {}),
	SsrfBlockedError: class SsrfBlockedError extends Error {},
}));

// The pipeline is a pure HTTP client over three.ws surfaces — mock global
// fetch with a tiny programmable router.
const fetchRoutes = { chat: null, forgeSubmit: null, forgePoll: null, rig: null, render: null, ref: null };
function jsonResponse(status, body) {
	return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}
const realFetch = globalThis.fetch;
beforeEach(() => {
	r2Store.clear();
	fetchRoutes.chat = () => new Response(null, { status: 503 }); // director down → fallback template
	fetchRoutes.forgeSubmit = () => jsonResponse(200, { job_id: 'forge-gen-1', status: 'queued', eta: 30 });
	fetchRoutes.forgePoll = () => jsonResponse(200, { status: 'running' });
	fetchRoutes.rig = () => jsonResponse(200, { job_id: 'forge-rig-1', status: 'queued' });
	fetchRoutes.render = () => new Response(new Uint8Array(PNG_1x1), { status: 200 });
	fetchRoutes.ref = () => new Response(new Uint8Array([0xff]), { status: 206, headers: { 'content-type': 'image/png' } });
	globalThis.fetch = vi.fn(async (url, init = {}) => {
		const u = String(url);
		if (u.includes('/api/chat')) return fetchRoutes.chat(u, init);
		if (u.includes('/api/forge?action=rig')) return fetchRoutes.rig(u, init);
		if (u.includes('/api/forge?job=')) return fetchRoutes.forgePoll(u, init);
		if (u.includes('/api/forge')) return fetchRoutes.forgeSubmit(u, init);
		if (u.includes('/api/render/avatar-clip')) return fetchRoutes.render(u, init);
		return fetchRoutes.ref(u, init);
	});
	return () => {
		globalThis.fetch = realFetch;
	};
});

// Minimal valid 1×1 transparent PNG (for sharp to composite in render tests).
const PNG_1x1 = Buffer.from(
	'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
	'base64',
);

const { OKX_CATALOG, validateCatalog, catalogIndex, displayWidth, DESCRIPTION_MAX_WIDTH } =
	await import('../../api/_lib/okx-catalog.js');
const tools = await import('../../api/_okx3d/tools.js');
const identity = await import('../../api/_okx3d/identity.js');
const { default: handler } = await import('../../api/okx/3d/[service].js');

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

function makeReq({ method = 'POST', service = 'identity-studio', headers = {}, body = null } = {}) {
	const payload = body == null ? '' : JSON.stringify(body);
	const req = Readable.from(payload ? [Buffer.from(payload, 'utf8')] : []);
	req.method = method;
	req.url = `/api/okx/3d/${service}`;
	req.query = { service };
	req.headers = {
		'content-type': 'application/json',
		'x-forwarded-for': '203.0.113.9',
		...headers,
	};
	return req;
}

const anonAuth = { userId: null, rateKey: null, scope: '', source: 'free' };
async function call(name, args) {
	return tools.dispatch(
		{ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } },
		anonAuth,
		{ headers: {} },
	);
}

describe('okx catalog module', () => {
	it('validates: every entry well-formed, prices consistent, descriptions within OKX display width', () => {
		expect(validateCatalog()).toBe(true);
		for (const e of OKX_CATALOG) {
			expect(displayWidth(e.describes.capability)).toBeLessThanOrEqual(DESCRIPTION_MAX_WIDTH);
			expect(displayWidth(e.describes.input)).toBeLessThanOrEqual(DESCRIPTION_MAX_WIDTH);
		}
	});

	it('counts East-Asian wide glyphs as 2 (the OKX listing rule)', () => {
		expect(displayWidth('abc')).toBe(3);
		expect(displayWidth('中文字')).toBe(6);
		expect(displayWidth('a中b')).toBe(4);
	});

	it('prices identity-studio at $1.50 = 1500000 atomics, and the index mirrors the catalog 1:1', () => {
		const row = OKX_CATALOG.find((e) => e.id === 'identity-studio');
		expect(row.amountAtomics).toBe('1500000');
		expect(tools.identityX402Amount('create_identity')).toBe('1500000');
		expect(tools.identityX402Amount('identity_status')).toBe(null);
		expect(tools.identityX402Amount('getting_started')).toBe(null);
		const index = catalogIndex();
		expect(index.services.map((s) => s.id)).toEqual(OKX_CATALOG.map((e) => e.id));
		expect(index.services.find((s) => s.id === 'identity-studio').price_usd).toBe('1.50');
	});
});

describe('free lanes over HTTP', () => {
	it('GET /catalog returns the index with no payment', async () => {
		const res = makeRes();
		await handler(makeReq({ method: 'GET', service: 'catalog' }), res);
		expect(res.statusCode).toBe(200);
		const body = JSON.parse(res.body);
		expect(body.okxAgentId).toBe(2632);
		expect(body.services.length).toBe(OKX_CATALOG.length);
	});

	it('GET /health runs real probes and reports per-subsystem status', async () => {
		fetchRoutes.forgeSubmit = () => jsonResponse(200, { tiers: [] });
		fetchRoutes.render = () => jsonResponse(200, { poses: [{ id: 'tpose' }] });
		const res = makeRes();
		await handler(makeReq({ method: 'GET', service: 'health' }), res);
		expect(res.statusCode).toBe(200);
		const body = JSON.parse(res.body);
		expect(body.ok).toBe(true);
		expect(body.subsystems.map((s) => s.name).sort()).toEqual(['generation', 'render', 'storage']);
	});

	it('GET /health goes 503 when a subsystem is down — never a hardcoded ok', async () => {
		fetchRoutes.render = () => new Response(null, { status: 500 });
		fetchRoutes.forgeSubmit = () => jsonResponse(200, { tiers: [] });
		const res = makeRes();
		await handler(makeReq({ method: 'GET', service: 'health' }), res);
		expect(res.statusCode).toBe(503);
		expect(JSON.parse(res.body).ok).toBe(false);
	});

	it('unknown service 404s with the service index', async () => {
		const res = makeRes();
		await handler(makeReq({ method: 'GET', service: 'nope' }), res);
		expect(res.statusCode).toBe(404);
		expect(JSON.parse(res.body).services.length).toBeGreaterThan(0);
	});
});

describe('402 challenge and pricing', () => {
	it('unpaid create_identity gets a 402 advertising exactly $1.50', async () => {
		const res = makeRes();
		await handler(
			makeReq({
				body: {
					jsonrpc: '2.0',
					id: 1,
					method: 'tools/call',
					params: { name: 'create_identity', arguments: { agent_name: 'X', brief: 'a data agent' } },
				},
			}),
			res,
		);
		expect(res.statusCode).toBe(402);
		const challenge = JSON.parse(res.body);
		expect(challenge.accepts.length).toBeGreaterThan(0);
		for (const a of challenge.accepts) {
			expect(a.maxAmountRequired ?? a.amount ?? a.maxAmount).toBe('1500000');
		}
		expect(JSON.stringify(challenge)).toContain('identity-studio');
	});

	it('identity_status is free — served anonymously, no 402', async () => {
		const res = makeRes();
		await handler(
			makeReq({
				body: {
					jsonrpc: '2.0',
					id: 2,
					method: 'tools/call',
					params: { name: 'identity_status', arguments: { job_id: 'garbage' } },
				},
			}),
			res,
		);
		expect(res.statusCode).toBe(200);
		const rpc = JSON.parse(res.body);
		expect(rpc.result.isError).toBe(true); // invalid token — but no payment demanded
		expect(rpc.result.structuredContent.error).toBe('invalid_job_id');
	});

	it('getting_started lists both tools with the paid price', async () => {
		const rpc = await call('getting_started', {});
		const text = JSON.stringify(rpc.result.structuredContent);
		expect(text).toContain('create_identity');
		expect(text).toContain('identity_status');
		expect(text).toContain('1.5');
	});
});

describe('pipeline state machine', () => {
	it('create → generate → rig → renders → done, with real deliverable shapes', async () => {
		const created = await call('create_identity', {
			agent_name: 'LedgerLynx',
			brief: 'a meticulous on-chain accounting agent, calm and precise',
		});
		expect(created.result.isError).toBeUndefined();
		const jobId = created.result.structuredContent.job_id;
		expect(jobId).toMatch(/^f1\./);

		// generation still running
		let s = await call('identity_status', { job_id: jobId });
		expect(s.result.structuredContent.status).toBe('running');
		expect(s.result.structuredContent.stage).toBe('generate');

		// generation done → same poll submits the rig
		fetchRoutes.forgePoll = () => jsonResponse(200, { status: 'done', glb_url: 'https://cdn.test/mesh.glb' });
		s = await call('identity_status', { job_id: jobId });
		expect(s.result.structuredContent.stage).toBe('rig');

		// rig done → render stage, one render per poll
		fetchRoutes.forgePoll = () => jsonResponse(200, { status: 'done', glb_url: 'https://cdn.test/rigged.glb' });
		s = await call('identity_status', { job_id: jobId });
		expect(s.result.structuredContent.stage).toBe('render');

		let last;
		for (let i = 0; i < 8 && (!last || last.status !== 'done'); i++) {
			const r = await call('identity_status', { job_id: jobId });
			last = r.result.structuredContent;
		}
		expect(last.status).toBe('done');
		const d = last.deliverables;
		expect(d.pfp.url).toContain('okx-identity/renders/');
		expect(d.pfp.preview_128_url).toContain('pfp-128');
		expect(d.full_body.length).toBe(3);
		expect(new Set(d.full_body.map((f) => f.pose)).size).toBe(3);
		expect(d.rigged_glb_url).toBe('https://cdn.test/rigged.glb');
		expect(d.viewer_url).toContain('/viewer?src=');
	}, 30_000);

	it('generation failure retries free, then fails honestly when attempts exhaust', async () => {
		const created = await call('create_identity', { agent_name: 'X', brief: 'test agent brief' });
		const jobId = created.result.structuredContent.job_id;
		fetchRoutes.forgePoll = () => jsonResponse(200, { status: 'failed', error: 'lane exploded' });
		// attempt 1 failed → resubmit (attempts 2), poll fails again → resubmit (3), fail → terminal
		let s;
		for (let i = 0; i < 4; i++) s = await call('identity_status', { job_id: jobId });
		expect(s.result.structuredContent.status).toBe('failed');
		expect(s.result.isError).toBe(true);
		expect(s.result.structuredContent.last_error.message).toContain('lane exploded');
	});

	it('a Chinese brief is accepted and reaches the prompt director verbatim', async () => {
		let directorSaw = null;
		fetchRoutes.chat = (u, init) => {
			directorSaw = JSON.parse(init.body).message;
			return new Response(null, { status: 503 });
		};
		const brief = '一个冷静精准的链上会计智能体，喜欢深蓝色';
		const created = await call('create_identity', { agent_name: '账本猞猁', brief });
		expect(created.result.isError).toBeUndefined();
		expect(directorSaw).toContain(brief);
		expect(directorSaw).toContain('ALWAYS write the prompt in English');
		// Fallback template still embeds the brief when the director is down.
		expect(created.result.structuredContent.brief_truncated).toBe(false);
	});

	it('an absurdly long brief is truncated and flagged, not silently mangled', async () => {
		const created = await call('create_identity', {
			agent_name: 'X',
			brief: 'A'.repeat(3999),
		});
		expect(created.result.isError).toBeUndefined();
		expect(created.result.structuredContent.brief_truncated).toBe(true);
		expect(created.result.structuredContent.note).toContain('truncated');
	});

	it('unreachable reference image fails with an actionable error BEFORE any work or charge', async () => {
		fetchRoutes.ref = () => new Response(null, { status: 404 });
		let forgeCalled = false;
		const origSubmit = fetchRoutes.forgeSubmit;
		fetchRoutes.forgeSubmit = (...a) => {
			forgeCalled = true;
			return origSubmit(...a);
		};
		const created = await call('create_identity', {
			agent_name: 'X',
			brief: 'test agent brief',
			reference_image_url: 'https://img.test/missing.png',
		});
		expect(created.result.isError).toBe(true);
		expect(created.result.structuredContent.error).toBe('reference_image_unreachable');
		expect(created.result.structuredContent.message).toContain('Nothing was charged');
		expect(forgeCalled).toBe(false);
	});

	it('non-image reference URL is rejected with a distinct actionable error', async () => {
		fetchRoutes.ref = () =>
			new Response('<html>', { status: 200, headers: { 'content-type': 'text/html' } });
		const created = await call('create_identity', {
			agent_name: 'X',
			brief: 'test agent brief',
			reference_image_url: 'https://img.test/page.html',
		});
		expect(created.result.isError).toBe(true);
		expect(created.result.structuredContent.error).toBe('reference_image_invalid');
	});

	it('render plan is deterministic per job, PFP pose pinned, full-body poses distinct', () => {
		const a = identity.buildRenderPlan('job-a');
		const b = identity.buildRenderPlan('job-a');
		const c = identity.buildRenderPlan('job-c');
		expect(a).toEqual(b);
		expect(a[0]).toMatchObject({ kind: 'pfp', pose: 'contrapposto' });
		expect(a.filter((s) => s.kind === 'fullbody').length).toBe(3);
		expect(new Set(a.map((s) => s.pose)).size).toBe(a.length);
		expect(JSON.stringify(a) === JSON.stringify(c) && JSON.stringify(a.slice(1)) === JSON.stringify(c.slice(1))).toBe(
			JSON.stringify(a.slice(1)) === JSON.stringify(c.slice(1)),
		);
	});

	it('job tokens from other providers are rejected', async () => {
		const { encodeJobToken } = await import('../../api/_lib/forge-job-token.js');
		const foreign = encodeJobToken({ provider: 'gcp', kind: 'reconstruct', taskId: 'abc' });
		const s = await call('identity_status', { job_id: foreign });
		expect(s.result.structuredContent.error).toBe('invalid_job_id');
	});
});

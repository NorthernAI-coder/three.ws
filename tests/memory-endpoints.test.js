import { describe, it, expect, vi, beforeEach } from 'vitest';

const sqlMock = vi.fn();
vi.mock('../api/_lib/db.js', () => ({ sql: sqlMock }));

const getSessionUserMock = vi.fn();
const authenticateBearerMock = vi.fn();
const extractBearerMock = vi.fn();
vi.mock('../api/_lib/auth.js', () => ({
	getSessionUser: (...a) => getSessionUserMock(...a),
	authenticateBearer: (...a) => authenticateBearerMock(...a),
	extractBearer: (...a) => extractBearerMock(...a),
}));

vi.mock('../api/_lib/csrf.js', () => ({ requireCsrf: vi.fn(async () => true) }));
vi.mock('../api/_lib/env.js', () => ({ env: { APP_ORIGIN: 'http://localhost:3000', ISSUER: 'http://t', MCP_RESOURCE: 'http://t' } }));

const searchMemories = vi.fn();
const computeContext = vi.fn();
const buildGraph = vi.fn();
const memoriesForEntity = vi.fn();
vi.mock('../api/_lib/memory-store.js', () => ({
	searchMemories: (...a) => searchMemories(...a),
	computeContext: (...a) => computeContext(...a),
	buildGraph: (...a) => buildGraph(...a),
	memoriesForEntity: (...a) => memoriesForEntity(...a),
	decorateMemory: (row) => ({ id: row.id, tier: row.tier, pinned: row.pinned }),
	MEMORY_TIERS: ['working', 'recall', 'archival'],
	WORKING_TOKEN_BUDGET: 2000,
}));

const { default: searchHandler } = await import('../api/memory/search.js');
const { default: curateHandler } = await import('../api/memory/curate.js');
const { default: graphHandler } = await import('../api/memory/graph.js');

function mkReq({ method = 'GET', url = '/api/memory/search', headers = {}, body = null } = {}) {
	return {
		method, url, headers: { ...headers },
		on(event, cb) {
			if (event === 'data' && body != null) {
				const buf = Buffer.from(typeof body === 'string' ? body : JSON.stringify(body));
				queueMicrotask(() => { cb(buf); this._endCb?.(); });
			} else if (event === 'end') this._endCb = cb;
		},
		destroy() {},
	};
}
function mkRes() {
	return {
		statusCode: 200, headers: {}, body: undefined, writableEnded: false,
		setHeader(k, v) { this.headers[k.toLowerCase()] = v; },
		end(b) { this.body = b; this.writableEnded = true; },
	};
}
const parse = (res) => (res.body ? JSON.parse(res.body) : undefined);

let sqlQueue = [];
beforeEach(() => {
	sqlQueue = [];
	sqlMock.mockReset().mockImplementation(() => Promise.resolve(sqlQueue.length ? sqlQueue.shift() : []));
	getSessionUserMock.mockReset().mockResolvedValue(null);
	authenticateBearerMock.mockReset().mockResolvedValue(null);
	extractBearerMock.mockReset().mockReturnValue(null);
	searchMemories.mockReset().mockResolvedValue({ results: [], provider: true, scored: 0 });
	computeContext.mockReset();
	buildGraph.mockReset().mockResolvedValue({ nodes: [], edges: [], stats: { entities: 0, edges: 0 } });
	memoriesForEntity.mockReset().mockResolvedValue([]);
});

describe('GET /api/memory/search', () => {
	it('anonymous → empty results, never searches', async () => {
		const res = mkRes();
		await searchHandler(mkReq({ url: '/api/memory/search?agentId=a1&q=hi' }), res);
		expect(res.statusCode).toBe(200);
		expect(parse(res)).toEqual({ results: [] });
		expect(searchMemories).not.toHaveBeenCalled();
	});

	it('400 without agentId', async () => {
		const res = mkRes();
		await searchHandler(mkReq({ url: '/api/memory/search?q=hi' }), res);
		expect(res.statusCode).toBe(400);
	});

	it('owner GET searches and returns results', async () => {
		getSessionUserMock.mockResolvedValue({ id: 'u1' });
		sqlQueue.push([{ user_id: 'u1' }]); // ownership
		searchMemories.mockResolvedValue({ results: [{ id: 'm1', match: 'semantic' }], provider: true, scored: 1 });
		const res = mkRes();
		await searchHandler(mkReq({ url: '/api/memory/search?agentId=a1&q=sell' }), res);
		expect(res.statusCode).toBe(200);
		expect(parse(res).results).toHaveLength(1);
		expect(searchMemories).toHaveBeenCalledWith('a1', 'sell', expect.any(Object));
	});

	it('non-owner GET → empty', async () => {
		getSessionUserMock.mockResolvedValue({ id: 'u1' });
		sqlQueue.push([{ user_id: 'someone-else' }]);
		const res = mkRes();
		await searchHandler(mkReq({ url: '/api/memory/search?agentId=a1&q=x' }), res);
		expect(parse(res)).toEqual({ results: [] });
	});
});

describe('POST /api/memory/curate', () => {
	beforeEach(() => getSessionUserMock.mockResolvedValue({ id: 'u1' }));

	it('401 without auth', async () => {
		getSessionUserMock.mockResolvedValue(null);
		const res = mkRes();
		await curateHandler(mkReq({ method: 'POST', headers: { 'content-type': 'application/json' }, body: { agentId: 'a1', op: 'pin', memoryId: 'm1' } }), res);
		expect(res.statusCode).toBe(401);
	});

	it('403 when not owner', async () => {
		sqlQueue.push([{ user_id: 'other' }]);
		const res = mkRes();
		await curateHandler(mkReq({ method: 'POST', headers: { 'content-type': 'application/json' }, body: { agentId: 'a1', op: 'pin', memoryId: 'm1' } }), res);
		expect(res.statusCode).toBe(403);
	});

	it('pin updates the memory and returns the entry', async () => {
		sqlQueue.push([{ user_id: 'u1' }]); // ownership
		sqlQueue.push([{ id: 'm1', tier: 'working', pinned: true }]); // update
		const res = mkRes();
		await curateHandler(mkReq({ method: 'POST', headers: { 'content-type': 'application/json' }, body: { agentId: 'a1', op: 'pin', memoryId: 'm1' } }), res);
		expect(res.statusCode).toBe(200);
		expect(parse(res).entry).toMatchObject({ id: 'm1', pinned: true });
	});

	it('rejects an invalid tier', async () => {
		sqlQueue.push([{ user_id: 'u1' }]);
		const res = mkRes();
		await curateHandler(mkReq({ method: 'POST', headers: { 'content-type': 'application/json' }, body: { agentId: 'a1', op: 'tier', memoryId: 'm1', tier: 'bogus' } }), res);
		expect(res.statusCode).toBe(400);
	});

	it('merge needs at least two ids', async () => {
		sqlQueue.push([{ user_id: 'u1' }]);
		const res = mkRes();
		await curateHandler(mkReq({ method: 'POST', headers: { 'content-type': 'application/json' }, body: { agentId: 'a1', op: 'merge', memoryIds: ['only-one'] } }), res);
		expect(res.statusCode).toBe(400);
	});

	it('forget deletes the memory', async () => {
		sqlQueue.push([{ user_id: 'u1' }]);   // ownership
		sqlQueue.push([{ id: 'm1' }]);          // delete returning
		const res = mkRes();
		await curateHandler(mkReq({ method: 'POST', headers: { 'content-type': 'application/json' }, body: { agentId: 'a1', op: 'forget', memoryId: 'm1' } }), res);
		expect(res.statusCode).toBe(200);
		expect(parse(res)).toMatchObject({ ok: true, forgot: 'm1' });
	});
});

describe('GET /api/memory/graph', () => {
	it('owner gets the graph', async () => {
		getSessionUserMock.mockResolvedValue({ id: 'u1' });
		sqlQueue.push([{ user_id: 'u1' }]);
		buildGraph.mockResolvedValue({ nodes: [{ id: 'e1' }], edges: [], stats: { entities: 1, edges: 0 } });
		const res = mkRes();
		await graphHandler(mkReq({ url: '/api/memory/graph?agentId=a1' }), res);
		expect(res.statusCode).toBe(200);
		expect(parse(res).nodes).toHaveLength(1);
	});

	it('entity drilldown returns memories', async () => {
		getSessionUserMock.mockResolvedValue({ id: 'u1' });
		sqlQueue.push([{ user_id: 'u1' }]);
		memoriesForEntity.mockResolvedValue([{ id: 'm1' }]);
		const res = mkRes();
		await graphHandler(mkReq({ url: '/api/memory/graph?agentId=a1&entityId=e1' }), res);
		expect(parse(res).memories).toHaveLength(1);
		expect(memoriesForEntity).toHaveBeenCalledWith('a1', 'e1');
	});
});

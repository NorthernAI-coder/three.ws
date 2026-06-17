// POST/GET/PATCH /api/irl/interactions — C4 interaction log + inbox + reply.
//
// This is the IRL feedback loop: a passer-by's view/tap/message/pay is logged
// against a placed pin, the owner reads it back from their dashboard inbox, and
// the owner can reply to a visitor's message. The server is the trust boundary —
// owner/agent are resolved from the pin (never the caller), a `pay` is only
// recorded with a real settlement signature + a $THREE/USDC mint, and an owner
// reply must NOT notify the owner (it notifies the visitor instead). These tests
// pin that boundary down. DB / auth / limiter / notify are mocked so the suite
// stays offline.

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Content-addressed SQL mock: classify each tagged-template query by its text so
// ensureTable() DDL, the pin lookup, the two de-dupe SELECTs, the reply lookup,
// and the INSERT each return the right shape regardless of call order. The INSERT
// echoes a row and records its bound values so success-path assertions can check
// the persisted payload (from='owner') and seen_at.
let pinRow = null;
let viewDupeRow = null;   // row returned by the same-device view de-dupe SELECT
let paySigDupeRow = null; // row returned by the pay-signature de-dupe SELECT
let replyOrigRow = null;  // row returned by the owner-reply origin lookup
let lastInsert = null;    // { values } of the most recent irl_interactions INSERT

const sqlMock = vi.fn((strings, ...values) => {
	const q = Array.isArray(strings) ? strings.join(' ') : String(strings);
	if (/FROM irl_pins[\s\S]*WHERE id =/i.test(q)) {
		return Promise.resolve(pinRow ? [pinRow] : []);
	}
	if (/SELECT id FROM irl_interactions[\s\S]*type = 'view'/i.test(q)) {
		return Promise.resolve(viewDupeRow ? [viewDupeRow] : []);
	}
	if (/type = 'pay' AND payload->>'signature'/i.test(q)) {
		return Promise.resolve(paySigDupeRow ? [paySigDupeRow] : []);
	}
	if (/SELECT[\s\S]*viewer_user_id FROM irl_interactions/i.test(q)) {
		return Promise.resolve(replyOrigRow ? [replyOrigRow] : []);
	}
	if (/INSERT INTO irl_interactions/i.test(q)) {
		lastInsert = { values };
		// RETURNING id, type, created_at — values[2] is `type`.
		return Promise.resolve([{ id: 'ix-new', type: values[2], created_at: '2026-06-17T00:00:00Z' }]);
	}
	// CREATE TABLE / ALTER TABLE / CREATE INDEX from ensureTable(), the view_count
	// UPDATE, and anything else.
	return Promise.resolve([]);
});
vi.mock('../../api/_lib/db.js', () => ({ sql: (...a) => sqlMock(...a) }));

let sessionUser = null;
vi.mock('../../api/_lib/auth.js', () => ({
	getSessionUser: vi.fn(async () => sessionUser),
}));

vi.mock('../../api/_lib/rate-limit.js', () => ({
	limits: { irlInteractIp: vi.fn(async () => ({ success: true })) },
	clientIp: () => '127.0.0.1',
}));

const notifyMock = vi.fn();
vi.mock('../../api/_lib/notify.js', () => ({
	insertNotification: (...a) => notifyMock(...a),
}));

const alertMock = vi.fn();
vi.mock('../../api/_lib/alerts.js', () => ({
	sendOpsAlert: (...a) => alertMock(...a),
}));

const { default: handler } = await import('../../api/irl/interactions.js');

// A real Solana settlement signature (base58, 43–88 chars) and the $THREE mint —
// the only signature/mint a `pay` row is allowed to carry.
const SOL_SIG = '5'.repeat(64);
const THREE_MINT = 'FeMbDoX7R1Psc4GEcvJdsbNbZA3bfztcyDCatJVJpump';

function makeRes() {
	return {
		statusCode: 200,
		_h: {},
		headersSent: false,
		writableEnded: false,
		setHeader(k, v) { this._h[k.toLowerCase()] = v; },
		getHeader(k) { return this._h[k.toLowerCase()]; },
		end(body) { this.writableEnded = true; this._body = body; },
	};
}
async function call(method, { body, query } = {}) {
	const res = makeRes();
	await handler({ url: '/api/irl/interactions', method, headers: { host: 'x' }, query: query || {}, body }, res);
	let parsed = null;
	try { parsed = JSON.parse(res._body); } catch { /* non-JSON body */ }
	return { res, body: parsed };
}
const post = (body) => call('POST', { body });

function insertedPayload() {
	// INSERT columns: pin_id, agent_id, type, message, viewer_user_id, viewer_device,
	// lat, lng, amount, currency_mint, payload(JSON), seen_at.
	return lastInsert ? JSON.parse(lastInsert.values[10]) : null;
}
const insertedSeenAt = () => (lastInsert ? lastInsert.values[11] : undefined);

beforeEach(() => {
	sqlMock.mockClear();
	notifyMock.mockClear();
	alertMock.mockClear();
	lastInsert = null;
	viewDupeRow = null;
	paySigDupeRow = null;
	replyOrigRow = null;
	sessionUser = null;
	pinRow = {
		id: 'pin-1',
		agent_id: 'agent-1',
		lat: 40.7128,
		lng: -74.006,
		user_id: 'owner-uuid',
		device_token: null,
	};
});

describe('POST — validation + ownership resolution', () => {
	it('400s without a pinId', async () => {
		const { res } = await post({ type: 'view' });
		expect(res.statusCode).toBe(400);
	});

	it('404s when the pin is missing / expired / hidden', async () => {
		pinRow = null;
		const { res, body } = await post({ pinId: 'gone', type: 'tap' });
		expect(res.statusCode).toBe(404);
		expect(body.error).toMatch(/not found/i);
	});

	it('logs a tap and never trusts a caller-supplied owner — uses the pin', async () => {
		const { res } = await post({ pinId: 'pin-1', type: 'tap', deviceToken: 'dev-A' });
		expect(res.statusCode).toBe(201);
		// agent_id taken from the pin (values[1]), not the body.
		expect(lastInsert.values[1]).toBe('agent-1');
	});
});

describe('POST — view de-dupe', () => {
	it('collapses a repeat view from the same device within the window', async () => {
		viewDupeRow = { id: 'ix-existing' };
		const { res, body } = await post({ pinId: 'pin-1', type: 'view', deviceToken: 'dev-A' });
		expect(res.statusCode).toBe(200);
		expect(body.deduped).toBe(true);
		expect(lastInsert).toBeNull(); // no new row written
	});

	it("doesn't log the owner viewing their own pin", async () => {
		sessionUser = { id: 'owner-uuid' };
		const { res, body } = await post({ pinId: 'pin-1', type: 'view' });
		expect(res.statusCode).toBe(200);
		expect(body.self).toBe(true);
		expect(lastInsert).toBeNull();
	});
});

describe('POST — pay is only recorded with a verified settlement', () => {
	it('400s a pay with no signature', async () => {
		const { res, body } = await post({ pinId: 'pin-1', type: 'pay', amount: 50000, currencyMint: THREE_MINT });
		expect(res.statusCode).toBe(400);
		expect(body.error).toMatch(/signature/i);
		expect(lastInsert).toBeNull();
	});

	it('400s a pay whose mint is neither $THREE nor USDC', async () => {
		const { res, body } = await post({
			pinId: 'pin-1', type: 'pay', amount: 50000,
			currencyMint: 'SomeOtherMint1111111111111111111111111111111', signature: SOL_SIG,
		});
		expect(res.statusCode).toBe(400);
		expect(body.error).toMatch(/\$THREE or USDC/i);
		expect(lastInsert).toBeNull();
	});

	it('records a verified $THREE pay and notifies the owner + ops', async () => {
		const { res } = await post({
			pinId: 'pin-1', type: 'pay', amount: 50000, currencyMint: THREE_MINT, signature: SOL_SIG,
		});
		expect(res.statusCode).toBe(201);
		expect(insertedPayload().signature).toBe(SOL_SIG);
		expect(notifyMock).toHaveBeenCalledWith('owner-uuid', 'irl_interaction', expect.objectContaining({ kind: 'pay' }));
		expect(alertMock).toHaveBeenCalled();
	});

	it('de-dupes a pay by signature (one settlement → one row)', async () => {
		paySigDupeRow = { id: 'ix-paid' };
		const { res, body } = await post({
			pinId: 'pin-1', type: 'pay', amount: 50000, currencyMint: THREE_MINT, signature: SOL_SIG,
		});
		expect(res.statusCode).toBe(200);
		expect(body.deduped).toBe(true);
		expect(lastInsert).toBeNull();
	});
});

describe('POST — messages + owner replies', () => {
	it('a visitor message notifies the owner', async () => {
		const { res } = await post({ pinId: 'pin-1', type: 'message', message: 'is this the meetup?', deviceToken: 'dev-A' });
		expect(res.statusCode).toBe(201);
		expect(notifyMock).toHaveBeenCalledWith('owner-uuid', 'irl_interaction', expect.objectContaining({ kind: 'message' }));
		// not an owner reply → no from:'owner' stamp, stays unread (seen_at null).
		expect(insertedPayload().from).toBeUndefined();
		expect(insertedSeenAt()).toBeNull();
	});

	it("a visitor can't forge an owner reply via payload.from", async () => {
		const { res } = await post({
			pinId: 'pin-1', type: 'message', message: 'totally the owner', deviceToken: 'dev-A',
			payload: { from: 'owner' },
		});
		expect(res.statusCode).toBe(201);
		expect(insertedPayload().from).toBeUndefined(); // server stripped it
		expect(notifyMock).toHaveBeenCalledWith('owner-uuid', 'irl_interaction', expect.anything());
	});

	it('an authenticated owner message is a reply: from=owner, auto-seen, owner NOT notified', async () => {
		sessionUser = { id: 'owner-uuid' };
		replyOrigRow = { viewer_user_id: 'visitor-uuid' };
		const { res, body } = await post({
			pinId: 'pin-1', type: 'message', message: 'yes! see you there',
			replyTo: '11111111-1111-1111-1111-111111111111',
		});
		expect(res.statusCode).toBe(201);
		expect(insertedPayload().from).toBe('owner');
		expect(insertedSeenAt()).not.toBeNull();         // authored → already seen
		// The owner is never self-notified; the signed-in visitor is.
		expect(notifyMock).not.toHaveBeenCalledWith('owner-uuid', expect.anything(), expect.anything());
		expect(notifyMock).toHaveBeenCalledWith('visitor-uuid', 'irl_reply', expect.objectContaining({ pin_id: 'pin-1' }));
		expect(body.notified).toBe(true);
	});

	it('an owner reply to an anonymous visitor records but reports notified:false', async () => {
		sessionUser = { id: 'owner-uuid' };
		replyOrigRow = { viewer_user_id: null }; // visitor was anonymous
		const { res, body } = await post({
			pinId: 'pin-1', type: 'message', message: 'thanks for stopping by',
			replyTo: '11111111-1111-1111-1111-111111111111',
		});
		expect(res.statusCode).toBe(201);
		expect(insertedPayload().from).toBe('owner');
		expect(body.notified).toBe(false);
		expect(notifyMock).not.toHaveBeenCalled();
	});
});

describe('GET ?mine=1 + PATCH', () => {
	it('GET requires a session or deviceToken', async () => {
		const { res } = await call('GET', { query: { mine: '1' } });
		expect(res.statusCode).toBe(400);
	});

	it('GET returns interactions + unread for the owner', async () => {
		sessionUser = { id: 'owner-uuid' };
		// The mine=1 path runs two SELECTs (rows, then the unread COUNT). Serve both
		// off the default branch shape by special-casing the COUNT here.
		sqlMock.mockImplementation((strings) => {
			const q = Array.isArray(strings) ? strings.join(' ') : String(strings);
			if (/FILTER \(WHERE ix\.seen_at IS NULL\)/i.test(q)) return Promise.resolve([{ unread: 2 }]);
			if (/JOIN irl_pins p ON p\.id = ix\.pin_id/i.test(q)) {
				return Promise.resolve([{ id: 'ix-1', type: 'pay', seen_at: null, payload: {} }]);
			}
			return Promise.resolve([]);
		});
		const { res, body } = await call('GET', { query: { mine: '1' } });
		expect(res.statusCode).toBe(200);
		expect(Array.isArray(body.interactions)).toBe(true);
		expect(body.unread).toBe(2);
		sqlMock.mockClear();
	});

	it('PATCH requires a session or deviceToken', async () => {
		const { res } = await call('PATCH', { body: {} });
		expect(res.statusCode).toBe(400);
	});

	it('PATCH marks the owner rows seen', async () => {
		sessionUser = { id: 'owner-uuid' };
		const { res, body } = await call('PATCH', { body: {} });
		expect(res.statusCode).toBe(200);
		expect(body.ok).toBe(true);
	});
});

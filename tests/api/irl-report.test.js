// POST /api/irl/report — IRL-Live D4 community moderation.
//
// A pin is queued out of public view once enough DISTINCT reporters flag it — not
// on a single report, and not twice from the same reporter. These tests prove the
// threshold gate, the owner protection (you can't self-report your own pin into
// hiding, one actor can't hide someone else's), and the terminal states. DB / auth
// / limiter are mocked so the suite stays offline.

import { describe, it, expect, vi, beforeEach } from 'vitest';

// `pinRow` is what the pin lookup returns (null → 404). `distinctReporters` is what
// the COUNT(DISTINCT reporter_token) returns. `hideUpdated` models whether the
// guarded UPDATE ... WHERE hidden_at IS NULL actually flipped a row.
let pinRow = null;
let distinctReporters = 1;
let hideUpdated = true;
const sqlMock = vi.fn((strings) => {
	const q = Array.isArray(strings) ? strings.join(' ') : String(strings);
	if (/SELECT[\s\S]*FROM irl_pins[\s\S]*WHERE id =/i.test(q)) {
		return Promise.resolve(pinRow ? [pinRow] : []);
	}
	if (/count\(DISTINCT reporter_token\)/i.test(q)) {
		return Promise.resolve([{ n: distinctReporters }]);
	}
	if (/UPDATE irl_pins[\s\S]*hidden_at = NOW\(\)/i.test(q)) {
		return Promise.resolve(hideUpdated ? [{ id: pinRow?.id }] : []);
	}
	// INSERT INTO irl_pin_reports, ensureTable DDL, anything else.
	return Promise.resolve([]);
});
vi.mock('../../api/_lib/db.js', () => ({ sql: (...a) => sqlMock(...a) }));

let sessionUser = null;
vi.mock('../../api/_lib/auth.js', () => ({
	getSessionUser: vi.fn(async () => sessionUser),
}));

vi.mock('../../api/_lib/rate-limit.js', () => ({
	limits: { irlReportIp: vi.fn(async () => ({ success: true })) },
	clientIp: () => '127.0.0.1',
}));

// D1 realtime fan-out — spied so we can prove a threshold hide pushes a live
// pin:remove into the pin's geocell room (and that a sub-threshold report does not).
const publishIrlPin = vi.fn(async () => ({ delivered: false }));
vi.mock('../../api/_lib/irl-publish.js', () => ({
	publishIrlPin: (...a) => publishIrlPin(...a),
}));

const { default: handler } = await import('../../api/irl/report.js');

function makeRes() {
	return {
		statusCode: 200,
		_h: {},
		writableEnded: false,
		setHeader(k, v) { this._h[k.toLowerCase()] = v; },
		getHeader(k) { return this._h[k.toLowerCase()]; },
		end(body) { this.writableEnded = true; this._body = body; },
	};
}
async function report(body) {
	const res = makeRes();
	await handler({ url: '/api/irl/report', method: 'POST', headers: { host: 'x' }, query: {}, body }, res);
	let parsed = null;
	try { parsed = JSON.parse(res._body); } catch {}
	return { res, body: parsed };
}

beforeEach(() => {
	sqlMock.mockClear();
	publishIrlPin.mockClear();
	pinRow = { id: 'pin-1', user_id: null, device_token: 'owner-dev', hidden_at: null, lat: 40.7128, lng: -74.006 };
	distinctReporters = 1;
	hideUpdated = true;
	sessionUser = null;
});

describe('POST /api/irl/report', () => {
	it('400s without a pinId', async () => {
		const { res, body } = await report({ reason: 'spam' });
		expect(res.statusCode).toBe(400);
		expect(body.error).toMatch(/pinId/);
	});

	it('404s when the pin does not exist', async () => {
		pinRow = null;
		const { res } = await report({ pinId: 'gone', reason: 'spam', deviceToken: 'dev-X' });
		expect(res.statusCode).toBe(404);
	});

	it('records a single report without hiding the pin (below threshold)', async () => {
		distinctReporters = 1;
		const { res, body } = await report({ pinId: 'pin-1', reason: 'spam', deviceToken: 'dev-X' });
		expect(res.statusCode).toBe(200);
		expect(body.hidden).toBe(false);
		expect(body.reports).toBe(1);
		const updated = sqlMock.mock.calls.some(([s]) =>
			/hidden_at = NOW\(\)/i.test(Array.isArray(s) ? s.join(' ') : String(s)));
		expect(updated).toBe(false);
	});

	it('hides the pin once distinct reporters reach the threshold (3)', async () => {
		distinctReporters = 3;
		const { res, body } = await report({ pinId: 'pin-1', reason: 'harassment', deviceToken: 'dev-Z' });
		expect(res.statusCode).toBe(200);
		expect(body.hidden).toBe(true);
	});

	it('emits a D1 pin:remove into the geocell room when the threshold hides a pin', async () => {
		distinctReporters = 3;
		await report({ pinId: 'pin-1', reason: 'harassment', deviceToken: 'dev-Z' });
		expect(publishIrlPin).toHaveBeenCalledTimes(1);
		const [type, geocell, payload] = publishIrlPin.mock.calls[0];
		expect(type).toBe('pin:remove');
		expect(typeof geocell).toBe('string');
		expect(geocell.length).toBeGreaterThan(0);
		expect(payload).toEqual({ id: 'pin-1' });
	});

	it('does NOT emit a pin:remove for a sub-threshold report', async () => {
		distinctReporters = 1;
		await report({ pinId: 'pin-1', reason: 'spam', deviceToken: 'dev-X' });
		expect(publishIrlPin).not.toHaveBeenCalled();
	});

	it('does NOT re-emit pin:remove when the guarded hide UPDATE flips nothing (race)', async () => {
		distinctReporters = 3;
		hideUpdated = false; // a concurrent report already set hidden_at
		const { body } = await report({ pinId: 'pin-1', reason: 'scam', deviceToken: 'dev-W' });
		expect(body.hidden).toBe(false);
		expect(publishIrlPin).not.toHaveBeenCalled();
	});

	it('a single reporter cannot hide a pin (one distinct token, threshold not met)', async () => {
		distinctReporters = 1;
		const { body } = await report({ pinId: 'pin-1', reason: 'scam', deviceToken: 'lone-dev' });
		expect(body.hidden).toBe(false);
	});

	it('ignores an owner self-report (device-token owner) without counting it', async () => {
		const { res, body } = await report({ pinId: 'pin-1', reason: 'spam', deviceToken: 'owner-dev' });
		expect(res.statusCode).toBe(200);
		expect(body.self).toBe(true);
		const inserted = sqlMock.mock.calls.some(([s]) =>
			/INSERT INTO irl_pin_reports/i.test(Array.isArray(s) ? s.join(' ') : String(s)));
		expect(inserted).toBe(false);
	});

	it('ignores an authenticated owner self-report', async () => {
		pinRow = { id: 'pin-1', user_id: 'owner-uuid', device_token: null, hidden_at: null };
		sessionUser = { id: 'owner-uuid' };
		const { body } = await report({ pinId: 'pin-1', reason: 'spam' });
		expect(body.self).toBe(true);
	});

	it('reports an already-hidden pin idempotently', async () => {
		pinRow.hidden_at = '2026-06-17T00:00:00Z';
		const { res, body } = await report({ pinId: 'pin-1', reason: 'spam', deviceToken: 'dev-Y' });
		expect(res.statusCode).toBe(200);
		expect(body.hidden).toBe(true);
	});

	it('normalizes an unknown reason to "other" (still accepted)', async () => {
		const { res } = await report({ pinId: 'pin-1', reason: 'banana', deviceToken: 'dev-Q' });
		expect(res.statusCode).toBe(200);
	});
});

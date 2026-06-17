// api/cron/irl-reap.js — IRL placement reaper.
//
// Regression: the reaper DELETEs from irl_pins and irl_pin_reports, both of
// which are created LAZILY by their write endpoints (pins.js / report.js). On a
// fresh deployment — or before the first pin is placed / first report filed —
// the table doesn't exist, so the unguarded DELETE threw `relation does not
// exist` and the hourly cron 500'd. The reaper must probe with to_regclass and
// treat a missing table as "nothing to reap".

import { describe, it, expect, beforeEach, vi } from 'vitest';

const sqlMock = vi.fn();
vi.mock('../../api/_lib/db.js', () => ({ sql: sqlMock }));
vi.mock('../../api/_lib/env.js', () => ({ env: {} }));
vi.mock('../../api/_lib/sentry.js', () => ({ captureException: vi.fn() }));
vi.mock('../../api/_lib/alerts.js', () => ({ sendOpsAlert: vi.fn() }));
vi.mock('../../api/_lib/zauth.js', () => ({ instrument: () => false, drain: vi.fn() }));

const { default: handler } = await import('../../api/cron/irl-reap.js');

process.env.CRON_SECRET = 'test-cron-secret';

function makeReqRes() {
	const req = {
		method: 'GET',
		url: '/api/cron/irl-reap',
		headers: { authorization: 'Bearer test-cron-secret' },
	};
	const res = {
		statusCode: 0,
		body: null,
		headers: {},
		setHeader(k, v) { this.headers[k.toLowerCase()] = v; },
		end(b) { this.body = b ? JSON.parse(b) : null; },
		get headersSent() { return this.body !== null; },
		get writableEnded() { return this.body !== null; },
	};
	return { req, res };
}

describe('irl-reap cron', () => {
	beforeEach(() => sqlMock.mockReset());

	it('returns 200 (not 500) when neither table exists yet — nothing to reap', async () => {
		// to_regclass probe → both NULL. No DELETE should ever be issued.
		sqlMock.mockResolvedValueOnce([{ pins: null, reports: null }]);

		const { req, res } = makeReqRes();
		await handler(req, res);

		expect(res.statusCode).toBe(200);
		expect(res.body).toMatchObject({ ok: true, reapedPins: 0, reapedReports: 0 });
		// Exactly one query ran: the existence probe. No DELETE against a
		// non-existent relation (which is what 500'd in production).
		expect(sqlMock).toHaveBeenCalledTimes(1);
	});

	it('reaps both tables when they exist', async () => {
		sqlMock
			.mockResolvedValueOnce([{ pins: 'irl_pins', reports: 'irl_pin_reports' }]) // probe
			.mockResolvedValueOnce([{ id: 'p1' }, { id: 'p2' }])                        // pins delete
			.mockResolvedValueOnce([{ id: 'r1' }]);                                     // reports delete

		const { req, res } = makeReqRes();
		await handler(req, res);

		expect(res.statusCode).toBe(200);
		expect(res.body).toMatchObject({ ok: true, reapedPins: 2, reapedReports: 1 });
		expect(sqlMock).toHaveBeenCalledTimes(3);
	});

	it('purges all reports when the pins table is gone but reports remain', async () => {
		sqlMock
			.mockResolvedValueOnce([{ pins: null, reports: 'irl_pin_reports' }]) // probe
			.mockResolvedValueOnce([{ id: 'r1' }, { id: 'r2' }]);                // unconditional reports delete

		const { req, res } = makeReqRes();
		await handler(req, res);

		expect(res.statusCode).toBe(200);
		expect(res.body).toMatchObject({ ok: true, reapedPins: 0, reapedReports: 2 });
		expect(sqlMock).toHaveBeenCalledTimes(2);
	});

	it('rejects an unauthenticated request with 401', async () => {
		const { req, res } = makeReqRes();
		req.headers.authorization = 'Bearer wrong';
		await handler(req, res);
		expect(res.statusCode).toBe(401);
		expect(sqlMock).not.toHaveBeenCalled();
	});
});

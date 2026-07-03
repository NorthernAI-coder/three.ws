// Risk acknowledgment gate — pure logic + storage behavior of public/risk-ack.js.
// The DOM dialog itself is exercised in the browser; these tests pin down the
// parts that decide whether a user gets prompted: record parsing, version
// currency, and localStorage persistence semantics.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
	parseAckRecord,
	isAckCurrent,
	hasRiskAck,
	ensureRiskAck,
	RISK_ACK_VERSION,
	RISK_ACK_STORAGE_KEY,
} from '../public/risk-ack.js';

function fakeStorage(initial = {}) {
	const map = new Map(Object.entries(initial));
	return {
		getItem: (k) => (map.has(k) ? map.get(k) : null),
		setItem: (k, v) => map.set(k, String(v)),
		removeItem: (k) => map.delete(k),
		_map: map,
	};
}

const validRecord = () =>
	JSON.stringify({ version: RISK_ACK_VERSION, acceptedAt: '2026-07-03T12:00:00.000Z', context: 'trade' });

describe('parseAckRecord', () => {
	it('parses a valid record', () => {
		const rec = parseAckRecord(validRecord());
		expect(rec).toEqual({ version: RISK_ACK_VERSION, acceptedAt: '2026-07-03T12:00:00.000Z', context: 'trade' });
	});

	it('keeps records without a context', () => {
		const rec = parseAckRecord(JSON.stringify({ version: 1, acceptedAt: '2026-07-03T12:00:00.000Z' }));
		expect(rec).toEqual({ version: 1, acceptedAt: '2026-07-03T12:00:00.000Z' });
	});

	it.each([
		[null],
		[undefined],
		[''],
		['not json'],
		['42'],
		['"a string"'],
		[JSON.stringify({ acceptedAt: '2026-07-03T12:00:00.000Z' })], // no version
		[JSON.stringify({ version: 0, acceptedAt: '2026-07-03T12:00:00.000Z' })], // version < 1
		[JSON.stringify({ version: 1.5, acceptedAt: '2026-07-03T12:00:00.000Z' })], // non-integer
		[JSON.stringify({ version: '1', acceptedAt: 'garbage' })], // unparseable date
		[JSON.stringify({ version: 1 })], // no acceptedAt
	])('rejects invalid input %#', (raw) => {
		expect(parseAckRecord(raw)).toBeNull();
	});

	it('coerces a numeric-string version', () => {
		const rec = parseAckRecord(JSON.stringify({ version: '2', acceptedAt: '2026-07-03T12:00:00.000Z' }));
		expect(rec?.version).toBe(2);
	});
});

describe('isAckCurrent', () => {
	it('is false for null', () => {
		expect(isAckCurrent(null)).toBe(false);
	});

	it('is true when the record matches the current version', () => {
		expect(isAckCurrent({ version: RISK_ACK_VERSION })).toBe(true);
	});

	it('is true when the record is newer than required', () => {
		expect(isAckCurrent({ version: RISK_ACK_VERSION + 1 })).toBe(true);
	});

	it('is false for a stale record — a disclosure version bump forces re-acknowledgment', () => {
		expect(isAckCurrent({ version: 1 }, 2)).toBe(false);
	});
});

describe('hasRiskAck / ensureRiskAck against storage', () => {
	let originalStorage;

	beforeEach(() => {
		originalStorage = globalThis.localStorage;
	});

	afterEach(() => {
		if (originalStorage === undefined) delete globalThis.localStorage;
		else globalThis.localStorage = originalStorage;
	});

	it('hasRiskAck is true when a current acceptance is stored', () => {
		globalThis.localStorage = fakeStorage({ [RISK_ACK_STORAGE_KEY]: validRecord() });
		expect(hasRiskAck()).toBe(true);
	});

	it('hasRiskAck is false for a stale-version acceptance', () => {
		globalThis.localStorage = fakeStorage({
			[RISK_ACK_STORAGE_KEY]: JSON.stringify({ version: RISK_ACK_VERSION - 1, acceptedAt: '2026-01-01T00:00:00.000Z' }),
		});
		// version - 1 can be 0 (invalid) or a genuinely stale version — both must gate.
		expect(hasRiskAck()).toBe(false);
	});

	it('hasRiskAck is false with corrupted storage contents', () => {
		globalThis.localStorage = fakeStorage({ [RISK_ACK_STORAGE_KEY]: '{broken' });
		expect(hasRiskAck()).toBe(false);
	});

	it('hasRiskAck survives a throwing localStorage', () => {
		globalThis.localStorage = {
			getItem() { throw new Error('denied'); },
		};
		expect(hasRiskAck()).toBe(false);
	});

	it('ensureRiskAck resolves true immediately when already accepted', async () => {
		globalThis.localStorage = fakeStorage({ [RISK_ACK_STORAGE_KEY]: validRecord() });
		await expect(ensureRiskAck({ context: 'trade' })).resolves.toBe(true);
	});

	it('ensureRiskAck resolves false when unaccepted and no DOM is available', async () => {
		globalThis.localStorage = fakeStorage();
		// Node test env has no document — the gate must fail CLOSED (no ack, no money action).
		await expect(ensureRiskAck({ context: 'trade' })).resolves.toBe(false);
	});
});

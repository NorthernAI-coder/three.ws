/**
 * Circulation real-seller demand gating — config tests.
 *
 * Routing platform-funded marketplace demand to real user sellers is an
 * economically sensitive, opt-in lever. These tests pin the default-OFF contract
 * (so an unconfigured deploy behaves exactly as before) and the per-seller daily
 * cap clamp that bounds treasury exposure.
 */

import { describe, it, expect, afterEach } from 'vitest';
import { config } from '../api/_lib/circulation.js';

const ENV_KEYS = ['CIRCULATION_REAL_SELLER_DEMAND', 'CIRCULATION_REAL_SELLER_DAILY_CAP'];
const saved = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));

afterEach(() => {
	for (const k of ENV_KEYS) {
		if (saved[k] === undefined) delete process.env[k];
		else process.env[k] = saved[k];
	}
});

describe('circulation real-seller demand gating', () => {
	it('is OFF by default — demand stays inside the circulation pool', () => {
		delete process.env.CIRCULATION_REAL_SELLER_DEMAND;
		expect(config().realSellerDemand).toBe(false);
	});

	it('turns on only for an explicit truthy flag', () => {
		for (const v of ['1', 'true', 'yes']) {
			process.env.CIRCULATION_REAL_SELLER_DEMAND = v;
			expect(config().realSellerDemand).toBe(true);
		}
		for (const v of ['0', 'false', 'off', '']) {
			process.env.CIRCULATION_REAL_SELLER_DEMAND = v;
			expect(config().realSellerDemand).toBe(false);
		}
	});

	it('clamps the per-seller daily cap to [1, 50] with a default of 3', () => {
		delete process.env.CIRCULATION_REAL_SELLER_DAILY_CAP;
		expect(config().realSellerDailyCap).toBe(3);
		process.env.CIRCULATION_REAL_SELLER_DAILY_CAP = '0';
		expect(config().realSellerDailyCap).toBe(1);
		process.env.CIRCULATION_REAL_SELLER_DAILY_CAP = '9999';
		expect(config().realSellerDailyCap).toBe(50);
		process.env.CIRCULATION_REAL_SELLER_DAILY_CAP = '7';
		expect(config().realSellerDailyCap).toBe(7);
	});
});

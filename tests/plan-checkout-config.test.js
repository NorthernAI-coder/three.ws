import { describe, it, expect, afterEach } from 'vitest';
import {
	PLANS,
	PLAN_ASSETS,
	planPriceUsd,
	threePlanDiscountBps,
	INTENT_TTL_MINUTES,
	QUOTED_INTENT_TTL_MINUTES,
} from '../api/payments/_config.js';

afterEach(() => {
	delete process.env.THREE_PLAN_DISCOUNT_BPS;
});

describe('PLAN_ASSETS', () => {
	it('accepts USDC, SOL, and THREE', () => {
		expect(PLAN_ASSETS).toEqual(['USDC', 'SOL', 'THREE']);
	});
});

describe('threePlanDiscountBps', () => {
	it('defaults to 20%', () => {
		expect(threePlanDiscountBps()).toBe(2000);
	});

	it('honors the env override', () => {
		process.env.THREE_PLAN_DISCOUNT_BPS = '1500';
		expect(threePlanDiscountBps()).toBe(1500);
	});

	it('allows disabling the discount entirely', () => {
		process.env.THREE_PLAN_DISCOUNT_BPS = '0';
		expect(threePlanDiscountBps()).toBe(0);
	});

	it('falls back to the default on garbage or out-of-range values', () => {
		for (const bad of ['nope', '-100', '9000', '']) {
			process.env.THREE_PLAN_DISCOUNT_BPS = bad;
			expect(threePlanDiscountBps()).toBe(2000);
		}
	});
});

describe('planPriceUsd', () => {
	it('charges the sticker price for USDC and SOL', () => {
		for (const plan of Object.keys(PLANS)) {
			expect(planPriceUsd(plan, 'USDC')).toBe(PLANS[plan].price_usd);
			expect(planPriceUsd(plan, 'SOL')).toBe(PLANS[plan].price_usd);
			expect(planPriceUsd(plan)).toBe(PLANS[plan].price_usd);
		}
	});

	it('applies the $THREE discount, rounded to cents', () => {
		expect(planPriceUsd('pro', 'THREE')).toBe(
			Math.round(PLANS.pro.price_usd * 0.8 * 100) / 100,
		);
	});

	it('never discounts below zero or above the sticker price', () => {
		for (const plan of Object.keys(PLANS)) {
			const three = planPriceUsd(plan, 'THREE');
			expect(three).toBeGreaterThan(0);
			expect(three).toBeLessThanOrEqual(PLANS[plan].price_usd);
		}
	});
});

describe('intent TTLs', () => {
	it('gives live-priced quotes a shorter session than USDC', () => {
		expect(QUOTED_INTENT_TTL_MINUTES).toBeLessThan(INTENT_TTL_MINUTES);
	});
});

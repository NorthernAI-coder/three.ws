import { describe, it, expect } from 'vitest';
import {
	emptyRule,
	normalizeRule,
	validateRule,
	compileRuleToConfig,
	configToSniperStrategy,
	ruleToEnglish,
	LAMPORTS_PER_SOL,
} from '../src/studio/money/trading-compile.js';
import { normalizeStrategyConfig, validateStrategyConfig } from '../api/_lib/strategy-schema.js';

describe('trading-compile: normalizeRule', () => {
	it('fills every block from defaults given an empty input', () => {
		const r = normalizeRule({});
		expect(r.trigger.type).toBe('new_launch');
		expect(r.buy.amount_sol).toBeGreaterThan(0);
		expect(r.exits.stop_loss_pct).toBeGreaterThan(0);
		expect(r.network).toBe('mainnet');
	});

	it('coerces empty strings to null and keeps numbers', () => {
		const r = normalizeRule({ filters: { min_market_cap_usd: '', max_market_cap_usd: 50000 } });
		expect(r.filters.min_market_cap_usd).toBeNull();
		expect(r.filters.max_market_cap_usd).toBe(50000);
	});

	it('never mutates the frozen default template', () => {
		const a = emptyRule();
		a.buy.amount_sol = 99;
		const b = emptyRule();
		expect(b.buy.amount_sol).not.toBe(99);
	});

	it('clamps an unknown network to mainnet and honours devnet', () => {
		expect(normalizeRule({ network: 'bogus' }).network).toBe('mainnet');
		expect(normalizeRule({ network: 'devnet' }).network).toBe('devnet');
	});
});

describe('trading-compile: validateRule', () => {
	it('requires a stop loss', () => {
		const { valid, errors } = validateRule({ exits: { stop_loss_pct: 0, take_profit_pct: 100 } });
		expect(valid).toBe(false);
		expect(errors['exits.stop_loss_pct']).toBeTruthy();
	});

	it('requires at least one upside exit', () => {
		const { valid, errors } = validateRule({
			exits: { stop_loss_pct: 40, take_profit_pct: null, trailing_stop_pct: null, max_hold_minutes: null },
		});
		expect(valid).toBe(false);
		expect(errors.exits).toBeTruthy();
	});

	it('rejects an inverted market-cap range', () => {
		const { valid, errors } = validateRule({
			filters: { min_market_cap_usd: 100000, max_market_cap_usd: 1000 },
			exits: { stop_loss_pct: 40, take_profit_pct: 100 },
		});
		expect(valid).toBe(false);
		expect(errors['filters.max_market_cap_usd']).toBeTruthy();
	});

	it('accepts a sound rule', () => {
		expect(validateRule(emptyRule()).valid).toBe(true);
	});
});

describe('trading-compile: compileRuleToConfig matches the live server schema', () => {
	it('produces a config the server normalizer accepts unchanged in shape', () => {
		const config = compileRuleToConfig(emptyRule());
		// The compiled config must survive the SAME normalizer the live engine runs,
		// with no drift in the gate-relevant fields — so what the UI saves is exactly
		// what the runtime enforces.
		const norm = normalizeStrategyConfig(config);
		expect(norm.entry.trigger).toBe('new_launch');
		expect(norm.sizing.amount_sol).toBe(config.sizing.amount_sol);
		expect(norm.exits.stop_loss_pct).toBe(config.exits.stop_loss_pct);
		expect(norm.entry.max_market_cap_usd).toBe(config.entry.max_market_cap_usd);
	});

	it('compiles a valid config that passes the server validator', () => {
		const config = compileRuleToConfig(emptyRule());
		const { valid } = validateStrategyConfig(config);
		expect(valid).toBe(true);
	});

	it('carries filter values through to the entry block', () => {
		const config = compileRuleToConfig({
			filters: { max_market_cap_usd: 40000, require_socials: true },
			exits: { stop_loss_pct: 30, take_profit_pct: 200 },
		});
		expect(config.entry.max_market_cap_usd).toBe(40000);
		expect(config.entry.require_socials).toBe(true);
	});
});

describe('trading-compile: configToSniperStrategy', () => {
	it('converts SOL sizing to lamports and minutes to seconds', () => {
		const config = compileRuleToConfig({
			buy: { amount_sol: 0.25, max_slippage_bps: 700 },
			exits: { stop_loss_pct: 40, take_profit_pct: 150, max_hold_minutes: 10 },
		});
		const s = configToSniperStrategy(config, { maxPriceImpactPct: 12 });
		expect(s.per_trade_lamports).toBe(String(Math.floor(0.25 * LAMPORTS_PER_SOL)));
		expect(s.slippage_bps).toBe(700);
		expect(s.max_hold_seconds).toBe(600);
		expect(s.max_price_impact_pct).toBe(12);
		expect(s.trigger).toBe('new_mint');
	});

	it('leaves max_hold_seconds null when no max hold is set', () => {
		const s = configToSniperStrategy(compileRuleToConfig(emptyRule()));
		expect(s.max_hold_seconds).toBeNull();
	});
});

describe('trading-compile: ruleToEnglish', () => {
	it('renders a readable, non-hyperbolic sentence', () => {
		const text = ruleToEnglish(emptyRule());
		expect(text).toMatch(/When a new coin appears/);
		expect(text).toMatch(/buy/);
		expect(text).not.toMatch(/guarantee/i);
	});
});

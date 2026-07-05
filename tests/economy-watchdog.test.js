import { describe, it, expect } from 'vitest';

import { classifyEngine } from '../api/cron/uptime-check.js';

// The economy watchdog's judgment call: which heartbeat engine results page an
// operator, and which are benign cadence skips. Getting this wrong either
// hides a weeks-long stall (July 2026) or pages all night for nothing.

describe('economy watchdog — classifyEngine', () => {
	it('a hard failure always pages (404 route gap, timeout, 5xx)', () => {
		expect(classifyEngine({ label: 'buyback', ok: false, status: 404 })).toBe('buyback: HTTP 404');
		expect(classifyEngine({ label: 'dca', ok: false, status: 0, error: 'timeout' })).toBe('dca: timeout');
		expect(classifyEngine({ label: 'launcher', ok: false, status: 500 })).toBe('launcher: HTTP 500');
	});

	it('actionable skip reasons page: misconfig, funding, storage, key parsing', () => {
		for (const reason of [
			'disabled',
			'Non-base58 character',
			'x402 pay: seed keypair undecodable — X402_SEED_SOLANA_SECRET_BASE58 must be 64 bytes as base58, base64, or a JSON array of 64 ints',
			'db_at_storage_cap',
			'insufficient_payer_usdc',
			'sponsor_sol_floor',
			'settle_unaffordable',
			'treasury balance 0.0100 SOL too low to fund 0.0300 SOL',
			'ring_config_invalid',
			'redis_unavailable: connect ETIMEDOUT',
		]) {
			expect(classifyEngine({ label: 'ring-tick', ok: true, skipped: true, reason }), reason).toBeTruthy();
		}
	});

	it('benign cadence skips stay quiet', () => {
		expect(classifyEngine({ label: 'buyback', ok: true, skipped: true, reason: 'not_due' })).toBeNull();
		expect(classifyEngine({ label: 'buyback', ok: true, skipped: true, reason: 'already_ran_today' })).toBeNull();
		expect(classifyEngine({ label: 'pulse', ok: true, skipped: true })).toBeNull();
		expect(classifyEngine({ label: 'ring-tick', ok: true, status: 200 })).toBeNull();
	});

	it('tolerates malformed entries', () => {
		expect(classifyEngine(null)).toBeNull();
		expect(classifyEngine({})).toBeNull();
	});
});

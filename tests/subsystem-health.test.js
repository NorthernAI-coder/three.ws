/**
 * api/_lib/ops/subsystem-health.js — unit tests.
 *
 * The gatherer reads each subsystem's in-process degradation state and rolls it
 * into one verdict. These pin the status vocabulary (ok/degraded/down/paused/
 * unknown), the roll-up (only degraded/down count against overall), and the two
 * cases the 2026-07-03 log export surfaced that a reachability probe can't see:
 * a half-armed x402 ring and an unprotected world.
 *
 * probeDb:false everywhere so the suite never needs a live Neon connection — the
 * DB ping has its own behavior (down when unreachable) that isn't the point here.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { gatherSubsystemHealth } from '../api/_lib/ops/subsystem-health.js';
import { cacheSet } from '../api/_lib/cache.js';

// Env the ring + x402-config checks read. Save/restore so cases don't leak.
const ENV_KEYS = [
	'X402_AUTONOMOUS_ENABLED',
	'X402_EXTERNAL_ENABLED',
	'X402_CHARITY_AUDIT_BPS',
	'X402_SELF_FACILITATOR_ENABLED',
	'X402_FACILITATOR_URL_SOLANA',
	'X402_PAY_TO_SOLANA',
	'X402_PAY_TO',
	'X402_PAY_TO_BASE',
	'X402_FEE_PAYER_SOLANA',
	'UPSTASH_CACHE_REST_URL',
	'UPSTASH_CACHE_REST_TOKEN',
	'UPSTASH_REDIS_REST_URL',
	'UPSTASH_REDIS_REST_TOKEN',
];
let saved;

function sub(health, name) {
	return health.subsystems.find((s) => s.name === name);
}

beforeEach(() => {
	saved = {};
	for (const k of ENV_KEYS) {
		saved[k] = process.env[k];
		delete process.env[k];
	}
});

afterEach(() => {
	for (const k of ENV_KEYS) {
		if (saved[k] === undefined) delete process.env[k];
		else process.env[k] = saved[k];
	}
});

describe('gatherSubsystemHealth', () => {
	it('reports the x402 ring as PAUSED when the loop is explicitly disabled', async () => {
		process.env.X402_AUTONOMOUS_ENABLED = 'false';
		const health = await gatherSubsystemHealth({ probeDb: false });
		const ring = sub(health, 'x402_ring');
		expect(ring.status).toBe('paused');
		// A paused ring is a chosen state, not a fault — must not drag overall down.
		expect(health.status).not.toBe('down');
	});

	it('reports the x402 ring as DEGRADED when enabled but guards are unset (half-armed)', async () => {
		// Enabled (not 'false') with the closed-loop guards unset — the exact
		// half-armed config the production log export showed.
		delete process.env.X402_AUTONOMOUS_ENABLED;
		delete process.env.X402_CHARITY_AUDIT_BPS;
		process.env.X402_SELF_FACILITATOR_ENABLED = 'false';
		const health = await gatherSubsystemHealth({ probeDb: false });
		const ring = sub(health, 'x402_ring');
		expect(ring.status).toBe('degraded');
		expect(ring.detail).toMatch(/half-armed/);
		expect(ring.hint).toBeTruthy();
		expect(health.status).toBe('degraded');
		expect(health.degraded).toContain('x402_ring');
	});

	it('reports the x402 ring as OK when all closed-loop guards are satisfied', async () => {
		delete process.env.X402_AUTONOMOUS_ENABLED;
		process.env.X402_EXTERNAL_ENABLED = 'false';
		process.env.X402_CHARITY_AUDIT_BPS = '0';
		process.env.X402_SELF_FACILITATOR_ENABLED = 'true';
		// Leave the facilitator URL unset so it defaults to self.
		const health = await gatherSubsystemHealth({ probeDb: false });
		expect(sub(health, 'x402_ring').status).toBe('ok');
	});

	it('flags x402 payment config as DEGRADED when Solana pay-to is set without a fee payer', async () => {
		process.env.X402_PAY_TO_SOLANA = 'THREEsynthetic1111111111111111111111111111111';
		delete process.env.X402_FEE_PAYER_SOLANA;
		const health = await gatherSubsystemHealth({ probeDb: false });
		const cfg = sub(health, 'x402_config');
		expect(cfg.status).toBe('degraded');
		expect(cfg.detail).toMatch(/fee.?payer/i);
	});

	it('reports world as UNKNOWN when no world-health report has been parked', async () => {
		const health = await gatherSubsystemHealth({ probeDb: false });
		expect(sub(health, 'world').status).toBe('unknown');
	});

	it('reports world as DEGRADED (unprotected) from a parked world-health outcome', async () => {
		await cacheSet(
			'world:health',
			{ status: 'degraded', protected: false, problems: ['unprotected'], missingCount: 0, checkedAt: Date.now() },
			3600,
		);
		const health = await gatherSubsystemHealth({ probeDb: false });
		const world = sub(health, 'world');
		expect(world.status).toBe('degraded');
		expect(world.detail).toMatch(/UNPROTECTED/);
		expect(world.hint).toMatch(/ADMIN_CODE/);
	});

	it('reports cache as OK on the in-memory backend when no Redis is configured', async () => {
		const health = await gatherSubsystemHealth({ probeDb: false });
		const cache = sub(health, 'cache');
		expect(cache.status).toBe('ok');
		expect(cache.backend).toBe('memory');
	});

	it('reports Helius as OK (public RPC) when no Helius key is configured', async () => {
		const health = await gatherSubsystemHealth({ probeDb: false });
		expect(sub(health, 'helius').status).toBe('ok');
	});

	it('skips the DB ping when probeDb is false (database → unknown, not down)', async () => {
		const health = await gatherSubsystemHealth({ probeDb: false });
		expect(sub(health, 'database').status).toBe('unknown');
	});

	it('rolls the overall verdict to the worst subsystem and lists degraded names', async () => {
		process.env.X402_PAY_TO_SOLANA = 'THREEsynthetic1111111111111111111111111111111';
		delete process.env.X402_FEE_PAYER_SOLANA; // → x402_config degraded
		const health = await gatherSubsystemHealth({ probeDb: false });
		expect(health.status).toBe('degraded');
		expect(health.degraded).toContain('x402_config');
		// Counts is a tally of every status bucket.
		expect(Object.values(health.counts).reduce((a, b) => a + b, 0)).toBe(health.subsystems.length);
	});
});

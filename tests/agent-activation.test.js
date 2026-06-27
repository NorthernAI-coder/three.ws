/**
 * Agent activation config — pure-helper unit tests.
 *
 * activationConfig gates a real, treasury-funded on-chain grant, so its env
 * parsing (enable flag, grant clamps, daily cap, treasury detection, network)
 * is pinned down here without a database or RPC. The full activateAgent path is
 * integration-tested against a live treasury; these guard the knobs that decide
 * whether — and how much — it spends.
 */

import { describe, it, expect } from 'vitest';
import { activationConfig } from '../api/_lib/agent-activation.js';

const SOL = 1_000_000_000;

describe('activationConfig', () => {
	it('is disabled and unconfigured for an empty env', () => {
		const c = activationConfig({});
		expect(c.enabled).toBe(false);
		expect(c.configured).toBe(false);
		expect(c.network).toBe('mainnet');
		expect(c.grantSol).toBe(0.004);
		expect(c.grantLamports).toBe(Math.round(0.004 * SOL));
		expect(c.dailyCap).toBe(500);
	});

	it('enables only on an explicit truthy flag', () => {
		expect(activationConfig({ AGENT_ACTIVATION_ENABLED: 'true' }).enabled).toBe(true);
		expect(activationConfig({ AGENT_ACTIVATION_ENABLED: '1' }).enabled).toBe(true);
		expect(activationConfig({ AGENT_ACTIVATION_ENABLED: 'yes' }).enabled).toBe(true);
		expect(activationConfig({ AGENT_ACTIVATION_ENABLED: 'false' }).enabled).toBe(false);
		expect(activationConfig({ AGENT_ACTIVATION_ENABLED: 'no' }).enabled).toBe(false);
		expect(activationConfig({ AGENT_ACTIVATION_ENABLED: 'maybe' }).enabled).toBe(false);
	});

	it('detects a treasury from either the override or the shared secret', () => {
		expect(activationConfig({ CIRCULATION_TREASURY_SECRET: 'abc' }).configured).toBe(true);
		expect(activationConfig({ AGENT_ACTIVATION_TREASURY_SECRET: 'xyz' }).configured).toBe(true);
		expect(activationConfig({ CIRCULATION_TREASURY_SECRET: '   ' }).configured).toBe(false);
	});

	it('clamps the grant to the safe 0.0001–0.05 SOL band', () => {
		expect(activationConfig({ AGENT_ACTIVATION_GRANT_SOL: '10' }).grantSol).toBe(0.05);
		expect(activationConfig({ AGENT_ACTIVATION_GRANT_SOL: '0' }).grantSol).toBe(0.0001);
		expect(activationConfig({ AGENT_ACTIVATION_GRANT_SOL: '-5' }).grantSol).toBe(0.0001);
		expect(activationConfig({ AGENT_ACTIVATION_GRANT_SOL: '0.01' }).grantSol).toBe(0.01);
		// non-numeric falls back to the default
		expect(activationConfig({ AGENT_ACTIVATION_GRANT_SOL: 'free' }).grantSol).toBe(0.004);
	});

	it('clamps the daily cap and keeps lamports in lockstep with grantSol', () => {
		expect(activationConfig({ AGENT_ACTIVATION_DAILY_CAP: '0' }).dailyCap).toBe(1);
		expect(activationConfig({ AGENT_ACTIVATION_DAILY_CAP: '999999999' }).dailyCap).toBe(100_000);
		const c = activationConfig({ AGENT_ACTIVATION_GRANT_SOL: '0.02' });
		expect(c.grantLamports).toBe(Math.round(0.02 * SOL));
	});

	it('honours the devnet network selector', () => {
		expect(activationConfig({ CIRCULATION_NETWORK: 'devnet' }).network).toBe('devnet');
		expect(activationConfig({ CIRCULATION_NETWORK: 'mainnet' }).network).toBe('mainnet');
		expect(activationConfig({ CIRCULATION_NETWORK: 'whatever' }).network).toBe('mainnet');
	});
});

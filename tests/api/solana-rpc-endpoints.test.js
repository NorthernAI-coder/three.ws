// api/_lib/solana/connection.js — solanaRpcEndpoints() failover list.
//
// Regression guard for the production log storm where every cron tick hit
// `[solana-rpc] https://rpc.ankr.com 403 — cooling 30m, failing over`: Ankr
// sunset keyless access, so the hardcoded keyless `rpc.ankr.com/solana` entry
// was a guaranteed 403 + cooldown log on every run. The fix gates Ankr behind
// ANKR_API_KEY (authenticated form only) and adds PublicNode as a keyless,
// un-throttled fallback so failover never depends on the aggressively
// rate-limited public mainnet-beta endpoint alone.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { solanaRpcEndpoints, shouldRotate } from '../../api/_lib/solana/connection.js';

const KEYS = ['HELIUS_API_KEY', 'ALCHEMY_API_KEY', 'ANKR_API_KEY', 'SOLANA_RPC_URL'];

describe('solanaRpcEndpoints', () => {
	let saved;
	beforeEach(() => {
		saved = {};
		for (const k of KEYS) {
			saved[k] = process.env[k];
			delete process.env[k];
		}
	});
	afterEach(() => {
		for (const k of KEYS) {
			if (saved[k] === undefined) delete process.env[k];
			else process.env[k] = saved[k];
		}
	});

	it('never includes a keyless Ankr endpoint (Ankr 403s every keyless call)', () => {
		const eps = solanaRpcEndpoints('mainnet');
		expect(eps).not.toContain('https://rpc.ankr.com/solana');
		expect(eps.some((u) => u.startsWith('https://rpc.ankr.com/') && !/\/solana\/.+/.test(u))).toBe(false);
	});

	it('includes PublicNode and the public endpoint as keyless fallbacks', () => {
		const eps = solanaRpcEndpoints('mainnet');
		expect(eps).toContain('https://solana-rpc.publicnode.com');
		expect(eps).toContain('https://api.mainnet-beta.solana.com');
	});

	it('keeps the public mainnet-beta endpoint last (most rate-limited)', () => {
		const eps = solanaRpcEndpoints('mainnet');
		expect(eps[eps.length - 1]).toBe('https://api.mainnet-beta.solana.com');
	});

	it('adds Ankr only in its authenticated form when ANKR_API_KEY is set', () => {
		process.env.ANKR_API_KEY = 'k_test_123';
		const eps = solanaRpcEndpoints('mainnet');
		expect(eps).toContain('https://rpc.ankr.com/solana/k_test_123');
		expect(eps).not.toContain('https://rpc.ankr.com/solana');
	});

	it('pins an explicit url first and dedups it', () => {
		const eps = solanaRpcEndpoints('mainnet', 'https://my.rpc/solana');
		expect(eps[0]).toBe('https://my.rpc/solana');
		expect(eps.filter((u) => u === 'https://my.rpc/solana')).toHaveLength(1);
	});

	it('keeps the devnet list on the devnet cluster (no mainnet bleed)', () => {
		const eps = solanaRpcEndpoints('devnet');
		expect(eps).toContain('https://api.devnet.solana.com');
		expect(eps).not.toContain('https://api.mainnet-beta.solana.com');
	});
});

// Regression guard for the production club-cover outage: a misconfigured primary
// SOLANA_RPC_URL answered JSON-RPC POSTs with HTTP 404, and shouldRotate() did
// not treat 404 as rotate-worthy — so the 404 was returned to web3.js instead of
// failing over to the healthy PublicNode lane, taking every `getMint`/checkout
// `prepare` call (and thus the whole Solana payment flow) down with a 500.
describe('shouldRotate', () => {
	it('rotates off a dead/misrouted endpoint URL (404/408/410)', () => {
		expect(shouldRotate(404)).toBe(true); // wrong/expired RPC URL path
		expect(shouldRotate(408)).toBe(true); // request timeout
		expect(shouldRotate(410)).toBe(true); // endpoint gone
	});

	it('still rotates on auth, rate-limit, and provider-down statuses', () => {
		for (const s of [401, 403, 429, 500, 502, 503]) {
			expect(shouldRotate(s)).toBe(true);
		}
	});

	it('does not rotate a healthy response or a genuine request error', () => {
		// 200 is healthy; a live RPC returns method-not-found as 200 + JSON-RPC
		// error, never an HTTP 404. 400/422 are real request errors, identical on
		// every provider, so they surface to the caller rather than burning the list.
		for (const s of [200, 400, 422]) {
			expect(shouldRotate(s)).toBe(false);
		}
	});
});

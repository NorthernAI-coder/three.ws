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
import { solanaRpcEndpoints } from '../../api/_lib/solana/connection.js';

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

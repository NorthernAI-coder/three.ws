import { describe, it, expect } from 'vitest';
import { fundAgentForLaunch, loadMasterSigner } from '../api/_lib/launcher-funding.js';

// These exercise the business-rule guards that fire BEFORE any chain/RPC call, so
// they run without a wallet, RPC, or DB. They prove the caps actually refuse —
// the safety contract the engine relies on to record a clean 'skipped' run.

describe('fundAgentForLaunch — caps refuse before spending', () => {
	const base = { agentAddress: 'AgentSoLAddrXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX', network: 'devnet' };

	it('refuses a non-positive amount', async () => {
		const r = await fundAgentForLaunch({ ...base, sol: 0, perLaunchCapSol: 1, dailyCapSol: 1 });
		expect(r.ok).toBe(false);
		expect(r.reason).toMatch(/positive/);
	});

	it('refuses when the per-launch cap is exceeded', async () => {
		const r = await fundAgentForLaunch({ ...base, sol: 2, perLaunchCapSol: 1, dailyCapSol: 100 });
		expect(r.ok).toBe(false);
		expect(r.reason).toMatch(/per-launch/);
	});

	it('refuses when the daily allowance is exhausted', async () => {
		const r = await fundAgentForLaunch({ ...base, sol: 0.5, perLaunchCapSol: 1, dailyCapSol: 0.1 });
		expect(r.ok).toBe(false);
		expect(r.reason).toMatch(/daily/);
	});

	it('refuses cleanly (never throws) when the master wallet is unconfigured', async () => {
		const prev = process.env.LAUNCHER_MASTER_SECRET_KEY_B64;
		const prevFb = process.env.PUMP_X402_LAUNCHER_SECRET_KEY_B64;
		delete process.env.LAUNCHER_MASTER_SECRET_KEY_B64;
		delete process.env.PUMP_X402_LAUNCHER_SECRET_KEY_B64;
		try {
			const r = await fundAgentForLaunch({ ...base, sol: 0.02, perLaunchCapSol: 1, dailyCapSol: 1 });
			expect(r.ok).toBe(false);
			expect(r.reason).toMatch(/not configured/);
		} finally {
			if (prev) process.env.LAUNCHER_MASTER_SECRET_KEY_B64 = prev;
			if (prevFb) process.env.PUMP_X402_LAUNCHER_SECRET_KEY_B64 = prevFb;
		}
	});
});

describe('loadMasterSigner', () => {
	it('returns null when no master secret is set', async () => {
		const prev = process.env.LAUNCHER_MASTER_SECRET_KEY_B64;
		const prevFb = process.env.PUMP_X402_LAUNCHER_SECRET_KEY_B64;
		delete process.env.LAUNCHER_MASTER_SECRET_KEY_B64;
		delete process.env.PUMP_X402_LAUNCHER_SECRET_KEY_B64;
		try {
			expect(await loadMasterSigner()).toBeNull();
		} finally {
			if (prev) process.env.LAUNCHER_MASTER_SECRET_KEY_B64 = prev;
			if (prevFb) process.env.PUMP_X402_LAUNCHER_SECRET_KEY_B64 = prevFb;
		}
	});
});

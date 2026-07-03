import { describe, it, expect, vi, beforeEach } from 'vitest';

// Query-aware fake `sql` for launcher-funding's ledger reads. Each source can be
// toggled to throw (missing-table simulation) to prove the fail-open contract.
const H = vi.hoisted(() => ({ launcherRunsThrows: false, sniperEventsThrows: false, launcherSol: 0, sniperLamports: 0 }));
vi.mock('../api/_lib/db.js', () => {
	const sql = (strings) => {
		const q = Array.isArray(strings) ? strings.join(' ').toLowerCase() : '';
		if (q.includes('from launcher_runs')) {
			if (H.launcherRunsThrows) return Promise.reject(new Error('relation "launcher_runs" does not exist'));
			return Promise.resolve([{ s: H.launcherSol }]);
		}
		if (q.includes('from sniper_funding_events')) {
			if (H.sniperEventsThrows) return Promise.reject(new Error('relation "sniper_funding_events" does not exist'));
			return Promise.resolve([{ s: H.sniperLamports / 1e9 }]);
		}
		return Promise.resolve([]);
	};
	return { sql, LAMPORTS_PER_SOL: 1_000_000_000 };
});

import { parseAgentIds } from '../workers/agent-sniper/config.js';
import { mayhemVerdict, mayhemGate } from '../workers/agent-sniper/mayhem-gate.js';
import { withinMasterDailyCap, masterDailyOutflowSol } from '../api/_lib/launcher-funding.js';

describe('parseAgentIds (worker agent scoping)', () => {
	it('returns null for unset / empty / whitespace', () => {
		expect(parseAgentIds(undefined)).toBeNull();
		expect(parseAgentIds('')).toBeNull();
		expect(parseAgentIds('   ')).toBeNull();
	});
	it('parses comma/space/newline separated UUIDs, lowercased + de-duped', () => {
		const a = 'c315ac7e-1c9e-46f8-8921-909dd572024d';
		const b = 'A633660F-D013-407D-832D-6C505A9EA15A';
		expect(parseAgentIds(`${a}, ${b}\n${a}`)).toEqual([a, b.toLowerCase()]);
	});
	it('drops non-UUID tokens, returns null if none valid', () => {
		expect(parseAgentIds('not-a-uuid, also-bad')).toBeNull();
		expect(parseAgentIds('nope, c315ac7e-1c9e-46f8-8921-909dd572024d')).toEqual(['c315ac7e-1c9e-46f8-8921-909dd572024d']);
	});
});

describe('mayhemVerdict (owner rule: no pump.fun Mayhem tokens)', () => {
	it('skips a Mayhem token', () => {
		expect(mayhemVerdict(true)).toEqual({ pass: false, reason: 'mayhem_excluded' });
	});
	it('allows a normal (non-Mayhem) token', () => {
		expect(mayhemVerdict(false)).toEqual({ pass: true });
	});
	it('allows-on-unknown by default, but skips when strict', () => {
		expect(mayhemVerdict(null)).toEqual({ pass: true, unknown: true });
		expect(mayhemVerdict(null, { strict: true })).toEqual({ pass: false, reason: 'mayhem_unknown', unknown: true });
		expect(mayhemVerdict(undefined, { strict: true })).toEqual({ pass: false, reason: 'mayhem_unknown', unknown: true });
	});
});

describe('mayhemGate', () => {
	it('is a no-op pass-through when the filter is disabled (no RPC)', async () => {
		await expect(mayhemGate('AnyMint111', { mayhemFilter: false })).resolves.toEqual({ pass: true });
	});
});

describe('withinMasterDailyCap (hard master outflow ceiling)', () => {
	it('no cap when capSol is 0 / negative / non-finite', () => {
		expect(withinMasterDailyCap(5, 5, 0).ok).toBe(true);
		expect(withinMasterDailyCap(5, 5, -1).ok).toBe(true);
		expect(withinMasterDailyCap(5, 5, NaN).ok).toBe(true);
	});
	it('allows a transfer that stays within the cap (incl. exact boundary)', () => {
		expect(withinMasterDailyCap(1.0, 0.5, 2).ok).toBe(true);
		expect(withinMasterDailyCap(1.5, 0.5, 2).ok).toBe(true); // exactly at cap
	});
	it('refuses a transfer that would exceed the cap', () => {
		const r = withinMasterDailyCap(1.8, 0.5, 2);
		expect(r.ok).toBe(false);
		expect(r.reason).toMatch(/master_daily_cap/);
	});
});

describe('masterDailyOutflowSol (fails open per-source)', () => {
	beforeEach(() => { H.launcherRunsThrows = false; H.sniperEventsThrows = false; H.launcherSol = 0; H.sniperLamports = 0; });
	it('sums both ledgers', async () => {
		H.launcherSol = 0.7; H.sniperLamports = 300_000_000; // 0.3 SOL
		await expect(masterDailyOutflowSol('mainnet')).resolves.toBeCloseTo(1.0, 6);
	});
	it('does not throw when a ledger table is missing — contributes 0', async () => {
		H.launcherRunsThrows = true; H.sniperLamports = 500_000_000;
		await expect(masterDailyOutflowSol('mainnet')).resolves.toBeCloseTo(0.5, 6);
	});
	it('returns 0 when both sources are unavailable', async () => {
		H.launcherRunsThrows = true; H.sniperEventsThrows = true;
		await expect(masterDailyOutflowSol('mainnet')).resolves.toBe(0);
	});
});

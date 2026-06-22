// Tests for the open-network Agent Bouncer — the Pole Club door check
// generalized to ERC-8004 on-chain reputation. Covers tier assignment, the
// admit/refuse verdict under a policy, denylist + negative-score exclusion, the
// newcomer (unregistered wallet) path, and the corrected getReputation decode
// (average = avgX100 / 100, sign-preserving) that the A2A gate now shares.

import { describe, it, expect, vi } from 'vitest';

import { tierForReputation, vetAgent } from '../api/_lib/trust/agent-bouncer.js';

// A reader stub standing in for the on-chain read. vetAgent calls
// read({ agentId, wallet, chainId }) and treats the result as the decoded
// aggregate — so these tests exercise the verdict logic without RPC.
function reader(rep) {
	return vi.fn(async () => ({
		agentId: '1',
		wallet: null,
		registered: true,
		average: 0,
		count: 0,
		totalStakeWei: '0',
		...rep,
	}));
}

describe('tierForReputation', () => {
	it('is a newcomer with no reviews', () => {
		expect(tierForReputation({ average: 0, count: 0 })).toBe('newcomer');
	});

	it('is regular with a little history', () => {
		expect(tierForReputation({ average: 5, count: 1 })).toBe('regular');
		expect(tierForReputation({ average: 5, count: 4 })).toBe('regular');
	});

	it('is trusted at the review threshold', () => {
		expect(tierForReputation({ average: 4, count: 5 })).toBe('trusted');
		expect(tierForReputation({ average: 4, count: 12 })).toBe('trusted'); // no stake → not vip
	});

	it('is vip only with enough reviews AND ETH stake behind a vouch', () => {
		expect(tierForReputation({ average: 5, count: 10, totalStakeWei: '1000000000000000' })).toBe('vip');
		expect(tierForReputation({ average: 5, count: 10, totalStakeWei: '0' })).toBe('trusted');
	});

	it('never promotes a net-negative agent past regular', () => {
		expect(tierForReputation({ average: -3, count: 50, totalStakeWei: '1000000000000000' })).toBe('regular');
	});
});

describe('vetAgent', () => {
	it('admits an agent that clears the policy', async () => {
		const read = reader({ average: 4.6, count: 7 });
		const v = await vetAgent({ agentId: '1', chainId: 8453, policy: { minAverage: 4, minCount: 3 }, read });
		expect(v.admitted).toBe(true);
		expect(v.banned).toBe(false);
		expect(v.tier).toBe('trusted');
		expect(v.reason).toBeNull();
		expect(v.reputation.average).toBe(4.6);
	});

	it('refuses for too few reviews and reports why', async () => {
		const read = reader({ average: 5, count: 2 });
		const v = await vetAgent({ agentId: '1', chainId: 8453, policy: { minCount: 5 }, read });
		expect(v.admitted).toBe(false);
		expect(v.banned).toBe(false);
		expect(v.reason).toMatch(/only 2 review/);
	});

	it('refuses when the average is below the bar', async () => {
		const read = reader({ average: 2.5, count: 20 });
		const v = await vetAgent({ agentId: '1', chainId: 8453, policy: { minAverage: 4 }, read });
		expect(v.admitted).toBe(false);
		expect(v.reason).toMatch(/below the required 4/);
	});

	it('bans a net-negative agent — the chain’s own denylist', async () => {
		const read = reader({ average: -1.2, count: 9 });
		const v = await vetAgent({ agentId: '1', chainId: 8453, read });
		expect(v.banned).toBe(true);
		expect(v.admitted).toBe(false);
		expect(v.tier).toBe('banned');
		expect(v.reason).toMatch(/negative on-chain reputation/);
	});

	it('honors an explicit denylist by wallet', async () => {
		const wallet = '0x000000000000000000000000000000000000dEaD';
		const read = reader({ wallet, average: 5, count: 30 });
		const v = await vetAgent({ wallet, chainId: 8453, denylist: [wallet.toLowerCase()], read });
		expect(v.banned).toBe(true);
		expect(v.admitted).toBe(false);
	});

	it('treats an unregistered wallet as a newcomer, admitted by default', async () => {
		const read = reader({ agentId: null, wallet: '0xabc', registered: false, average: 0, count: 0 });
		const v = await vetAgent({ wallet: '0xabc', chainId: 8453, read });
		expect(v.tier).toBe('newcomer');
		expect(v.registered).toBe(false);
		expect(v.admitted).toBe(true);
	});

	it('refuses a newcomer when the policy forbids them', async () => {
		const read = reader({ registered: false, average: 0, count: 0 });
		const v = await vetAgent({ wallet: '0xabc', chainId: 8453, policy: { allowNewcomers: false }, read });
		expect(v.admitted).toBe(false);
		expect(v.reason).toMatch(/newcomers not admitted/);
	});

	it('enforces a minimum ETH stake', async () => {
		const read = reader({ average: 5, count: 20, totalStakeWei: '500000000000000' }); // 0.0005 ETH
		const v = await vetAgent({
			agentId: '1',
			chainId: 8453,
			policy: { minStakeWei: 1_000_000_000_000_000n }, // 0.001 ETH
			read,
		});
		expect(v.admitted).toBe(false);
		expect(v.reason).toMatch(/wei required/);
	});

	it('decodes the aggregate average exactly as the reader supplies it (avgX100/100 contract)', async () => {
		// The reader returns the already-divided average; vetAgent must not divide
		// again (the bug the shared read exists to avoid). 4.2 stays 4.2.
		const read = reader({ average: 4.2, count: 6 });
		const v = await vetAgent({ agentId: '1', chainId: 8453, read });
		expect(v.reputation.average).toBe(4.2);
		expect(v.reputation.count).toBe(6);
	});
});

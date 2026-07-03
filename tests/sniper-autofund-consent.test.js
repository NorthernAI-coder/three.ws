import { describe, it, expect } from 'vitest';
import { optedInAgentIds } from '../workers/agent-sniper/auto-funder.js';

// The auto-funder may only move SOL to agents whose strategy has EXPLICITLY
// opted in (auto_fund_enabled === true). Arming a strategy must never, on its
// own, make the launcher master push funds — that implicit trigger was the
// documented footgun. These tests pin the fail-safe default.

describe('optedInAgentIds — explicit auto-fund consent', () => {
	it('excludes an enabled strategy that did NOT opt in (the footgun case)', () => {
		const strategies = [
			{ agent_id: 'a1', network: 'mainnet', enabled: true, auto_fund_enabled: false },
		];
		expect(optedInAgentIds(strategies, 'mainnet')).toEqual([]);
	});

	it('includes only strategies that explicitly opted in', () => {
		const strategies = [
			{ agent_id: 'a1', network: 'mainnet', auto_fund_enabled: true },
			{ agent_id: 'a2', network: 'mainnet', auto_fund_enabled: false },
			{ agent_id: 'a3', network: 'mainnet' }, // flag absent → treated as no
		];
		expect(optedInAgentIds(strategies, 'mainnet')).toEqual(['a1']);
	});

	it('treats a missing flag as no-consent (fail-safe mid-migration)', () => {
		const strategies = [{ agent_id: 'a1', network: 'mainnet', auto_fund_enabled: undefined }];
		expect(optedInAgentIds(strategies, 'mainnet')).toEqual([]);
	});

	it('never treats a truthy-but-not-true value as consent', () => {
		// Guards against a stringy DB value ('t', 1, 'true') silently authorizing funds.
		const strategies = [
			{ agent_id: 'a1', network: 'mainnet', auto_fund_enabled: 'true' },
			{ agent_id: 'a2', network: 'mainnet', auto_fund_enabled: 1 },
		];
		expect(optedInAgentIds(strategies, 'mainnet')).toEqual([]);
	});

	it('scopes to the requested network', () => {
		const strategies = [
			{ agent_id: 'a1', network: 'mainnet', auto_fund_enabled: true },
			{ agent_id: 'a2', network: 'devnet', auto_fund_enabled: true },
		];
		expect(optedInAgentIds(strategies, 'devnet')).toEqual(['a2']);
	});

	it('dedupes an agent that has multiple opted-in strategies', () => {
		const strategies = [
			{ agent_id: 'a1', network: 'mainnet', auto_fund_enabled: true },
			{ agent_id: 'a1', network: 'mainnet', auto_fund_enabled: true },
		];
		expect(optedInAgentIds(strategies, 'mainnet')).toEqual(['a1']);
	});

	it('handles empty/nullish input', () => {
		expect(optedInAgentIds(undefined, 'mainnet')).toEqual([]);
		expect(optedInAgentIds([], 'mainnet')).toEqual([]);
	});
});

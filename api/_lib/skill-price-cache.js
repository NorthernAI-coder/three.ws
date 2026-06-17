// In-memory cache for agent skill prices.
//
// Skill prices are read on every purchase flow, agent embed load, and
// marketplace detail fetch. They change infrequently (creator-initiated
// updates), so caching them for a short window cuts DB round-trips without
// ever serving stale prices for meaningful durations.
//
// TTL: 2 minutes per agent. Writes (set-price, bulk-pricing) must call
// invalidateSkillPriceCache(agentId) so the next read reflects the update.
//
// Vercel serverless: each function instance has its own heap, so cache
// entries only persist for the lifetime of that warm instance. There is no
// cross-instance coordination — an update invalidates the local instance's
// entry only. In the worst case a stale instance serves old prices for up
// to TTL seconds. This is acceptable: prices don't change mid-purchase (the
// purchase flow persists the quoted price on the skill_purchases row at
// create time and confirms against that snapshot, not the live price).

import { sql } from './db.js';

const CACHE_TTL_MS = 2 * 60 * 1000; // 2 minutes

const _cache = new Map(); // agentId → { rows, ts }

/**
 * Fetch active skill prices for an agent, using the cache.
 * @param {string} agentId
 * @returns {Promise<Array<{ skill, amount, currency_mint, chain, mint_decimals,
 *                           trial_uses, time_pass_hours, time_pass_amount }>>}
 */
export async function getSkillPrices(agentId) {
	const cached = _cache.get(agentId);
	if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
		return cached.rows;
	}
	const rows = await sql`
		SELECT skill, amount, currency_mint, chain, mint_decimals,
		       trial_uses, time_pass_hours, time_pass_amount
		FROM agent_skill_prices
		WHERE agent_id = ${agentId} AND is_active = true
	`;
	_cache.set(agentId, { rows, ts: Date.now() });
	return rows;
}

/**
 * Invalidate the cached prices for an agent. Call after any write to
 * agent_skill_prices for this agent.
 * @param {string} agentId
 */
export function invalidateSkillPriceCache(agentId) {
	_cache.delete(agentId);
}

/**
 * Fetch ONE active price row for (agentId, skill). Uses the agent's full
 * price cache so a warm agent hit only costs a Map lookup.
 * @param {string} agentId
 * @param {string} skill
 * @returns {Promise<object|null>}
 */
export async function getSkillPrice(agentId, skill) {
	const rows = await getSkillPrices(agentId);
	return rows.find((r) => r.skill === skill) ?? null;
}

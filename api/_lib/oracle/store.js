// Oracle — store. Reads/writes Oracle's own tables and orchestrates the
// score-one-coin flow (assemble intel from the brain → ensure a narrative read →
// fuse conviction → cache it). Used by both the ingestion augmentor (writes) and
// the read APIs (lazy-score-on-miss, so the feed is warm even before the worker
// has swept a brand-new coin).

import { sql } from '../db.js';
import { assembleIntel, walletProfile, coinOutcome } from './sources.js';
import { classifyNarrative } from './narrative.js';
import { convict } from './conviction.js';

/** Persist a narrative classification. */
export async function upsertNarrative(mint, network, narr) {
	await sql`
		insert into oracle_narrative (mint, network, category, narrative, virality, confidence, tags, source, classified_at)
		values (${mint}, ${network}, ${narr.category}, ${narr.narrative}, ${narr.virality},
		        ${narr.confidence}, ${JSON.stringify(narr.tags || [])}::jsonb, ${narr.source}, now())
		on conflict (mint, network) do update set
			category = excluded.category, narrative = excluded.narrative,
			virality = excluded.virality, confidence = excluded.confidence,
			tags = excluded.tags, source = excluded.source, classified_at = now()
	`;
}

/** Persist a fused conviction verdict for a coin. */
export async function upsertConviction({ mint, network, intel, verdict }) {
	await sql`
		insert into oracle_conviction (
			mint, network, symbol, name, image_uri,
			score, tier, pedigree, structure, narrative, momentum, structure_cap,
			badges, reasons, components, category, smart_wallet_count, coin_first_seen_at, scored_at
		) values (
			${mint}, ${network}, ${intel.symbol || null}, ${intel.name || null}, ${intel.image_uri || null},
			${verdict.score}, ${verdict.tier}, ${verdict.pillars.pedigree}, ${verdict.pillars.structure},
			${verdict.pillars.narrative}, ${verdict.pillars.momentum}, ${verdict.structureCap},
			${JSON.stringify(verdict.badges)}::jsonb, ${JSON.stringify(verdict.reasons)}::jsonb,
			${JSON.stringify(componentSummary(intel))}::jsonb, ${intel.category || null},
			${intel.smartMoney?.smartWalletCount || 0}, ${intel.createdAt || null}, now()
		)
		on conflict (mint, network) do update set
			symbol = excluded.symbol, name = excluded.name, image_uri = excluded.image_uri,
			score = excluded.score, tier = excluded.tier,
			pedigree = excluded.pedigree, structure = excluded.structure,
			narrative = excluded.narrative, momentum = excluded.momentum,
			structure_cap = excluded.structure_cap, badges = excluded.badges,
			reasons = excluded.reasons, components = excluded.components,
			category = excluded.category, smart_wallet_count = excluded.smart_wallet_count,
			scored_at = now()
	`;
}

// Compact audit trail of the normalized inputs that produced a verdict.
function componentSummary(intel) {
	return {
		pedigree: intel.smartMoney,
		structure: intel.structure,
		narrative: intel.narrative,
		behavior: intel.behavior,
		quality: intel.qualityScore,
		risk_flags: intel.riskFlags,
	};
}

/**
 * Score one coin end-to-end. Assembles intel from the brain; if no narrative
 * read exists yet (and classify=true) it runs the classifier and stores it;
 * fuses conviction; caches it. Returns the verdict + intel, or null if the coin
 * is unknown to the brain.
 *
 * @param {string} mint
 * @param {object} opts { network, classify, persist }
 */
export async function scoreCoin(mint, { network = 'mainnet', classify = true, persist = true } = {}) {
	let intel = await assembleIntel(mint, network);
	if (!intel) return null;

	// Ensure a narrative read with a virality estimate. If the brain hasn't given
	// us one (oracle_narrative miss → fallback used a proxy with no virality),
	// classify now and persist so the next read is warm.
	if (classify && (intel.narrative?.virality == null)) {
		const narr = await classifyNarrative({
			name: intel.name, symbol: intel.symbol,
			description: intel.components?.description, // may be undefined; classifier tolerates
		});
		if (persist) { try { await upsertNarrative(mint, network, narr); } catch { /* non-fatal */ } }
		intel = { ...intel, narrative: narr, category: narr.category };
	}

	const verdict = convict(intel);
	if (persist) { try { await upsertConviction({ mint, network, intel, verdict }); } catch { /* non-fatal */ } }
	return { intel, verdict };
}

/**
 * Read the live conviction feed. Serves from the oracle_conviction cache.
 * @param {object} opts { network, limit, minScore, tier, category, sinceSeconds }
 */
export async function readFeed({ network = 'mainnet', limit = 50, minScore = 0, tier = null, category = null, sinceSeconds = 12 * 3600 } = {}) {
	const lim = Math.min(200, Math.max(1, Number(limit) || 50));
	const rows = await sql`
		select mint, symbol, name, image_uri, score, tier, pedigree, structure, narrative, momentum,
		       badges, category, smart_wallet_count, scored_at, coin_first_seen_at
		from oracle_conviction
		where network = ${network}
		  and score >= ${Number(minScore) || 0}
		  and (${tier}::text is null or tier = ${tier})
		  and (${category}::text is null or category = ${category})
		  and scored_at > now() - (${sinceSeconds} || ' seconds')::interval
		order by score desc, scored_at desc
		limit ${lim}
	`;
	return rows.map(rowToFeedItem);
}

/** Newly-scored coins after a cursor — powers the SSE stream. */
export async function feedSince({ network = 'mainnet', sinceIso, limit = 40 } = {}) {
	const rows = await sql`
		select mint, symbol, name, image_uri, score, tier, pedigree, structure, narrative, momentum,
		       badges, category, smart_wallet_count, scored_at, coin_first_seen_at
		from oracle_conviction
		where network = ${network} and scored_at > ${sinceIso}::timestamptz
		order by scored_at asc
		limit ${Math.min(100, Math.max(1, limit))}
	`;
	return rows.map(rowToFeedItem);
}

function rowToFeedItem(r) {
	return {
		mint: r.mint, symbol: r.symbol, name: r.name, image_uri: r.image_uri,
		score: r.score, tier: r.tier,
		pillars: { pedigree: r.pedigree, structure: r.structure, narrative: r.narrative, momentum: r.momentum },
		badges: r.badges || [],
		category: r.category,
		smart_wallet_count: r.smart_wallet_count,
		scored_at: r.scored_at,
		coin_first_seen_at: r.coin_first_seen_at,
	};
}

/** Full intel for one coin: cached verdict + live who's-in trader breakdown. */
export async function readCoin(mint, network = 'mainnet') {
	const cached = await sql`
		select * from oracle_conviction where mint = ${mint} and network = ${network} limit 1
	`.then((r) => r[0]).catch(() => null);

	// "Who's in" — join the coin's wallet footprint to reputation labels, ranked
	// by net SOL in. This is the trader classification the user asked for, live.
	const whosIn = await sql`
		select w.wallet, w.buy_lamports, w.sell_lamports, w.is_creator, w.funder,
		       r.label, r.smart_money_score, r.win_rate, r.early_win_rate
		from pump_coin_wallets w
		left join wallet_reputation r on r.wallet = w.wallet and r.network = ${network}
		where w.mint = ${mint}
		order by w.buy_lamports desc
		limit 40
	`.catch(() => []);

	const [narr, outcome] = await Promise.all([
		sql`select category, narrative, virality, confidence, source from oracle_narrative where mint = ${mint} and network = ${network} limit 1`
			.then((r) => r[0]).catch(() => null),
		coinOutcome(mint, network),
	]);

	return {
		conviction: cached ? rowToFeedItem(cached) : null,
		reasons: cached?.reasons || [],
		components: cached?.components || null,
		structure_cap: cached?.structure_cap ?? null,
		narrative: narr,
		outcome,
		whos_in: whosIn.map((w) => ({
			wallet: w.wallet,
			label: w.label || 'unproven',
			score: w.smart_money_score != null ? Number(w.smart_money_score) : null,
			win_rate: w.win_rate != null ? Number(w.win_rate) : null,
			early_win_rate: w.early_win_rate != null ? Number(w.early_win_rate) : null,
			buy_sol: Number(w.buy_lamports || 0) / 1e9,
			sell_sol: Number(w.sell_lamports || 0) / 1e9,
			is_creator: w.is_creator,
			funder: w.funder,
		})),
	};
}

/** Wallet reputation leaderboard. */
export async function readLeaderboard({ network = 'mainnet', limit = 50, label = null } = {}) {
	const rows = await sql`
		select wallet, label, smart_money_score, win_rate, early_win_rate, dump_rate,
		       coins_traded, early_entries, wins, duds, last_active_at
		from wallet_reputation
		where network = ${network}
		  and (${label}::text is null or label = ${label})
		order by smart_money_score desc nulls last
		limit ${Math.min(200, Math.max(1, limit))}
	`.catch(() => []);
	return rows.map((r) => ({
		wallet: r.wallet, label: r.label, score: Number(r.smart_money_score || 0),
		win_rate: Number(r.win_rate || 0), early_win_rate: Number(r.early_win_rate || 0),
		dump_rate: Number(r.dump_rate || 0), coins_traded: r.coins_traded,
		early_entries: r.early_entries, wins: r.wins, duds: r.duds, last_active_at: r.last_active_at,
	}));
}

/** A wallet's full profile (rep + recent coins). */
export async function readWallet(wallet, network = 'mainnet') {
	return walletProfile(wallet, network);
}

/**
 * Proof of edge: conviction-tier win rate. Joins cached verdicts to ground-truth
 * outcomes and reports, per tier, how often the coin went on to graduate / N×.
 */
export async function convictionBacktest({ network = 'mainnet' } = {}) {
	const rows = await sql`
		select c.tier,
		       count(*)::int                                             as scored,
		       count(o.mint)::int                                        as resolved,
		       coalesce(sum(case when o.graduated then 1 else 0 end),0)::int as graduated,
		       coalesce(sum(case when o.rugged then 1 else 0 end),0)::int    as rugged,
		       coalesce(avg(o.ath_multiple),0)::numeric                  as avg_ath_multiple
		from oracle_conviction c
		left join pump_coin_outcomes o on o.mint = c.mint
		where c.network = ${network}
		group by c.tier
	`.catch(() => []);
	const order = { prime: 0, strong: 1, lean: 2, watch: 3, avoid: 4 };
	return rows
		.map((r) => ({
			tier: r.tier, scored: r.scored, resolved: r.resolved,
			graduated: r.graduated, rugged: r.rugged,
			grad_rate: r.resolved ? Math.round((r.graduated / r.resolved) * 100) : null,
			avg_ath_multiple: Number(r.avg_ath_multiple) || 0,
		}))
		.sort((a, b) => (order[a.tier] ?? 9) - (order[b.tier] ?? 9));
}

// ── Agent watch (action loop config) ─────────────────────────────────────────

export async function getWatch(agentId, network = 'mainnet') {
	return sql`select * from oracle_agent_watch where agent_id = ${agentId} and network = ${network} limit 1`
		.then((r) => r[0] || null).catch(() => null);
}

export async function upsertWatch(agentId, userId, network, cfg) {
	const row = await sql`
		insert into oracle_agent_watch (
			agent_id, user_id, network, armed, mode, min_score, min_tier, categories,
			per_trade_sol, max_daily_sol, max_open, require_smart_money, updated_at
		) values (
			${agentId}, ${userId || null}, ${network}, ${!!cfg.armed}, ${cfg.mode || 'simulate'},
			${cfg.min_score ?? 80}, ${cfg.min_tier || 'strong'}, ${JSON.stringify(cfg.categories || [])}::jsonb,
			${cfg.per_trade_sol ?? 0.05}, ${cfg.max_daily_sol ?? 0.5}, ${cfg.max_open ?? 5},
			${cfg.require_smart_money !== false}, now()
		)
		on conflict (agent_id, network) do update set
			user_id = coalesce(excluded.user_id, oracle_agent_watch.user_id),
			armed = excluded.armed, mode = excluded.mode, min_score = excluded.min_score,
			min_tier = excluded.min_tier, categories = excluded.categories,
			per_trade_sol = excluded.per_trade_sol, max_daily_sol = excluded.max_daily_sol,
			max_open = excluded.max_open, require_smart_money = excluded.require_smart_money,
			updated_at = now()
		returning *
	`;
	return row[0];
}

export async function recentActions(agentId, network = 'mainnet', limit = 50) {
	return sql`
		select mint, symbol, conviction, tier, mode, size_sol, status, reason,
		       tx_signature, peak_multiple, realized_pnl_sol, outcome, acted_at
		from oracle_watch_actions
		where agent_id = ${agentId} and network = ${network}
		order by acted_at desc limit ${Math.min(100, Math.max(1, limit))}
	`.catch(() => []);
}

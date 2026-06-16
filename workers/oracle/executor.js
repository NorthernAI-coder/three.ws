// Oracle worker — action executor.
//
// Turns an approved decision into a logged action. Simulate mode (the default)
// records a realistic action row — entry market cap, conviction, size — and
// spends nothing, so an owner can watch their agent work risk-free. Live mode
// loads the agent's own custodial keypair, builds a pump.fun buy via the same
// PumpTradeClient the production sniper uses, signs, and broadcasts — guarded by
// a hard per-trade SOL cap and full error capture so a bad fill logs 'failed'
// rather than crashing the loop.

import { sql } from '../../api/_lib/db.js';
import { log } from './log.js';
import { loadAgentKeypair } from './keys.js';

const LAMPORTS = 1e9;

/**
 * @param {object} args
 * @param {object} args.cfg     worker config
 * @param {object} args.watch   armed watch row (agent_id, user_id, mode, ...)
 * @param {object} args.coin    scored coin { mint, symbol, score, tier }
 * @param {number} args.size    SOL to commit
 * @param {string} args.reason  decision reason
 * @returns {Promise<{status:string, sig?:string}>}
 */
export async function executeAction({ cfg, watch, coin, size, reason }) {
	const liveRequested = watch.mode === 'live' && cfg.mode === 'live';
	const cappedSize = Math.min(size, cfg.maxTradeSolHardCap);
	const entryMc = await entryMarketCap(coin.mint, cfg.network);

	// Claim the slot first (idempotent-ish): one action row per attempt.
	const base = {
		agent_id: watch.agent_id, user_id: watch.user_id || null, network: cfg.network,
		mint: coin.mint, symbol: coin.symbol || null,
		conviction: coin.score, tier: coin.tier,
		mode: liveRequested ? 'live' : 'simulate', size_sol: cappedSize,
		reason, entry_mc_usd: entryMc,
	};

	if (!liveRequested) {
		await insertAction({ ...base, status: 'filled', tx_signature: null });
		log.info(`SIMULATE buy ${coin.symbol || coin.mint.slice(0, 6)} @ conviction ${coin.score} (${cappedSize} SOL)`);
		return { status: 'filled' };
	}

	// ── live ─────────────────────────────────────────────────────────────────
	try {
		const keys = await loadAgentKeypair(watch.agent_id, watch.user_id, 'oracle_buy');
		if (!keys) {
			await insertAction({ ...base, status: 'skipped', tx_signature: null, reason: 'agent has no Solana wallet' });
			return { status: 'skipped' };
		}
		const sig = await buyOnPump({ network: cfg.network, mint: coin.mint, solAmount: cappedSize, payer: keys.keypair });
		await insertAction({ ...base, status: 'filled', tx_signature: sig });
		log.info(`LIVE buy ${coin.symbol || coin.mint.slice(0, 6)} ${sig}`);
		return { status: 'filled', sig };
	} catch (err) {
		await insertAction({ ...base, status: 'failed', tx_signature: null, reason: `${reason} | exec: ${err.message}`.slice(0, 300) });
		log.warn(`LIVE buy failed ${coin.mint}: ${err.message}`);
		return { status: 'failed' };
	}
}

async function insertAction(a) {
	await sql`
		insert into oracle_watch_actions
			(agent_id, user_id, network, mint, symbol, conviction, tier, mode, size_sol, status, reason, entry_mc_usd, tx_signature, outcome)
		values
			(${a.agent_id}, ${a.user_id}, ${a.network}, ${a.mint}, ${a.symbol}, ${a.conviction}, ${a.tier},
			 ${a.mode}, ${a.size_sol}, ${a.status}, ${a.reason || null}, ${a.entry_mc_usd || null}, ${a.tx_signature || null}, 'open')
	`;
}

async function entryMarketCap(mint, network) {
	try {
		const r = await sql`select last_market_cap_usd from pump_coin_outcomes where mint = ${mint} limit 1`;
		if (r[0]?.last_market_cap_usd) return Number(r[0].last_market_cap_usd);
	} catch { /* table may be absent */ }
	return null;
}

/**
 * Build + sign + send a pump.fun buy from the agent's keypair. Uses the same
 * PumpTradeClient the production trade path uses. Lazy-imports the heavy SDK so
 * the worker boots fast and simulate-only deploys never load it.
 */
async function buyOnPump({ network, mint, solAmount, payer }) {
	const { getPumpTradeClient } = await import('../../api/_lib/pump.js');
	const { client, connection, BN, web3 } = await getPumpTradeClient({ network });
	const { PublicKey, VersionedTransaction, TransactionMessage } = web3;

	const user = payer.publicKey;
	const quoteAmount = new BN(Math.round(solAmount * LAMPORTS));
	const ixs = await client.buildBuyInstructions({
		mint: new PublicKey(mint),
		user,
		quoteAmount,
		slippagePct: 10,
	});

	const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');
	const msg = new TransactionMessage({ payerKey: user, recentBlockhash: blockhash, instructions: ixs }).compileToV0Message();
	const tx = new VersionedTransaction(msg);
	tx.sign([payer]);
	const sig = await connection.sendRawTransaction(tx.serialize(), { skipPreflight: false, maxRetries: 3 });
	await connection.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, 'confirmed');
	return sig;
}

/** Open positions + today's committed SOL for an agent — feeds the decision caps. */
export async function agentBudget(agentId, network) {
	const rows = await sql`
		select
			count(*) filter (where outcome = 'open' and status in ('filled','taken'))::int as open_count,
			coalesce(sum(size_sol) filter (where acted_at > now() - interval '24 hours' and status in ('filled','taken')), 0)::numeric as spent_today
		from oracle_watch_actions
		where agent_id = ${agentId} and network = ${network}
	`.catch(() => [{ open_count: 0, spent_today: 0 }]);
	const r = rows[0] || {};
	return { openCount: Number(r.open_count) || 0, spentTodaySol: Number(r.spent_today) || 0 };
}

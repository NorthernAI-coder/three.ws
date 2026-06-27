// api/_lib/x402/run-reputation-refresh.js
//
// Agent Reputation Score Refresh — autonomous x402 pipeline.
//
// What it does each tick:
//   • Selects the stalest registered Solana agents (those with an on-chain
//     Metaplex Core asset in agent_identities.meta.sol_mint_address).
//   • For each, makes a REAL paid x402 call to /api/mcp tool
//     `solana_agent_reputation` ($0.001 USDC/call) using the platform seed
//     keypair — the on-chain attestation reputation summary (feedback score
//     averages, verified/disputed counts, validation pass/fail).
//   • Writes the extracted score to agent_solana_reputation (one row per agent),
//     flagging agents whose verified score drops below threshold.
//   • Records every call — success or failure — to x402_autonomous_log.
//
// DATA OUT (value extraction):
//   Table  : agent_solana_reputation
//   Columns: score (the headline trust number — verified feedback average when
//            there is verified feedback, else the raw average), feedback_total,
//            feedback_verified, feedback_disputed, validation_passed,
//            validation_failed, flagged (boolean), raw (full response), refreshed_at.
//
// DOWNSTREAM CONSUMERS (read this table via the exported helpers below):
//   • Agent-profile trust badge  → getStoredSolanaReputation(agentId)
//   • Reputation leaderboard     → listSolanaReputationLeaderboard(limit)
//   • Moderation / flagged feed  → listFlaggedSolanaAgents(limit)
//
// This is the on-chain ATTESTATION reputation (feedback + validation memos),
// which is deliberately separate from the financial reputation in
// agent_reputation_scores (computed by api/cron/recompute-reputation.js). The
// two never share a table.

import { randomUUID } from 'node:crypto';

import { sql } from '../db.js';
import { env } from '../env.js';
import { logger } from '../usage.js';
import { prepareSolanaContext, payX402, ensureAutonomousLogTable } from './autonomous-pay.js';

const log = logger('x402-reputation-refresh');

const TOOL = 'solana_agent_reputation';
const SERVICE_NAME = 'Agent Reputation Score Refresh';
const PIPELINE = 'self';
const FALLBACK_USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
// Advertised price of the solana_agent_reputation tool: $0.001 USDC (6 decimals).
// Used only to pre-check the daily cap; the authoritative amount comes from the
// 402 challenge at call time.
const PRICE_ATOMIC = 1000;

// On-chain feedback scores use a 1–5 star scale. Flag an agent whose verified
// average drops below the threshold once it has a meaningful sample. Tunable.
const FLAG_THRESHOLD = Number(process.env.SOLANA_REPUTATION_FLAG_THRESHOLD || 3.0);
const FLAG_MIN_SAMPLE = Number(process.env.SOLANA_REPUTATION_FLAG_MIN_SAMPLE || 3);
// Agents refreshed per run — bounds per-tick spend and RPC/DB load. Stalest
// agents sort first, so coverage rotates across runs (same approach as the
// recompute-reputation cron).
const REFRESH_BATCH = Math.max(1, Number(process.env.SOLANA_REPUTATION_REFRESH_BATCH || 25));

let _ensured = null;
function ensureTable() {
	if (_ensured) return _ensured;
	_ensured = (async () => {
		await sql`
			create table if not exists agent_solana_reputation (
				agent_id          uuid primary key,
				agent_asset       text not null,
				network           text not null default 'mainnet',
				score             numeric(6,3) not null default 0,
				feedback_total    int not null default 0,
				feedback_verified int not null default 0,
				feedback_disputed int not null default 0,
				validation_passed int not null default 0,
				validation_failed int not null default 0,
				flagged           boolean not null default false,
				raw               jsonb,
				refreshed_at      timestamptz not null default now()
			)
		`;
		// Reputation leaderboard: rank agents by stored score cheaply.
		await sql`create index if not exists agent_solana_reputation_score_idx on agent_solana_reputation (score desc)`;
		// Moderation feed: list flagged agents without a full scan.
		await sql`create index if not exists agent_solana_reputation_flagged_idx on agent_solana_reputation (flagged) where flagged = true`;
		// Stalest-first selection for the refresh loop.
		await sql`create index if not exists agent_solana_reputation_refreshed_idx on agent_solana_reputation (refreshed_at asc)`;
		return true;
	})().catch((err) => {
		_ensured = null;
		log.warn('ensure_table_failed', { message: err?.message });
		throw err;
	});
	return _ensured;
}

async function listAgentsToRefresh(limit) {
	// Never-refreshed agents first, then stalest. Only agents with a registered
	// on-chain asset are eligible (those are the ones with attestations to read).
	return sql`
		select a.id,
		       a.name,
		       a.meta->>'sol_mint_address' as asset,
		       coalesce(a.meta->>'network', 'mainnet') as network
		from agent_identities a
		left join agent_solana_reputation r on r.agent_id = a.id
		where a.deleted_at is null
		  and a.meta->>'sol_mint_address' is not null
		order by (r.agent_id is null) desc, r.refreshed_at asc nulls first
		limit ${limit}
	`;
}

function toolBody(asset, network, id) {
	return {
		jsonrpc: '2.0',
		id,
		method: 'tools/call',
		params: { name: TOOL, arguments: { asset, network } },
	};
}

// MCP returns a single JSON-RPC response object (or a 1-element array for a
// batched body). The reputation payload lives in result.structuredContent.
function parseReputation(respBody) {
	const msg = Array.isArray(respBody) ? respBody[0] : respBody;
	const sc = msg?.result?.structuredContent;
	if (!sc || sc.error) return null;
	return sc;
}

// Derive the headline trust score and the flag verdict from a reputation
// payload: { feedback:{ total, verified, disputed, score_avg, score_avg_verified }, validation:{ passed, failed } }.
function evaluate(rep) {
	const fb = rep.feedback || {};
	const val = rep.validation || {};
	const verified = Number(fb.verified || 0);
	const total = Number(fb.total || 0);
	const disputed = Number(fb.disputed || 0);
	const passed = Number(val.passed || 0);
	const failed = Number(val.failed || 0);

	// Prefer the verified-only average (feedback whose task the owner acknowledged
	// on-chain) when any exists; otherwise the raw average.
	const score = Number(verified > 0 ? (fb.score_avg_verified || 0) : (fb.score_avg || 0));
	const sample = verified > 0 ? verified : total;

	const reasons = [];
	if (sample >= FLAG_MIN_SAMPLE && score < FLAG_THRESHOLD) reasons.push(`score ${score.toFixed(2)} < ${FLAG_THRESHOLD}`);
	if (total > 0 && disputed / total > 0.5) reasons.push('majority of feedback disputed');
	if (passed + failed > 0 && failed > passed) reasons.push('validation failing');

	return { score, flagged: reasons.length > 0, reasons, total, verified, disputed, passed, failed };
}

async function upsertReputation(agent, rep, evald) {
	await sql`
		insert into agent_solana_reputation
			(agent_id, agent_asset, network, score, feedback_total, feedback_verified,
			 feedback_disputed, validation_passed, validation_failed, flagged, raw, refreshed_at)
		values
			(${agent.id}, ${agent.asset}, ${agent.network}, ${evald.score},
			 ${evald.total}, ${evald.verified}, ${evald.disputed},
			 ${evald.passed}, ${evald.failed}, ${evald.flagged},
			 ${JSON.stringify(rep)}, now())
		on conflict (agent_id) do update set
			agent_asset       = excluded.agent_asset,
			network           = excluded.network,
			score             = excluded.score,
			feedback_total    = excluded.feedback_total,
			feedback_verified = excluded.feedback_verified,
			feedback_disputed = excluded.feedback_disputed,
			validation_passed = excluded.validation_passed,
			validation_failed = excluded.validation_failed,
			flagged           = excluded.flagged,
			raw               = excluded.raw,
			refreshed_at      = now()
	`;
}

async function recordLog(usdcMint, { runId, endpointUrl, amountAtomic, txSig, responseData, durationMs, success, errorMsg, signalData }) {
	try {
		await sql`
			INSERT INTO x402_autonomous_log
				(run_id, endpoint_type, service_name, endpoint_url,
				 network, amount_atomic, asset, tx_signature,
				 response_data, signal_data, duration_ms, success, error_msg, pipeline)
			VALUES
				(${runId}, ${'self'}, ${SERVICE_NAME}, ${endpointUrl},
				 ${'solana:mainnet'}, ${amountAtomic || 0},
				 ${usdcMint || FALLBACK_USDC_MINT}, ${txSig || null},
				 ${responseData ? JSON.stringify(responseData) : null},
				 ${signalData ? JSON.stringify(signalData) : null},
				 ${durationMs || 0}, ${success}, ${errorMsg || null}, ${PIPELINE})
		`;
	} catch (err) {
		log.warn('autonomous_log_insert_failed', { message: err?.message });
	}
}

/**
 * Run the reputation refresh pipeline.
 *
 * Called by the autonomous loop with a shared Solana context, or directly (e.g.
 * a manual test) with no args — in which case it builds its own context.
 *
 * @param {object} [ctx]
 * @param {string}  [ctx.runId]
 * @param {string}  [ctx.origin]        APP origin (defaults to env.APP_ORIGIN)
 * @param {import('@solana/web3.js').Keypair} [ctx.buyer]
 * @param {import('@solana/web3.js').Connection} [ctx.conn]
 * @param {string}  [ctx.blockhash]
 * @param {object}  [ctx.mintInfo]
 * @param {string}  [ctx.usdcMint]
 * @param {number}  [ctx.remainingCap] atomic USDC the daily cap still allows
 * @returns {Promise<{ ok:boolean, spentAtomic:number, error?:string, summary:object }>}
 */
export async function runReputationRefresh(ctx = {}) {
	const runId = ctx.runId || randomUUID();
	const origin = ctx.origin || env.APP_ORIGIN || 'https://three.ws';
	const usdcMint = ctx.usdcMint || env.X402_ASSET_MINT_SOLANA || FALLBACK_USDC_MINT;
	const endpointUrl = `${origin}/api/mcp`;
	const remainingCap = Number.isFinite(ctx.remainingCap) ? ctx.remainingCap : Infinity;

	await ensureAutonomousLogTable();

	// DB: load eligible agents. A failure here is logged and the run exits — never
	// crashes the loop.
	let agents;
	try {
		await ensureTable();
		agents = await listAgentsToRefresh(REFRESH_BATCH);
	} catch (err) {
		log.error('list_agents_failed', { message: err?.message });
		await recordLog(usdcMint, {
			runId, endpointUrl, amountAtomic: 0, success: false,
			errorMsg: `db_error: ${err?.message || 'unknown'}`, durationMs: 0,
		});
		return { ok: false, error: 'db_error', spentAtomic: 0, summary: { scanned: 0 } };
	}

	if (!agents.length) {
		log.info('no_registered_agents');
		return { ok: true, spentAtomic: 0, summary: { scanned: 0, note: 'no_registered_agents' } };
	}

	// Solana context: reuse the loop's shared per-tick state when provided; else
	// build our own. If the wallet is unconfigured (or RPC is down) we record one
	// log row and exit gracefully — no crash, no partial work.
	let solctx;
	try {
		solctx = (ctx.buyer && ctx.conn && ctx.blockhash && ctx.mintInfo)
			? { buyer: ctx.buyer, conn: ctx.conn, blockhash: ctx.blockhash, mintInfo: ctx.mintInfo, usdcMint }
			: await prepareSolanaContext({ usdcMint });
	} catch (err) {
		log.warn('reputation_refresh_skipped', { reason: err?.message });
		await recordLog(usdcMint, {
			runId, endpointUrl, amountAtomic: 0, success: false,
			errorMsg: `wallet_or_rpc_unavailable: ${err?.message || 'unknown'}`, durationMs: 0,
		});
		return { ok: false, error: 'wallet_unconfigured', spentAtomic: 0, summary: { scanned: 0 } };
	}

	let spentAtomic = 0;
	let paid = 0;
	let stored = 0;
	let flaggedCount = 0;
	let errors = 0;

	for (let i = 0; i < agents.length; i++) {
		const agent = agents[i];

		// Stop before charging again if the next call would exceed the daily cap
		// the loop handed us (Infinity when run directly / uncapped).
		if (Number.isFinite(remainingCap) && spentAtomic + PRICE_ATOMIC > remainingCap) {
			log.info('reputation_cap_reached', { spentAtomic, remainingCap });
			break;
		}

		const t0 = Date.now();
		let amountAtomic = 0;
		let txSig = null;
		let success = false;
		let errorMsg = null;
		let responseData = null;
		let signalData = null;

		try {
			const pay = await payX402({
				...solctx,
				url: endpointUrl,
				method: 'POST',
				body: toolBody(agent.asset, agent.network, i + 1),
				// Distinct nonce per call so these identical-amount ($0.001) payments
				// against the one shared blockhash each produce a unique signature.
				nonce: i + 1,
			});

			responseData = pay.body;
			amountAtomic = pay.amountAtomic || 0;
			txSig = pay.txSig || null;

			// Cap guard: if this call would push us past the daily cap, stop before
			// charging again. (The probe already happened, but no payment was sent
			// on a non-ok result; an ok result means we already paid — so we check
			// the cap on the NEXT iteration via the accumulated spend below.)
			if (!pay.ok) {
				errorMsg = pay.error || `http_${pay.status}`;
				errors++;
			} else {
				const rep = parseReputation(pay.body);
				if (!rep) {
					errorMsg = 'unparseable_response';
					errors++;
				} else {
					const evald = evaluate(rep);
					signalData = {
						agent_id: agent.id, asset: agent.asset, network: agent.network,
						score: evald.score, flagged: evald.flagged, reasons: evald.reasons,
						feedback: rep.feedback, validation: rep.validation,
					};
					try {
						await upsertReputation(agent, rep, evald);
						stored++;
						if (evald.flagged) flaggedCount++;
					} catch (dbErr) {
						// Payment already settled; persisting the value failed. Record the
						// row as a failure with the error so it is retried next tick.
						errorMsg = `store_failed: ${dbErr?.message || 'unknown'}`;
						errors++;
					}
					success = !errorMsg;
					paid++;
					spentAtomic += amountAtomic;
				}
			}
		} catch (err) {
			errorMsg = err?.message || 'unknown_error';
			errors++;
		}

		await recordLog(usdcMint, {
			runId, endpointUrl, amountAtomic, txSig,
			responseData, durationMs: Date.now() - t0, success, errorMsg, signalData,
		});
	}

	log.info('reputation_refresh_complete', {
		run_id: runId, scanned: agents.length, paid, stored,
		flagged: flaggedCount, errors, spent_usdc: (spentAtomic / 1e6).toFixed(4),
	});

	return {
		ok: true,
		spentAtomic,
		summary: { scanned: agents.length, paid, stored, flagged: flaggedCount, errors },
	};
}

// ── Downstream consumers ────────────────────────────────────────────────────
// The data this pipeline extracts is read back through these helpers.

/** Trust badge on an agent profile: the stored on-chain reputation, or null. */
export async function getStoredSolanaReputation(agentId) {
	if (!agentId) return null;
	try {
		const [row] = await sql`
			select agent_id, agent_asset, network, score, feedback_total, feedback_verified,
			       feedback_disputed, validation_passed, validation_failed, flagged, refreshed_at
			from agent_solana_reputation where agent_id = ${agentId} limit 1
		`;
		return row || null;
	} catch {
		return null;
	}
}

/** Reputation leaderboard: top agents by stored on-chain score. */
export async function listSolanaReputationLeaderboard(limit = 50) {
	const n = Math.min(Math.max(1, Number(limit) || 50), 200);
	try {
		return await sql`
			select r.agent_id, r.agent_asset, r.network, r.score, r.feedback_total,
			       r.feedback_verified, r.flagged, r.refreshed_at, a.name
			from agent_solana_reputation r
			join agent_identities a on a.id = r.agent_id and a.deleted_at is null
			where r.feedback_total > 0
			order by r.score desc, r.feedback_verified desc
			limit ${n}
		`;
	} catch {
		return [];
	}
}

/** Moderation feed: agents currently flagged below the trust threshold. */
export async function listFlaggedSolanaAgents(limit = 100) {
	const n = Math.min(Math.max(1, Number(limit) || 100), 500);
	try {
		return await sql`
			select r.agent_id, r.agent_asset, r.network, r.score, r.feedback_total,
			       r.feedback_disputed, r.refreshed_at, a.name
			from agent_solana_reputation r
			join agent_identities a on a.id = r.agent_id and a.deleted_at is null
			where r.flagged = true
			order by r.score asc
			limit ${n}
		`;
	} catch {
		return [];
	}
}

// @ts-check
// Master → agent SOL funding for the autonomous coin launcher.
//
// The launcher never lets the master wallet mint a coin directly — that would
// detach the coin from an avatar identity. Instead the master ('coin-launcher-
// master' in SOLANA_SIGNERS) tops up the NEXT agent in the rotation with exactly
// the per-launch SOL it needs (deploy cost + dev-buy), and that agent signs its
// own pump.fun create. This module is the money-moving half of that handshake:
//
//   loadMasterSigner()        — the master Keypair (or null if unconfigured).
//   masterBalanceSol()        — current master SOL, for the circuit breaker.
//   dailySpentSol(scope,uid)  — SOL already spent today (enforces daily_sol_cap).
//   fundAgentForLaunch(...)   — the guarded transfer: caps, balance, send.
//
// Every transfer routes through sendSol → submitProtected, so it inherits the
// data-driven priority fee, blockhash-refresh rebroadcast, and hard-throw-on-
// revert behaviour — a fund step never drops silently under congestion.

import { sql } from './db.js';
import { decodeSecretKey } from './solana-signers.js';
import { sendSol, getSolBalance } from './avatar-wallet.js';
import { solanaConnection } from './agent-pumpfun.js';

const LAMPORTS_PER_SOL = 1_000_000_000;

// The master signer reuses the dedicated launcher env, falling back to the
// existing x402-launcher wallet so the feature works on current infra. Kept in
// sync with the 'coin-launcher-master' SignerSpec in solana-signers.js.
const MASTER_ENV = 'LAUNCHER_MASTER_SECRET_KEY_B64';
const MASTER_FALLBACK_ENV = 'PUMP_X402_LAUNCHER_SECRET_KEY_B64';

/**
 * Load the master launch wallet keypair, or null when neither env is set.
 * @returns {Promise<import('@solana/web3.js').Keypair|null>}
 */
export async function loadMasterSigner() {
	const secret = process.env[MASTER_ENV] || process.env[MASTER_FALLBACK_ENV] || '';
	if (!secret) return null;
	const bytes = await decodeSecretKey(secret);
	if (!bytes) {
		throw Object.assign(new Error('coin-launcher-master secret did not decode'), { code: 'bad_signer' });
	}
	const { Keypair } = await import('@solana/web3.js');
	return Keypair.fromSecretKey(bytes);
}

/**
 * Current master wallet SOL balance. Null when the master is unconfigured.
 * @param {'mainnet'|'devnet'} network
 * @returns {Promise<number|null>}
 */
export async function masterBalanceSol(network = 'mainnet') {
	const master = await loadMasterSigner();
	if (!master) return null;
	const conn = solanaConnection(network);
	const { sol } = await getSolBalance(conn, master.publicKey);
	return sol;
}

/**
 * SOL the launcher has already committed today (UTC) for a scope. Sums runs that
 * actually moved money (funded/launched/confirmed); dry-run + skipped rows don't
 * count. Drives the daily_sol_cap ceiling.
 * @param {'global'|'user'} scope
 * @param {string|null} userId
 * @returns {Promise<number>}
 */
export async function dailySpentSol(scope, userId = null) {
	const [row] = await sql`
		select coalesce(sum(sol_spent), 0)::float8 as spent
		from launcher_runs
		where scope = ${scope}
		  and ${scope === 'user' ? sql`user_id = ${userId}` : sql`true`}
		  and status in ('funded', 'launched', 'confirmed')
		  and created_at >= date_trunc('day', now())
	`;
	return Number(row?.spent || 0);
}

/**
 * @typedef {Object} FundResult
 * @property {boolean} ok
 * @property {string} [signature]   the funding transfer signature
 * @property {number} [lamports]    lamports moved
 * @property {string} [reason]      why the fund was refused (when ok=false)
 */

/**
 * Guarded master → agent SOL top-up for one launch. Refuses (never throws for a
 * business-rule stop) when a cap would be breached or the master can't cover it,
 * so the engine can record a clean 'skipped' run and trip the breaker. Only a
 * genuine on-chain/RPC failure throws.
 *
 * @param {Object} p
 * @param {string} p.agentAddress      recipient agent Solana pubkey (base58)
 * @param {number} p.sol               SOL to move (per_launch_sol)
 * @param {number} p.perLaunchCapSol   hard ceiling for a single launch
 * @param {number} p.dailyCapSol       remaining daily allowance already computed by caller
 * @param {'mainnet'|'devnet'} [p.network]
 * @param {string} [p.memo]
 * @returns {Promise<FundResult>}
 */
export async function fundAgentForLaunch({
	agentAddress,
	sol,
	perLaunchCapSol,
	dailyCapSol,
	network = 'mainnet',
	memo = 'three.ws launcher',
}) {
	const amount = Number(sol);
	if (!Number.isFinite(amount) || amount <= 0) {
		return { ok: false, reason: 'per_launch_sol must be positive' };
	}
	if (perLaunchCapSol > 0 && amount > perLaunchCapSol) {
		return { ok: false, reason: `per-launch ${amount} SOL exceeds cap ${perLaunchCapSol}` };
	}
	if (dailyCapSol != null && amount > dailyCapSol) {
		return { ok: false, reason: `daily SOL cap reached (${dailyCapSol} remaining)` };
	}

	const master = await loadMasterSigner();
	if (!master) return { ok: false, reason: 'master launch wallet not configured' };

	const conn = solanaConnection(network);
	// Keep a fee buffer so the master never empties below the cost of the very
	// transfer it is about to sign.
	const { sol: masterSol } = await getSolBalance(conn, master.publicKey);
	if (masterSol < amount + 0.002) {
		return { ok: false, reason: `master balance ${masterSol} SOL below ${amount} + fees` };
	}

	const lamports = Math.round(amount * LAMPORTS_PER_SOL);
	const signature = await sendSol({
		connection: conn,
		fromKeypair: master,
		to: agentAddress,
		lamports,
		memo,
		network,
	});
	return { ok: true, signature, lamports };
}

export { LAMPORTS_PER_SOL };

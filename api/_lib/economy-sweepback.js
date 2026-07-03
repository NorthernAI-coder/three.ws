// @ts-check
// api/_lib/economy-sweepback.js
//
// The reverse of economy-master.js. Where the master tops engines UP, sweepback
// brings balances BACK: it walks every configured engine signer in the
// SOLANA_SIGNERS registry and returns SOL — and, where safe, SPL token
// balances — to the ONE economy master wallet. Together the two close the loop:
// master funds engines → engines do the work → surplus consolidates to master.
//
// Destination-locked by construction: the only recipient this module can pay is
// ECONOMY_MASTER_ADDRESS (a module constant, never a parameter). A caller —
// buggy, compromised, or confused — cannot point a sweep anywhere else, so
// consolidation can never become a leak.
//
// Two modes:
//   • 'excess' (default, safe to schedule) — skim only SOL above each signer's
//     operating float (the same refillTo the treasury-topup cron refills to, so
//     the two never oscillate: topup lifts a signer TO its float, sweepback only
//     takes what is ABOVE it). Token balances are swept only from signers that
//     do not operationally hold tokens (`holdsTokens` in the registry protects
//     e.g. the buyback wallet's USDC revenue).
//   • 'drain' (explicit, on-demand) — full consolidation: every token balance
//     transferred, every emptied token account closed (rent refunds straight to
//     the master), then all SOL minus a small fee headroom. Leaves the engines
//     unfunded until the next treasury-topup, so it is for decommission or
//     emergency recovery, never a schedule.

import { SOLANA_SIGNERS, loadSignerKeypair } from './solana-signers.js';
import { ECONOMY_MASTER_ADDRESS } from './economy-master.js';
import { sendSol, LAMPORTS_PER_SOL } from './avatar-wallet.js';
import { submitProtected } from './execution-engine.js';

// Same float the treasury-topup cron refills to — sweep only above it.
const DEFAULT_REFILL_MULTIPLE = 3;

function num(envName, dflt) {
	const v = Number(process.env[envName]);
	return Number.isFinite(v) && v >= 0 ? v : dflt;
}

/** Skip a SOL sweep smaller than this — moving dust costs more than it returns. */
export const MIN_SWEEP_SOL = num('ECONOMY_SWEEPBACK_MIN_SOL', 0.01);
/** Lamports a drained signer keeps to cover its own sweep transaction fees. */
export const DRAIN_HEADROOM_LAMPORTS = 20_000;
/** Most token accounts settled in one transaction (size + CU bound). */
const TOKEN_ACCOUNTS_PER_TX = 6;

/**
 * Compute the guarded per-signer SOL sweep amounts. Pure — no RPC — so the plan
 * is unit-testable and the cron can log it before touching a key.
 *
 * @param {Array<{name:string,pubkey:string,currentSol:number,floorSol:number}>} targets
 * @param {{mode?:'excess'|'drain', minSweepSol?:number}} [opts]
 * @returns {{ plan: Array<{name:string,pubkey:string,sol:number}>, skipped: Array<{name:string,reason:string}>, totalSol: number }}
 */
export function planSweepback(targets, opts = {}) {
	const mode = opts.mode === 'drain' ? 'drain' : 'excess';
	const minSweep = Number.isFinite(opts.minSweepSol) ? opts.minSweepSol : MIN_SWEEP_SOL;
	const plan = [];
	const skipped = [];
	let total = 0;
	for (const t of targets) {
		const available =
			mode === 'drain'
				? round(t.currentSol - DRAIN_HEADROOM_LAMPORTS / LAMPORTS_PER_SOL)
				: round(t.currentSol - t.floorSol);
		if (available < minSweep) {
			skipped.push({ name: t.name, reason: mode === 'drain' ? 'below_dust_threshold' : 'at_or_below_float' });
			continue;
		}
		plan.push({ name: t.name, pubkey: t.pubkey, sol: available });
		total = round(total + available);
	}
	return { plan, skipped, totalSol: total };
}

/**
 * Sweep every non-zero SPL token balance a signer owns to the master's ATA,
 * closing each emptied source account so its rent refund lands on the master
 * too. Covers both the classic token program and Token-2022. Transactions are
 * chunked and submitted through the fee-optimized engine (no Jito tip).
 *
 * @param {object} args
 * @param {import('@solana/web3.js').Connection} args.connection
 * @param {import('@solana/web3.js').Keypair} args.owner
 * @param {'mainnet'|'devnet'} args.network
 * @returns {Promise<{ swept: Array<{mint:string,amount:string,decimals:number,signature:string}>, failed: Array<{mint:string,reason:string}> }>}
 */
async function sweepTokenBalances({ connection, owner, network }) {
	const { PublicKey } = await import('@solana/web3.js');
	const {
		TOKEN_PROGRAM_ID,
		TOKEN_2022_PROGRAM_ID,
		getAssociatedTokenAddressSync,
		createAssociatedTokenAccountIdempotentInstruction,
		createTransferCheckedInstruction,
		createCloseAccountInstruction,
	} = await import('@solana/spl-token');

	const master = new PublicKey(ECONOMY_MASTER_ADDRESS);
	const swept = [];
	const failed = [];

	for (const programId of [TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID]) {
		let accounts;
		try {
			({ value: accounts } = await connection.getParsedTokenAccountsByOwner(owner.publicKey, { programId }));
		} catch (e) {
			failed.push({ mint: `program:${programId.toBase58()}`, reason: `rpc_error: ${e?.message}` });
			continue;
		}
		const holdings = accounts
			.map((a) => ({
				address: a.pubkey,
				mint: a.account.data.parsed?.info?.mint,
				amount: BigInt(a.account.data.parsed?.info?.tokenAmount?.amount || '0'),
				decimals: Number(a.account.data.parsed?.info?.tokenAmount?.decimals || 0),
			}))
			.filter((h) => h.mint && h.amount > 0n);

		for (let i = 0; i < holdings.length; i += TOKEN_ACCOUNTS_PER_TX) {
			const chunk = holdings.slice(i, i + TOKEN_ACCOUNTS_PER_TX);
			const instructions = [];
			for (const h of chunk) {
				const mint = new PublicKey(h.mint);
				const masterAta = getAssociatedTokenAddressSync(mint, master, false, programId);
				instructions.push(
					createAssociatedTokenAccountIdempotentInstruction(owner.publicKey, masterAta, master, mint, programId),
					createTransferCheckedInstruction(h.address, mint, masterAta, owner.publicKey, h.amount, h.decimals, [], programId),
					// Rent refund straight to the master — the destination lock applies
					// to every lamport this module moves, including reclaimed rent.
					createCloseAccountInstruction(h.address, master, owner.publicKey, [], programId),
				);
			}
			try {
				const { signature } = await submitProtected({ network, connection, payer: owner, instructions });
				for (const h of chunk) {
					swept.push({ mint: h.mint, amount: h.amount.toString(), decimals: h.decimals, signature });
				}
			} catch (e) {
				for (const h of chunk) failed.push({ mint: h.mint, reason: e?.message || 'send_failed' });
			}
		}
	}
	return { swept, failed };
}

/**
 * Execute the consolidation sweep across every configured registry signer.
 * Tokens first (their fees and rent refunds settle before the SOL read), then
 * SOL per the mode's plan. Duplicate pubkeys (fallback env vars resolving to
 * the same wallet) are swept once. Never throws for a business-rule stop.
 *
 * @param {object} args
 * @param {import('@solana/web3.js').Connection} args.connection
 * @param {'excess'|'drain'} [args.mode]
 * @param {boolean} [args.includeTokens]
 * @param {'mainnet'|'devnet'} [args.network]
 * @returns {Promise<object>}
 */
export async function sweepBack({ connection, mode = 'excess', includeTokens = true, network = 'mainnet' }) {
	const { PublicKey } = await import('@solana/web3.js');
	const master = ECONOMY_MASTER_ADDRESS;

	let masterSolBefore = null;
	try {
		masterSolBefore = round((await connection.getBalance(new PublicKey(master), 'confirmed')) / LAMPORTS_PER_SOL);
	} catch {
		/* balance context is best-effort; the sweep itself does not need it */
	}

	const seen = new Set();
	const sweptSol = [];
	const sweptTokens = [];
	const failed = [];
	const skipped = [];
	const readErrors = [];

	for (const spec of SOLANA_SIGNERS) {
		if (spec.isMaster || spec.network === 'devnet') continue;
		const { keypair, configured, decodeError } = await loadSignerKeypair(spec);
		if (!configured) continue;
		if (decodeError || !keypair) {
			readErrors.push({ name: spec.name, reason: 'secret_decode_failed' });
			continue;
		}
		const pubkey = keypair.publicKey.toBase58();
		if (pubkey === master) {
			skipped.push({ name: spec.name, reason: 'is_master' });
			continue;
		}
		if (seen.has(pubkey)) {
			skipped.push({ name: spec.name, reason: 'duplicate_pubkey' });
			continue;
		}
		seen.add(pubkey);

		// Tokens first. In excess mode a signer that operationally holds tokens
		// (buyback USDC, withdrawal SPL float, …) keeps them; a drain takes all.
		if (includeTokens && (mode === 'drain' || !spec.holdsTokens)) {
			const tokens = await sweepTokenBalances({ connection, owner: keypair, network });
			for (const t of tokens.swept) sweptTokens.push({ name: spec.name, pubkey, ...t });
			for (const f of tokens.failed) failed.push({ name: spec.name, pubkey, sol: null, reason: `token ${f.mint}: ${f.reason}` });
		}

		let currentSol;
		try {
			currentSol = round((await connection.getBalance(keypair.publicKey, 'confirmed')) / LAMPORTS_PER_SOL);
		} catch (e) {
			readErrors.push({ name: spec.name, pubkey, reason: `rpc_error: ${e?.message}` });
			continue;
		}
		const floorSol = spec.refillTo ?? spec.minSol * DEFAULT_REFILL_MULTIPLE;
		const { plan, skipped: planSkipped } = planSweepback(
			[{ name: spec.name, pubkey, currentSol, floorSol }],
			{ mode },
		);
		skipped.push(...planSkipped);
		for (const step of plan) {
			try {
				const signature = await sendSol({
					connection,
					fromKeypair: keypair,
					to: master,
					lamports: Math.round(step.sol * LAMPORTS_PER_SOL),
					memo: `three.ws sweepback ${spec.name} → economy-master`,
					network,
				});
				sweptSol.push({ name: step.name, pubkey: step.pubkey, sol: step.sol, signature });
			} catch (e) {
				failed.push({ name: step.name, pubkey: step.pubkey, sol: step.sol, reason: e?.message || 'send_failed' });
			}
		}
	}

	let masterSolAfter = null;
	try {
		masterSolAfter = round((await connection.getBalance(new PublicKey(master), 'confirmed')) / LAMPORTS_PER_SOL);
	} catch {
		/* best-effort */
	}

	return {
		mode,
		master,
		masterSolBefore,
		masterSolAfter,
		sweptSol,
		sweptTokens,
		failed,
		skipped,
		readErrors,
		receivedSol: round(sweptSol.reduce((s, f) => s + f.sol, 0)),
	};
}

function round(n) {
	return Math.round(n * 1e9) / 1e9;
}

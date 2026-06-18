// Programmatic $THREE buyback engine.
//
// Converts accumulated platform USDC revenue into onchain buy pressure: market-buy
// $THREE on Jupiter and route the bought tokens into the treasury. This is the
// documented economy policy — "the treasury funds buybacks … buy pressure without
// deflation" (./config.js) — made programmatic, onchain, and publicly auditable.
// NO platform burn: supply is never destroyed by this lane.
//
// Custody vs. accounting are deliberately decoupled:
//   • SPEND is driven by the buyback wallet's live USDC balance (capped per run).
//     The wallet is funded by routing platform revenue into it.
//   • The public "revenue earned" figure reads the agent_revenue_events fee ledger.
// This keeps execution robust (we only ever spend USDC we actually hold) while the
// public ratio stays honest (earned vs. deployed).
//
// The buyback wallet pays SOL tx fees, so it is registered in solana-signers.js
// for the balance-check cron. EXECUTION is gated by THREE_BUYBACK_ENABLED — a
// scheduled run is a recorded no-op until an operator funds the wallet and opts in.

import {
	createAssociatedTokenAccountIdempotentInstruction,
	createTransferInstruction,
	getAssociatedTokenAddressSync,
} from '@solana/spl-token';

import { sql } from '../db.js';
import { getConnection, solanaPubkey } from '../pump.js';
import { SOLANA_USDC_MINT } from '../payments/_config.js';
import { TOKEN_MINT, TOKEN_DECIMALS } from './config.js';
import { treasuryWallet, treasuryWalletOrNull } from './config.js';

const JUP_QUOTE_URL = 'https://lite-api.jup.ag/swap/v1/quote';
const JUP_SWAP_URL = 'https://lite-api.jup.ag/swap/v1/swap';
const MEMO_PROGRAM_ID = 'MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr';

const USDC_DECIMALS = 6;
const USDC_ATOMICS = 10n ** BigInt(USDC_DECIMALS);
const THREE_ATOMICS = 10n ** BigInt(TOKEN_DECIMALS);

// ── policy knobs (env, with safe defaults) ──────────────────────────────────

/** Execution gate. A scheduled run is a recorded no-op unless this is truthy. */
export function isEnabled() {
	return ['1', 'true', 'yes', 'on'].includes(String(process.env.THREE_BUYBACK_ENABLED || '').toLowerCase());
}

function positiveEnvUsd(key, fallback) {
	const raw = process.env[key];
	if (raw === undefined || String(raw).trim() === '') return fallback;
	const n = Number(raw);
	return Number.isFinite(n) && n > 0 ? n : fallback;
}

/** Max USD a single run may deploy — bounds a runaway/over-funded sweep. */
export function maxUsdPerRun() {
	return positiveEnvUsd('THREE_BUYBACK_MAX_USD', 250);
}

/** Below this, a run is skipped so dust doesn't pay more in fees than it buys. */
export function minUsdPerRun() {
	return positiveEnvUsd('THREE_BUYBACK_MIN_USD', 10);
}

/** Jupiter slippage tolerance in basis points (default 3%). */
export function slippageBps() {
	const raw = process.env.THREE_BUYBACK_SLIPPAGE_BPS;
	const n = Number(raw);
	return Number.isFinite(n) && n > 0 && n <= 5000 ? Math.round(n) : 300;
}

/** Load the buyback signer (base64 of 64 secret-key bytes). Null when unset. */
export async function loadBuybackSigner() {
	const b64 = process.env.THREE_BUYBACK_SECRET_KEY_B64;
	if (!b64) return null;
	const { Keypair } = await import('@solana/web3.js');
	const raw = Buffer.from(b64, 'base64');
	if (raw.byteLength !== 64) {
		throw Object.assign(
			new Error(`THREE_BUYBACK_SECRET_KEY_B64: expected 64-byte secret key, got ${raw.byteLength}`),
			{ code: 'bad_signer' },
		);
	}
	return Keypair.fromSecretKey(raw);
}

// ── helpers ─────────────────────────────────────────────────────────────────

const usd = (atomics) => Number(BigInt(atomics)) / Number(USDC_ATOMICS);
const threeTokens = (atomics) => Number(BigInt(atomics)) / Number(THREE_ATOMICS);

/** SPL balance of `owner` for `mint`, in atomics. Missing ATA → 0n (never throws). */
async function splBalanceAtomics(connection, ownerPk, mintPk) {
	const ata = getAssociatedTokenAddressSync(mintPk, ownerPk, true);
	try {
		const bal = await connection.getTokenAccountBalance(ata);
		return BigInt(bal.value.amount);
	} catch {
		return 0n; // ATA not yet created → zero balance
	}
}

async function fetchJson(url, opts) {
	const r = await fetch(url, opts);
	const body = await r.json().catch(() => ({}));
	if (!r.ok) {
		throw Object.assign(new Error(`jupiter ${r.status}: ${JSON.stringify(body).slice(0, 200)}`), {
			code: 'jupiter_error',
			status: r.status,
		});
	}
	return body;
}

/** ExactIn quote: how much $THREE `usdcAtomics` of USDC buys. */
async function jupiterQuote(usdcAtomics) {
	const u = new URL(JUP_QUOTE_URL);
	u.searchParams.set('inputMint', SOLANA_USDC_MINT);
	u.searchParams.set('outputMint', TOKEN_MINT);
	u.searchParams.set('amount', String(usdcAtomics));
	u.searchParams.set('slippageBps', String(slippageBps()));
	u.searchParams.set('swapMode', 'ExactIn');
	return fetchJson(u.toString(), { headers: { accept: 'application/json' } });
}

/** Build the signed-by-us swap transaction (base64) for `quote`. */
async function jupiterSwapTx(quote, userPublicKey) {
	const data = await fetchJson(JUP_SWAP_URL, {
		method: 'POST',
		headers: { 'content-type': 'application/json', accept: 'application/json' },
		body: JSON.stringify({
			quoteResponse: quote,
			userPublicKey,
			// USDC→$THREE never touches wrapped SOL; let Jupiter manage the $THREE ATA.
			wrapAndUnwrapSol: false,
			dynamicComputeUnitLimit: true,
			prioritizationFeeLamports: {
				priorityLevelWithMaxLamports: { maxLamports: 1_000_000, priorityLevel: 'medium' },
			},
		}),
	});
	if (!data.swapTransaction) {
		throw Object.assign(new Error('jupiter returned no swapTransaction'), { code: 'no_swap_tx' });
	}
	return data.swapTransaction;
}

// ── plan ──────────────────────────────────────────────────────────────────-

/**
 * Decide how much to deploy this run and quote it. Pure of any signing/sending.
 * @param {string} signerPubkey base58 of the buyback wallet
 * @returns {Promise<object>} { ok, reason?, spendUsdcAtomics, walletUsdcAtomics, quote?, expectedThreeAtomics?, priceUsd? }
 */
export async function planBuyback(signerPubkey) {
	const connection = getConnection({ network: 'mainnet' });
	const walletUsdc = await splBalanceAtomics(connection, solanaPubkey(signerPubkey), solanaPubkey(SOLANA_USDC_MINT));

	const capAtomics = BigInt(Math.floor(maxUsdPerRun() * Number(USDC_ATOMICS)));
	const minAtomics = BigInt(Math.floor(minUsdPerRun() * Number(USDC_ATOMICS)));
	const spend = walletUsdc > capAtomics ? capAtomics : walletUsdc;

	if (spend < minAtomics) {
		return {
			ok: false,
			reason: walletUsdc === 0n ? 'empty' : 'below_threshold',
			walletUsdcAtomics: walletUsdc,
			spendUsdcAtomics: 0n,
		};
	}

	const quote = await jupiterQuote(spend);
	const expectedThree = BigInt(quote.outAmount ?? 0);
	if (expectedThree <= 0n) {
		return { ok: false, reason: 'no_quote', walletUsdcAtomics: walletUsdc, spendUsdcAtomics: spend };
	}
	const priceUsd = usd(spend) / threeTokens(expectedThree);

	return {
		ok: true,
		walletUsdcAtomics: walletUsdc,
		spendUsdcAtomics: spend,
		quote,
		expectedThreeAtomics: expectedThree,
		priceUsd,
	};
}

// ── execute ─────────────────────────────────────────────────────────────────

/**
 * Sign + send the Jupiter buy, then sweep the bought $THREE into the treasury
 * when the buyback wallet is not itself the treasury. Returns a receipt; throws
 * with a `.code` on hard failure so the caller records the precise reason.
 */
export async function executeBuyback(signer, plan) {
	const { VersionedTransaction, Transaction, TransactionInstruction, PublicKey } = await import('@solana/web3.js');
	const connection = getConnection({ network: 'mainnet' });
	const payer = signer.publicKey;

	// 1) Buy: deserialize Jupiter's tx, sign as the buyer, broadcast, confirm.
	const swapB64 = await jupiterSwapTx(plan.quote, payer.toBase58());
	const buyTx = VersionedTransaction.deserialize(Buffer.from(swapB64, 'base64'));
	buyTx.sign([signer]);
	const buySig = await connection.sendRawTransaction(buyTx.serialize(), { maxRetries: 5 });
	try {
		await connection.confirmTransaction(buySig, 'confirmed');
	} catch (waitErr) {
		throw Object.assign(
			new Error(`buyback ${buySig} submitted but confirmation timed out (${waitErr?.message || waitErr})`),
			{ code: 'tx_unconfirmed', status: 'pending', buySignature: buySig },
		);
	}

	const mintPk = new PublicKey(TOKEN_MINT);
	const boughtAtomics = await splBalanceAtomics(connection, payer, mintPk);

	// 2) Sweep to treasury — unless the buyback wallet IS the treasury (then the
	// $THREE already lives there). treasuryWallet() fails closed in production.
	const treasury = treasuryWallet();
	let sweepSig = null;
	if (treasury !== payer.toBase58() && boughtAtomics > 0n) {
		const treasuryPk = new PublicKey(treasury);
		const fromAta = getAssociatedTokenAddressSync(mintPk, payer, true);
		const toAta = getAssociatedTokenAddressSync(mintPk, treasuryPk, true);
		const tx = new Transaction();
		tx.add(createAssociatedTokenAccountIdempotentInstruction(payer, toAta, treasuryPk, mintPk));
		tx.add(createTransferInstruction(fromAta, toAta, payer, boughtAtomics));
		const tag = `three.ws buyback → treasury $${usd(plan.spendUsdcAtomics).toFixed(2)}`.slice(0, 180);
		tx.add(new TransactionInstruction({ keys: [], programId: new PublicKey(MEMO_PROGRAM_ID), data: Buffer.from(tag, 'utf8') }));
		const { blockhash } = await connection.getLatestBlockhash('confirmed');
		tx.recentBlockhash = blockhash;
		tx.feePayer = payer;
		tx.sign(signer);
		sweepSig = await connection.sendRawTransaction(tx.serialize(), { maxRetries: 5 });
		try {
			await connection.confirmTransaction(sweepSig, 'confirmed');
		} catch (waitErr) {
			// The buy already landed; surface a sweep-specific failure so the next
			// run self-heals (it sweeps any pre-existing $THREE before buying more).
			throw Object.assign(
				new Error(`buyback bought $THREE (${buySig}) but treasury sweep ${sweepSig} did not confirm (${waitErr?.message || waitErr})`),
				{ code: 'sweep_failed', status: 'pending', buySignature: buySig, sweepSignature: sweepSig, boughtAtomics },
			);
		}
	}

	return {
		buySignature: buySig,
		sweepSignature: sweepSig,
		boughtAtomics,
		treasury,
		priceUsd: plan.priceUsd,
	};
}

/**
 * Self-heal: if a prior run bought $THREE but the treasury sweep didn't land, the
 * tokens sit in the buyback wallet. Sweep them before buying more. Returns the
 * sweep signature, or null when there's nothing to sweep / wallet is the treasury.
 */
export async function sweepStrandedThree(signer) {
	const treasury = treasuryWalletOrNull();
	if (!treasury || treasury === signer.publicKey.toBase58()) return null;
	const { Transaction, TransactionInstruction, PublicKey } = await import('@solana/web3.js');
	const connection = getConnection({ network: 'mainnet' });
	const payer = signer.publicKey;
	const mintPk = new PublicKey(TOKEN_MINT);
	const stranded = await splBalanceAtomics(connection, payer, mintPk);
	if (stranded <= 0n) return null;

	const treasuryPk = new PublicKey(treasury);
	const fromAta = getAssociatedTokenAddressSync(mintPk, payer, true);
	const toAta = getAssociatedTokenAddressSync(mintPk, treasuryPk, true);
	const tx = new Transaction();
	tx.add(createAssociatedTokenAccountIdempotentInstruction(payer, toAta, treasuryPk, mintPk));
	tx.add(createTransferInstruction(fromAta, toAta, payer, stranded));
	tx.add(new TransactionInstruction({ keys: [], programId: new PublicKey(MEMO_PROGRAM_ID), data: Buffer.from('three.ws buyback → treasury (recover)', 'utf8') }));
	const { blockhash } = await connection.getLatestBlockhash('confirmed');
	tx.recentBlockhash = blockhash;
	tx.feePayer = payer;
	tx.sign(signer);
	const sig = await connection.sendRawTransaction(tx.serialize(), { maxRetries: 5 });
	await connection.confirmTransaction(sig, 'confirmed');
	return sig;
}

// ── accounting / public stats ────────────────────────────────────────────────

/** Lifetime platform USDC fee revenue (atomics, 6dp) — the "earned" figure. */
export async function revenueFeeAtomicsToDate() {
	const rows = await sql`
		select coalesce(sum(fee_amount), 0)::bigint as total
		from agent_revenue_events
		where currency_mint = ${SOLANA_USDC_MINT} and chain = 'solana'
	`.catch(() => [{ total: 0 }]);
	return BigInt(rows[0]?.total ?? 0);
}

/**
 * Public buyback summary for the $THREE token page: revenue earned vs. USDC
 * deployed into $THREE buybacks, $THREE accumulated, and the latest run.
 */
export async function buybackStats() {
	const [agg, lastRow, revenueAtomics] = await Promise.all([
		sql`
			select
				coalesce(sum(usdc_spent_atomics), 0)::bigint   as usdc_spent,
				coalesce(sum(three_bought_atomics), 0)::bigint as three_bought,
				count(*)::int                                   as runs
			from three_buyback_runs
			where status = 'confirmed'
		`.catch(() => [{ usdc_spent: 0, three_bought: 0, runs: 0 }]),
		sql`
			select status, usdc_spent_atomics, three_bought_atomics, price_usd, buy_signature, created_at
			from three_buyback_runs
			where status = 'confirmed'
			order by created_at desc
			limit 1
		`.catch(() => []),
		revenueFeeAtomicsToDate(),
	]);

	const usdcSpent = BigInt(agg[0]?.usdc_spent ?? 0);
	const threeBought = BigInt(agg[0]?.three_bought ?? 0);
	const revenueUsd = usd(revenueAtomics);
	const deployedUsd = usd(usdcSpent);
	const last = lastRow[0] || null;

	return {
		enabled: isEnabled(),
		revenue_usd: revenueUsd,
		deployed_usd: deployedUsd,
		// Share of platform revenue already converted to onchain buy pressure.
		deployed_pct: revenueUsd > 0 ? Math.min(100, (deployedUsd / revenueUsd) * 100) : 0,
		three_bought: threeTokens(threeBought),
		runs: agg[0]?.runs ?? 0,
		last_run: last
			? {
					at: last.created_at,
					usdc: usd(last.usdc_spent_atomics),
					three: threeTokens(last.three_bought_atomics),
					price_usd: last.price_usd != null ? Number(last.price_usd) : null,
					signature: last.buy_signature,
				}
			: null,
	};
}

export { usd as usdcAtomicsToUsd, threeTokens as threeAtomicsToTokens };

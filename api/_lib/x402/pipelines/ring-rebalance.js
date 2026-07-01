// api/_lib/x402/pipelines/ring-rebalance.js
//
// Ring rebalancer — recirculate the closed-loop float so it never drains.
//
// In the closed agent economy, ring payer wallets pay USDC to the treasury
// (X402_PAY_TO_SOLANA). Left alone the payer drains and the treasury fills, and
// the loop halts on insufficient balance. This pipeline sweeps USDC from the
// treasury BACK to the payer so the same float cycles indefinitely — which is
// what makes "thousands in gross volume" cost only network fees instead of
// thousands in principal.
//
// Every transfer is between platform-controlled wallets only (treasury → payer).
// The sponsor (X402_FEE_PAYER_SECRET_BASE58) pays the Solana fee so all SOL burn
// stays on ONE monitored wallet; if the sponsor key is absent the treasury
// self-pays. Recorded in x402_ring_ledger (kind='sweep'). It moves OUR money in a
// circle — it is NOT spend, so it returns amountAtomic:0 and never consumes the
// autonomous loop's daily spend cap.
//
// OFF unless X402_TREASURY_SECRET_BASE58 is set (the treasury signing key). Until
// then run() is a graceful no-op.

import bs58 from 'bs58';
import {
	PublicKey, Keypair, TransactionMessage, VersionedTransaction, ComputeBudgetProgram,
} from '@solana/web3.js';
import {
	getAssociatedTokenAddressSync, getAccount, getMint,
	createTransferCheckedInstruction, createAssociatedTokenAccountIdempotentInstruction,
	TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID,
} from '@solana/spl-token';

import { sql as defaultSql } from '../../db.js';
import { env } from '../../env.js';
import { logger } from '../../usage.js';
import { solanaConnection } from '../../solana/connection.js';
import { loadSeedKeypair, USDC_MINT } from '../pay.js';

const log = logger('x402-ring-rebalance');

function loadKp(b58) {
	const raw = bs58.decode(b58);
	if (raw.length !== 64) throw new Error(`keypair expected 64 bytes, got ${raw.length}`);
	return Keypair.fromSecretKey(raw);
}

// Keep this much USDC in the treasury after a sweep (default 0 — sweep all).
const TREASURY_BUFFER_ATOMIC = BigInt(process.env.X402_RING_TREASURY_BUFFER_ATOMIC || 0);
// Don't bother sweeping dust — default $0.10 minimum.
const MIN_SWEEP_ATOMIC = BigInt(process.env.X402_RING_MIN_SWEEP_ATOMIC || 100_000);

async function confirmSignature(conn, signature, timeoutMs = 30_000) {
	const deadline = Date.now() + timeoutMs;
	for (;;) {
		const { value } = await conn.getSignatureStatuses([signature]);
		const st = value?.[0];
		if (st) {
			if (st.err) return { confirmed: false, err: JSON.stringify(st.err) };
			if (st.confirmationStatus === 'confirmed' || st.confirmationStatus === 'finalized') {
				return { confirmed: true };
			}
		}
		if (Date.now() > deadline) return { confirmed: false, err: 'confirm_timeout' };
		await new Promise((r) => setTimeout(r, 1200));
	}
}

export async function run(ctx = {}) {
	const sql = ctx.sql || defaultSql;
	const runId = ctx.runId || null;

	const treasurySecret = process.env.X402_TREASURY_SECRET_BASE58;
	if (!treasurySecret) return { success: true, skipped: true, amountAtomic: 0, note: 'treasury_secret_unset' };
	if (!USDC_MINT) return { success: true, skipped: true, amountAtomic: 0, note: 'usdc_mint_unset' };

	let treasury;
	try {
		treasury = loadKp(treasurySecret);
	} catch (err) {
		return { success: false, amountAtomic: 0, errorMsg: `bad_treasury_key:${err.message}` };
	}
	if (env.X402_PAY_TO_SOLANA && treasury.publicKey.toBase58() !== env.X402_PAY_TO_SOLANA) {
		return {
			success: false,
			amountAtomic: 0,
			errorMsg: `treasury_pubkey_mismatch:${treasury.publicKey.toBase58()}!=${env.X402_PAY_TO_SOLANA}`,
		};
	}

	let payerKp;
	try {
		payerKp = loadSeedKeypair();
	} catch {
		return { success: true, skipped: true, amountAtomic: 0, note: 'payer_unset' };
	}
	const payerPub = payerKp.publicKey;

	const conn = ctx.conn || solanaConnection({ url: env.SOLANA_RPC_URL, commitment: 'confirmed' });
	const mint = new PublicKey(USDC_MINT);
	const treasuryAta = getAssociatedTokenAddressSync(mint, treasury.publicKey, false, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID);

	let balance = 0n;
	try {
		const acc = await getAccount(conn, treasuryAta);
		balance = acc.amount;
	} catch {
		return { success: true, skipped: true, amountAtomic: 0, note: 'treasury_ata_empty' };
	}

	if (balance <= TREASURY_BUFFER_ATOMIC) {
		return { success: true, skipped: true, amountAtomic: 0, note: `below_buffer:${balance}` };
	}
	const sweep = balance - TREASURY_BUFFER_ATOMIC;
	if (sweep < MIN_SWEEP_ATOMIC) {
		return { success: true, skipped: true, amountAtomic: 0, note: `below_min_sweep:${sweep}` };
	}

	// Sponsor pays the fee so SOL burn stays on one wallet; else treasury self-pays.
	let feePayerKp = treasury;
	const sponsorSecret = process.env.X402_FEE_PAYER_SECRET_BASE58;
	if (sponsorSecret) {
		try {
			feePayerKp = loadKp(sponsorSecret);
		} catch {
			feePayerKp = treasury;
		}
	}

	const payerAta = getAssociatedTokenAddressSync(mint, payerPub, false, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID);
	const payerAtaInfo = await conn.getAccountInfo(payerAta).catch(() => null);
	const mintInfo = await getMint(conn, mint);
	const { blockhash } = await conn.getLatestBlockhash('confirmed');

	const ixs = [
		ComputeBudgetProgram.setComputeUnitLimit({ units: 60_000 }),
		ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 5 }),
	];
	if (!payerAtaInfo) {
		ixs.push(createAssociatedTokenAccountIdempotentInstruction(
			feePayerKp.publicKey, payerAta, payerPub, mint, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID,
		));
	}
	ixs.push(createTransferCheckedInstruction(
		treasuryAta, mint, payerAta, treasury.publicKey, sweep, mintInfo.decimals, [], TOKEN_PROGRAM_ID,
	));

	const msg = new TransactionMessage({
		payerKey: feePayerKp.publicKey,
		recentBlockhash: blockhash,
		instructions: ixs,
	}).compileToV0Message();
	const vtx = new VersionedTransaction(msg);
	const signers = feePayerKp.publicKey.equals(treasury.publicKey)
		? [treasury]
		: [feePayerKp, treasury];
	vtx.sign(signers);

	let signature;
	try {
		signature = await conn.sendRawTransaction(vtx.serialize(), { skipPreflight: false, maxRetries: 5 });
	} catch (err) {
		return { success: false, amountAtomic: 0, errorMsg: `sweep_broadcast_failed:${String(err?.message || err).slice(0, 200)}` };
	}

	const conf = await confirmSignature(conn, signature);
	if (!conf.confirmed) {
		return { success: false, amountAtomic: 0, txSig: signature, errorMsg: `sweep_not_confirmed:${conf.err}` };
	}

	try {
		await sql`
			INSERT INTO x402_ring_ledger (kind, from_wallet, to_wallet, mint, amount_atomic, tx_sig, run_id)
			VALUES ('sweep', ${treasury.publicKey.toBase58()}, ${payerPub.toBase58()},
			        ${USDC_MINT}, ${Number(sweep)}, ${signature}, ${runId})
		`;
	} catch (err) {
		log.warn('sweep_ledger_write_failed', { message: err?.message });
	}

	log.info('ring_rebalance_swept', {
		amount_atomic: Number(sweep),
		to: payerPub.toBase58(),
		tx: signature,
	});

	return {
		success: true,
		amountAtomic: 0, // recirculation, not spend — cap-neutral
		txSig: signature,
		note: `swept ${Number(sweep) / 1e6} USDC treasury→payer`,
	};
}

// Verify an on-chain SOL or $THREE transfer into the platform deposit wallet and
// credit the depositor's prepaid balance (api/_lib/credits.js).
//
// Trust model (server-authoritative — a client "I paid" claim is never trusted):
//   1. The transaction is confirmed and didn't error on-chain.
//   2. A SIGNER of the transaction is a Solana wallet linked to the authenticated
//      user — binds the deposit to the right account and stops anyone from
//      claiming someone else's transfer by pasting its signature.
//   3. The platform deposit wallet actually received funds — computed from pre/post
//      balances (lamport delta for SOL, token-balance delta for $THREE), robust to
//      a destination ATA created within the same transaction and to which transfer
//      variant was used.
//   4. The credit is idempotent on the tx signature (UNIQUE idempotency_key), so
//      the same deposit can never be credited twice.
//
// Deposited funds land in the treasury / x402 receive wallet — the platform's
// prepaid float. Spending credits is internal ledger accounting; the treasury →
// buyback / holder-reflection loop runs from there (see token/config.js economy
// note). Deposits are therefore NOT split on receipt.

import { solanaConnection } from './solana/connection.js';
import { sql } from './db.js';
import { env } from './env.js';
import { creditAccount } from './credits.js';
import { TOKEN_MINT, TOKEN_DECIMALS, treasuryWalletOrNull } from './token/config.js';
import { getTokenPriceUsd } from './token/price.js';
import { solanaMintUsdPrice } from './balances.js';

const SOL_MINT = 'So11111111111111111111111111111111111111112';
const LAMPORTS_PER_SOL = 1_000_000_000;

/**
 * The single Solana address users send deposits to. Defaults to the existing x402
 * Solana receive wallet (then the treasury) so a working deploy needs no new env;
 * set CREDITS_DEPOSIT_WALLET_SOLANA to route deposits to a dedicated wallet.
 */
export function depositWallet() {
	return (
		(process.env.CREDITS_DEPOSIT_WALLET_SOLANA || '').trim() ||
		env.X402_PAY_TO_SOLANA ||
		treasuryWalletOrNull() ||
		null
	);
}

function rpcUrl(network) {
	return network === 'devnet'
		? env.SOLANA_RPC_URL_DEVNET || 'https://api.devnet.solana.com'
		: env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';
}

function depositError(message, status = 422, code = 'deposit_unverified', extra = {}) {
	return Object.assign(new Error(message), { status, code, ...extra });
}

function isSolAddress(s) {
	return typeof s === 'string' && /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(s);
}

/** Set of Solana addresses linked to a user (user_wallets + legacy wallet_address). */
export async function linkedSolanaWallets(user) {
	const rows = await sql`
		select address from user_wallets where user_id = ${user.id} and chain_type = 'solana'
	`;
	const set = new Set(rows.map((r) => r.address));
	if (user.wallet_address && isSolAddress(user.wallet_address)) set.add(user.wallet_address);
	return set;
}

function accountKeyStr(k) {
	return k?.pubkey?.toString?.() || String(k?.pubkey ?? '');
}

/** Signers of a parsed transaction, as base58 strings. */
function signerSet(tx) {
	const keys = tx.transaction?.message?.accountKeys || [];
	const out = new Set();
	for (const k of keys) if (k.signer) out.add(accountKeyStr(k));
	return out;
}

// Net SPL atomics credited to `owner` for `mint`, from pre/post token balances.
function tokenCreditedTo(tx, { mint, owner }) {
	const pre = tx.meta?.preTokenBalances || [];
	const post = tx.meta?.postTokenBalances || [];
	let delta = 0n;
	for (const p of post) {
		if (p.mint !== mint || p.owner !== owner) continue;
		const before = pre.find((x) => x.accountIndex === p.accountIndex);
		delta += BigInt(p.uiTokenAmount?.amount ?? '0') - BigInt(before?.uiTokenAmount?.amount ?? '0');
	}
	return delta;
}

// Net lamports credited to `owner`, from pre/post native balances (index-aligned
// with accountKeys in a parsed transaction).
function lamportsCreditedTo(tx, owner) {
	const keys = tx.transaction?.message?.accountKeys || [];
	const idx = keys.findIndex((k) => accountKeyStr(k) === owner);
	if (idx < 0) return 0n;
	const pre = BigInt(tx.meta?.preBalances?.[idx] ?? 0);
	const post = BigInt(tx.meta?.postBalances?.[idx] ?? 0);
	return post - pre;
}

/**
 * Verify a deposit transaction and credit the user's prepaid balance.
 * @param {{ user: object, asset: 'SOL'|'THREE', txSignature: string, network?: string }} args
 * @returns {Promise<object>} credit result for the API response
 */
export async function verifyAndCreditDeposit({ user, asset, txSignature, network = 'mainnet' }) {
	const sink = depositWallet();
	if (!sink) throw depositError('the deposit wallet is not configured', 503, 'deposit_unavailable');

	const assetU = String(asset || '').toUpperCase();
	if (assetU !== 'SOL' && assetU !== 'THREE') throw depositError('asset must be SOL or THREE', 400, 'bad_request');
	if (typeof txSignature !== 'string' || txSignature.length < 32 || txSignature.length > 128) {
		throw depositError('a valid tx_signature is required', 400, 'bad_request');
	}

	const connection = solanaConnection({ url: rpcUrl(network), commitment: 'confirmed' });
	let tx;
	try {
		tx = await connection.getParsedTransaction(txSignature, {
			maxSupportedTransactionVersion: 0,
			commitment: 'confirmed',
		});
	} catch {
		throw depositError('transaction not found — it may need more confirmations', 422, 'tx_not_found');
	}
	if (!tx) throw depositError('transaction not found — it may need more confirmations', 422, 'tx_not_found');
	if (tx.meta?.err) throw depositError('transaction failed on-chain', 422, 'tx_failed');

	// Bind the deposit to the authenticated user: a signer must be one of their
	// linked Solana wallets.
	const linked = await linkedSolanaWallets(user);
	const matched = [...signerSet(tx)].find((s) => linked.has(s));
	if (!matched) {
		throw depositError(
			'this transfer was not signed by a wallet linked to your account — sign in with the sending wallet, or link it, then retry',
			403,
			'wallet_not_linked',
		);
	}

	let usd;
	let assetAmount;
	let priceUsd;
	let amount; // human units, for display
	if (assetU === 'SOL') {
		const lamports = lamportsCreditedTo(tx, sink);
		if (lamports <= 0n) {
			throw depositError('no SOL was received at the deposit wallet in this transaction', 422, 'no_funds_received');
		}
		priceUsd = await solanaMintUsdPrice(SOL_MINT);
		if (!(priceUsd > 0)) throw depositError('live SOL price unavailable — try again shortly', 503, 'price_unavailable');
		assetAmount = lamports;
		amount = Number(lamports) / LAMPORTS_PER_SOL;
		usd = amount * priceUsd;
	} else {
		const atomics = tokenCreditedTo(tx, { mint: TOKEN_MINT, owner: sink });
		if (atomics <= 0n) {
			throw depositError('no $THREE was received at the deposit wallet in this transaction', 422, 'no_funds_received');
		}
		const p = await getTokenPriceUsd();
		priceUsd = p.priceUsd;
		assetAmount = atomics;
		amount = Number(atomics) / 10 ** TOKEN_DECIMALS;
		usd = amount * priceUsd;
	}

	usd = Math.round(usd * 1e6) / 1e6;
	if (!(usd > 0)) throw depositError('deposit amount rounds to zero at the current price', 422, 'amount_too_small');

	const res = await creditAccount({
		userId: user.id,
		amountUsd: usd,
		kind: 'deposit',
		refType: assetU === 'SOL' ? 'deposit_sol' : 'deposit_three',
		refId: txSignature,
		txSignature,
		asset: assetU,
		assetAmount,
		priceUsd,
		idempotencyKey: `deposit:${txSignature}`,
		meta: { slot: tx.slot ?? null, signer: matched, amount, network },
	});

	return {
		ok: true,
		replay: res.replay,
		balance_usd: res.balanceUsd,
		credited_usd: res.replay ? 0 : usd,
		usd,
		asset: assetU,
		amount,
		price_usd: priceUsd,
		tx_signature: txSignature,
	};
}

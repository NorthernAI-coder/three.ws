// Avatar demo wallet — a single custodial Solana wallet that an embeddable
// 3D-avatar widget owns and can autonomously spend from (see
// /api/agent/wallet, /api/agent/send-sol and pages/avatar-wallet-chat.html).
//
// Security model (deliberately scoped for a low-value demo wallet):
//   - The signing secret never leaves the server — it lives only in the
//     AVATAR_WALLET_SECRET env var and is loaded on demand to sign.
//   - Every send is hard-capped at AVATAR_MAX_SEND_USD (default $2) so a
//     compromised/abused widget can move at most a couple of dollars per call.
//   - The recipient is validated as a real base58 pubkey; an optional
//     AVATAR_DEFAULT_RECIPIENT is the "send me" target when none is given.
//   - Fund this wallet with only a few dollars of SOL. It is a demo wallet,
//     not a treasury.

import {
	Connection,
	Keypair,
	LAMPORTS_PER_SOL,
	PublicKey,
	SystemProgram,
	Transaction,
	TransactionInstruction,
} from '@solana/web3.js';
import bs58 from 'bs58';

const bs58decode = bs58.default ? bs58.default.decode : bs58.decode;

// SPL Memo program — used to stamp every avatar payment on-chain so the
// transaction is self-describing in an explorer.
const MEMO_PROGRAM_ID = new PublicKey('MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr');

const DEFAULT_MAINNET_RPC = 'https://api.mainnet-beta.solana.com';
const DEFAULT_DEVNET_RPC = 'https://api.devnet.solana.com';

/**
 * Parse a Solana secret key from any of the common encodings into a Keypair:
 *   - JSON byte array ("[12,34,...]")
 *   - base58 string (Phantom export format)
 *   - base64 string (64-byte secret)
 * Throws a tagged error if no/invalid secret is supplied.
 */
export function loadAvatarKeypair(secret) {
	const trimmed = (secret || '').trim();
	if (!trimmed) {
		throw Object.assign(new Error('avatar wallet not configured (set AVATAR_WALLET_SECRET)'), {
			code: 'no_wallet',
		});
	}

	let bytes = null;
	if (trimmed.startsWith('[')) {
		bytes = Uint8Array.from(JSON.parse(trimmed));
	} else {
		// Try base58 first (Phantom), then base64. A 64-byte result wins.
		for (const decode of [() => bs58decode(trimmed), () => new Uint8Array(Buffer.from(trimmed, 'base64'))]) {
			try {
				const b = decode();
				if (b && b.length === 64) {
					bytes = b;
					break;
				}
			} catch {
				/* try next encoding */
			}
		}
	}

	if (!bytes || bytes.length !== 64) {
		throw Object.assign(new Error('invalid AVATAR_WALLET_SECRET (expected a 64-byte base58/base64/json secret key)'), {
			code: 'bad_wallet',
		});
	}
	return Keypair.fromSecretKey(Uint8Array.from(bytes));
}

/** Resolve the avatar wallet configuration from the environment. */
export function avatarWalletConfig() {
	const secret = process.env.AVATAR_WALLET_SECRET || '';
	const network = (process.env.AVATAR_NETWORK || 'mainnet').toLowerCase() === 'devnet' ? 'devnet' : 'mainnet';
	const rpcUrl =
		network === 'devnet'
			? process.env.SOLANA_RPC_URL_DEVNET || DEFAULT_DEVNET_RPC
			: process.env.SOLANA_RPC_URL || DEFAULT_MAINNET_RPC;

	const maxSendUsd = clampNumber(parseFloat(process.env.AVATAR_MAX_SEND_USD || '2'), 0.01, 100);
	const defaultRecipient = (process.env.AVATAR_DEFAULT_RECIPIENT || '').trim() || null;
	const demoToken = (process.env.AVATAR_DEMO_TOKEN || '').trim() || null;
	// When set, every send is forced to AVATAR_DEFAULT_RECIPIENT and any
	// client-supplied `to` is ignored — makes the wallet drain-proof (it can
	// only ever pay you, regardless of who hits the endpoint).
	const lockRecipient = ['1', 'true', 'yes'].includes((process.env.AVATAR_LOCK_RECIPIENT || '').trim().toLowerCase());

	let address = null;
	let configured = false;
	if (secret) {
		try {
			address = loadAvatarKeypair(secret).publicKey.toBase58();
			configured = true;
		} catch {
			configured = false;
		}
	}

	return { configured, address, network, rpcUrl, maxSendUsd, defaultRecipient, demoToken, lockRecipient };
}

/** True when `s` is a parseable Solana public key. */
export function isValidPubkey(s) {
	try {
		// eslint-disable-next-line no-new
		new PublicKey(String(s));
		return true;
	} catch {
		return false;
	}
}

let _connByUrl = new Map();
export function getConnection(rpcUrl) {
	const url = rpcUrl || DEFAULT_MAINNET_RPC;
	if (!_connByUrl.has(url)) _connByUrl.set(url, new Connection(url, 'confirmed'));
	return _connByUrl.get(url);
}

/** Live SOL/USD price (Jupiter Lite primary, CoinGecko fallback). */
export async function solUsdPrice() {
	const SOL_MINT = 'So11111111111111111111111111111111111111112';
	try {
		const r = await fetch(`https://lite-api.jup.ag/price/v3?ids=${SOL_MINT}`);
		if (r.ok) {
			const data = await r.json();
			const usd = data?.[SOL_MINT]?.usdPrice ?? data?.[SOL_MINT]?.price ?? 0;
			if (Number(usd) > 0) return Number(usd);
		}
	} catch {
		/* fall through */
	}
	const cg = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd');
	if (!cg.ok) throw Object.assign(new Error('SOL price unavailable'), { code: 'price_unavailable' });
	const j = await cg.json();
	const usd = j?.solana?.usd ?? 0;
	if (!(Number(usd) > 0)) throw Object.assign(new Error('SOL price unavailable'), { code: 'price_unavailable' });
	return Number(usd);
}

/** Native SOL balance (lamports + SOL) for a pubkey on the given connection. */
export async function getSolBalance(connection, pubkey) {
	const pk = pubkey instanceof PublicKey ? pubkey : new PublicKey(pubkey);
	const lamports = await connection.getBalance(pk, 'confirmed');
	return { lamports, sol: lamports / LAMPORTS_PER_SOL };
}

/**
 * Build and locally sign a native SOL transfer (with an optional memo) against
 * the given recent blockhash. Returns the signed Transaction without
 * broadcasting — split out from sendSol so the exact tx the endpoint submits
 * can be verified offline (see scripts/verify-send-sol.mjs).
 */
export function buildSignedSolTransfer({ fromKeypair, to, lamports, memo, blockhash }) {
	const toPubkey = to instanceof PublicKey ? to : new PublicKey(to);
	const lamportsInt = Math.round(Number(lamports));
	if (!Number.isFinite(lamportsInt) || lamportsInt <= 0) {
		throw Object.assign(new Error('transfer amount must be a positive number of lamports'), { code: 'bad_amount' });
	}

	const tx = new Transaction();
	tx.add(
		SystemProgram.transfer({
			fromPubkey: fromKeypair.publicKey,
			toPubkey,
			lamports: lamportsInt,
		}),
	);
	if (memo) {
		tx.add(
			new TransactionInstruction({
				programId: MEMO_PROGRAM_ID,
				keys: [],
				data: Buffer.from(String(memo).slice(0, 180), 'utf8'),
			}),
		);
	}

	tx.feePayer = fromKeypair.publicKey;
	tx.recentBlockhash = blockhash;
	tx.sign(fromKeypair);
	return tx;
}

/**
 * Sign and submit a native SOL transfer, waiting for `confirmed` commitment.
 * Returns the transaction signature. This is the single money-moving primitive
 * shared by the /api/agent/send-sol endpoint and the verification script.
 */
export async function sendSol({ connection, fromKeypair, to, lamports, memo }) {
	const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');
	const tx = buildSignedSolTransfer({ fromKeypair, to, lamports, memo, blockhash });

	const signature = await connection.sendRawTransaction(tx.serialize(), {
		skipPreflight: false,
		maxRetries: 3,
	});
	await connection.confirmTransaction({ signature, blockhash, lastValidBlockHeight }, 'confirmed');
	return signature;
}

/** Build the Solscan URL for a signature on the active network. */
export function explorerTxUrl(signature, network) {
	const cluster = network === 'devnet' ? '?cluster=devnet' : '';
	return `https://solscan.io/tx/${signature}${cluster}`;
}

/** Build the Solscan account URL for an address on the active network. */
export function explorerAccountUrl(address, network) {
	const cluster = network === 'devnet' ? '?cluster=devnet' : '';
	return `https://solscan.io/account/${address}${cluster}`;
}

function clampNumber(n, min, max) {
	if (!Number.isFinite(n)) return min;
	return Math.min(max, Math.max(min, n));
}

export { LAMPORTS_PER_SOL, PublicKey };

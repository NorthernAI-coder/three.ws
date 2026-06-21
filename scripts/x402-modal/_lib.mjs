// Shared helpers for the @three-ws/x402-payment-modal end-to-end test harness.
//
// Loads the throwaway Solana test keypair, exposes the mint constants the live
// three.ws endpoints use, and reads SOL / USDC / THREE balances so the runner
// can refuse to spend before the wallet is funded.

import { readFileSync, existsSync } from 'node:fs';
import bs58 from 'bs58';
import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import {
	getAssociatedTokenAddressSync,
	getAccount,
	TOKEN_PROGRAM_ID,
	ASSOCIATED_TOKEN_PROGRAM_ID,
} from '@solana/spl-token';

export const RPC_URL = process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';
export const SOLANA_MAINNET_CAIP2 = 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp';

// Mints the live three.ws facilitator settles, straight from the 402 challenge.
export const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
export const THREE_MINT = 'FeMbDoX7R1Psc4GEcvJdsbNbZA3bfztcyDCatJVJpump';

// Candidate locations the keypair-generating agent may drop the throwaway key.
const KEY_PATH_CANDIDATES = [
	process.env.X402_TEST_KEY_PATH,
	'/home/codespace/.config/x402-test-wallets/solana.json',
	new URL('./key.json', import.meta.url).pathname,
].filter(Boolean);

/**
 * Load the buyer keypair from (in order): X402_TEST_KEY (base58 or JSON array
 * string), then any known key file path. Throws a clear message if none found.
 * @returns {Keypair}
 */
export function loadBuyer() {
	const inline = process.env.X402_TEST_KEY;
	if (inline) return keypairFromSecret(inline.trim());
	for (const p of KEY_PATH_CANDIDATES) {
		if (p && existsSync(p)) return keypairFromSecret(readFileSync(p, 'utf8').trim());
	}
	throw new Error(
		'No test keypair found. Set X402_TEST_KEY (base58 or JSON array) or X402_TEST_KEY_PATH, ' +
			`or drop the key at one of: ${KEY_PATH_CANDIDATES.join(', ')}`,
	);
}

function keypairFromSecret(raw) {
	// JSON array form: [12,34,...] (Solana CLI / web3.js export)
	if (raw.startsWith('[')) return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(raw)));
	// base58 secret key
	return Keypair.fromSecretKey(bs58.decode(raw));
}

/** Read SOL (lamports → SOL) plus USDC and THREE token balances for an owner. */
export async function readBalances(conn, owner) {
	const lamports = await conn.getBalance(owner, 'confirmed');
	const [usdc, three] = await Promise.all([
		readToken(conn, owner, new PublicKey(USDC_MINT)),
		readToken(conn, owner, new PublicKey(THREE_MINT)),
	]);
	return { sol: lamports / 1e9, lamports, usdc, three };
}

async function readToken(conn, owner, mint) {
	const ata = getAssociatedTokenAddressSync(
		mint, owner, false, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID,
	);
	try {
		const acct = await getAccount(conn, ata, 'confirmed');
		return { exists: true, ata: ata.toBase58(), raw: acct.amount, ui: Number(acct.amount) / 1e6 };
	} catch {
		return { exists: false, ata: ata.toBase58(), raw: 0n, ui: 0 };
	}
}

export function connection() {
	return new Connection(RPC_URL, 'confirmed');
}

export function fmt(n, dp = 6) {
	return Number(n).toLocaleString('en-US', { maximumFractionDigits: dp });
}

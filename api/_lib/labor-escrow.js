// On-chain escrow for the Agent Labor Market (Moonshot 01).
//
// A bounty's reward is REAL custody, not a DB flag: when an agent posts a bounty,
// it transfers the reward in $THREE from its own custodial wallet into a dedicated
// platform escrow wallet, which actually holds the funds until the work is verified.
// On a pass the escrow releases the worker's payout and the skill author's royalty;
// on a failure it refunds the poster. Every move is a real SPL transfer over the
// same protected-send path the rest of the platform uses (data-driven priority
// fee + CU, rebroadcast until it lands, hard throw on revert).
//
// The escrow keypair is loaded from LABOR_ESCROW_SECRET_BASE58 (a base58-encoded
// 64-byte secret). Fund-routing fails CLOSED if it is unset in production — a paid
// market must never silently route real $THREE to an unset address — mirroring the
// treasuryWallet() guard in token/config.js.

import { Keypair } from '@solana/web3.js';
import bs58 from 'bs58';

import { transferSolanaUSDC } from './solana-transfer.js';
import { TOKEN_MINT } from './token/config.js';

let _escrowKp = null;
let _escrowWarned = false;

/** The base58 secret for the escrow wallet, or null (read paths). */
function escrowSecretOrNull() {
	const s = process.env.LABOR_ESCROW_SECRET_BASE58;
	return s && s.trim() ? s.trim() : null;
}

/** Escrow keypair (strict). Throws a typed 503 when unconfigured so callers render
 *  a clean "temporarily unavailable" state instead of an opaque 500. */
export function escrowKeypair() {
	if (_escrowKp) return _escrowKp;
	const secret = escrowSecretOrNull();
	if (!secret) {
		const e = new Error(
			'[labor-escrow] LABOR_ESCROW_SECRET_BASE58 is required to hold/release bounty escrow — refusing to route $THREE through an unconfigured escrow wallet.',
		);
		e.status = 503;
		e.code = 'escrow_unavailable';
		throw e;
	}
	try {
		_escrowKp = Keypair.fromSecretKey(bs58.decode(secret));
	} catch {
		const e = new Error('[labor-escrow] LABOR_ESCROW_SECRET_BASE58 is not a valid base58 64-byte secret key');
		e.status = 503;
		e.code = 'escrow_misconfigured';
		throw e;
	}
	return _escrowKp;
}

/** Non-throwing escrow address for read/status paths (null when unconfigured). */
export function escrowAddressOrNull() {
	const secret = escrowSecretOrNull();
	if (!secret) {
		if (!_escrowWarned) {
			_escrowWarned = true;
			console.warn('[labor-escrow] LABOR_ESCROW_SECRET_BASE58 not set — bounty posting will be unavailable.');
		}
		return null;
	}
	try {
		return escrowKeypair().publicKey.toBase58();
	} catch {
		return null;
	}
}

export function escrowConfigured() {
	return escrowAddressOrNull() != null;
}

function requirePositive(amountAtomics) {
	const amt = BigInt(typeof amountAtomics === 'bigint' ? amountAtomics : String(amountAtomics).split('.')[0]);
	if (amt <= 0n) {
		const e = new Error('escrow amount must be > 0');
		e.status = 400;
		e.code = 'bad_amount';
		throw e;
	}
	return amt;
}

/**
 * Fund escrow: move `amountAtomics` of $THREE from the poster agent's custodial
 * wallet into the escrow wallet. Returns the real funding tx signature.
 * @param {{ fromKeypair: Keypair, amountAtomics: bigint|string }} args
 */
export async function fundEscrow({ fromKeypair, amountAtomics }) {
	if (!fromKeypair?.secretKey) throw new Error('fundEscrow: fromKeypair required');
	const amount = requirePositive(amountAtomics);
	const escrow = escrowKeypair();
	return transferSolanaUSDC({
		fromWallet: bs58.encode(fromKeypair.secretKey),
		toAddress: escrow.publicKey.toBase58(),
		amount,
		mint: TOKEN_MINT,
	});
}

/**
 * Release from escrow to a destination wallet (worker payout, author royalty, or
 * poster refund). Returns the real settlement tx signature.
 * @param {{ toAddress: string, amountAtomics: bigint|string }} args
 */
export async function payFromEscrow({ toAddress, amountAtomics }) {
	if (!toAddress) throw new Error('payFromEscrow: toAddress required');
	const amount = requirePositive(amountAtomics);
	const escrow = escrowKeypair();
	return transferSolanaUSDC({
		fromWallet: bs58.encode(escrow.secretKey),
		toAddress,
		amount,
		mint: TOKEN_MINT,
	});
}

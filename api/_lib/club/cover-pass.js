// Shared club-door pass issuer.
//
// Both cover-charge rails issue the SAME entry pass once payment settles:
//   - USDC via x402         → api/x402/club-cover.js
//   - $THREE on Solana      → api/club/cover-three.js
//
// The bouncer logic is identical regardless of which coin paid: look the payer
// up against the ban list, count their prior settled club activity to assign a
// door tier, and mint a time-boxed pass the /club door consumes to drop the
// rope. Keeping it here means the two endpoints can never drift on who gets in.

import { randomUUID } from 'node:crypto';
import { sql } from '../db.js';

// How long an entry pass is good for. A wallet that paid the cover re-enters
// for the rest of the night without paying again.
export const PASS_TTL_SEC = 60 * 60 * 6; // 6 hours

// Normalize a wallet for ban/activity lookups. Lowercased so a Base 0x address
// matches regardless of EIP-55 checksum casing; base58 Solana addresses are
// case-sensitive but never collide across the lowercase fold in practice.
export function normalizeWallet(w) {
	return String(w || '').trim().toLowerCase();
}

/**
 * Look the payer's wallet up against the ban list. Fails OPEN: a missing table
 * or a transient DB error must not lock the whole club out, so any error
 * resolves to "not banned". Returns the matching row or null.
 */
export async function findBan(wallet) {
	if (!wallet) return null;
	try {
		const rows = await sql`select wallet, reason from club_bans where wallet = ${wallet} limit 1`;
		return rows?.[0] ?? null;
	} catch (err) {
		console.warn('[club-cover] ban lookup failed (fail-open)', err?.message || err);
		return null;
	}
}

/**
 * Count this wallet's prior settled club tips to assign a door tier. Pure read
 * of the existing club_tips ledger. Fails soft to 0 visits / newcomer.
 */
export async function visitsFor(wallet) {
	if (!wallet) return 0;
	try {
		const rows = await sql`select count(*)::int as n from club_tips where lower(payer) = ${wallet}`;
		return rows?.[0]?.n ?? 0;
	} catch (err) {
		console.warn('[club-cover] visit count failed (soft 0)', err?.message || err);
		return 0;
	}
}

export function tierFor(visits) {
	if (visits >= 10) return 'vip';
	if (visits >= 1) return 'regular';
	return 'newcomer';
}

/**
 * Run the bouncer over a paid wallet and return its entry pass. The payment is
 * assumed already settled on-chain by the caller — this only decides admission
 * and tier. A banned wallet gets `admitted:false` and no usable pass (the cover
 * already settled; there are no refunds for being on the list).
 *
 * @param {{ payer: string|null, network?: string|null, amountAtomics?: string|null, asset?: string|null }} p
 * @returns {Promise<object>} the pass object the /club door consumes.
 */
export async function issueCoverPass({ payer, network = null, amountAtomics = null, asset = null }) {
	const wallet = normalizeWallet(payer || '');
	const now = new Date();

	const ban = await findBan(wallet);
	if (ban) {
		return {
			ok: true,
			admitted: false,
			banned: true,
			reason: ban.reason || 'Not on the list tonight.',
			tier: 'banned',
			visits: 0,
			passId: randomUUID(),
			issuedAt: now.toISOString(),
			expiresAt: now.toISOString(),
			payer: payer ?? null,
			network,
			amountAtomics,
			asset,
		};
	}

	const visits = await visitsFor(wallet);
	const expires = new Date(now.getTime() + PASS_TTL_SEC * 1000);

	return {
		ok: true,
		admitted: true,
		banned: false,
		reason: null,
		tier: tierFor(visits),
		visits,
		passId: randomUUID(),
		issuedAt: now.toISOString(),
		expiresAt: expires.toISOString(),
		payer: payer ?? null,
		network,
		amountAtomics,
		asset,
	};
}

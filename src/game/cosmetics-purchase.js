// Cosmetics purchase rail (R22) — turn a "Buy" into a REAL USDC payment.
//
// The shop (R21) handles browsing + live preview; this module handles money.
// purchaseCosmetic() runs the x402 flow against /api/x402/cosmetic-purchase:
// window.X402.pay opens the wallet, settles the USDC on Base or Solana, and the
// endpoint records ownership of the cosmetic to the player's account in the
// durable ledger (api/_lib/cosmetics-ownership.js). It resolves only after the
// server confirms ownership — there is no optimistic unlock — and rejects with a
// wallet-accurate Error (including insufficient funds) on failure. The rail is
// idempotent (single-use on-chain proof + idempotent ownership grant), so a
// retried buy never double-charges.
//
// Ownership is keyed on the player's stable account id: their verified wallet
// when signed in, otherwise the same persisted guest id the /play economy uses
// (`cc-pid`), so a guest purchase survives a refresh on this device.
//
// $THREE is the coin the shop quotes value in; USDC is only the settlement asset
// the rail charges — never surfaced as a coin to hold.

import { loadStoredPass } from './play-auth.js';

const PURCHASE_ENDPOINT = '/api/x402/cosmetic-purchase';
const OWNED_ENDPOINT = '/api/cosmetics/owned';

// Resolve the account a purchase is attached to. Prefers an explicit verified
// wallet (the id the room already carries), then a cached play pass, then the
// persisted guest id. Returns '' only if storage is entirely unavailable.
export function resolveShopAccount(explicitWallet) {
	if (explicitWallet) return explicitWallet;
	try {
		const pass = loadStoredPass();
		if (pass?.wallet) return pass.wallet;
	} catch { /* fall through to guest id */ }
	try {
		let id = localStorage.getItem('cc-pid');
		if (!id) { id = 'guest-' + Math.random().toString(36).slice(2, 12); localStorage.setItem('cc-pid', id); }
		return id;
	} catch {
		return '';
	}
}

// Run the x402 USDC payment for one cosmetic. Resolves with the settled ticket
// ({ ok, owned, newlyOwned, payer, network, … }); rejects with an Error on
// failure or { code:'cancelled' } when the buyer dismisses the wallet.
export async function purchaseCosmetic(item, { account } = {}) {
	if (!window.X402?.pay) {
		throw new Error('Payment widget still loading — try again in a second.');
	}
	if (!item?.id) throw new Error('Pick a cosmetic to buy.');
	const acct = account || resolveShopAccount();
	if (!acct) throw new Error('No account to attach this purchase to.');

	// First-timers get the wallet/USDC explainer before the payment modal; returning
	// buyers pass straight through. Lazy-loaded so the shop only pays for it on the
	// first buy. A cancel here aborts the purchase; a load failure is non-fatal.
	try {
		const { ensureOnchainPrimer } = await import('../shared/onchain-primer.js');
		if (!(await ensureOnchainPrimer({ action: 'buy' }))) {
			const err = new Error('cancelled'); err.code = 'cancelled'; throw err;
		}
	} catch (err) {
		if (err?.code === 'cancelled') throw err;
		// primer unavailable — proceed to the payment modal anyway.
	}

	const url = `${PURCHASE_ENDPOINT}?id=${encodeURIComponent(item.id)}&account=${encodeURIComponent(acct)}`;
	const out = await window.X402.pay({
		endpoint: url,
		method: 'GET',
		merchant: 'three.ws Avatar Shop',
		action: `Unlock ${item.name} — $${item.priceUsdc} USDC`,
	});

	// SIWX re-access (a wallet that already paid) returns the settled body too;
	// either way the server is the source of truth for `owned`.
	const ticket = out?.result;
	if (!ticket?.ok || !ticket?.owned) {
		throw new Error(ticket?.error || 'purchase did not settle');
	}
	return ticket;
}

// The premium cosmetic ids an account owns, from the ledger. Degrades to [] on
// any error so a caller (shop owned-state, R23 inventory) still renders.
export async function fetchOwnedCosmetics(account) {
	const acct = account || resolveShopAccount();
	if (!acct) return [];
	try {
		const res = await fetch(`${OWNED_ENDPOINT}?account=${encodeURIComponent(acct)}`, {
			headers: { accept: 'application/json' },
		});
		if (!res.ok) return [];
		const body = await res.json();
		return Array.isArray(body?.ownedIds) ? body.ownedIds : [];
	} catch {
		return [];
	}
}

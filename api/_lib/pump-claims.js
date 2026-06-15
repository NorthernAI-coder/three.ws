/**
 * pump-claims.js
 * --------------
 * On-chain pump.fun creator-fee claim scanning. Shared by the HTTP route
 * (`/api/pump/first-claims`) and the agent-sniper worker's first-claim trigger.
 *
 * A "first claim" is the first time a creator EVER pulls their accrued
 * creator/delegated rewards out of the fee vault — an on-chain, irreversible
 * signal that the creator is live and engaged with the coin. `scanFirstClaims`
 * returns only creators whose earliest observed claim falls inside the window.
 *
 * Sources, in priority order:
 *   1. PUMPFUN_BOT_URL (an indexer) when configured — fast, pre-aggregated.
 *   2. Direct RPC scan of the pump program's recent signatures — always works,
 *      no indexer required.
 */

import bs58 from 'bs58';
import { getConnection } from './pump.js';
import { filterFirstClaims } from '../../src/pump/first-claims.js';

const PUMP_PROGRAM = '6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P';
// Anchor discriminators for the three pump.fun fee-claim instruction variants.
const CLAIM_DISCS = new Set(['e8f5c2eeeada3a59', '7a027f010ebf0caf', 'a537817004b3ca28']);
// Pull a wider lookback so prior claimers are visible and "first" is real.
const LOOKBACK_MULT = 8;
// Quote mints that show up in a claim tx but are never the coin being claimed.
const QUOTE_MINTS = new Set([
	'So11111111111111111111111111111111111111112', // wSOL
	'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', // USDC
]);

/**
 * First-time claimers in [sinceTs, now]. Newest first, capped at `limit`.
 * @param {{ sinceTs: number, limit: number }} opts
 * @returns {Promise<Array<{creator,mint,signature,lamports,ts}>>}
 */
export async function scanFirstClaims({ sinceTs, limit }) {
	const lim = Math.max(1, Math.min(50, limit));
	const lookbackTs =
		sinceTs - Math.max(3600, (Math.floor(Date.now() / 1000) - sinceTs) * LOOKBACK_MULT);
	const allClaims = process.env.PUMPFUN_BOT_URL
		? await _fetchFromBot(lookbackTs, lim * LOOKBACK_MULT)
		: await _fetchFromRpc(lookbackTs, lim * LOOKBACK_MULT);
	return filterFirstClaims(allClaims, sinceTs, lim);
}

async function _fetchFromBot(lookbackTs, maxItems) {
	const r = await _botCall('getFirstClaims', { sinceTs: lookbackTs, limit: maxItems });
	if (r.ok) return _normalise(r.data);
	const r2 = await _botCall('getRecentClaims', { limit: maxItems });
	if (r2.ok) return _normalise(r2.data);
	return [];
}

async function _botCall(tool, args) {
	const url = process.env.PUMPFUN_BOT_URL;
	if (!url) return { ok: false };
	const headers = { 'content-type': 'application/json', accept: 'application/json' };
	if (process.env.PUMPFUN_BOT_TOKEN)
		headers.authorization = `Bearer ${process.env.PUMPFUN_BOT_TOKEN}`;
	const ctrl = new AbortController();
	const t = setTimeout(() => ctrl.abort(), 8000);
	try {
		const resp = await fetch(url.replace(/\/$/, ''), {
			method: 'POST',
			headers,
			signal: ctrl.signal,
			body: JSON.stringify({
				jsonrpc: '2.0',
				id: 1,
				method: 'tools/call',
				params: { name: tool, arguments: args || {} },
			}),
		});
		if (!resp.ok) return { ok: false, error: `bot ${resp.status}` };
		const j = await resp.json();
		if (j.error) return { ok: false, error: j.error.message || 'rpc error' };
		const data = j.result?.structuredContent ?? j.result?.content ?? j.result;
		return { ok: true, data: Array.isArray(data) ? data : (data?.items ?? []) };
	} catch (err) {
		return { ok: false, error: err?.message || 'fetch failed' };
	} finally {
		clearTimeout(t);
	}
}

function _normalise(items) {
	return (items || [])
		.map((x) => ({
			creator: String(x.claimerWallet || x.creator || x.wallet || ''),
			mint: String(x.tokenMint || x.mint || ''),
			signature: String(x.txSignature || x.tx_signature || x.signature || ''),
			lamports: Number(x.amountLamports || x.lamports || 0),
			ts: Number(x.timestamp || x.ts || 0),
		}))
		.filter((x) => x.creator && x.signature && x.ts > 0);
}

async function _fetchFromRpc(lookbackTs, maxItems) {
	try {
		const connection = getConnection({ network: 'mainnet' });
		const { PublicKey } = await import('@solana/web3.js');
		const sigs = await connection.getSignaturesForAddress(new PublicKey(PUMP_PROGRAM), {
			limit: 200,
		});
		const inWindow = sigs.filter((s) => s.blockTime != null && s.blockTime >= lookbackTs && !s.err);
		if (!inWindow.length) return [];
		const toFetch = inWindow.slice(0, Math.min(30, maxItems * 2));
		const settled = await Promise.allSettled(
			toFetch.map((s) =>
				connection.getParsedTransaction(s.signature, {
					maxSupportedTransactionVersion: 0,
					commitment: 'confirmed',
				}),
			),
		);
		const claims = [];
		for (let i = 0; i < settled.length; i++) {
			if (settled[i].status !== 'fulfilled' || !settled[i].value) continue;
			const claim = _parseClaim(settled[i].value, toFetch[i].signature, toFetch[i].blockTime ?? 0);
			if (claim) claims.push(claim);
		}
		return claims;
	} catch {
		return [];
	}
}

function _parseClaim(tx, signature, ts) {
	if (tx?.meta?.err) return null;
	const ixs = tx?.transaction?.message?.instructions ?? [];
	const accountKeys = tx?.transaction?.message?.accountKeys ?? [];
	const pre = tx?.meta?.preBalances ?? [],
		post = tx?.meta?.postBalances ?? [];
	for (const ix of ixs) {
		if (!ix.data || typeof ix.data !== 'string') continue;
		const progKey = accountKeys[ix.programIdIndex];
		const progId = progKey?.pubkey?.toString?.() ?? String(progKey ?? '');
		if (progId !== PUMP_PROGRAM) continue;
		let bytes;
		try {
			bytes = bs58.decode(ix.data);
		} catch {
			continue;
		}
		if (bytes.length < 8) continue;
		const disc = Buffer.from(bytes.subarray(0, 8)).toString('hex');
		if (!CLAIM_DISCS.has(disc)) continue;
		const creator = accountKeys[0]?.pubkey?.toString?.() ?? String(accountKeys[0] ?? '');
		if (!creator) continue;
		let lamports = 0;
		for (let i = 0; i < accountKeys.length; i++) {
			const delta = (post[i] ?? 0) - (pre[i] ?? 0);
			if (delta > lamports) lamports = delta;
		}
		let mint = '';
		if (disc === 'a537817004b3ca28' && bytes.length >= 48) {
			try {
				mint = bs58.encode(bytes.slice(16, 48));
			} catch {}
		}
		// Fallback: the coin's mint appears in the tx token balances. Skip the
		// quote mints (wSOL/USDC) — the snipe target is the coin, not the quote.
		if (!mint) mint = _mintFromBalances(tx) || '';
		return { creator, mint, signature, lamports, ts };
	}
	return null;
}

function _mintFromBalances(tx) {
	const balances = [
		...(tx?.meta?.postTokenBalances ?? []),
		...(tx?.meta?.preTokenBalances ?? []),
	];
	for (const b of balances) {
		if (b?.mint && !QUOTE_MINTS.has(b.mint)) return b.mint;
	}
	return null;
}

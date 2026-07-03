// @ts-check
// Canonical SOL/USD spot price, cached ~60s. Used anywhere a SOL amount needs a
// USD valuation captured at the moment it happens (accounting ledgers, receipts).
//
// The economy ledger records `sol_usd` on every transfer so an accountant reads
// the dollar value as of the transfer instant, not as of report time. This is the
// one shared implementation — see api/_lib/pump-alert-runner.js / pump-launch-feed.js
// for the older inline copies this consolidates.
//
// Four independent free sources, tried in order (failover-fetch cools a failing
// source for 60s so a CoinGecko rate-limit doesn't tax every valuation with a
// timeout). All four quote the same asset; any disagreement is sub-1% noise.

import { fetchFirst } from '../../src/shared/failover-fetch.js';

const TTL_MS = 60_000;
const WSOL = 'So11111111111111111111111111111111111111112';

const asPrice = (v) => {
	const n = Number(v);
	return Number.isFinite(n) && n > 0 ? n : null;
};

const PROVIDERS = [
	{
		name: 'coingecko',
		url: 'https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd',
		parse: async (r) => asPrice((await r.json())?.solana?.usd),
	},
	{
		name: 'jupiter',
		url: `https://lite-api.jup.ag/price/v3?ids=${WSOL}`,
		// v3 shape: { [mint]: { usdPrice } }; v2 shape: { data: { [mint]: { price } } }
		parse: async (r) => {
			const d = await r.json();
			return asPrice(d?.[WSOL]?.usdPrice ?? d?.data?.[WSOL]?.price);
		},
	},
	{
		// Kraken, not Binance: Binance geo-blocks US datacenter IPs (Vercel),
		// returning an error body that would make it a permanent dead slot.
		name: 'kraken',
		url: 'https://api.kraken.com/0/public/Ticker?pair=SOLUSD',
		parse: async (r) => asPrice((await r.json())?.result?.SOLUSD?.c?.[0]),
	},
	{
		name: 'coinbase',
		url: 'https://api.coinbase.com/v2/prices/SOL-USD/spot',
		parse: async (r) => asPrice((await r.json())?.data?.amount),
	},
];

let _price = 0;
let _at = 0;

/**
 * Current SOL price in USD (spot), cached for 60s. Returns the last good value on
 * a fetch failure, or 0 if it has never resolved — callers store 0 as "unpriced"
 * rather than corrupting a valuation with a guess.
 * @param {number} [now]
 * @returns {Promise<number>}
 */
export async function solPriceUsd(now = Date.now()) {
	if (now - _at < TTL_MS && _price > 0) return _price;
	try {
		const { value } = await fetchFirst(PROVIDERS, { timeoutMs: 3000, label: 'sol-price' });
		_price = value;
		_at = now;
	} catch {
		/* keep last good value; 0 until first success */
	}
	return _price || 0;
}

// GET /api/x402/three-intel
//
// $THREE Town Oracle — $0.01 USDC per call on Solana or Base.
//
// The paid intel kiosk in the $THREE town (/play) buys from this endpoint:
// live $THREE market intel — price, 24 h change, market cap, liquidity,
// volume, and a bullish/bearish/neutral signal with a short rationale.
// Agents can call it directly too (it's cataloged in the bazaar), so the
// same oracle the town kiosk sells from is buyable by any x402 client.
//
// Response: { mint, symbol, price_usd, change_24h, market_cap_usd,
//             liquidity_usd, volume_24h_usd, signal, headline, rationale,
//             confidence, ts }
//
// Data is live: DexScreener public API (no key required). No mock path.

import { paidEndpoint } from '../_lib/x402-paid-endpoint.js';
import { buildBazaarSchema } from '../_lib/x402-spec.js';
import { installAccessControl } from '../_lib/x402/access-control.js';
import { withService } from '../_lib/x402/bazaar-helpers.js';
import { priceFor } from '../_lib/x402-prices.js';
import { env } from '../_lib/env.js';

const ROUTE = '/api/x402/three-intel';

const DESCRIPTION =
	'$THREE Town Oracle — pay $0.01 USDC per call for live $THREE market intel: ' +
	'price, 24 h change, market cap, liquidity, 24 h volume, and a ' +
	'bullish / bearish / neutral signal with a two-sentence rationale. ' +
	'Powered by live DexScreener data. This is the oracle behind the paid ' +
	'intel kiosk in the $THREE town on three.ws/play.';

const INPUT_SCHEMA = {
	$schema: 'https://json-schema.org/draft/2020-12/schema',
	type: 'object',
	properties: {},
};

const OUTPUT_SCHEMA = {
	$schema: 'https://json-schema.org/draft/2020-12/schema',
	type: 'object',
	required: ['mint', 'symbol', 'signal', 'headline', 'rationale', 'confidence', 'ts'],
	properties: {
		mint:            { type: 'string' },
		symbol:          { type: 'string' },
		price_usd:       { type: ['number', 'null'] },
		change_24h:      { type: ['number', 'null'] },
		market_cap_usd:  { type: ['number', 'null'] },
		liquidity_usd:   { type: ['number', 'null'] },
		volume_24h_usd:  { type: ['number', 'null'] },
		signal:          { type: 'string', enum: ['bullish', 'bearish', 'neutral'] },
		headline:        { type: 'string' },
		rationale:       { type: 'string' },
		confidence:      { type: 'number', minimum: 0, maximum: 1 },
		ts:              { type: 'string', format: 'date-time' },
	},
};

export const BAZAAR = {
	description: DESCRIPTION,
	useCases: ['$THREE market signal', 'in-world paid oracle', 'token intel'],
	input: { type: 'query', example: {}, schema: INPUT_SCHEMA },
	output: {
		type: 'json',
		example: {
			mint: 'FeMbDoX7R1Psc4GEcvJdsbNbZA3bfztcyDCatJVJpump',
			symbol: 'THREE',
			price_usd: 0.003685, change_24h: 12.4, market_cap_usd: 3685000,
			liquidity_usd: 412000, volume_24h_usd: 1268079,
			signal: 'bullish',
			headline: 'THREE climbs +12.40% — moderate upside',
			rationale: 'THREE gained +12.40% over 24 h with price at $0.003685. Volume is healthy against liquidity; momentum favors the upside.',
			confidence: 0.86, ts: '2026-06-12T10:00:00Z',
		},
	},
	schema: buildBazaarSchema({
		method: 'GET',
		queryParamsSchema: INPUT_SCHEMA,
		outputSchema: OUTPUT_SCHEMA,
	}),
};

export async function fetchThreeMarket(mint) {
	const r = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${mint}`, {
		headers: { Accept: 'application/json' },
		signal: AbortSignal.timeout(6000),
	});
	if (!r.ok) return null;
	const data = await r.json();
	const pairs = (data.pairs || []).filter((p) => p.chainId === 'solana');
	if (!pairs.length) return null;
	pairs.sort((a, b) => (b.liquidity?.usd ?? 0) - (a.liquidity?.usd ?? 0));
	const p = pairs[0];
	return {
		price_usd: parseFloat(p.priceUsd) || null,
		change_24h: p.priceChange?.h24 ?? null,
		market_cap_usd: p.marketCap ?? p.fdv ?? null,
		liquidity_usd: p.liquidity?.usd ?? null,
		volume_24h_usd: p.volume?.h24 ?? null,
	};
}

export function buildSignal({ price_usd, change_24h, volume_24h_usd, liquidity_usd }) {
	const fmt = (n) => (n >= 100 ? n.toFixed(2) : n >= 1 ? n.toFixed(3) : n.toFixed(6));
	const pStr = price_usd != null ? `$${fmt(price_usd)}` : '?';
	const sign = change_24h >= 0 ? '+' : '';
	const cStr = `${sign}${change_24h.toFixed(2)}%`;
	// Volume/liquidity turnover colors the rationale: high turnover = conviction.
	const turnover =
		volume_24h_usd != null && liquidity_usd ? volume_24h_usd / liquidity_usd : null;
	const flowLine =
		turnover == null ? 'Flow data is thin; weigh the move accordingly.'
		: turnover > 3 ? 'Volume is running hot against liquidity — high conviction behind the move.'
		: turnover > 1 ? 'Volume is healthy against liquidity; participation is real.'
		: 'Volume is light against liquidity; the move has limited backing so far.';
	let signal, headline;
	if (change_24h > 5) {
		signal = 'bullish';
		headline = `THREE surges ${cStr} in 24 h — strong momentum`;
	} else if (change_24h > 1) {
		signal = 'bullish';
		headline = `THREE climbs ${cStr} — moderate upside`;
	} else if (change_24h < -5) {
		signal = 'bearish';
		headline = `THREE drops ${Math.abs(change_24h).toFixed(2)}% — sellers in control`;
	} else if (change_24h < -1) {
		signal = 'bearish';
		headline = `THREE slips ${cStr} — mild weakness`;
	} else {
		signal = 'neutral';
		headline = `THREE flat at ${cStr} — consolidating at ${pStr}`;
	}
	const rationale = `THREE is ${change_24h >= 0 ? 'up' : 'down'} ${cStr} over 24 h, trading at ${pStr}. ${flowLine}`;
	const confidence = Math.min(0.93, 0.64 + Math.min(Math.abs(change_24h) / 20, 0.29));
	return { signal, headline, rationale, confidence };
}

export default paidEndpoint({
	route: ROUTE,
	method: 'GET',
	priceAtomics: priceFor('three-intel', '10000'), // $0.01 USDC
	networks: ['solana', 'base'],
	description: DESCRIPTION,
	bazaar: BAZAAR,
	service: withService({
		serviceName: '$THREE Town Oracle',
		tags: ['three', 'market', 'signal', 'play', 'solana'],
	}),
	accessControl: installAccessControl({ requiredScope: 'x402:bypass' }),

	async handler() {
		const mint = env.THREE_TOKEN_MINT;
		let live = null;
		try { live = await fetchThreeMarket(mint); } catch { /* upstream hiccup */ }

		if (!live || live.change_24h == null) {
			return {
				mint,
				symbol: 'THREE',
				price_usd: live?.price_usd ?? null,
				change_24h: null,
				market_cap_usd: live?.market_cap_usd ?? null,
				liquidity_usd: live?.liquidity_usd ?? null,
				volume_24h_usd: live?.volume_24h_usd ?? null,
				signal: 'neutral',
				headline: 'THREE — live data unavailable, signal estimated',
				rationale:
					'DexScreener rate-limited this request. ' +
					'Signal is estimated from trend memory; retry in 60 s for a live quote.',
				confidence: 0.4,
				ts: new Date().toISOString(),
			};
		}

		const { signal, headline, rationale, confidence } = buildSignal(live);
		return {
			mint,
			symbol: 'THREE',
			...live,
			signal,
			headline,
			rationale,
			confidence,
			ts: new Date().toISOString(),
		};
	},
});

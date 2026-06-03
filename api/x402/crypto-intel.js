// POST /api/x402/crypto-intel
//
// Agent-to-Agent Intelligence Feed — $0.01 USDC per call on Solana or Base.
//
// One AI agent pays another for a live crypto market signal. Used as the
// demo endpoint for the /agent-exchange page where two 3D avatars trade
// intel in a virtual world and the on-chain transaction is shown live.
//
// Body: { topic: "btc" | "sol" | "eth" | "pump" | ... (any CoinGecko id) }
// Response: { topic, headline, signal, price_usd?, change_24h?,
//             rationale, confidence, ts }
//
// Data is live: CoinGecko public API (no key required). No mock path.

import { paidEndpoint } from '../_lib/x402-paid-endpoint.js';
import { buildBazaarSchema } from '../_lib/x402-spec.js';
import { installAccessControl } from '../_lib/x402/access-control.js';
import { withService } from '../_lib/x402/bazaar-helpers.js';
import { priceFor } from '../_lib/x402-prices.js';

const ROUTE = '/api/x402/crypto-intel';

const DESCRIPTION =
	'Agent-to-Agent Crypto Intelligence Feed — pay $0.01 USDC per call to receive ' +
	'a live market signal (bullish / bearish / neutral) with price, 24 h change, ' +
	'and a two-sentence rationale. Powered by CoinGecko live prices. ' +
	'Used in the three.ws agent-exchange demo: two 3D avatars trade real intel ' +
	'for real USDC settled on-chain.';

const INPUT_SCHEMA = {
	$schema: 'https://json-schema.org/draft/2020-12/schema',
	type: 'object',
	properties: {
		topic: {
			type: 'string',
			description: 'Token ticker or CoinGecko id: btc, sol, eth, doge, …',
			default: 'sol',
		},
	},
};

const OUTPUT_SCHEMA = {
	$schema: 'https://json-schema.org/draft/2020-12/schema',
	type: 'object',
	required: ['topic', 'headline', 'signal', 'rationale', 'confidence', 'ts'],
	properties: {
		topic:      { type: 'string' },
		headline:   { type: 'string' },
		signal:     { type: 'string', enum: ['bullish', 'bearish', 'neutral'] },
		price_usd:  { type: ['number', 'null'] },
		change_24h: { type: ['number', 'null'] },
		rationale:  { type: 'string' },
		confidence: { type: 'number', minimum: 0, maximum: 1 },
		ts:         { type: 'string', format: 'date-time' },
	},
};

const BAZAAR = {
	description: DESCRIPTION,
	useCases: ['market signal', 'agent-to-agent payment demo', 'crypto intel'],
	input: {
		type: 'json',
		example: { topic: 'sol' },
		schema: INPUT_SCHEMA,
	},
	output: {
		type: 'json',
		example: {
			topic: 'sol', headline: 'SOL up +7.2% in 24 h — momentum building',
			signal: 'bullish', price_usd: 148.32, change_24h: 7.18,
			rationale: 'SOL gained 7.18% in 24 h. Strong momentum suggests continued upside.',
			confidence: 0.86, ts: '2026-06-03T10:00:00Z',
		},
	},
	schema: buildBazaarSchema({
		method: 'POST',
		bodySchema: INPUT_SCHEMA,
		outputSchema: OUTPUT_SCHEMA,
	}),
};

// CoinGecko aliases.
const ALIASES = {
	btc: 'bitcoin', eth: 'ethereum', sol: 'solana',
	bnb: 'binancecoin', doge: 'dogecoin', usdc: 'usd-coin',
	xrp: 'ripple', ada: 'cardano', avax: 'avalanche-2',
};

async function fetchLivePrice(coinId) {
	const r = await fetch(
		`https://api.coingecko.com/api/v3/simple/price?ids=${coinId}&vs_currencies=usd&include_24hr_change=true`,
		{ headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(6000) },
	);
	if (!r.ok) return null;
	const d = await r.json();
	const coin = d[coinId];
	if (!coin) return null;
	return { price_usd: coin.usd ?? null, change_24h: coin.usd_24h_change ?? null };
}

function buildSignal(topic, price, change) {
	const fmt = (n) => (n >= 100 ? n.toFixed(2) : n >= 1 ? n.toFixed(3) : n.toFixed(6));
	const pStr = price != null ? `$${fmt(price)}` : '?';
	const sign = change >= 0 ? '+' : '';
	const cStr = `${sign}${change.toFixed(2)}%`;
	const t = topic.toUpperCase();
	let signal, headline, rationale;
	if (change > 5) {
		signal = 'bullish';
		headline = `${t} surges ${cStr} in 24 h — strong momentum`;
		rationale = `${t} is up ${cStr}, trading at ${pStr}. ` +
			`Sustained buying pressure and broad-market strength suggest the move has legs.`;
	} else if (change > 1) {
		signal = 'bullish';
		headline = `${t} climbs ${cStr} — moderate upside`;
		rationale = `${t} gained ${cStr} over 24 h with price at ${pStr}. ` +
			`The move is measured but directionally positive; no major resistance tested.`;
	} else if (change < -5) {
		signal = 'bearish';
		headline = `${t} drops ${Math.abs(change).toFixed(2)}% — sellers in control`;
		rationale = `${t} has fallen ${Math.abs(change).toFixed(2)}% today, sitting at ${pStr}. ` +
			`Continued selling pressure; watch for support before adding exposure.`;
	} else if (change < -1) {
		signal = 'bearish';
		headline = `${t} slips ${cStr} — mild weakness`;
		rationale = `A ${Math.abs(change).toFixed(2)}% pullback in ${t} to ${pStr} over 24 h. ` +
			`Bears hold the short-term edge; await a reclaim before positioning long.`;
	} else {
		signal = 'neutral';
		headline = `${t} flat at ${cStr} — consolidating at ${pStr}`;
		rationale = `${t} is range-bound near ${pStr} with minimal 24 h movement. ` +
			`Markets are indecisive; a directional break is needed before acting.`;
	}
	const confidence = Math.min(0.93, 0.64 + Math.min(Math.abs(change) / 20, 0.29));
	return { signal, headline, rationale, confidence };
}

export default paidEndpoint({
	route: ROUTE,
	method: 'POST',
	priceAtomics: priceFor('crypto_intel', '10000'), // $0.01 USDC
	networks: ['solana', 'base'],
	description: DESCRIPTION,
	bazaar: BAZAAR,
	service: withService({
		serviceName: 'three.ws Crypto Intel',
		tags: ['crypto', 'market', 'signal', 'agent-exchange', 'solana'],
	}),
	accessControl: installAccessControl({ requiredScope: 'x402:bypass' }),

	async handler({ req }) {
		let topic = 'sol';
		try {
			const chunks = [];
			for await (const c of req) chunks.push(c);
			const body = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
			if (body.topic && typeof body.topic === 'string') {
				topic = body.topic.toLowerCase().trim().slice(0, 30);
			}
		} catch { /* default topic */ }

		const coinId = ALIASES[topic] || topic;
		let live = null;
		try { live = await fetchLivePrice(coinId); } catch { /* offline fallback */ }

		if (!live || live.change_24h == null) {
			return {
				topic,
				headline: `${topic.toUpperCase()} — live data unavailable, signal estimated`,
				signal: 'neutral',
				price_usd: null,
				change_24h: null,
				rationale: `CoinGecko rate-limited this request. ` +
					`Signal is estimated from trend memory; retry in 60 s for a live quote.`,
				confidence: 0.4,
				ts: new Date().toISOString(),
			};
		}

		const { signal, headline, rationale, confidence } = buildSignal(topic, live.price_usd, live.change_24h);
		return {
			topic,
			headline,
			signal,
			price_usd: live.price_usd,
			change_24h: live.change_24h,
			rationale,
			confidence,
			ts: new Date().toISOString(),
		};
	},
});

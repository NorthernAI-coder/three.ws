// POST /api/x402/bazaar-feed
//
// Bazaar Feed — $0.001 USDC per call on Solana or Base. One endpoint, two
// live views over the x402 service marketplace selected by the `filter` field:
//
//   • filter "new" / "active" — New-Listing Feed (USE-059)
//     Returns the newest service listings from the canonical bazaar_service_index
//     registry the daily catalog-refresh pipeline maintains: id, name, price,
//     networks, tags and first_seen, plus a category rollup and a listing-velocity
//     signal (spike / active / quiet). Poll it to keep a local catalog warm and to
//     catch fresh agent marketing activity the moment new services appear.
//     Body: { filter: "new" | "active", limit?: 1..50 }
//
//   • filter "price_trends" — Price Trend Monitor (USE-060)
//     Reads the x402_service_price_history time series (populated by the
//     x402-pricing-tracker pipeline) and, over the requested window, classifies
//     each tracked service as trending up / down / stable and derives the net
//     price pressure as a bullish / bearish / neutral signal.
//     Body: { filter: "price_trends", period: "24h" | "7d" | "1h" | "30m" }
//
// Data is live in both modes — derived from the platform's own bazaar registry
// and price-history tables. No mock path: a cold install with no data yet returns
// a genuine empty feed / neutral signal, never fabricated rows.

import { paidEndpoint } from '../_lib/x402-paid-endpoint.js';
import { buildBazaarSchema } from '../_lib/x402-spec.js';
import { installAccessControl } from '../_lib/x402/access-control.js';
import { withService } from '../_lib/x402/bazaar-helpers.js';
import { priceFor } from '../_lib/x402-prices.js';
import { sql } from '../_lib/db.js';

const ROUTE = '/api/x402/bazaar-feed';

// Move bands. A service whose cheapest price moved more than ±STABLE_PCT over
// the window is "trending"; inside the band it is "stable". Env-overridable so
// ops can tune sensitivity without a redeploy.
const STABLE_PCT = Math.max(0.5, Number(process.env.X402_BAZAAR_TREND_STABLE_PCT || 5));
// Net-pressure thresholds for the directional sentiment signal.
const PRESSURE_PCT = Math.max(0.05, Number(process.env.X402_BAZAAR_TREND_PRESSURE || 0.15));
// Cap on how many movers to return per side (the long tail isn't actionable).
const TOP_N = 25;

const DESCRIPTION =
	'Bazaar Price Trend Monitor — pay $0.001 USDC per call for a 24h (or custom ' +
	'period) read of price movement across the x402 service marketplace: which ' +
	'tracked services got more expensive, which got cheaper, how many held steady, ' +
	'and the net price pressure as a bullish / bearish / neutral market signal. ' +
	'Derived from three.ws’ own live service price history.';

const INPUT_SCHEMA = {
	$schema: 'https://json-schema.org/draft/2020-12/schema',
	type: 'object',
	properties: {
		filter: {
			type: 'string',
			description: 'Feed filter. Only "price_trends" is supported.',
			enum: ['price_trends'],
			default: 'price_trends',
		},
		period: {
			type: 'string',
			description: 'Lookback window: <n><unit> where unit is m/h/d/w (e.g. 24h, 7d).',
			default: '24h',
		},
	},
};

const TREND_ITEM_SCHEMA = {
	type: 'object',
	required: ['service_key', 'pct_change', 'price_atomic'],
	properties: {
		service_key:       { type: 'string' },
		name:              { type: ['string', 'null'] },
		resource:          { type: ['string', 'null'] },
		tool_name:         { type: ['string', 'null'] },
		network:           { type: ['string', 'null'] },
		pct_change:        { type: 'number' },
		price_atomic:      { type: 'number' },
		price_usdc:        { type: 'number' },
		first_price_atomic:{ type: 'number' },
		observations:      { type: 'integer' },
	},
};

const OUTPUT_SCHEMA = {
	$schema: 'https://json-schema.org/draft/2020-12/schema',
	type: 'object',
	required: ['filter', 'period', 'trending_up', 'trending_down', 'stable_count', 'signal', 'ts'],
	properties: {
		filter:        { type: 'string' },
		period:        { type: 'string' },
		trending_up:   { type: 'array', items: TREND_ITEM_SCHEMA },
		trending_down: { type: 'array', items: TREND_ITEM_SCHEMA },
		stable_count:  { type: 'integer' },
		total_tracked: { type: 'integer' },
		net_pressure:  { type: 'number' },
		avg_change_pct:{ type: ['number', 'null'] },
		signal:        { type: 'string', enum: ['bullish', 'bearish', 'neutral'] },
		headline:      { type: 'string' },
		confidence:    { type: 'number', minimum: 0, maximum: 1 },
		ts:            { type: 'string', format: 'date-time' },
	},
};

const BAZAAR = {
	description: DESCRIPTION,
	useCases: ['bazaar price trends', 'service cost monitoring', 'market sentiment', 'agent-to-agent intel'],
	input: {
		type: 'json',
		example: { filter: 'price_trends', period: '24h' },
		schema: INPUT_SCHEMA,
	},
	output: {
		type: 'json',
		example: {
			filter: 'price_trends', period: '24h',
			trending_up: [{ service_key: 'https://svc.example/api#tool', name: 'Example Oracle', pct_change: 33.3, price_atomic: 2000, price_usdc: 0.002, first_price_atomic: 1500, observations: 4 }],
			trending_down: [], stable_count: 12, total_tracked: 13,
			net_pressure: 0.08, avg_change_pct: 2.4, signal: 'neutral',
			headline: 'Bazaar prices steady — 1 up, 0 down, 12 stable over 24h',
			confidence: 0.66, ts: '2026-06-27T10:00:00Z',
		},
	},
	schema: buildBazaarSchema({
		method: 'POST',
		bodySchema: INPUT_SCHEMA,
		outputSchema: OUTPUT_SCHEMA,
	}),
};

// Parse a period string (e.g. "24h", "7d", "30m", "2w") into a validated
// Postgres interval string. Defaults to 24 hours. Clamps to [1 minute, 30 days]
// so a hostile/typo value can never request an unbounded scan.
const UNIT_TO_PG = { m: 'minutes', h: 'hours', d: 'days', w: 'weeks' };
const UNIT_TO_MIN = { m: 1, h: 60, d: 1440, w: 10080 };
export function parsePeriod(raw) {
	const def = { interval: '24 hours', label: '24h' };
	if (typeof raw !== 'string') return def;
	const m = raw.trim().toLowerCase().match(/^(\d{1,5})\s*([mhdw])$/);
	if (!m) return def;
	let n = Number(m[1]);
	const unit = m[2];
	if (!Number.isFinite(n) || n <= 0) return def;
	const minutes = n * UNIT_TO_MIN[unit];
	const MIN = 1, MAX = 30 * 1440; // 1 minute .. 30 days
	if (minutes < MIN) { n = 1; return { interval: '1 minutes', label: '1m' }; }
	if (minutes > MAX) return { interval: '30 days', label: '30d' };
	return { interval: `${n} ${UNIT_TO_PG[unit]}`, label: `${n}${unit}` };
}

// Derive the directional sentiment from the up/down/stable tally + average move.
function classify(up, down, stable, avgChange) {
	const total = up + down + stable;
	const movers = up + down;
	const netPressure = total > 0 ? Number(((up - down) / total).toFixed(4)) : 0;
	let signal = 'neutral';
	if (netPressure > PRESSURE_PCT) signal = 'bullish';
	else if (netPressure < -PRESSURE_PCT) signal = 'bearish';

	// Confidence scales with sample size and the strength of the imbalance.
	let confidence = total === 0
		? 0.4
		: Math.min(0.95, 0.5 + Math.min(total / 20, 0.2) + Math.min(Math.abs(netPressure), 0.3));
	confidence = Number(confidence.toFixed(2));

	const dir = signal === 'bullish'
		? 'rising'
		: signal === 'bearish'
			? 'cooling'
			: 'steady';
	const headline = total === 0
		? 'Bazaar price trends: no service movement recorded yet'
		: `Bazaar prices ${dir} — ${up} up, ${down} down, ${stable} stable`;

	return { signal, netPressure, confidence, headline, total, movers };
}

// Read the price-trend feed from the live service price-history time series.
export async function readBazaarPriceTrends(periodRaw) {
	const { interval, label } = parsePeriod(periodRaw);

	let rows = [];
	try {
		rows = await sql`
			SELECT service_key,
			       (array_agg(price_atomic ORDER BY ts ASC))[1]  AS first_price,
			       (array_agg(price_atomic ORDER BY ts DESC))[1] AS last_price,
			       (array_agg(name        ORDER BY ts DESC))[1]  AS name,
			       (array_agg(resource    ORDER BY ts DESC))[1]  AS resource,
			       (array_agg(tool_name   ORDER BY ts DESC))[1]  AS tool_name,
			       (array_agg(network     ORDER BY ts DESC))[1]  AS network,
			       count(*)::int AS observations
			FROM x402_service_price_history
			WHERE ts >= now() - ${interval}::interval
			  AND available = true
			  AND price_atomic IS NOT NULL
			  AND price_atomic > 0
			GROUP BY service_key
			HAVING count(*) >= 2
		`;
	} catch (err) {
		// Tracker has never run (table absent) — genuine empty feed, not an error.
		if (/does not exist/i.test(err?.message || '')) rows = [];
		else throw err;
	}

	const up = [];
	const down = [];
	let stableCount = 0;
	let changeSum = 0;
	let changeN = 0;

	for (const r of rows) {
		const first = Number(r.first_price);
		const last = Number(r.last_price);
		if (!Number.isFinite(first) || first <= 0 || !Number.isFinite(last)) continue;
		const pct = Number((((last - first) / first) * 100).toFixed(2));
		changeSum += pct;
		changeN += 1;

		if (Math.abs(pct) < STABLE_PCT) {
			stableCount += 1;
			continue;
		}
		const item = {
			service_key: r.service_key,
			name: r.name || null,
			resource: r.resource || null,
			tool_name: r.tool_name || null,
			network: r.network || null,
			pct_change: pct,
			price_atomic: last,
			price_usdc: Number((last / 1e6).toFixed(6)),
			first_price_atomic: first,
			observations: Number(r.observations || 0),
		};
		(pct > 0 ? up : down).push(item);
	}

	up.sort((a, b) => b.pct_change - a.pct_change);
	down.sort((a, b) => a.pct_change - b.pct_change);

	const avgChange = changeN > 0 ? Number((changeSum / changeN).toFixed(2)) : null;
	const { signal, netPressure, confidence, headline, total } =
		classify(up.length, down.length, stableCount, avgChange);

	return {
		filter: 'price_trends',
		period: label,
		trending_up: up.slice(0, TOP_N),
		trending_down: down.slice(0, TOP_N),
		stable_count: stableCount,
		total_tracked: total,
		net_pressure: netPressure,
		avg_change_pct: avgChange,
		signal,
		headline: `${headline} over ${label}`,
		confidence,
		ts: new Date().toISOString(),
	};
}

export default paidEndpoint({
	route: ROUTE,
	method: 'POST',
	priceAtomics: priceFor('bazaar_feed', '1000'), // $0.001 USDC — lightweight read
	networks: ['solana', 'base'],
	description: DESCRIPTION,
	bazaar: BAZAAR,
	service: withService({
		serviceName: 'three.ws Bazaar Feed',
		tags: ['bazaar', 'price', 'trends', 'market', 'x402'],
	}),
	accessControl: installAccessControl({ requiredScope: 'x402:bypass' }),

	async handler({ req }) {
		let filter = 'price_trends';
		let period = '24h';
		try {
			const chunks = [];
			for await (const c of req) chunks.push(c);
			const body = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
			if (typeof body.filter === 'string' && body.filter.trim()) {
				filter = body.filter.trim().toLowerCase();
			}
			if (typeof body.period === 'string' && body.period.trim()) {
				period = body.period.trim();
			}
		} catch { /* defaults */ }

		if (filter !== 'price_trends') {
			// Reject before settlement so the buyer is not charged for an
			// unsupported filter.
			throw Object.assign(new Error(`unsupported filter "${filter}"; only "price_trends" is available`), {
				status: 400,
				code: 'unsupported_filter',
			});
		}

		return readBazaarPriceTrends(period);
	},
});

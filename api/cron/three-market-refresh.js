// @ts-check
// GET /api/cron/three-market-refresh — keep the $THREE market-data cache warm.
//
// Why this exists (TASK-10): market reads — the price / market-cap / holders
// panels, the leaderboard supply percentages, OG badges — are traffic-driven.
// On a cold or expired cache, every concurrent request independently fans out to
// Birdeye → DexScreener → GeckoTerminal, and under load that exhausts all three
// free quotas at once ("all sources failed — serving stale").
//
// This cron turns the upstream polling into a single, constant-rate background
// job: once a minute we do ONE forced-fresh fetch and write it to the shared
// (L2) cache, sized to outlive a cron cadence. On-demand reads then serve that
// warm write and almost never touch an upstream — collapsing fleet-wide upstream
// load to ~1 cascade per minute regardless of traffic. The circuit breaker still
// applies: a quota-exhausted source stays skipped via the shared cooldown key,
// so a dead Birdeye isn't re-burned every tick.
//
// Kept as a concrete file (not [name].js) so this lightweight refresh never
// shares a cold start with the heavy SDK bundles.

import { error, json, method, wrapCron } from '../_lib/http.js';
import { env } from '../_lib/env.js';
import { constantTimeEquals } from '../_lib/crypto.js';
import { TOKEN_MINT as THREE_MINT } from '../_lib/token/config.js';
import { fetchTokenMarketData } from '../_lib/market/token-market.js';

function requireCron(req, res) {
	const secret = process.env.CRON_SECRET || env.CRON_SECRET;
	if (!secret) {
		error(res, 503, 'not_configured', 'CRON_SECRET unset');
		return false;
	}
	const auth = req.headers['authorization'] || '';
	const presented = auth.startsWith('Bearer ') ? auth.slice(7) : '';
	if (!constantTimeEquals(presented, secret)) {
		error(res, 401, 'unauthorized', 'invalid cron secret');
		return false;
	}
	return true;
}

export default wrapCron(async (req, res) => {
	if (!method(req, res, ['GET'])) return;
	if (!requireCron(req, res)) return;

	// fresh:true bypasses the read caches and the single-flight lock (we WANT to
	// fetch) but still writes the result to L2 for everyone else to serve.
	const md = await fetchTokenMarketData(THREE_MINT, { fresh: true }).catch((err) => {
		console.warn('[three-market-refresh] fetch failed:', err?.message || err);
		return null;
	});

	return json(res, 200, {
		ok: !!md,
		mint: THREE_MINT,
		source: md?.source ?? null,
		price_usd: md?.price_usd ?? null,
		ts: Date.now(),
	});
});

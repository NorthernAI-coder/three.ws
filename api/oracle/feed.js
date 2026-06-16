/**
 * Oracle — live conviction feed.
 *
 *   GET /api/oracle/feed?network=mainnet&limit=50&min_score=0&tier=strong&category=ai
 *
 * Serves the materialized oracle_conviction cache (one fast indexed read). On a
 * cold cache it opportunistically scores a handful of recent coins straight from
 * the data brain (no LLM — DB-only, fast) so the feed is never empty before the
 * ingestion augmentor has swept. Also returns the conviction-tier backtest so
 * the UI can prove the edge.
 */

import { cors, json, method, wrap, rateLimited } from '../_lib/http.js';
import { limits, clientIp } from '../_lib/rate-limit.js';
import { readFeed, convictionBacktest, scoreCoin } from '../_lib/oracle/store.js';
import { recentMints } from '../_lib/oracle/sources.js';

const NETWORKS = new Set(['mainnet', 'devnet']);
const TIERS = new Set(['prime', 'strong', 'lean', 'watch', 'avoid']);
const CATEGORIES = new Set(['meme', 'tech', 'ai', 'culture', 'community', 'political', 'news', 'animal', 'celebrity', 'utility', 'unknown']);

export default wrap(async (req, res) => {
	if (cors(req, res, { methods: 'GET,OPTIONS', origins: '*' })) return;
	if (!method(req, res, ['GET'])) return;

	const rl = await limits.mcpIp(clientIp(req));
	if (!rl.success) return rateLimited(res, rl);

	const url = new URL(req.url, `http://${req.headers.host || 'x'}`);
	const p = url.searchParams;
	const network = NETWORKS.has(p.get('network')) ? p.get('network') : 'mainnet';
	const limit = Math.min(200, Math.max(1, Number(p.get('limit')) || 50));
	const minScore = Math.max(0, Math.min(100, Number(p.get('min_score')) || 0));
	const tier = TIERS.has(p.get('tier')) ? p.get('tier') : null;
	const category = CATEGORIES.has(p.get('category')) ? p.get('category') : null;

	let items = await safeFeed({ network, limit, minScore, tier, category });

	// Cold-start warm: if the cache is empty, score a few recent brain coins
	// (DB-only, no LLM) so the page has something real to render immediately.
	if (items.length === 0) {
		const mints = await recentMints({ network, limit: 8, sinceSeconds: 6 * 3600 }).catch(() => []);
		await Promise.allSettled(mints.map((m) => scoreCoin(m, { network, classify: false, persist: true })));
		items = await safeFeed({ network, limit, minScore, tier, category });
	}

	const backtest = await convictionBacktest({ network }).catch(() => []);

	return json(res, 200, {
		network,
		count: items.length,
		items,
		backtest,
		generated_at: new Date().toISOString(),
	}, { 'Cache-Control': 'public, max-age=3, stale-while-revalidate=15' });
});

async function safeFeed(opts) {
	try { return await readFeed(opts); } catch { return []; }
}

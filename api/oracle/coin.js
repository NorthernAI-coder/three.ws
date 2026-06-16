/**
 * Oracle — full intel for one coin.
 *
 *   GET /api/oracle/coin?mint=<mint>&network=mainnet
 *
 * Returns the fused conviction verdict (lazy-scored with a fresh narrative read
 * on a cache miss), the transparent pillar reasons, the narrative classification,
 * the ground-truth outcome if known, and the live "who's in" trader breakdown —
 * every early wallet labeled by its data-brain archetype + track record. This is
 * the trader-classification surface the product is built around.
 */

import { cors, json, method, wrap, error, rateLimited } from '../_lib/http.js';
import { limits, clientIp } from '../_lib/rate-limit.js';
import { readCoin, scoreCoin } from '../_lib/oracle/store.js';

const NETWORKS = new Set(['mainnet', 'devnet']);
const MINT_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

export default wrap(async (req, res) => {
	if (cors(req, res, { methods: 'GET,OPTIONS', origins: '*' })) return;
	if (!method(req, res, ['GET'])) return;

	const rl = await limits.mcpIp(clientIp(req));
	if (!rl.success) return rateLimited(res, rl);

	const url = new URL(req.url, `http://${req.headers.host || 'x'}`);
	const mint = (url.searchParams.get('mint') || '').trim();
	const network = NETWORKS.has(url.searchParams.get('network')) ? url.searchParams.get('network') : 'mainnet';

	if (!MINT_RE.test(mint)) return error(res, 400, 'validation_error', 'a valid base58 mint is required');

	let coin = await safeReadCoin(mint, network);

	// Cache miss (no verdict yet) → score it now, with a real narrative read.
	if (!coin || !coin.conviction) {
		const scored = await scoreCoin(mint, { network, classify: true, persist: true }).catch(() => null);
		if (!scored) {
			// The coin is unknown to the data brain (never observed).
			return error(res, 404, 'not_found', 'this mint has not been observed yet');
		}
		coin = await safeReadCoin(mint, network);
	}

	return json(res, 200, { network, mint, ...coin }, {
		'Cache-Control': 'public, max-age=5, stale-while-revalidate=30',
	});
});

async function safeReadCoin(mint, network) {
	try { return await readCoin(mint, network); } catch { return null; }
}

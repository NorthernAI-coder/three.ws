/**
 * GET /api/cosmetics/catalog — the avatar cosmetics shop catalog (R21).
 *
 * Returns every shop item with its shop fields (id, name, slot, rarity, price,
 * previewImage, owned/locked) and the rig payload the live preview needs. The
 * base accessory pack is owned/free; premium emotes + skins are locked until
 * purchased (R22 x402 flow / R23 inventory). Prices are denominated in $THREE.
 *
 * Query params:
 *   rarity=common|rare|epic|legendary  — optional filter to one tier.
 */

import { cors, json, method, wrap, error } from '../_lib/http.js';
import { limits, clientIp } from '../_lib/rate-limit.js';
import { buildCatalog, RARITIES } from '../_lib/cosmetics.js';

export default wrap(async (req, res) => {
	if (cors(req, res, { methods: 'GET,OPTIONS', origins: '*' })) return;
	if (!method(req, res, ['GET'])) return;

	const rl = await limits.publicIp(clientIp(req));
	if (!rl.success) return error(res, 429, 'rate_limited', 'too many requests');

	const url = new URL(req.url, 'http://x');
	const rarity = url.searchParams.get('rarity');
	if (rarity && !RARITIES.includes(rarity)) {
		return error(res, 400, 'bad_rarity', `rarity must be one of: ${RARITIES.join(', ')}`);
	}

	// Ownership beyond the free base pack is wired in R23 (wallet-bound
	// inventory). Until then every premium item reads as locked.
	const items = buildCatalog({ rarity: rarity || null });

	// Catalog is static content — cache hard at the edge, but let the client
	// revalidate so a deploy that changes the pack propagates promptly.
	return json(res, 200, { items, rarities: RARITIES }, {
		'cache-control': 'public, max-age=300, s-maxage=3600, stale-while-revalidate=86400',
	});
});

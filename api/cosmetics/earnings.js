// GET /api/cosmetics/earnings?creator=<solanaWallet>
//
// Real, settled cosmetic creator earnings (R25) for a creator wallet: lifetime +
// 30-day totals, paid vs. pending, per-coin and per-cosmetic breakdowns, and recent
// sales. Reads the settled-sale ledger — never estimated. Powers the creator
// earnings view in the dashboard. Public read keyed on the wallet (the numbers are
// derived from public on-chain settlements); no secrets are exposed.

import { cors, json, method, wrap, error, rateLimited } from '../_lib/http.js';
import { limits, clientIp } from '../_lib/rate-limit.js';
import { creatorEarnings, isWallet } from '../_lib/cosmetics-economy.js';

export default wrap(async (req, res) => {
	if (cors(req, res, { methods: 'GET,OPTIONS', origins: '*' })) return;
	if (!method(req, res, ['GET'])) return;

	const rl = await limits.publicIp(clientIp(req));
	if (!rl.success) return rateLimited(res, rl);

	const url = new URL(req.url, 'http://x');
	const creator = String(url.searchParams.get('creator') || '').trim();
	if (!isWallet(creator)) {
		return error(res, 400, 'creator_required', 'query parameter "creator" must be a Solana wallet address');
	}

	let earnings;
	try {
		earnings = await creatorEarnings(creator);
	} catch (err) {
		console.warn('[cosmetics/earnings] read failed:', err?.message);
		earnings = null;
	}
	// A creator with no sales yet → zeroed totals, not a 404, so the dashboard
	// renders the designed empty state.
	if (!earnings) {
		earnings = {
			creatorWallet: creator,
			currency: 'USDC',
			totals: { sales: 0, buyers: 0, earnedUsdc: 0, paidUsdc: 0, pendingUsdc: 0, earned30dUsdc: 0, grossUsdc: 0, firstSaleAt: null, lastSaleAt: null },
			perCoin: [], perCosmetic: [], recent: [],
		};
	}

	return json(res, 200, earnings, { 'cache-control': 'no-store' });
});

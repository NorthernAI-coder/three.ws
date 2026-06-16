/**
 * Public wallet preview — show an on-chain pump.fun trade record without auth.
 *
 *   GET /api/traders/preview?wallet=<base58>&network=mainnet
 *
 * Returns the wallet's brain reputation (win rate, smart-money score, label,
 * trade count) and their 20 most recent pump.fun coin appearances. This powers
 * the /claim-wallet page where a KOL or trader can see their verified track
 * record before signing in to claim it.
 *
 * Public, IP rate-limited, 2-minute CDN cache.
 */

import { cors, json, method, wrap, error, rateLimited } from '../_lib/http.js';
import { limits, clientIp } from '../_lib/rate-limit.js';
import { walletProfile } from '../_lib/oracle/sources.js';

const NETWORKS = new Set(['mainnet', 'devnet']);
const WALLET_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const LAMPORTS = 1e9;

export default wrap(async (req, res) => {
	if (cors(req, res, { methods: 'GET,OPTIONS', origins: '*' })) return;
	if (!method(req, res, ['GET'])) return;

	const rl = await limits.publicIp(clientIp(req));
	if (!rl.success) return rateLimited(res, rl);

	const p = new URL(req.url, `http://${req.headers.host || 'x'}`).searchParams;
	const wallet  = (p.get('wallet') || '').trim();
	const network = NETWORKS.has(p.get('network')) ? p.get('network') : 'mainnet';

	if (!WALLET_RE.test(wallet)) return error(res, 400, 'invalid_wallet', 'Paste a valid Solana base-58 wallet address.');

	const { rep, recent } = await walletProfile(wallet, network);

	// Build a useful summary even if wallet_reputation doesn't have this wallet
	// yet (it's scored by the smart-money rollup worker, so new wallets lag).
	const coins = (recent || []).map((r) => {
		const buySol  = r.buy_lamports  != null ? Number(r.buy_lamports)  / LAMPORTS : null;
		const sellSol = r.sell_lamports != null ? Number(r.sell_lamports) / LAMPORTS : null;
		const pnlSol  = buySol != null && sellSol != null ? sellSol - buySol : null;
		return {
			mint:        r.mint,
			symbol:      r.symbol || null,
			name:        r.name   || null,
			image_uri:   r.image_uri || null,
			category:    r.category || null,
			is_creator:  r.is_creator || false,
			buy_sol:     buySol,
			sell_sol:    sellSol,
			pnl_sol:     pnlSol,
			last_seen_at: r.last_seen_at ? new Date(r.last_seen_at).toISOString() : null,
		};
	});

	const totalBuy  = coins.reduce((a, c) => a + (c.buy_sol  || 0), 0);
	const totalSell = coins.reduce((a, c) => a + (c.sell_sol || 0), 0);
	const wins      = coins.filter((c) => c.pnl_sol != null && c.pnl_sol > 0).length;
	const losses    = coins.filter((c) => c.pnl_sol != null && c.pnl_sol <= 0).length;

	const profile = rep ? {
		coins_traded:      Number(rep.coins_traded)      || 0,
		early_entries:     Number(rep.early_entries)     || 0,
		wins:              Number(rep.wins)              || 0,
		duds:              Number(rep.duds)              || 0,
		dumps:             Number(rep.dumps)             || 0,
		creator_count:     Number(rep.creator_count)     || 0,
		creator_wins:      Number(rep.creator_wins)      || 0,
		win_rate:          rep.win_rate != null ? Number(rep.win_rate) : null,
		early_win_rate:    rep.early_win_rate != null ? Number(rep.early_win_rate) : null,
		dump_rate:         rep.dump_rate != null ? Number(rep.dump_rate) : null,
		smart_money_score: rep.smart_money_score != null ? Number(rep.smart_money_score) : null,
		label:             rep.label || 'unproven',
		first_seen_at:     rep.first_seen_at ? new Date(rep.first_seen_at).toISOString() : null,
		last_active_at:    rep.last_active_at ? new Date(rep.last_active_at).toISOString() : null,
	} : null;

	const known = !!profile;
	const claimable = known && (Number(profile.coins_traded) > 0 || coins.length > 0);

	return json(res, 200, {
		wallet,
		network,
		known,
		claimable,
		profile,
		coins,
		summary: {
			total_coins: coins.length,
			wins_in_window:   wins,
			losses_in_window: losses,
			total_buy_sol:   Math.round(totalBuy  * 1000) / 1000,
			total_sell_sol:  Math.round(totalSell * 1000) / 1000,
			net_pnl_sol:     Math.round((totalSell - totalBuy) * 1000) / 1000,
		},
		generated_at: new Date().toISOString(),
	}, { 'Cache-Control': 'public, max-age=120, stale-while-revalidate=300' });
});

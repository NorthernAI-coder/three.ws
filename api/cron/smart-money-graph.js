// GET/POST /api/cron/smart-money-graph — maintain the Smart-Money wallet graph.
//
// Recomputes smart_wallet_reputation + smart_wallet_clusters from the coin-intel
// ground truth: every observed buyer (pump_coin_wallets) joined to what the coin
// actually did (pump_coin_outcomes). Each wallet earns a realized 0..100 score
// (ATH-weighted, confidence-regressed), and wallets sharing a funder are clustered
// (sybil/insider detection). The live lookup (api/_lib/smart-money.js) that the
// firewall, sniper scorer, oracle gate, and the public Smart-Money API all share
// reads from these tables.
//
// Idempotent + bounded so a frequent cron can never run away. Mainnet-only
// (pump_coin_* live on mainnet). Reads/writes only the graph's own tables.

import { error, json, method, wrap } from '../_lib/http.js';
import { env } from '../_lib/env.js';
import { constantTimeEquals } from '../_lib/crypto.js';
import { recomputeWalletGraph } from '../../workers/agent-sniper/recompute-wallet-graph.js';

const NETWORK = 'mainnet';

function requireCron(req, res) {
	const secret = process.env.CRON_SECRET || env.CRON_SECRET;
	if (!secret) { error(res, 503, 'not_configured', 'CRON_SECRET unset'); return false; }
	const auth = req.headers['authorization'] || '';
	const presented = auth.startsWith('Bearer ') ? auth.slice(7) : '';
	if (!constantTimeEquals(presented, secret)) {
		error(res, 401, 'unauthorized', 'invalid cron secret');
		return false;
	}
	return true;
}

export default wrap(async (req, res) => {
	if (!method(req, res, ['GET', 'POST'])) return;
	if (!requireCron(req, res)) return;

	const started = Date.now();
	const result = await recomputeWalletGraph({ network: NETWORK });

	return json(res, 200, {
		ok: result.ok,
		wallets: result.wallets,
		clusters: result.clusters,
		coins: result.coins,
		reason: result.reason || null,
		ms: Date.now() - started,
	});
});

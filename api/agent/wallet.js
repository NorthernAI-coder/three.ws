// GET /api/agent/wallet — public read of the avatar's custodial wallet.
//
// Returns the avatar wallet address, network, live SOL balance and USD value,
// the per-send cap and the default recipient. No secrets are exposed. The
// widget polls this to render the wallet chip and refresh after a payout.

import { cors, json, method, wrap, error } from '../_lib/http.js';
import {
	avatarWalletConfig,
	getConnection,
	getSolBalance,
	solUsdPrice,
	explorerAccountUrl,
} from '../_lib/avatar-wallet.js';

export default wrap(async (req, res) => {
	if (cors(req, res, { methods: 'GET,OPTIONS', credentials: true })) return;
	if (!method(req, res, ['GET'])) return;

	const cfg = avatarWalletConfig();
	if (!cfg.configured) {
		return error(
			res,
			503,
			'wallet_unconfigured',
			'avatar wallet is not configured — set AVATAR_WALLET_SECRET (run scripts/gen-avatar-wallet.mjs)',
		);
	}

	const connection = getConnection(cfg.rpcUrl);
	const [{ lamports, sol }, solPriceUsd] = await Promise.all([
		getSolBalance(connection, cfg.address),
		solUsdPrice().catch(() => 0),
	]);

	return json(
		res,
		200,
		{
			address: cfg.address,
			network: cfg.network,
			lamports,
			sol,
			usd: solPriceUsd ? sol * solPriceUsd : null,
			solPriceUsd: solPriceUsd || null,
			maxSendUsd: cfg.maxSendUsd,
			defaultRecipient: cfg.defaultRecipient,
			explorer: explorerAccountUrl(cfg.address, cfg.network),
		},
		// Short cache so the chip feels live without hammering the RPC.
		{ 'Cache-Control': 'public, max-age=10' },
	);
});

// GET /api/agent-economy/status
//
// Returns live wallet info for both agents — no auth required, read-only.
//   agentA = the buyer  (AVATAR_WALLET_SECRET keypair)
//   agentB = the seller (AGENT_B_ADDRESS public key only)
//
// Both balances are fetched from Solana mainnet. The seller balance uses a
// public RPC query on the configured address — no private key needed.
// Returns configured:false for either agent when their env var is absent.

import {
	avatarWalletConfig,
	loadAvatarKeypair,
	getConnection,
	getSolBalance,
	solUsdPrice,
	isValidPubkey,
	explorerAccountUrl,
} from '../_lib/avatar-wallet.js';
import { cors, method, wrap } from '../_lib/http.js';

const RPC_URL = process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';

export default wrap(async (req, res) => {
	if (cors(req, res, { methods: 'GET,OPTIONS', origins: '*' })) return;
	if (!method(req, res, ['GET'])) return;

	const cfgA = avatarWalletConfig();
	const conn = getConnection(RPC_URL);
	const pricePromise = solUsdPrice().catch(() => 0);

	let agentA = { configured: false };
	let agentB = { configured: false };

	const fetches = [];

	if (cfgA.configured) {
		fetches.push(
			(async () => {
				const kp = loadAvatarKeypair(process.env.AVATAR_WALLET_SECRET);
				const addr = kp.publicKey.toBase58();
				const [{ sol, lamports }, price] = await Promise.all([
					getSolBalance(conn, addr),
					pricePromise,
				]);
				agentA = {
					configured: true,
					address: addr,
					sol,
					lamports,
					usd: price > 0 ? sol * price : null,
					solPriceUsd: price || null,
					network: cfgA.network,
					explorer: explorerAccountUrl(addr, cfgA.network),
				};
			})(),
		);
	}

	const bAddr = process.env.AGENT_B_ADDRESS?.trim();
	if (bAddr && isValidPubkey(bAddr)) {
		fetches.push(
			(async () => {
				const [{ sol, lamports }, price] = await Promise.all([
					getSolBalance(conn, bAddr),
					pricePromise,
				]);
				agentB = {
					configured: true,
					address: bAddr,
					sol,
					lamports,
					usd: price > 0 ? sol * price : null,
					solPriceUsd: price || null,
					network: 'mainnet',
					explorer: explorerAccountUrl(bAddr, 'mainnet'),
				};
			})(),
		);
	}

	await Promise.allSettled(fetches);

	res.writeHead(200, {
		'content-type': 'application/json',
		'access-control-allow-origin': '*',
		'cache-control': 'no-store',
	});
	res.end(JSON.stringify({ agentA, agentB }));
});

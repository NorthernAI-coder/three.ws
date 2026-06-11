// POST /api/agents/:id/solana/airdrop — thin delegate.
//
// The canonical airdrop implementation lives in solana-wallet.js
// (handleAirdrop), dispatched from api/agents/[id].js via the `solana`
// sub-path. This wrapper exists only for direct imports of the standalone
// module path; it carries no logic of its own so the two paths can never
// drift apart.

import { wrap } from '../_lib/http.js';
import solanaWallet from './solana-wallet.js';

export default wrap(async (req, res, id) => {
	const url = new URL(req.url, 'http://x');
	const agentId = id || url.searchParams.get('id') || req.query?.id;
	return solanaWallet(req, res, agentId, 'airdrop');
});

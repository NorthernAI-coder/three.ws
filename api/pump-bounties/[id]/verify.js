// GET /api/pump-bounties/:id/verify — trustless on-chain escrow check.
//
// Reads each reward leg's RewardVault balance straight from a Solana RPC and
// confirms it covers the remaining reward. Independent of pump.fun's API being
// honest. Lazy-loaded by the detail page so the page paints first, then the
// "escrow funded" badge resolves. Cached briefly — vault balances rarely change.

import { cors, json, error, wrap, method } from '../../_lib/http.js';
import { cacheGet, cacheSet } from '../../_lib/cache.js';
import { isUuid } from '../../_lib/validate.js';
import { getBounty, verifyEscrow, PumpGoError } from '../../_lib/pump-go.js';

export default wrap(async (req, res) => {
	if (cors(req, res, { methods: 'GET,OPTIONS' })) return;
	if (!method(req, res, ['GET'])) return;

	const id = req.query?.id;
	if (!id || !isUuid(id)) return error(res, 400, 'bad_request', 'valid bounty taskId required');

	const cacheKey = `pumpgo:verify:${id}`;
	const cached = await cacheGet(cacheKey).catch(() => null);
	if (cached) {
		res.setHeader('cache-control', 'public, s-maxage=45, stale-while-revalidate=180');
		return json(res, 200, cached);
	}

	let bounty;
	try {
		bounty = await getBounty(id);
	} catch (e) {
		if (e instanceof PumpGoError) return error(res, e.status, e.code, e.message);
		throw e;
	}
	if (!bounty) return error(res, 404, 'not_found', 'bounty not found');

	const result = await verifyEscrow(bounty);
	const payload = {
		...result,
		checkedAt: new Date().toISOString(),
		programId: bounty.onChain.programId,
		bountyId: bounty.onChain.bountyId,
	};

	// Only cache a clean (non-degraded) verdict, so a transient RPC error doesn't
	// stick for the full TTL.
	if (!payload.degraded) await cacheSet(cacheKey, payload, 45).catch(() => {});
	res.setHeader('cache-control', 'public, s-maxage=45, stale-while-revalidate=180');
	return json(res, 200, payload);
});

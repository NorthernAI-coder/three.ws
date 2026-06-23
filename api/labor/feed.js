// GET /api/labor/feed — the live Agent Labor Market feed.
// Open bounties (filterable by skill + minimum reward), in-flight jobs, the most
// recent settlements (the $THREE-flow ticker), and market totals. Public read.

import { cors, json, method, wrap } from '../_lib/http.js';
import { TOKEN_MINT, TOKEN_DECIMALS, TOKEN_SYMBOL } from '../_lib/token/config.js';
import { escrowConfigured } from '../_lib/labor-escrow.js';
import {
	listOpenBounties, listInflightJobs, recentSettlements, marketTotals, threeToAtomics,
} from '../_lib/agent-labor.js';

export default wrap(async (req, res) => {
	if (cors(req, res, { methods: 'GET,OPTIONS', credentials: true })) return;
	if (!method(req, res, ['GET'])) return;

	const url = new URL(req.url, 'http://localhost');
	const skill = url.searchParams.get('skill')?.trim() || null;
	const minRewardThree = url.searchParams.get('minReward');
	const minRewardAtomics = minRewardThree ? threeToAtomics(minRewardThree) : null;

	const [open, inflight, settlements, totals] = await Promise.all([
		listOpenBounties({ requiredSkill: skill, minRewardAtomics, limit: 60 }),
		listInflightJobs({ limit: 30 }),
		recentSettlements({ limit: 24 }),
		marketTotals(),
	]);

	json(res, 200, {
		data: {
			open,
			inflight,
			settlements,
			totals,
			escrow_configured: escrowConfigured(),
			token: { mint: TOKEN_MINT, symbol: TOKEN_SYMBOL, decimals: TOKEN_DECIMALS },
		},
	});
});

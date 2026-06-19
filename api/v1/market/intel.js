// GET /api/v1/market/intel — recent narrative / market intelligence items.
//
// Unified-API surface over the aixbt bridge (api/_lib/aixbt.js). The shared
// upstream key is metered per-deployment, so on top of the gateway's
// per-principal budget this also consumes the global aixbt ceiling — one caller
// (or many) can't drain the shared key.

import { defineEndpoint, fail } from '../../_lib/gateway.js';
import { getIntel, aixbtEnabled } from '../../_lib/aixbt.js';
import { limits } from '../../_lib/rate-limit.js';

export default defineEndpoint({
	name: 'v1.market.intel',
	method: 'GET',
	auth: 'optional',
	scope: 'agents:read',
	handler: async ({ query }) => {
		if (!aixbtEnabled())
			fail(503, 'not_configured', 'market intelligence is not enabled on this deployment');

		const g = await limits.aixbtGlobal();
		if (!g.success) fail(429, 'rate_limited', 'market intelligence is busy — retry shortly');

		const { intel, pagination } = await getIntel({
			limit: query.limit,
			category: query.category,
			chain: query.chain,
		});
		return { intel, pagination, source: 'aixbt' };
	},
});

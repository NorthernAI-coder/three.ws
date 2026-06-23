// /api/labor/policy — read or set an agent's labor-market autonomy policy.
//   GET  ?agentId=…  → the agent's policy (public; powers the "for hire" badge).
//   PUT  { agentId, … } → owner-gated upsert of the worker/poster autonomy config.

import { cors, error, json, method, readJson, wrap } from '../_lib/http.js';
import { authWrite, loadOwnedAgent } from '../_lib/labor-auth.js';
import { getLaborPolicy, upsertLaborPolicy, threeToAtomics } from '../_lib/agent-labor.js';

export default wrap(async (req, res) => {
	if (cors(req, res, { methods: 'GET,PUT,OPTIONS', credentials: true })) return;

	if (req.method === 'GET') {
		const url = new URL(req.url, 'http://localhost');
		const agentId = url.searchParams.get('agentId');
		if (!agentId) return error(res, 400, 'validation_error', 'agentId is required');
		const policy = await getLaborPolicy(agentId);
		return json(res, 200, { data: policy || { agent_id: agentId, worker_enabled: false, poster_enabled: false, skills: [] } });
	}

	if (!method(req, res, ['GET', 'PUT'])) return;

	const auth = await authWrite(req, res);
	if (!auth) return;
	const { userId } = auth;

	const body = (await readJson(req)) || {};
	const { agentId } = body;
	if (!agentId) return error(res, 400, 'validation_error', 'agentId is required');

	try {
		await loadOwnedAgent(agentId, userId);
	} catch (e) {
		return error(res, e.status || 400, e.code || 'bad_request', e.message);
	}

	const policy = await upsertLaborPolicy(agentId, userId, {
		workerEnabled: !!body.workerEnabled,
		posterEnabled: !!body.posterEnabled,
		autoAward: !!body.autoAward,
		skills: Array.isArray(body.skills) ? body.skills : [],
		minBids: body.minBids,
		maxBidAtomics: body.maxBidThree != null ? threeToAtomics(body.maxBidThree) : body.maxBidAtomics ?? null,
		minRewardAtomics: body.minRewardThree != null ? threeToAtomics(body.minRewardThree) : body.minRewardAtomics ?? null,
		meta: body.meta || {},
	});

	return json(res, 200, { ok: true, data: policy });
});

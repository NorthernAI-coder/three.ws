// POST /api/labor/deliver — a worker agent (owned by the caller) submits the
// deliverable for its awarded job. Delivery immediately triggers verification +
// settlement: a neutral verifier scores the work against the spec and, ONLY on a
// pass, escrow is released on-chain to the worker with the skill royalty routed to
// the author. No human approves — the verdict gates the money.

import { cors, error, json, method, readJson, wrap } from '../_lib/http.js';
import { authWrite, loadOwnedAgent } from '../_lib/labor-auth.js';
import { getJob, getBounty, markJobDelivered } from '../_lib/agent-labor.js';
import { runSettlement } from '../_lib/labor-settle.js';

export default wrap(async (req, res) => {
	if (cors(req, res, { methods: 'POST,OPTIONS', credentials: true })) return;
	if (!method(req, res, ['POST'])) return;

	const auth = await authWrite(req, res);
	if (!auth) return;
	const { userId } = auth;

	const body = (await readJson(req)) || {};
	const { jobId } = body;
	if (!jobId) return error(res, 400, 'validation_error', 'jobId is required');

	const job = await getJob(jobId);
	if (!job) return error(res, 404, 'not_found', 'job not found');

	try {
		await loadOwnedAgent(job.worker_agent_id, userId); // caller must own the worker
	} catch (e) {
		return error(res, e.status || 400, e.code || 'bad_request', e.message);
	}
	if (job.status !== 'working') return error(res, 409, 'not_deliverable', `job is ${job.status}, not awaiting delivery`);

	const raw = body.deliverable;
	const deliverable =
		typeof raw === 'string'
			? { output: raw.slice(0, 8000), produced_at: new Date().toISOString() }
			: raw && typeof raw === 'object'
				? { output: String(raw.output ?? '').slice(0, 8000), ...raw, produced_at: new Date().toISOString() }
				: null;
	if (!deliverable || !deliverable.output) return error(res, 400, 'validation_error', 'deliverable (string or { output }) is required');

	const delivered = await markJobDelivered(jobId, deliverable);
	if (!delivered) return error(res, 409, 'not_deliverable', 'job could not be marked delivered (already delivered?)');

	const bounty = await getBounty(job.bounty_id);
	const result = await runSettlement({ job: delivered, bounty });

	return json(res, 200, { ok: true, job_id: jobId, settlement: result });
});

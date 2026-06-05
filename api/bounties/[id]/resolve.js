import { sql } from '../../_lib/db.js';
import { cors, json, error, readJson, wrap, method } from '../../_lib/http.js';
import { getSessionUser } from '../../_lib/auth.js';

export default wrap(async (req, res) => {
	if (cors(req, res)) return;
	if (!method(req, res, ['POST'])) return;

	let user;
	try { user = await getSessionUser(req); } catch {
		return error(res, 401, 'unauthorized', 'sign in required');
	}

	const id = req.query?.id;
	if (!id) return error(res, 400, 'bad_request', 'bounty id required');

	const [bounty] = await sql`
		SELECT id, user_id, status, reward_sol FROM bounties
		WHERE id = ${id} AND deleted_at IS NULL
	`;
	if (!bounty) return error(res, 404, 'not_found', 'bounty not found');
	if (bounty.user_id !== user.id) return error(res, 403, 'forbidden', 'only the bounty poster can resolve');
	if (bounty.status === 'closed') return error(res, 409, 'already_closed', 'bounty already resolved');

	const body = await readJson(req);
	const { submission_id, tx_hash } = body;
	if (!submission_id) return error(res, 400, 'bad_request', 'submission_id required');

	const [submission] = await sql`
		SELECT id FROM bounty_submissions WHERE id = ${submission_id} AND bounty_id = ${id}
	`;
	if (!submission) return error(res, 404, 'not_found', 'submission not found on this bounty');

	await sql`
		UPDATE bounty_submissions SET status = 'rejected'
		WHERE bounty_id = ${id} AND id != ${submission_id}
	`;

	const [winner] = await sql`
		UPDATE bounty_submissions
		SET status = 'accepted', reward_sol = ${bounty.reward_sol || null}, tx_hash = ${tx_hash?.trim() || null}
		WHERE id = ${submission_id}
		RETURNING *
	`;

	await sql`
		UPDATE bounties SET status = 'closed', winner_submission_id = ${submission_id}
		WHERE id = ${id}
	`;

	return json(res, 200, { winner });
});

import { sql } from '../../_lib/db.js';
import { cors, json, error, readJson, wrap, method } from '../../_lib/http.js';
import { getSessionUser } from '../../_lib/auth.js';
import { enrichLikes } from '../../_lib/bounty-likes.js';

export default wrap(async (req, res) => {
	if (cors(req, res)) return;

	const id = req.query?.id;
	if (!id) return error(res, 400, 'bad_request', 'bounty id required');

	if (req.method === 'GET') {
		const url = new URL(req.url, 'http://localhost');
		const limit = Math.min(parseInt(url.searchParams.get('limit') || '20', 10), 50);
		const offset = Math.max(parseInt(url.searchParams.get('offset') || '0', 10), 0);

		const rows = await sql`
			SELECT id, bounty_id, user_id, username, content, media_url, media_type,
			       status, reward_sol, tx_hash, created_at
			FROM bounty_submissions
			WHERE bounty_id = ${id} AND status != 'rejected'
			ORDER BY created_at DESC
			LIMIT ${limit} OFFSET ${offset}
		`;
		const userId = (await getSessionUser(req).catch(() => null))?.id || null;
		await enrichLikes(rows, { userId });
		return json(res, 200, { submissions: rows });
	}

	if (req.method === 'POST') {
		let user;
		try { user = await getSessionUser(req); } catch {
			return error(res, 401, 'unauthorized', 'sign in to submit');
		}

		const [bounty] = await sql`
			SELECT id, status, expires_at FROM bounties
			WHERE id = ${id} AND deleted_at IS NULL
		`;
		if (!bounty) return error(res, 404, 'not_found', 'bounty not found');
		if (bounty.status === 'closed') return error(res, 409, 'bounty_closed', 'bounty is closed');
		if (bounty.expires_at && new Date(bounty.expires_at) < new Date()) {
			return error(res, 409, 'bounty_expired', 'bounty has expired');
		}

		const body = await readJson(req);
		const { content, media_url, media_type } = body;
		if (!content?.trim() && !media_url?.trim()) {
			return error(res, 400, 'bad_request', 'provide a description or media URL');
		}

		const validTypes = ['image', 'video', 'link'];
		const mtype = media_type && validTypes.includes(media_type) ? media_type : (media_url ? 'link' : null);
		const username = user.display_name || user.email?.split('@')[0] || 'anon';

		const [submission] = await sql`
			INSERT INTO bounty_submissions (bounty_id, user_id, username, content, media_url, media_type)
			VALUES (${id}, ${user.id}, ${username}, ${content?.trim() || null}, ${media_url?.trim() || null}, ${mtype})
			RETURNING *
		`;

		await sql`
			UPDATE bounties SET submission_count = submission_count + 1, status = 'resolving'
			WHERE id = ${id}
		`;

		return json(res, 201, { submission });
	}

	if (!method(req, res, ['GET', 'POST'])) return;
});

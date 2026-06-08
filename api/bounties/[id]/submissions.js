import { sql } from '../../_lib/db.js';
import { cors, json, error, readJson, wrap, method, rateLimited } from '../../_lib/http.js';
import { getSessionUser } from '../../_lib/auth.js';
import { limits } from '../../_lib/rate-limit.js';
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
		try {
			user = await getSessionUser(req);
		} catch {
			return error(res, 401, 'unauthorized', 'sign in to submit');
		}
		if (!user) return error(res, 401, 'unauthorized', 'sign in to submit');

		const rl = await limits.bountySubmit(user.id);
		if (!rl.success) return rateLimited(res, rl, 'too many submissions, slow down');

		const [bounty] = await sql`
			SELECT id, status, expires_at FROM bounties
			WHERE id = ${id} AND deleted_at IS NULL
		`;
		if (!bounty) return error(res, 404, 'not_found', 'bounty not found');
		if (bounty.status === 'closed') return error(res, 409, 'bounty_closed', 'bounty is closed');
		if (bounty.expires_at && new Date(bounty.expires_at) < new Date()) {
			return error(res, 409, 'bounty_expired', 'bounty has expired');
		}

		const body = await readJson(req, 16_000);
		const { content, media_url, media_type } = body;
		if (!content?.trim() && !media_url?.trim()) {
			return error(res, 400, 'bad_request', 'provide a description or media URL');
		}
		// Bound free-text and validate the media URL shape — it's rendered to every
		// other user, so reject oversized content and non-http(s) links.
		if (typeof content === 'string' && content.length > 4000)
			return error(res, 400, 'bad_request', 'content too long (max 4000)');
		if (typeof media_url === 'string' && media_url.trim()) {
			const u = media_url.trim();
			if (u.length > 2000 || !/^https?:\/\//i.test(u))
				return error(res, 400, 'bad_request', 'media_url must be a valid http(s) URL');
		}

		const validTypes = ['image', 'video', 'link'];
		const mtype =
			media_type && validTypes.includes(media_type) ? media_type : media_url ? 'link' : null;
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

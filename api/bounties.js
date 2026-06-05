import { sql } from './_lib/db.js';
import { cors, json, error, readJson, wrap, method } from './_lib/http.js';
import { getSessionUser } from './_lib/auth.js';

const SOL_USD_FALLBACK = 160;

export default wrap(async (req, res) => {
	if (cors(req, res)) return;

	if (req.method === 'GET') {
		const url = new URL(req.url, 'http://localhost');
		const tab = url.searchParams.get('tab') || 'trending';
		const limit = Math.min(parseInt(url.searchParams.get('limit') || '30', 10), 50);
		const offset = Math.max(parseInt(url.searchParams.get('offset') || '0', 10), 0);

		if (tab === 'feed') {
			// Mixed feed: interleave recent submissions and open bounties
			const [bounties, submissions] = await Promise.all([
				sql`
					SELECT b.id, b.user_id, b.username, b.title, b.description,
					       b.coin_symbol, b.coin_mint, b.reward_sol, b.reward_tokens,
					       b.reward_usd, b.status, b.expires_at, b.submission_count,
					       b.created_at, 'bounty' AS _type
					FROM bounties b
					WHERE b.deleted_at IS NULL AND b.status != 'closed'
					ORDER BY b.submission_count DESC, b.reward_usd DESC NULLS LAST, b.created_at DESC
					LIMIT ${Math.ceil(limit / 2)}
				`,
				sql`
					SELECT bs.id, bs.bounty_id, bs.user_id, bs.username,
					       bs.content, bs.media_url, bs.media_type, bs.status,
					       bs.created_at,
					       b.title AS bounty_title, b.coin_symbol, b.coin_mint,
					       'submission' AS _type
					FROM bounty_submissions bs
					JOIN bounties b ON bs.bounty_id = b.id
					WHERE bs.status != 'rejected' AND b.deleted_at IS NULL
					ORDER BY bs.created_at DESC
					LIMIT ${Math.ceil(limit / 2)}
				`,
			]);
			// Interleave: for each bounty insert up to 2 of its submissions
			const subsByBounty = {};
			for (const s of submissions) {
				if (!subsByBounty[s.bounty_id]) subsByBounty[s.bounty_id] = [];
				subsByBounty[s.bounty_id].push(s);
			}
			const feed = [];
			for (const b of bounties) {
				feed.push(b);
				const subs = subsByBounty[b.id] || [];
				for (const s of subs.slice(0, 2)) feed.push(s);
			}
			return json(res, 200, { feed, tab });
		}

		if (tab === 'submissions') {
			const rows = await sql`
				SELECT bs.id, bs.bounty_id, bs.user_id, bs.username,
				       bs.content, bs.media_url, bs.media_type, bs.status,
				       bs.reward_sol, bs.created_at,
				       b.title AS bounty_title, b.coin_symbol, b.coin_mint
				FROM bounty_submissions bs
				JOIN bounties b ON bs.bounty_id = b.id
				WHERE bs.status != 'rejected' AND b.deleted_at IS NULL
				ORDER BY bs.created_at DESC
				LIMIT ${limit} OFFSET ${offset}
			`;
			return json(res, 200, { submissions: rows, tab });
		}

		if (tab === 'open') {
			const rows = await sql`
				SELECT b.id, b.user_id, b.username, b.title, b.description,
				       b.coin_symbol, b.coin_mint, b.reward_sol, b.reward_tokens,
				       b.reward_usd, b.status, b.expires_at, b.submission_count, b.created_at
				FROM bounties b
				WHERE b.deleted_at IS NULL AND b.status = 'open'
				  AND (b.expires_at IS NULL OR b.expires_at > NOW())
				ORDER BY b.reward_usd DESC NULLS LAST, b.created_at DESC
				LIMIT ${limit} OFFSET ${offset}
			`;
			return json(res, 200, { bounties: rows, tab });
		}

		// trending (default)
		const rows = await sql`
			SELECT b.id, b.user_id, b.username, b.title, b.description,
			       b.coin_symbol, b.coin_mint, b.reward_sol, b.reward_tokens,
			       b.reward_usd, b.status, b.expires_at, b.submission_count, b.created_at
			FROM bounties b
			WHERE b.deleted_at IS NULL
			ORDER BY b.submission_count DESC, b.reward_usd DESC NULLS LAST, b.created_at DESC
			LIMIT ${limit} OFFSET ${offset}
		`;
		return json(res, 200, { bounties: rows, tab });
	}

	if (req.method === 'POST') {
		let user;
		try { user = await getSessionUser(req); } catch {
			return error(res, 401, 'unauthorized', 'sign in to post a bounty');
		}

		const body = await readJson(req);
		const { title, description, reward_sol, reward_tokens, coin_symbol, coin_mint, expires_in_days } = body;

		if (!title?.trim()) return error(res, 400, 'bad_request', 'title is required');
		if (!reward_sol && !reward_tokens) return error(res, 400, 'bad_request', 'set a reward (SOL or tokens)');

		const rewardSol = reward_sol ? parseFloat(reward_sol) : null;
		const rewardUsd = rewardSol ? parseFloat((rewardSol * SOL_USD_FALLBACK).toFixed(2)) : null;
		const days = Math.min(parseInt(expires_in_days || '7', 10), 30);
		const expiresAt = new Date(Date.now() + days * 86400000).toISOString();
		const username = user.display_name || user.email?.split('@')[0] || 'anon';
		const symbol = coin_symbol?.trim() || '$THREE';
		const mint = coin_mint?.trim() || 'FeMbDoX7R1Psc4GEcvJdsbNbZA3bfztcyDCatJVJpump';

		const [bounty] = await sql`
			INSERT INTO bounties
			  (user_id, username, title, description, reward_sol, reward_tokens, reward_usd, coin_symbol, coin_mint, expires_at)
			VALUES
			  (${user.id}, ${username}, ${title.trim()}, ${description?.trim() || null},
			   ${rewardSol}, ${reward_tokens ? BigInt(reward_tokens) : null}, ${rewardUsd},
			   ${symbol}, ${mint}, ${expiresAt})
			RETURNING *
		`;
		return json(res, 201, { bounty });
	}

	if (!method(req, res, ['GET', 'POST'])) return;
});

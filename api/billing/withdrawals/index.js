// GET /api/billing/withdrawals — list user's withdrawal history
// POST /api/billing/withdrawals — initiate a withdrawal request

import { z } from 'zod';
import { sql } from '../../_lib/db.js';
import { getSessionUser } from '../../_lib/auth.js';
import { cors, json, method, wrap, error, readJson, rateLimited } from '../../_lib/http.js';
import { parse } from '../../_lib/validate.js';
import { limits, clientIp } from '../../_lib/rate-limit.js';
import { requireCsrf } from '../../_lib/csrf.js';

const postBody = z.object({
	amount: z.number().int().positive(),
	currency_mint: z.string().trim().min(1).max(100),
	chain: z.enum(['solana', 'base', 'evm']),
	to_address: z.string().trim().min(1).max(200),
	agent_id: z.string().uuid().nullable().optional(),
});

export default wrap(async (req, res) => {
	if (cors(req, res, { methods: 'GET,POST,OPTIONS', credentials: true })) return;
	if (!method(req, res, ['GET', 'POST'])) return;

	const user = await getSessionUser(req);
	if (!user) return error(res, 401, 'unauthorized', 'sign in required');

	const rl = await limits.authIp(clientIp(req));
	if (!rl.success) return rateLimited(res, rl);

	if (req.method === 'GET') {
		const params = new URL(req.url, 'http://x').searchParams;
		const status = params.get('status') || null;
		const limit = Math.min(100, Math.max(1, parseInt(params.get('limit') || '20', 10)));
		const offset = Math.max(0, parseInt(params.get('offset') || '0', 10));

		// Branching on `status` avoids Postgres's `42P18: could not determine
		// data type of parameter` when the entire predicate compares two NULLs
		// (the `(${status} is null or status = ${status})` shape).
		const withdrawals = status
			? await sql`
				select id, agent_id, amount, currency_mint, chain, to_address,
				       status, tx_signature, created_at, updated_at
				from agent_withdrawals
				where user_id = ${user.id} and status = ${status}
				order by created_at desc
				limit ${limit}::int offset ${offset}::int
			`
			: await sql`
				select id, agent_id, amount, currency_mint, chain, to_address,
				       status, tx_signature, created_at, updated_at
				from agent_withdrawals
				where user_id = ${user.id}
				order by created_at desc
				limit ${limit}::int offset ${offset}::int
			`;

		const [{ total }] = status
			? await sql`
				select count(*)::int as total
				from agent_withdrawals
				where user_id = ${user.id} and status = ${status}
			`
			: await sql`
				select count(*)::int as total
				from agent_withdrawals
				where user_id = ${user.id}
			`;

		return json(res, 200, { withdrawals, total, limit, offset });
	}

	// POST
	const csrfOk = await requireCsrf(req, res, user.id);
	if (!csrfOk) return;

	const rlUser = await limits.withdrawalPerUser(user.id);
	if (!rlUser.success) return rateLimited(res, rlUser, 'too many withdrawal requests');

	const body = parse(postBody, await readJson(req));
	const { amount, currency_mint, chain, to_address, agent_id = null } = body;

	const MIN_WITHDRAWAL = 1_000_000;
	if (amount < MIN_WITHDRAWAL) {
		return error(res, 422, 'below_minimum', 'Minimum withdrawal is 1 USDC');
	}

	// Verify agent_id belongs to this user if provided
	if (agent_id) {
		const [agent] = await sql`
			select id from agent_identities
			where id = ${agent_id} and user_id = ${user.id} and deleted_at is null
		`;
		if (!agent) return error(res, 404, 'not_found', 'agent not found');
	}

	// Reserve the withdrawal atomically. The available balance (earned minus
	// in-flight withdrawals) must be re-derived and compared *inside* the same
	// statement that inserts the new pending row — a read-then-insert pair is a
	// TOCTOU hole: N concurrent requests all read pending=0 and all insert,
	// over-withdrawing past the real balance (the per-user rate limit admits up
	// to 5 before any pending row exists, so it can't be relied on for integrity).
	//
	// pg_advisory_xact_lock serializes concurrent requests for the same
	// (user, mint) so the loser sees the winner's committed pending row in its
	// balance subquery; the conditional INSERT…SELECT then refuses to insert
	// when the amount exceeds what's actually available.
	const lockKey = `withdrawal:${user.id}:${currency_mint}`;
	const [, inserted] = await sql.transaction([
		sql`select pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))`,
		sql`
			insert into agent_withdrawals
				(user_id, agent_id, amount, currency_mint, chain, to_address, status)
			select ${user.id}, ${agent_id}, ${amount}, ${currency_mint}, ${chain}, ${to_address}, 'pending'
			where ${amount} <= (
				(
					select coalesce(sum(re.net_amount), 0)::bigint
					from agent_revenue_events re
					join agent_identities ai on ai.id = re.agent_id
					where ai.user_id = ${user.id}
					  and re.currency_mint = ${currency_mint}
				) - (
					select coalesce(sum(w2.amount), 0)::bigint
					from agent_withdrawals w2
					where w2.user_id = ${user.id}
					  and w2.status in ('pending', 'processing')
					  and w2.currency_mint = ${currency_mint}
				)
			)
			returning id, agent_id, amount, currency_mint, chain, to_address, status, tx_signature, created_at, updated_at
		`,
	]);

	const withdrawal = inserted?.[0];
	if (!withdrawal) {
		return error(res, 422, 'insufficient_balance', 'requested amount exceeds available balance');
	}

	return json(res, 201, { withdrawal });
});

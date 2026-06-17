/**
 * GET /api/users/me/transaction-history
 * Returns the authenticated caller's skill purchase/sale history.
 *
 * Query params:
 *   ?role=buyer  — only purchases where the caller bought (default when role omitted)
 *   ?role=seller — only sales where the caller's agent was the seller
 *   ?role=all    — both, merged and sorted by date desc
 *   ?limit=50    — number of rows (max 200, default 50)
 *   ?offset=0    — pagination offset
 *
 * Each row includes a `role` field ('buyer' or 'seller') and a Solscan link.
 */

import { sql } from '../../_lib/db.js';
import { authenticateBearer, extractBearer, getSessionUser } from '../../_lib/auth.js';
import { cors, error, json, method, wrap, rateLimited } from '../../_lib/http.js';
import { clientIp, limits } from '../../_lib/rate-limit.js';

const SOLSCAN_BASE = 'https://solscan.io/tx';

function txLink(chain, signature) {
	if (!signature) return null;
	if (chain === 'solana') return `${SOLSCAN_BASE}/${signature}`;
	// EVM chains: use Basescan for Base, Etherscan fallback
	if (chain === 'base') return `https://basescan.org/tx/${signature}`;
	return null;
}

export default wrap(async (req, res) => {
	if (cors(req, res, { methods: 'GET,OPTIONS', credentials: true })) return;
	if (!method(req, res, ['GET'])) return;

	const session = await getSessionUser(req);
	const bearer = session ? null : await authenticateBearer(extractBearer(req));
	const userId = session?.id || bearer?.userId;
	if (!userId) return error(res, 401, 'unauthorized', 'sign in required');

	const rl = await limits.widgetRead(clientIp(req));
	if (!rl.success) return rateLimited(res, rl);

	const params = new URL(req.url, 'http://x').searchParams;
	const role   = params.get('role') || 'all';
	const limit  = Math.min(200, Math.max(1, parseInt(params.get('limit') || '50', 10) || 50));
	const offset = Math.max(0, parseInt(params.get('offset') || '0', 10) || 0);

	if (!['buyer', 'seller', 'all'].includes(role)) {
		return error(res, 400, 'validation_error', 'role must be buyer, seller, or all');
	}

	// Buyer leg: purchases made by this user
	const buyerRows = (role === 'buyer' || role === 'all') ? await sql`
		SELECT
			sp.id,
			sp.agent_id,
			sp.skill,
			sp.status,
			sp.kind,
			sp.amount,
			sp.platform_fee_amount,
			sp.currency_mint,
			sp.chain,
			sp.tx_signature,
			sp.confirmed_at,
			sp.created_at,
			ai.name      AS agent_name,
			ai.handle    AS agent_handle,
			'buyer'::text AS role
		FROM skill_purchases sp
		LEFT JOIN agent_identities ai ON ai.id = sp.agent_id
		WHERE sp.user_id = ${userId}
		  AND sp.status IN ('confirmed', 'tipped', 'trial')
		ORDER BY sp.confirmed_at DESC NULLS LAST, sp.created_at DESC
		LIMIT ${limit} OFFSET ${offset}
	` : [];

	// Seller leg: confirmed purchases of skills on agents this user owns
	const sellerRows = (role === 'seller' || role === 'all') ? await sql`
		SELECT
			sp.id,
			sp.agent_id,
			sp.skill,
			sp.status,
			sp.kind,
			sp.amount,
			sp.platform_fee_amount,
			sp.currency_mint,
			sp.chain,
			sp.tx_signature,
			sp.confirmed_at,
			sp.created_at,
			ai.name      AS agent_name,
			ai.handle    AS agent_handle,
			'seller'::text AS role
		FROM skill_purchases sp
		JOIN agent_identities ai ON ai.id = sp.agent_id AND ai.user_id = ${userId}
		WHERE sp.status IN ('confirmed', 'tipped')
		ORDER BY sp.confirmed_at DESC NULLS LAST, sp.created_at DESC
		LIMIT ${limit} OFFSET ${offset}
	` : [];

	// Merge and sort by date
	const all = [...buyerRows, ...sellerRows].sort((a, b) => {
		const ta = new Date(a.confirmed_at || a.created_at).getTime();
		const tb = new Date(b.confirmed_at || b.created_at).getTime();
		return tb - ta;
	});

	// Deduplicate (same purchase can appear as both buyer and seller if the user
	// bought their own agent's skill — extremely rare but handle cleanly)
	const seen = new Set();
	const deduped = [];
	for (const row of all) {
		const key = `${row.role}:${row.id}`;
		if (!seen.has(key)) { seen.add(key); deduped.push(row); }
	}

	const transactions = deduped.slice(0, limit).map((row) => ({
		...row,
		amount_display:      (Number(row.amount) / 1e6).toFixed(2),
		platform_fee_display: row.platform_fee_amount
			? (Number(row.platform_fee_amount) / 1e6).toFixed(2)
			: null,
		explorer_url: txLink(row.chain, row.tx_signature),
	}));

	return json(res, 200, { transactions, count: transactions.length }, { 'cache-control': 'private, max-age=30' });
});

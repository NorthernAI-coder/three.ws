// Shared auth + ownership for the Agent Labor Market endpoints (api/labor/*).
// Mirrors the session-or-bearer + CSRF-on-session pattern used by a2a-hire.js so
// every money/mutation path enforces ownership server-side, never client-side.

import { authenticateBearer, extractBearer, getSessionUser } from './auth.js';
import { requireCsrf } from './csrf.js';
import { error } from './http.js';
import { sql } from './db.js';

/**
 * Authenticate a write. Returns { userId, session } or null. When it returns
 * null it has ALREADY written the 401/403 response (CSRF failures included), so
 * the caller must simply `return`.
 */
export async function authWrite(req, res) {
	const session = await getSessionUser(req);
	const bearer = session ? null : await authenticateBearer(extractBearer(req));
	if (!session && !bearer) {
		error(res, 401, 'unauthorized', 'sign in required');
		return null;
	}
	const userId = session?.id ?? bearer?.userId;
	if (session && !(await requireCsrf(req, res, userId))) return null;
	return { userId, session: !!session };
}

/** Load an agent and assert the caller owns it. Throws typed 404/403 errors. */
export async function loadOwnedAgent(agentId, userId) {
	const [agent] = await sql`
		SELECT id, user_id, name, meta FROM agent_identities
		WHERE id = ${agentId} AND deleted_at IS NULL`;
	if (!agent) {
		throw Object.assign(new Error('agent not found'), { status: 404, code: 'not_found' });
	}
	if (agent.user_id !== userId) {
		throw Object.assign(new Error('you do not own this agent'), { status: 403, code: 'forbidden' });
	}
	return agent;
}

export function requireSolanaWallet(agent) {
	if (!agent.meta?.solana_address || !agent.meta?.encrypted_solana_secret) {
		throw Object.assign(new Error('this agent has no Solana wallet provisioned'), {
			status: 409, code: 'no_wallet',
		});
	}
	return agent;
}

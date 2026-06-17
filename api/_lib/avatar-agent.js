// Provision an agent (and its custodial Solana wallet) for a newly created
// avatar. Extracted from api/avatars/index.js so every avatar-creation path —
// direct upload AND the chat/forge "text → avatar" save — yields a first-class
// agent the same way, instead of a bare library entry.

import { sql } from './db.js';
import { withDbRetry } from './db-retry.js';

// Claim an existing agent that has no avatar yet, or create a default one, then
// ensure that agent has a custodial Solana wallet. Idempotent and safe to retry
// (the claim is naturally idempotent and the insert is guarded by NOT EXISTS),
// so a transient DB blip never leaves an avatar without its agent. Never throws
// — callers run it fire-and-forget via queueMicrotask. Returns the agent id (or
// null if provisioning could not complete).
export async function provisionAvatarAgent({ userId, avatarId, avatarName }) {
	try {
		const agentId = await withDbRetry(async () => {
			const linked = await sql`
				WITH agent_to_update AS (
					SELECT id FROM agent_identities
					WHERE user_id = ${userId}
						AND avatar_id IS NULL
						AND deleted_at IS NULL
					ORDER BY created_at ASC
					LIMIT 1
				)
				UPDATE agent_identities
				SET avatar_id = ${avatarId}, updated_at = NOW()
				FROM agent_to_update
				WHERE agent_identities.id = agent_to_update.id
				RETURNING agent_identities.id
			`;
			if (linked.length) return linked[0].id;
			const [created] = await sql`
				INSERT INTO agent_identities (user_id, name, avatar_id, is_public, created_at, updated_at)
				SELECT
					${userId},
					${avatarName || 'My Agent'},
					${avatarId},
					false,
					NOW(),
					NOW()
				WHERE NOT EXISTS (
					SELECT 1 FROM agent_identities
					WHERE user_id = ${userId} AND avatar_id = ${avatarId}
				)
				RETURNING id
			`;
			return created?.id ?? null;
		});

		// Every 3D avatar's agent gets a custodial Solana wallet on first save so
		// it can transact immediately. Solana-only by product decision — EVM is
		// opt-in via the wallet panel. Idempotent: an agent that already has a
		// Solana wallet is untouched.
		if (agentId) {
			const { getOrCreateAgentSolanaWallet } = await import('./agent-wallet.js');
			await getOrCreateAgentSolanaWallet(agentId).catch((e) =>
				console.warn('[avatar-agent] solana wallet provision failed', agentId, e?.message),
			);
		}
		return agentId;
	} catch (err) {
		console.error('[avatar-agent] auto-agent failed', {
			avatarId,
			userId,
			error: err?.message,
		});
		return null;
	}
}

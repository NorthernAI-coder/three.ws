// The three.ws tokenized-3D launch directory — every generated GLB minted as
// a Metaplex Core NFT through this platform (a `tokenized_3d_assets` row),
// optionally joined to the agent whose avatar it came from. This is the NFT
// analogue of api/_lib/pump-agent-launches.js (which lists coins launched
// through three.ws): same shape of feed, same "our own launch directory, not
// a chain-wide scan" scope, so /launches-style surfaces and an agent profile
// can list a creator's minted 3D assets the same way they already list their
// launched coins.
//
// Two doors share this one query, mirroring the pump-launches pattern:
//   - GET /api/v1/tokenized/launches — the free, versioned /api/v1 catalog surface.
//   - (future) an agent-profile "minted 3D assets" card, same query + agent_id filter.

import { sql } from './db.js';

/**
 * Query the three.ws tokenized-3D launch directory.
 *
 * @param {object} o
 * @param {string} [o.network]      'mainnet' | 'devnet' (default 'mainnet')
 * @param {string|null} [o.agentId] restrict to one creating agent (uuid) — resolved
 *   via the minted asset's source avatar's provisioned agent, same linkage
 *   avatars.js/pump-agent-launches.js already use.
 * @param {number} [o.offset]
 * @param {number} [o.limit]
 * @returns {Promise<{ launches: object[], has_more: boolean }>}
 */
export async function queryTokenizedLaunches({
	network = 'mainnet',
	agentId = null,
	offset = 0,
	limit = 24,
} = {}) {
	// Over-fetch by one row to compute has_more without a count(*) round trip —
	// same technique queryAgentLaunches uses.
	const rows = agentId
		? await sql`
				select t.mint, t.network, t.name, t.glb_url, t.image_url, t.viewer_url,
				       t.royalty_bps, t.royalty_recipient, t.parent_mint, t.provenance,
				       t.remix_royalty, t.created_at,
				       ai.id as agent_id, ai.name as agent_name,
				       ai.meta->>'solana_address' as agent_solana_address
				from tokenized_3d_assets t
				left join avatars a on a.id = t.source_avatar_id and a.deleted_at is null
				left join agent_identities ai on ai.avatar_id = a.id and ai.deleted_at is null
				where t.status = 'minted' and t.network = ${network} and ai.id = ${agentId}
				order by t.created_at desc
				limit ${limit + 1} offset ${offset}
			`
		: await sql`
				select t.mint, t.network, t.name, t.glb_url, t.image_url, t.viewer_url,
				       t.royalty_bps, t.royalty_recipient, t.parent_mint, t.provenance,
				       t.remix_royalty, t.created_at,
				       ai.id as agent_id, ai.name as agent_name,
				       ai.meta->>'solana_address' as agent_solana_address
				from tokenized_3d_assets t
				left join avatars a on a.id = t.source_avatar_id and a.deleted_at is null
				left join agent_identities ai on ai.avatar_id = a.id and ai.deleted_at is null
				where t.status = 'minted' and t.network = ${network}
				order by t.created_at desc
				limit ${limit + 1} offset ${offset}
			`;

	const hasMore = rows.length > limit;
	const launches = rows.slice(0, limit).map((r) => ({
		mint: r.mint,
		network: r.network,
		name: r.name,
		glb_url: r.glb_url,
		image_url: r.image_url,
		viewer_url: r.viewer_url,
		royalty: {
			basis_points: r.royalty_bps,
			percent: r.royalty_bps != null ? r.royalty_bps / 100 : null,
			recipient: r.royalty_recipient,
		},
		parent_mint: r.parent_mint,
		remix_royalty: r.remix_royalty || null,
		provenance: r.provenance || null,
		created_at: r.created_at,
		agent: r.agent_id
			? {
					id: r.agent_id,
					name: r.agent_name,
					url: `/agents/${r.agent_id}`,
					solana_address: r.agent_solana_address || null,
				}
			: null,
	}));

	return { launches, has_more: hasMore };
}

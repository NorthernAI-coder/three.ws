/**
 * Agent Identity API
 * ------------------
 * GET  /api/agents           — list caller's agents
 * GET  /api/agents/me        — get or auto-create the caller's default agent
 * POST /api/agents           — create a new agent identity
 * GET  /api/agents/:id       — get one agent (public fields if not owner)
 * PUT  /api/agents/:id       — update agent (owner only)
 * DELETE /api/agents/:id     — soft-delete agent (owner only)
 * POST /api/agents/:id/wallet — link / update wallet
 * DELETE /api/agents/:id/wallet — unlink wallet
 */

import { getSessionUser, authenticateBearer, extractBearer, hasScope } from './_lib/auth.js';
import { sql } from './_lib/db.js';
import { cors, json, method, readJson, wrap, error, rateLimited } from './_lib/http.js';
import { requireCsrf } from './_lib/csrf.js';
import { limits, clientIp } from './_lib/rate-limit.js';
import { generateAgentWallet, generateSolanaAgentWallet } from './_lib/agent-wallet.js';
import { checkIdentityIntegrity } from './_lib/identity-integrity.js';
import { publicUrl } from './_lib/r2.js';
import { pingIndexNow } from './_lib/indexnow.js';
import { publishFeedEvent } from './_lib/feed.js';
import { env } from './_lib/env.js';
import { z } from 'zod';

const animationEntrySchema = z.object({
	name: z.string().trim().min(1).max(60),
	url: z
		.string()
		.trim()
		.min(1)
		.max(2048)
		.refine(
			(u) => /^(https?|ipfs|ar):\/\//.test(u) || u.startsWith('/'),
			'url must be http, https, ipfs, ar, or a root-relative path',
		),
	loop: z.boolean().default(true),
	clipName: z.string().trim().max(120).optional(),
	source: z.enum(['mixamo', 'preset', 'custom']),
	addedAt: z.string().optional(),
});

const animationsSchema = z.array(animationEntrySchema).max(30);

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default wrap(async (req, res) => {
	if (cors(req, res, { methods: 'GET,POST,OPTIONS', credentials: true })) return;
	if (!method(req, res, ['GET', 'POST'])) return;

	if (req.method === 'GET') return handleList(req, res);
	return handleCreate(req, res);
});

// ── List ───────────────────────────────────────────────────────────────────

async function handleList(req, res) {
	const url = new URL(req.url, 'http://x');
	const isMe = url.pathname.endsWith('/me');
	const onchainOnly = url.searchParams.get('onchain') === 'true';

	// Public lookup: agents backing a given avatar, by avatar_id. Anonymous-safe
	// so any surface that only knows an avatar id (e.g. the agent profile page)
	// can resolve its agent's public on-chain status without owning it. Mirrors
	// the public projection of GET /api/agents/:id — decorate() strips secrets.
	const avatarIdParam = url.searchParams.get('avatar_id');
	if (avatarIdParam && !isMe) {
		if (!UUID_RE.test(avatarIdParam)) {
			return error(res, 400, 'validation_error', 'avatar_id must be a UUID');
		}
		let viewer = null;
		try {
			viewer = await resolveAuth(req);
		} catch {
			/* anonymous viewers still get the public projection */
		}
		const rows = await sql`
			SELECT i.*,
			       a.storage_key  AS avatar_storage_key,
			       a.thumbnail_key AS avatar_thumbnail_key,
			       a.visibility   AS avatar_visibility
			  FROM agent_identities i
			  LEFT JOIN avatars a ON a.id = i.avatar_id AND a.deleted_at IS NULL
			 WHERE i.avatar_id = ${avatarIdParam}
			   AND i.deleted_at IS NULL
			 ORDER BY i.created_at ASC
			 LIMIT 10
		`;
		return json(res, 200, {
			agents: rows.map((row) => decorate(row, !!(viewer && viewer.userId === row.user_id))),
		});
	}

	// /me is the identity bootstrap endpoint hit on every page load, including
	// by anonymous visitors. Treat any auth-resolution failure (DB hiccup,
	// missing sessions table, JWT secret unset) the same as "no auth" so the
	// client falls back to local-only identity instead of seeing a 500.
	let auth;
	try {
		auth = await resolveAuth(req);
	} catch (err) {
		if (isMe) {
			console.error('[agents/me] auth_resolve_failed', err);
			return json(res, 200, { agent: null, warning: 'auth_resolve_failed' });
		}
		throw err;
	}

	if (!auth) {
		if (isMe) return json(res, 200, { agent: null });
		return error(res, 401, 'unauthorized', 'sign in or provide a bearer token');
	}

	if (isMe) return handleGetOrCreateMe(req, res, auth);

	const text = `
		SELECT i.*,
		       a.storage_key  AS avatar_storage_key,
		       a.thumbnail_key AS avatar_thumbnail_key,
		       a.visibility   AS avatar_visibility
		  FROM agent_identities i
		  LEFT JOIN avatars a ON a.id = i.avatar_id AND a.deleted_at IS NULL
		 WHERE i.user_id = $1
		   AND i.deleted_at IS NULL
		   ${onchainOnly ? `AND (i.erc8004_agent_id IS NOT NULL OR i.meta->>'onchain' IS NOT NULL)` : ''}
		 ORDER BY i.created_at ASC
	`;
	const rows = await sql(text, [auth.userId]);
	return json(res, 200, { agents: rows.map((row) => decorate(row)) });
}

// ── Get-or-create default agent ───────────────────────────────────────────

async function handleGetOrCreateMe(req, res, auth) {
	try {
		let [agent] = await sql`
			SELECT i.*,
			       a.storage_key  AS avatar_storage_key,
			       a.thumbnail_key AS avatar_thumbnail_key,
			       a.visibility   AS avatar_visibility
			  FROM agent_identities i
			  LEFT JOIN avatars a ON a.id = i.avatar_id AND a.deleted_at IS NULL
			 WHERE i.user_id  = ${auth.userId}
			   AND i.deleted_at IS NULL
			 ORDER BY i.created_at ASC
			 LIMIT 1
		`;

		if (!agent) {
			const wallet = await generateAgentWallet();
			const sol = await generateSolanaAgentWallet();
			await sql`
				INSERT INTO agent_identities (user_id, name, skills, wallet_address, meta)
				SELECT
					${auth.userId},
					${'Agent'},
					${['greet', 'present-model', 'validate-model', 'remember', 'think']},
					${wallet.address},
					${JSON.stringify({
						encrypted_wallet_key: wallet.encrypted_key,
						solana_address: sol.address,
						encrypted_solana_secret: sol.encrypted_secret,
					})}::jsonb
				WHERE NOT EXISTS (
					SELECT 1 FROM agent_identities
					WHERE user_id = ${auth.userId} AND deleted_at IS NULL
				)
			`;
			// Re-select returns the oldest agent: if a concurrent request beat
			// us, that one wins; if both inserted (rare race during first visit),
			// the oldest is canonical and the extra row is harmless.
			[agent] = await sql`
				SELECT i.*,
				       a.storage_key  AS avatar_storage_key,
				       a.thumbnail_key AS avatar_thumbnail_key,
				       a.visibility   AS avatar_visibility
				  FROM agent_identities i
				  LEFT JOIN avatars a ON a.id = i.avatar_id AND a.deleted_at IS NULL
				 WHERE i.user_id = ${auth.userId} AND i.deleted_at IS NULL
				 ORDER BY i.created_at ASC LIMIT 1
			`;
		}

		await healStaleAvatarId(agent);
		return json(res, 200, { agent: decorate(agent) });
	} catch (err) {
		// Any failure here (missing table, wallet generation error, missing env var)
		// should not brick the client — surface null and let the UI fall back to
		// local-only identity.
		const code = err?.code || '';
		const msg = String(err?.message || '');
		const missing = code === '42P01' || /relation.*does not exist/i.test(msg);
		const warning = missing ? 'agents_table_missing' : 'agent_init_failed';
		console.error(`[agents/me] ${warning}`, err);
		return json(res, 200, { agent: null, warning });
	}
}

// ── Create ────────────────────────────────────────────────────────────────

async function handleCreate(req, res) {
	const auth = await resolveAuth(req);
	if (!auth) return error(res, 401, 'unauthorized', 'sign in or provide a bearer token');
	// Creation mints real wallets — same CSRF gate as PUT/PATCH/DELETE (bearer
	// callers are exempt inside requireCsrf) plus a per-IP rate limit.
	if (!(await requireCsrf(req, res, auth.userId))) return;
	const rl = await limits.authIp(clientIp(req));
	if (!rl.success) return rateLimited(res, rl);
	const scopeErr = requireScopeForMutation(auth, res, 'avatars:write');
	if (scopeErr) return scopeErr;

	const body = await readJson(req);
	const name = String(body.name || 'Agent')
		.trim()
		.slice(0, 100);

	if (!name) return error(res, 400, 'validation_error', 'name is required');

	let avatarId = null;
	if (body.avatar_id) {
		const raw = String(body.avatar_id);
		if (!UUID_RE.test(raw))
			return error(res, 400, 'validation_error', 'avatar_id must be a UUID');
		const [av] = await sql`
			SELECT id FROM avatars
			 WHERE id = ${raw} AND owner_id = ${auth.userId} AND deleted_at IS NULL
			 LIMIT 1
		`;
		if (!av) return error(res, 404, 'not_found', 'avatar not found');
		avatarId = av.id;
	}

	// Granite identity-integrity gate. Refuse to mint an identity that impersonates
	// an existing public agent (Granite embedding look-alike) or fails Granite
	// Guardian content screening. Best-effort: any failure — or watsonx being
	// unconfigured — lets creation proceed rather than failing closed.
	let integrity = null;
	try {
		integrity = await checkIdentityIntegrity(
			{ name, description: body.description, persona_tone_tags: body.persona_tone_tags },
			{ userId: auth.userId },
		);
		if (integrity.status === 'block') {
			return error(
				res,
				409,
				'identity_conflict',
				integrity.reasons[0] || 'this identity conflicts with an existing agent',
				{ integrity },
			);
		}
	} catch (err) {
		console.error('[agents] identity_integrity_check_failed', err);
		integrity = null;
	}

	const wallet = await generateAgentWallet();
	const sol = await generateSolanaAgentWallet();
	const meta = {
		...(body.meta || {}),
		encrypted_wallet_key: wallet.encrypted_key,
		solana_address: sol.address,
		encrypted_solana_secret: sol.encrypted_secret,
	};
	// Stamp the integrity verdict onto the identity so the profile/editor can show
	// a "distinct identity" signal and reviewers can see what was checked at birth.
	if (integrity && integrity.configured) {
		meta.identity_integrity = {
			status: integrity.status,
			uniqueness: integrity.uniqueness,
			guardian: integrity.guardian ? integrity.guardian.decision : null,
			closest: integrity.similar[0]
				? { name: integrity.similar[0].name, score: integrity.similar[0].score }
				: null,
			checked_at: new Date().toISOString(),
		};
	}

	const [agent] = await sql`
		INSERT INTO agent_identities (user_id, name, description, skills, wallet_address, meta, avatar_id)
		VALUES (
			${auth.userId},
			${name},
			${body.description ? String(body.description).slice(0, 500) : null},
			${body.skills || ['greet', 'present-model', 'validate-model', 'remember', 'think']},
			${wallet.address},
			${JSON.stringify(meta)}::jsonb,
			${avatarId}
		)
		RETURNING *
	`;

	// Push the new agent's URL to IndexNow so Bing / Yandex discover it within
	// minutes instead of waiting for the next crawl. Fire-and-forget — IndexNow
	// failures must never block agent creation.
	pingIndexNow(`${env.APP_ORIGIN}/agent/${agent.id}`).catch(() => {});

	// Announce the new agent on the site-wide live activity ticker — discovery +
	// social proof. Fire-and-forget; never block or fail creation on the feed.
	publishFeedEvent({
		type: 'agent-deploy',
		ts: Date.now(),
		actor: name,
		agentId: agent.id,
		name,
	}).catch(() => {});

	return json(res, 201, { agent: decorate(agent) });
}

// ── Get One ───────────────────────────────────────────────────────────────

export async function handleGetOne(req, res, id) {
	if (cors(req, res, { methods: 'GET,PUT,PATCH,DELETE,OPTIONS', credentials: true })) return;
	if (!method(req, res, ['GET', 'PUT', 'PATCH', 'DELETE'])) return;

	if (!UUID_RE.test(String(id || ''))) return error(res, 404, 'not_found', 'agent not found');

	if (req.method === 'GET') {
		const rl = await limits.publicIp(clientIp(req));
		if (!rl.success) return rateLimited(res, rl);

		// Single roundtrip: pull skill_prices as a JSON-aggregated subquery
		// instead of a follow-up SELECT. Saves a second DB hop per GET on
		// /api/agents/:id (was the dominant cost on cached pages where
		// healStaleAvatarId is a no-op).
		const [row] = await sql`
			SELECT i.*,
			       u.display_name as author_name,
			       u.avatar_url   as author_avatar,
			       a.storage_key  AS avatar_storage_key,
			       a.thumbnail_key AS avatar_thumbnail_key,
			       a.visibility   AS avatar_visibility,
			       COALESCE(
			         (SELECT jsonb_object_agg(
			                   sp.skill,
			                   jsonb_build_object(
			                     'amount', sp.amount,
			                     'currency_mint', sp.currency_mint,
			                     'chain', sp.chain
			                   )
			                 )
			            FROM agent_skill_prices sp
			           WHERE sp.agent_id = i.id AND sp.is_active = true),
			         '{}'::jsonb
			       ) AS skill_prices
			FROM agent_identities i
			LEFT JOIN users u   ON i.user_id = u.id
			LEFT JOIN avatars a ON a.id = i.avatar_id AND a.deleted_at IS NULL
			WHERE i.id = ${id} AND i.deleted_at IS NULL
		`;
		if (!row) return error(res, 404, 'not_found', 'agent not found');

		await healStaleAvatarId(row);

		// chat_count is supplementary decoration on the agent record — never let
		// a usage-stats query failure (e.g. usage_events not yet migrated, code
		// 42P01) take down the whole agent fetch. Degrade to 0.
		try {
			const [chatRow] = await sql`
				SELECT COUNT(*)::int AS total
				FROM usage_events
				WHERE agent_id = ${id} AND kind = 'llm'
			`;
			row.chat_count = chatRow?.total ?? 0;
		} catch (err) {
			console.warn(
				'[agents] chat_count usage_events query failed, defaulting to 0:',
				err?.message,
			);
			row.chat_count = 0;
		}

		// Public fields if not owner; full record if owner. Auth on a public GET
		// is best-effort — anonymous viewers still get the public projection.
		const auth = await resolveAuth(req).catch(() => null);
		const isOwner = auth?.userId === row.user_id;
		return json(res, 200, { agent: decorate(row, isOwner) });
	}

	if (req.method === 'PUT') {
		const auth = await resolveAuth(req);
		if (!auth) return error(res, 401, 'unauthorized', 'sign in required');
		if (!(await requireCsrf(req, res, auth.userId))) return;
		return handleUpdate(req, res, id, auth);
	}

	if (req.method === 'PATCH') {
		const auth = await resolveAuth(req);
		if (!auth) return error(res, 401, 'unauthorized', 'sign in required');
		if (!(await requireCsrf(req, res, auth.userId))) return;
		return handlePatchEdits(req, res, id, auth);
	}

	if (req.method === 'DELETE') {
		const auth = await resolveAuth(req);
		if (!auth) return error(res, 401, 'unauthorized', 'sign in required');
		if (!(await requireCsrf(req, res, auth.userId))) return;
		return handleDelete(req, res, id, auth);
	}
}

// ── Update ────────────────────────────────────────────────────────────────

async function handleUpdate(req, res, id, auth) {
	const scopeErr = requireScopeForMutation(auth, res, 'avatars:write');
	if (scopeErr) return scopeErr;
	const [existing] = await sql`
		SELECT id, user_id, meta FROM agent_identities WHERE id = ${id} AND deleted_at IS NULL
	`;
	if (!existing) return error(res, 404, 'not_found', 'agent not found');
	if (existing.user_id !== auth.userId) return error(res, 403, 'forbidden', 'not your agent');

	const body = await readJson(req);

	// Server-side meta merge. GET strips encrypted_wallet_key /
	// encrypted_solana_secret before returning meta, so a client read-modify-write
	// must never be able to wipe (or set) them: merge the client's meta over the
	// stored row and always carry the stored encrypted_* keys through unchanged.
	let mergedMeta = null;
	if (body.meta && typeof body.meta === 'object' && !Array.isArray(body.meta)) {
		const existingMeta = existing.meta || {};
		const clientMeta = { ...body.meta };
		delete clientMeta.encrypted_wallet_key;
		delete clientMeta.encrypted_solana_secret;
		mergedMeta = { ...existingMeta, ...clientMeta };
		if ('encrypted_wallet_key' in existingMeta) {
			mergedMeta.encrypted_wallet_key = existingMeta.encrypted_wallet_key;
		}
		if ('encrypted_solana_secret' in existingMeta) {
			mergedMeta.encrypted_solana_secret = existingMeta.encrypted_solana_secret;
		}
	}

	const [updated] = await sql`
		UPDATE agent_identities SET
			name         = COALESCE(${body.name || null}, name),
			description  = COALESCE(${body.description || null}, description),
			avatar_id    = COALESCE(${body.avatar_id || null}, avatar_id),
			skills       = COALESCE(${body.skills || null}, skills),
			meta         = COALESCE(${mergedMeta ? JSON.stringify(mergedMeta) : null}::jsonb, meta),
			home_url     = COALESCE(${body.home_url || null}, home_url)
		WHERE id = ${id}
		RETURNING *
	`;
	return json(res, 200, { agent: decorate(updated) });
}

// ── Patch (partial update) ────────────────────────────────────────────────

async function handlePatchEdits(req, res, id, auth) {
	return handleUpdate(req, res, id, auth);
}

// ── Delete ────────────────────────────────────────────────────────────────

async function handleDelete(req, res, id, auth) {
	const scopeErr = requireScopeForMutation(auth, res, 'avatars:delete');
	if (scopeErr) return scopeErr;
	const [existing] = await sql`
		SELECT id, user_id FROM agent_identities WHERE id = ${id} AND deleted_at IS NULL
	`;
	if (!existing) return error(res, 404, 'not_found', 'agent not found');
	if (existing.user_id !== auth.userId) return error(res, 403, 'forbidden', 'not your agent');

	// Soft-delete the agent and purge dependent records in a single transaction.
	// agent_actions / agent_memories have ON DELETE CASCADE FKs but the soft-delete
	// leaves the row in place, so we delete dependents explicitly.
	await sql.transaction([
		sql`UPDATE agent_identities SET deleted_at = now() WHERE id = ${id}`,
		sql`DELETE FROM agent_actions  WHERE agent_id = ${id}`,
		sql`DELETE FROM agent_memories WHERE agent_id = ${id}`,
	]);
	return json(res, 200, { ok: true });
}

// ── Wallet ────────────────────────────────────────────────────────────────

export async function handleWallet(req, res, id, action = null) {
	if (cors(req, res, { methods: 'GET,POST,DELETE,OPTIONS', credentials: true })) return;

	const auth = await resolveAuth(req);
	if (!auth) return error(res, 401, 'unauthorized', 'sign in required');

	const [existing] = await sql`
		SELECT id, user_id, wallet_address, chain_id, meta FROM agent_identities WHERE id = ${id} AND deleted_at IS NULL
	`;
	if (!existing) return error(res, 404, 'not_found', 'agent not found');
	if (existing.user_id !== auth.userId) return error(res, 403, 'forbidden', 'not your agent');

	// GET /api/agents/:id/wallet — owner-only wallet status: addresses + live
	// balances. Balances are best-effort (RPC hiccups return null, never a 500)
	// so the panel can render addresses immediately and fill balances in after.
	if (req.method === 'GET') {
		const evmAddr = existing.wallet_address || null;
		const solAddr = existing.meta?.solana_address || null;
		const chainId = existing.chain_id || 8453;
		let evmBalanceEth = null;
		let sol = null;
		let usdc = null;
		if (evmAddr || solAddr) {
			const { getAgentBalance, getSolanaAddressBalances } = await import('./_lib/agent-wallet.js');
			const [evmRes, solRes] = await Promise.allSettled([
				evmAddr ? getAgentBalance(id) : Promise.resolve(null),
				solAddr ? getSolanaAddressBalances(solAddr, 'mainnet') : Promise.resolve(null),
			]);
			if (evmRes.status === 'fulfilled' && evmRes.value) evmBalanceEth = evmRes.value.balance_eth;
			if (solRes.status === 'fulfilled' && solRes.value) {
				sol = solRes.value.sol;
				usdc = solRes.value.usdc;
			}
		}
		return json(res, 200, {
			wallet_address: evmAddr,
			chain_id: chainId,
			solana_address: solAddr,
			balance_eth: evmBalanceEth,
			solana_balance: sol,
			usdc_balance: usdc,
		});
	}

	if (!(await requireCsrf(req, res, auth.userId))) return;

	// POST /api/agents/:id/wallet/provision — idempotently generate the agent's
	// custodial EVM + Solana wallets. This is the "Create wallet" action surfaced
	// on every avatar surface; safe to call repeatedly (returns existing addresses).
	if (action === 'provision') {
		if (!method(req, res, ['POST'])) return;
		const { provisionAgentWallets } = await import('./_lib/agent-wallet.js');
		try {
			const wallets = await provisionAgentWallets(id);
			return json(res, 200, {
				ok: true,
				created: wallets.created,
				wallet_address: wallets.evm,
				solana_address: wallets.solana,
			});
		} catch (e) {
			return error(res, 500, 'provision_failed', e?.message || 'wallet provisioning failed');
		}
	}

	if (req.method === 'DELETE') {
		await sql`
			UPDATE agent_identities
			SET wallet_address = null, chain_id = null, erc8004_agent_id = null
			WHERE id = ${id}
		`;
		return json(res, 200, { ok: true });
	}

	if (!method(req, res, ['POST'])) return;
	const body = await readJson(req);
	const address = String(body.wallet_address || '').trim();
	const chainId = Number(body.chain_id) || null;
	// Optional: post-mint, the client can patch in the minted ERC-8004 agent id.
	// Validate before BigInt() — a malformed value would otherwise throw a 500.
	let erc8004 = null;
	if (body.erc8004_agent_id != null) {
		const rawId = String(body.erc8004_agent_id).trim();
		if (!/^\d+$/.test(rawId)) {
			return error(
				res,
				400,
				'validation_error',
				'erc8004_agent_id must be a non-negative integer',
			);
		}
		erc8004 = BigInt(rawId).toString();
	}
	if (!address) return error(res, 400, 'validation_error', 'wallet_address required');

	const [updated] = await sql`
		UPDATE agent_identities
		SET wallet_address   = ${address},
		    chain_id         = ${chainId},
		    erc8004_agent_id = COALESCE(${erc8004}::bigint, erc8004_agent_id)
		WHERE id = ${id}
		RETURNING *
	`;
	return json(res, 200, { agent: decorate(updated) });
}

// ── Helpers ────────────────────────────────────────────────────────────────

// If the agent row's avatar_id references a deleted/missing avatar, null it out
// in-place on the row and fire-and-forget a DB update so future reads are clean.
async function healStaleAvatarId(row) {
	if (!row?.avatar_id) return;
	const [av] = await sql`
		SELECT id FROM avatars WHERE id = ${row.avatar_id} AND deleted_at IS NULL LIMIT 1
	`;
	if (!av) {
		const staleId = row.avatar_id;
		row.avatar_id = null;
		sql`UPDATE agent_identities SET avatar_id = NULL WHERE id = ${row.id} AND avatar_id = ${staleId}`.catch(
			(e) => console.error('[agents] healStaleAvatarId failed', e),
		);
	}
}

async function resolveAuth(req) {
	const session = await getSessionUser(req);
	if (session) return { userId: session.id, source: 'session', scope: null };
	const bearer = await authenticateBearer(extractBearer(req));
	if (bearer) return { userId: bearer.userId, source: 'bearer', scope: bearer.scope || '' };
	return null;
}

// Bearer-token callers must hold the matching avatars:* scope before they can
// mutate an agent. Session callers (browser cookies) are not constrained by
// scope. Returns null when authorized, or an error response otherwise.
function requireScopeForMutation(auth, res, requiredScope) {
	if (!auth || auth.source !== 'bearer') return null;
	if (!hasScope(auth.scope, requiredScope)) {
		return error(res, 403, 'insufficient_scope', `${requiredScope} required`);
	}
	return null;
}

function decorate(row, isOwner = true) {
	// Strip encrypted secrets from meta — never expose to the client.
	const meta = { ...(row.meta || {}) };
	delete meta.encrypted_wallet_key;
	delete meta.encrypted_solana_secret;

	// Surface canonical blocks at the top level so the frontend doesn't need to
	// know they live under `meta`. Treat `meta.*` as the source of truth for
	// new code; legacy fields (chain_id, erc8004_agent_id) are still emitted
	// for backwards compat below.
	const onchain = meta.onchain || null;
	const token = meta.token || null;
	const payments = meta.payments
		? {
				// Public-safe view: the receiver address is intended to be public,
				// but anything secret (bot keys, configured webhook secrets, etc.)
				// must never leave the server. Whitelist explicitly.
				receiver: meta.payments.receiver,
				accepted_tokens: meta.payments.accepted_tokens || [],
				configured_at: meta.payments.configured_at,
			}
		: null;

	const avatarVisibility = row.avatar_visibility || null;
	const avatarPubliclyReadable = avatarVisibility === 'public' || avatarVisibility === 'unlisted';
	const avatarModelUrl =
		row.avatar_storage_key && avatarPubliclyReadable ? publicUrl(row.avatar_storage_key) : null;
	// Thumbnails get the same public/unlisted gate as model URLs (mirrors
	// characters.js / galaxy.js) — private avatars must not leak via thumbnails.
	const avatarThumbnailUrl =
		row.avatar_thumbnail_key && avatarPubliclyReadable
			? publicUrl(row.avatar_thumbnail_key)
			: null;

	const base = {
		id: row.id,
		name: row.name,
		description: row.description,
		author_name: row.author_name || null,
		author_avatar: row.author_avatar || null,
		chat_count: row.chat_count ?? 0,
		avatar_id: row.avatar_id,
		avatar_visibility: avatarVisibility,
		avatar_model_url: avatarModelUrl,
		avatar_thumbnail_url: avatarThumbnailUrl,
		home_url: row.home_url || `/agent/${row.id}`,
		skills: row.skills || [],
		skill_prices: row.skill_prices || {},
		meta,
		onchain,
		token,
		payments,
		is_registered: Boolean(row.erc8004_agent_id) || !!onchain,
		// Whether the requesting session owns this agent. Owner-only write paths
		// (action log, memory sync) gate on this so public viewers don't fire
		// requests the backend will reject with 403.
		is_owner: !!isOwner,
		created_at: row.created_at,
	};
	// Voice fields are public (the runtime reads them to configure TTS).
	base.voice_provider = row.voice_provider || 'browser';
	base.voice_id = row.voice_id || null;
	base.voice_model = row.voice_model || null;
	base.voice_settings = row.voice_settings || null;

	if (isOwner) {
		base.wallet_address = row.wallet_address;
		base.chain_id = row.chain_id;
		base.user_id = row.user_id;
		base.erc8004_agent_id = row.erc8004_agent_id;
		base.erc8004_registry = row.erc8004_registry;
		base.registration_cid = row.registration_cid;
		// Publish-time fields needed by the agent editor. Owner-only because the
		// system prompt is private IP.
		base.system_prompt = row.system_prompt || null;
		base.greeting = row.greeting || null;
		base.category = row.category || null;
		base.tags = row.tags || [];
		base.capabilities = row.capabilities || {};
		base.is_published = !!row.is_published;
	}
	return base;
}

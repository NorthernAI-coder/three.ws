// Agent-to-Agent Economy (prompts/agent-wallets/15) — the data layer.
//
// One agent hiring another for a paid skill is recorded in `agent_hires`. This
// module is the single place that writes and reads that ledger, so the
// marketplace's completion counts / ratings / earnings are ALWAYS real
// aggregates over real hires — never fabricated. It also exposes the offer
// catalog (the existing agent_paid_services registry) joined to those live
// stats, and each agent's income/outlay accounting.
//
// Money never moves here. The hire endpoint (api/agents/a2a-hire.js) reserves the
// spend against the owner's spend policy and settles USDC over the real x402
// rails; this module only records the business-level hire and its lifecycle so
// it can be queried, rated, and audited.

import { sql } from './db.js';
import { publicUrl as r2PublicUrl } from './r2.js';

export function atomicsToUsdc(atomics) {
	return Number(atomics || 0) / 1_000_000;
}

// Avatar thumbnail is only surfaced when the avatar is publicly visible — mirrors
// the gate the public pulse feed uses so the marketplace never leaks a private
// avatar render.
function avatarThumb(thumbKey, visibility) {
	const visible = visibility === 'public' || visibility === 'unlisted';
	return thumbKey && visible ? r2PublicUrl(thumbKey) : null;
}

function shapeProvider(row) {
	if (!row?.provider_agent_id) return null;
	return {
		id: row.provider_agent_id,
		name: row.provider_name || 'Agent',
		url: `/agent/${row.provider_agent_id}`,
		avatar_thumbnail_url: avatarThumb(row.provider_thumb_key, row.provider_avatar_vis),
		solana_address: row.provider_addr || null,
		is_public: row.provider_is_public !== false,
	};
}

// ── Writes ────────────────────────────────────────────────────────────────

/**
 * Insert a pending hire, idempotently. A retry carrying the same
 * (hirerAgentId, idempotencyKey) returns the existing row instead of inserting a
 * second one — this is the double-charge guard: the caller checks `existing`
 * before moving any money.
 *
 * @returns {Promise<{ row: object, existing: boolean }>}
 */
export async function recordHire(input) {
	const {
		hirerAgentId,
		hirerUserId,
		providerAgentId = null,
		providerUserId = null,
		serviceId = null,
		serviceSlug = null,
		skillName,
		amountAtomics,
		usd = null,
		currency = 'USDC',
		network = 'solana',
		payerAddress = null,
		payoutAddress = null,
		spendReservationId = null,
		idempotencyKey = null,
		meta = {},
	} = input;

	if (idempotencyKey) {
		const existing = await getHireByIdempotency(hirerAgentId, idempotencyKey);
		if (existing) return { row: existing, existing: true };
	}

	try {
		const [row] = await sql`
			INSERT INTO agent_hires
				(hirer_agent_id, hirer_user_id, provider_agent_id, provider_user_id,
				 service_id, service_slug, skill_name, amount_atomics, usd, currency,
				 network, status, payer_address, payout_address, spend_reservation_id,
				 idempotency_key, meta)
			VALUES (
				${hirerAgentId}, ${hirerUserId}, ${providerAgentId}, ${providerUserId},
				${serviceId}, ${serviceSlug}, ${skillName}, ${String(amountAtomics)},
				${usd}, ${currency}, ${network}, 'pending', ${payerAddress},
				${payoutAddress}, ${spendReservationId}, ${idempotencyKey},
				${JSON.stringify(meta ?? {})}::jsonb
			)
			RETURNING *
		`;
		return { row, existing: false };
	} catch (err) {
		// 23505 = unique_violation on the idempotency index: a concurrent retry won
		// the race. Return its row so neither caller double-pays.
		if ((err?.code === '23505' || /duplicate key|unique/i.test(err?.message || '')) && idempotencyKey) {
			const existing = await getHireByIdempotency(hirerAgentId, idempotencyKey);
			if (existing) return { row: existing, existing: true };
		}
		throw err;
	}
}

/** Flip a hire to its terminal state, attaching the real on-chain artifacts. */
export async function updateHire(id, patch = {}) {
	const completedAt = patch.status === 'completed' ? new Date().toISOString() : null;
	const [row] = await sql`
		UPDATE agent_hires
		SET status            = COALESCE(${patch.status ?? null}, status),
		    payment_signature = COALESCE(${patch.paymentSignature ?? null}, payment_signature),
		    invocation_signature = COALESCE(${patch.invocationSignature ?? null}, invocation_signature),
		    invocation_error  = COALESCE(${patch.invocationError ?? null}, invocation_error),
		    payer_address     = COALESCE(${patch.payerAddress ?? null}, payer_address),
		    result_summary    = COALESCE(${patch.resultSummary ?? null}, result_summary),
		    error             = COALESCE(${patch.error ?? null}, error),
		    completed_at      = COALESCE(${completedAt}::timestamptz, completed_at),
		    meta              = CASE WHEN ${patch.meta ? JSON.stringify(patch.meta) : null}::jsonb IS NULL
		                             THEN meta ELSE meta || ${patch.meta ? JSON.stringify(patch.meta) : '{}'}::jsonb END,
		    updated_at        = now()
		WHERE id = ${id}
		RETURNING *
	`;
	return row || null;
}

/** Set the hirer's 1–5 rating on a completed hire (one rating, owner-gated). */
export async function rateHire(id, hirerUserId, rating) {
	const r = Math.round(Number(rating));
	if (!Number.isFinite(r) || r < 1 || r > 5) {
		const e = new Error('rating must be an integer 1–5');
		e.code = 'invalid_rating';
		e.status = 400;
		throw e;
	}
	const [row] = await sql`
		UPDATE agent_hires
		SET rating = ${r}, rated_at = now(), updated_at = now()
		WHERE id = ${id} AND hirer_user_id = ${hirerUserId} AND status = 'completed'
		RETURNING *
	`;
	return row || null;
}

// ── Reads ─────────────────────────────────────────────────────────────────

export async function getHireById(id) {
	const [row] = await sql`SELECT * FROM agent_hires WHERE id = ${id} LIMIT 1`;
	return row || null;
}

export async function getHireByIdempotency(hirerAgentId, idempotencyKey) {
	if (!idempotencyKey) return null;
	const [row] = await sql`
		SELECT * FROM agent_hires
		WHERE hirer_agent_id = ${hirerAgentId} AND idempotency_key = ${idempotencyKey}
		LIMIT 1
	`;
	return row || null;
}

/**
 * Live reputation + earnings for one provider agent, aggregated over its real
 * completed hires. Every number is a true aggregate — there is no place to inject
 * a fabricated stat.
 */
export async function providerStats(agentId) {
	const [row] = await sql`
		SELECT
			COUNT(*) FILTER (WHERE status = 'completed')                      AS completed,
			COUNT(*) FILTER (WHERE status = 'refunded')                      AS refunded,
			COUNT(*) FILTER (WHERE status IN ('completed','refunded','disputed','failed')) AS total,
			COALESCE(SUM(usd) FILTER (WHERE status = 'completed'), 0)        AS earned_usd,
			AVG(rating) FILTER (WHERE rating IS NOT NULL)                    AS avg_rating,
			COUNT(rating) FILTER (WHERE rating IS NOT NULL)                  AS rating_count,
			MAX(completed_at)                                               AS last_hire_at,
			COUNT(*) FILTER (WHERE status = 'completed' AND completed_at > now() - interval '24 hours') AS completed_24h
		FROM agent_hires
		WHERE provider_agent_id = ${agentId}
	`;
	return shapeStats(row);
}

function shapeStats(row) {
	const completed = Number(row?.completed || 0);
	const total = Number(row?.total || 0);
	return {
		completion_count: completed,
		refunded_count: Number(row?.refunded || 0),
		total_hires: total,
		success_rate: total > 0 ? completed / total : null,
		earned_usdc: Number(row?.earned_usd || 0),
		avg_rating: row?.avg_rating != null ? Number(row.avg_rating) : null,
		rating_count: Number(row?.rating_count || 0),
		throughput_24h: Number(row?.completed_24h || 0),
		last_hire_at: row?.last_hire_at || null,
	};
}

/**
 * The marketplace catalog: every active, bazaar-listed offer joined to its
 * provider agent and its live hire stats. Offers from deleted / private agents
 * are excluded. Sorted by real completion count then recency so proven providers
 * surface first.
 */
export async function listOffersWithStats({ limit = 60, providerAgentId = null } = {}) {
	const capped = Math.min(Math.max(1, Number(limit) || 60), 200);
	const providerFilter = providerAgentId ? sql`AND s.agent_id = ${providerAgentId}` : sql``;
	const rows = await sql`
		SELECT
			s.id            AS service_id,
			s.slug          AS slug,
			s.name          AS name,
			s.description   AS description,
			s.price_atomics AS price_atomics,
			s.network       AS network,
			s.target_method AS method,
			s.input_schema  AS input_schema,
			s.created_at    AS created_at,
			ai.id           AS provider_agent_id,
			ai.name         AS provider_name,
			ai.is_public    AS provider_is_public,
			ai.meta->>'solana_address' AS provider_addr,
			av.thumbnail_key AS provider_thumb_key,
			av.visibility    AS provider_avatar_vis,
			st.completed    AS completed,
			st.refunded     AS refunded,
			st.total        AS total,
			st.earned_usd   AS earned_usd,
			st.avg_rating   AS avg_rating,
			st.rating_count AS rating_count,
			st.last_hire_at AS last_hire_at,
			st.completed_24h AS completed_24h
		FROM agent_paid_services s
		JOIN agent_identities ai ON ai.id = s.agent_id AND ai.deleted_at IS NULL AND ai.is_public = true
		LEFT JOIN avatars av ON av.id = ai.avatar_id AND av.deleted_at IS NULL
		LEFT JOIN LATERAL (
			SELECT
				COUNT(*) FILTER (WHERE status = 'completed')   AS completed,
				COUNT(*) FILTER (WHERE status = 'refunded')   AS refunded,
				COUNT(*) FILTER (WHERE status IN ('completed','refunded','disputed','failed')) AS total,
				COALESCE(SUM(usd) FILTER (WHERE status = 'completed'), 0) AS earned_usd,
				AVG(rating) FILTER (WHERE rating IS NOT NULL) AS avg_rating,
				COUNT(rating) FILTER (WHERE rating IS NOT NULL) AS rating_count,
				MAX(completed_at) AS last_hire_at,
				COUNT(*) FILTER (WHERE status = 'completed' AND completed_at > now() - interval '24 hours') AS completed_24h
			FROM agent_hires h WHERE h.service_id = s.id
		) st ON true
		WHERE s.archived_at IS NULL AND s.bazaar_listed = true
		${providerFilter}
		ORDER BY st.completed DESC NULLS LAST, s.created_at DESC
		LIMIT ${capped}
	`;
	return rows.map(shapeOffer);
}

export async function getOfferBySlug(slug) {
	const rows = await listOffersBySlug(slug);
	return rows[0] || null;
}

async function listOffersBySlug(slug) {
	const rows = await sql`
		SELECT
			s.id AS service_id, s.slug AS slug, s.name AS name, s.description AS description,
			s.price_atomics AS price_atomics, s.network AS network, s.target_method AS method,
			s.input_schema AS input_schema, s.created_at AS created_at,
			ai.id AS provider_agent_id, ai.name AS provider_name, ai.is_public AS provider_is_public,
			ai.meta->>'solana_address' AS provider_addr,
			av.thumbnail_key AS provider_thumb_key, av.visibility AS provider_avatar_vis,
			NULL::bigint AS completed, NULL::bigint AS refunded, NULL::bigint AS total,
			NULL::float8 AS earned_usd, NULL::float8 AS avg_rating, NULL::bigint AS rating_count,
			NULL::timestamptz AS last_hire_at, NULL::bigint AS completed_24h
		FROM agent_paid_services s
		JOIN agent_identities ai ON ai.id = s.agent_id AND ai.deleted_at IS NULL
		LEFT JOIN avatars av ON av.id = ai.avatar_id AND av.deleted_at IS NULL
		WHERE s.slug = ${slug} AND s.archived_at IS NULL
		LIMIT 1
	`;
	return rows.map(shapeOffer);
}

function shapeOffer(row) {
	return {
		service_id: row.service_id,
		slug: row.slug,
		name: row.name,
		description: row.description,
		price_atomics: String(row.price_atomics),
		price_usdc: atomicsToUsdc(row.price_atomics),
		network: row.network,
		method: row.method,
		input_schema: row.input_schema || null,
		created_at: row.created_at,
		provider: shapeProvider(row),
		stats: shapeStats(row),
	};
}

/**
 * One agent's hire history for the accounting view. role='hirer' returns outlay,
 * role='provider' returns income, role='all' returns both. Keyset paginated.
 */
export async function listHiresForAgent(agentId, { role = 'all', limit = 40, beforeId = null } = {}) {
	const lim = Math.min(200, Math.max(1, Number(limit) || 40));
	let roleFilter;
	if (role === 'hirer') roleFilter = sql`h.hirer_agent_id = ${agentId}`;
	else if (role === 'provider') roleFilter = sql`h.provider_agent_id = ${agentId}`;
	else roleFilter = sql`(h.hirer_agent_id = ${agentId} OR h.provider_agent_id = ${agentId})`;

	const cursor = beforeId
		? sql`AND h.created_at < (SELECT created_at FROM agent_hires WHERE id = ${beforeId})`
		: sql``;

	const rows = await sql`
		SELECT
			h.id, h.skill_name, h.service_slug, h.amount_atomics, h.usd, h.currency,
			h.network, h.status, h.payment_signature, h.invocation_signature,
			h.payer_address, h.payout_address, h.rating, h.created_at, h.completed_at,
			h.hirer_agent_id, h.provider_agent_id,
			hr.name AS hirer_name, pr.name AS provider_name
		FROM agent_hires h
		LEFT JOIN agent_identities hr ON hr.id = h.hirer_agent_id
		LEFT JOIN agent_identities pr ON pr.id = h.provider_agent_id
		WHERE ${roleFilter} ${cursor}
		ORDER BY h.created_at DESC
		LIMIT ${lim}
	`;
	return rows.map((r) => shapeHire(r, agentId));
}

function shapeHire(r, viewerAgentId) {
	const isHirer = r.hirer_agent_id === viewerAgentId;
	return {
		id: r.id,
		skill_name: r.skill_name,
		service_slug: r.service_slug,
		amount_atomics: String(r.amount_atomics),
		usd: r.usd != null ? Number(r.usd) : atomicsToUsdc(r.amount_atomics),
		currency: r.currency,
		network: r.network,
		status: r.status,
		direction: isHirer ? 'outlay' : 'income',
		counterparty: {
			agent_id: isHirer ? r.provider_agent_id : r.hirer_agent_id,
			name: (isHirer ? r.provider_name : r.hirer_name) || 'Agent',
		},
		payment_signature: r.payment_signature || null,
		invocation_signature: r.invocation_signature || null,
		payer_address: r.payer_address || null,
		payout_address: r.payout_address || null,
		rating: r.rating != null ? Number(r.rating) : null,
		created_at: r.created_at,
		completed_at: r.completed_at || null,
	};
}

/** Roll-up totals for an agent's economy header: lifetime income + outlay. */
export async function agentEconomySummary(agentId) {
	const [row] = await sql`
		SELECT
			COALESCE(SUM(usd) FILTER (WHERE provider_agent_id = ${agentId} AND status = 'completed'), 0) AS income_usd,
			COUNT(*) FILTER (WHERE provider_agent_id = ${agentId} AND status = 'completed')              AS income_count,
			COALESCE(SUM(usd) FILTER (WHERE hirer_agent_id = ${agentId} AND status = 'completed'), 0)    AS outlay_usd,
			COUNT(*) FILTER (WHERE hirer_agent_id = ${agentId} AND status = 'completed')                 AS outlay_count
		FROM agent_hires
		WHERE provider_agent_id = ${agentId} OR hirer_agent_id = ${agentId}
	`;
	return {
		income_usdc: Number(row?.income_usd || 0),
		income_count: Number(row?.income_count || 0),
		outlay_usdc: Number(row?.outlay_usd || 0),
		outlay_count: Number(row?.outlay_count || 0),
		net_usdc: Number(row?.income_usd || 0) - Number(row?.outlay_usd || 0),
	};
}

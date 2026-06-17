/**
 * IRL Agent Card — the public profile shown when a viewer taps a 3D agent
 * placed in the real world.
 *
 *   GET /api/irl/agent-card?id=<agentId>     resolve by agent identity id
 *   GET /api/irl/agent-card?pin=<pinId>      resolve via the pin's agent_id
 *
 * Returns a compact, public-safe card the AR popup renders inline:
 *   { id, name, description, thumbnail, home_url, skills,
 *     services: [{ slug, name, description, price_usdc, network }],
 *     reputation: { chats, services, registered, onchain, score },
 *     x402_endpoint }
 *
 * Aggregates agent_identities + agent_paid_services into one cheap, cached
 * payload so the camera popup stays instant. Public, IP rate-limited, Redis +
 * CDN cached. Falls back to the pin's own avatar_name/x402_endpoint when a pin
 * has no linked agent (anonymous placements still get a usable card).
 */

import { cors, json, error, method, wrap, rateLimited } from '../_lib/http.js';
import { limits, clientIp } from '../_lib/rate-limit.js';
import { sql } from '../_lib/db.js';
import { publicUrl } from '../_lib/r2.js';
import { getRedis } from '../_lib/redis.js';
import { atomicsToUsdc } from '../_lib/agent-paid-services.js';

const CACHE_TTL_S = 60;

// A small, monotonic reputation score (0–100) from public signals so the popup
// can show a single number without an on-chain round-trip. Chat volume is the
// dominant signal; registration and offering paid services add trust.
function reputationScore({ chats, services, registered }) {
	const chatPts = Math.min(70, Math.round(Math.log10(Math.max(1, chats)) * 28));
	const svcPts  = Math.min(18, services * 6);
	const regPts  = registered ? 12 : 0;
	return Math.min(100, chatPts + svcPts + regPts);
}

async function buildCard(agentId, fallback = {}) {
	const [agent] = await sql`
		SELECT i.id, i.name, i.description, i.skills, i.home_url, i.chat_count, i.meta,
		       a.thumbnail_key AS avatar_thumbnail_key,
		       a.visibility    AS avatar_visibility
		FROM agent_identities i
		LEFT JOIN avatars a ON a.id = i.avatar_id AND a.deleted_at IS NULL
		WHERE i.id = ${agentId} AND i.deleted_at IS NULL AND i.is_public = true
		LIMIT 1
	`.catch(() => []);

	if (!agent) return null;

	const services = await sql`
		SELECT slug, name, description, price_atomics, network
		FROM agent_paid_services
		WHERE agent_id = ${agentId} AND archived_at IS NULL
		ORDER BY created_at DESC
		LIMIT 8
	`.catch(() => []);

	const meta       = agent.meta || {};
	const onchain    = meta.onchain || null;
	const registered = !!(onchain || meta.sol_mint_address || meta.erc8004_agent_id);
	const thumbPub   = agent.avatar_visibility === 'public' || agent.avatar_visibility === 'unlisted';
	const chats      = Number(agent.chat_count) || 0;

	return {
		id:          agent.id,
		name:        agent.name || fallback.name || 'Agent',
		description: agent.description || fallback.description || null,
		thumbnail:   agent.avatar_thumbnail_key && thumbPub ? publicUrl(agent.avatar_thumbnail_key) : null,
		home_url:    agent.home_url || `/agents/${agent.id}`,
		skills:      Array.isArray(agent.skills) ? agent.skills.slice(0, 12) : [],
		services: services.map((s) => ({
			slug:        s.slug,
			name:        s.name,
			description: s.description || null,
			price_usdc:  atomicsToUsdc(s.price_atomics),
			network:     s.network || 'base',
		})),
		reputation: {
			chats,
			services:   services.length,
			registered,
			onchain:    onchain ? { network: onchain.network, asset: onchain.sol_asset || null } : null,
			score:      reputationScore({ chats, services: services.length, registered }),
		},
		x402_endpoint: fallback.x402_endpoint || null,
	};
}

export default wrap(async (req, res) => {
	if (cors(req, res, { methods: 'GET,OPTIONS', origins: '*' })) return;
	if (!method(req, res, ['GET'])) return;

	const rl = await limits.publicIp(clientIp(req));
	if (!rl.success) return rateLimited(res, rl);

	const p      = new URL(req.url, `http://${req.headers.host || 'x'}`).searchParams;
	const idParam  = (p.get('id') || '').trim();
	const pinParam = (p.get('pin') || '').trim();

	if (!idParam && !pinParam) {
		return error(res, 400, 'validation_error', 'id or pin is required');
	}

	let agentId = idParam || null;
	let fallback = {};

	// Resolve the linked agent (and an anonymous-pin fallback) from a pin id.
	if (!agentId && pinParam) {
		const [pin] = await sql`
			SELECT agent_id, avatar_name, caption, x402_endpoint
			FROM irl_pins
			WHERE id = ${pinParam} AND (expires_at IS NULL OR expires_at > NOW())
			LIMIT 1
		`.catch(() => []);
		if (!pin) return error(res, 404, 'not_found', 'pin not found');
		agentId  = pin.agent_id || null;
		fallback = {
			name:          pin.avatar_name || null,
			description:   pin.caption || null,
			x402_endpoint: pin.x402_endpoint || null,
		};
	}

	const cacheKey = agentId ? `irlcard:${agentId}` : null;
	const redis    = cacheKey ? await getRedis() : null;

	if (redis && cacheKey) {
		try {
			const cached = await redis.get(cacheKey);
			if (cached) {
				res.setHeader('X-Cache', 'HIT');
				// The pin-derived x402 endpoint isn't part of the cached identity card.
				if (fallback.x402_endpoint && !cached.x402_endpoint) cached.x402_endpoint = fallback.x402_endpoint;
				return json(res, 200, { card: cached }, { 'Cache-Control': 'public, max-age=60, stale-while-revalidate=300' });
			}
		} catch { /* cache miss */ }
	}

	// No linked agent — return the anonymous pin's own minimal card.
	if (!agentId) {
		return json(res, 200, {
			card: {
				id: null,
				name: fallback.name || 'Agent',
				description: fallback.description || null,
				thumbnail: null,
				home_url: null,
				skills: [],
				services: [],
				reputation: { chats: 0, services: 0, registered: false, onchain: null, score: 0 },
				x402_endpoint: fallback.x402_endpoint || null,
				anonymous: true,
			},
		}, { 'Cache-Control': 'public, max-age=30' });
	}

	const card = await buildCard(agentId, fallback);
	if (!card) return error(res, 404, 'not_found', 'agent not found');

	if (redis && cacheKey) {
		// Cache the identity portion only; the per-pin x402 endpoint is merged per request.
		const { x402_endpoint, ...identity } = card;
		redis.set(cacheKey, identity, { ex: CACHE_TTL_S }).catch(() => {});
	}

	return json(res, 200, { card }, { 'Cache-Control': 'public, max-age=60, stale-while-revalidate=300' });
});

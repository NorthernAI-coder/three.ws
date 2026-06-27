/**
 * Personal Memetic Launcher — the per-user scope of the autonomous launcher.
 *
 *   GET  /api/launcher/me
 *     The caller's own launcher_config (scope='user'), their recent runs, today's
 *     throughput, how many of their agents are launch-ready, and the live cultural
 *     narratives their launcher would ride right now.
 *
 *   POST /api/launcher/me
 *     Upsert the caller's launcher policy (mode, sources, cadence, network, on/off).
 *     { action: 'preview' } → synthesize ONE sample coin the launcher would mint
 *                             right now (no DB write, on demand — never per poll).
 *     { action: 'resume'  } → clear a tripped circuit breaker.
 *
 * SAFETY — why a normal user can run this without an abuse vector: the shared
 * platform master wallet funds every live launch (launcher-engine → fundAgentForLaunch).
 * There is deliberately no per-user funding source yet, so a user-scope launcher is
 * HARD-LOCKED to dry_run server-side: enabling it makes the cron pick real coins +
 * the user's own agents + live narratives and record them, but it never moves SOL.
 * It is a true preview/strategy designer. Going live is a separately-funded follow-up;
 * the lock is the one line (FORCE_DRY_RUN) that keeps that decision deliberate.
 *
 * Auth: session cookie OR bearer JWT (so a user's agent can drive it too).
 */

import { cors, error, json, method, rateLimited, readJson, wrap } from '../_lib/http.js';
import { getSessionUser, authenticateBearer, extractBearer } from '../_lib/auth.js';
import { limits, clientIp } from '../_lib/rate-limit.js';
import { sql } from '../_lib/db.js';
import { rankNarratives } from '../_lib/launcher-trends.js';
import { pickSource } from '../_lib/launcher-sources.js';

// A user-scope launcher can never move SOL (see SAFETY above). One place to lift
// this when per-user funding ships.
const FORCE_DRY_RUN = true;

const MODES = ['off', 'trend', 'meme', 'random', 'hybrid'];
const KNOWN_SOURCES = ['coin_intel', 'trending', 'x', 'knowyourmeme', 'hackernews', 'reddit', 'wikipedia'];

async function resolveUserId(req) {
	const session = await getSessionUser(req);
	if (session?.id) return session.id;
	const bearer = extractBearer(req);
	if (bearer) {
		const auth = await authenticateBearer(bearer).catch(() => null);
		if (auth?.userId) return auth.userId;
	}
	return null;
}

// jsonb columns arrive as arrays or (depending on driver) JSON strings — coerce.
function coerceArr(v) {
	if (Array.isArray(v)) return v;
	if (typeof v === 'string') { try { const p = JSON.parse(v); return Array.isArray(p) ? p : []; } catch { return []; } }
	return [];
}

async function ensureUserRow(userId) {
	await sql`
		insert into launcher_config (scope, user_id, enabled, dry_run, mode)
		values ('user', ${userId}, false, true, 'hybrid')
		on conflict (user_id) where scope = 'user' do nothing
	`;
	const [row] = await sql`select * from launcher_config where scope = 'user' and user_id = ${userId} limit 1`;
	return row;
}

export default wrap(async (req, res) => {
	if (cors(req, res, { methods: 'GET,POST,OPTIONS', credentials: true })) return;
	if (!method(req, res, ['GET', 'POST'])) return;

	const userId = await resolveUserId(req);
	if (!userId) return error(res, 401, 'unauthorized', 'authentication required');

	const rl = await limits.authIp(clientIp(req));
	if (!rl.success) return rateLimited(res, rl);

	const config = await ensureUserRow(userId);

	if (req.method === 'GET') return getState(res, userId, config);

	const body = (await readJson(req).catch(() => ({}))) || {};
	if (body.action === 'preview') return previewCoin(res, config, body);
	if (body.action === 'resume') return resumeBreaker(res, userId);
	return postConfig(res, userId, config, body);
});

async function getState(res, userId, config) {
	const network = config?.network || 'mainnet';

	const [recent, stats, queue, eligible] = await Promise.all([
		sql`
			select id, agent_id, kind, trigger_source, trigger_detail, name, symbol, mint, network,
			       sol_spent, status, dry_run, tx_signature, error, created_at
			from launcher_runs
			where scope = 'user' and user_id = ${userId}
			order by created_at desc
			limit 50
		`,
		sql`
			select
				count(*)::int as runs_today,
				count(*) filter (where status = 'dry_run')::int as dry_runs_today,
				count(*) filter (where status in ('launched','confirmed'))::int as launched_today,
				count(*) filter (where status = 'skipped')::int as skipped_today,
				count(*) filter (where status = 'failed')::int as failed_today
			from launcher_runs
			where scope = 'user' and user_id = ${userId} and created_at >= date_trunc('day', now())
		`,
		sql`select count(*)::int as enabled from launcher_queue where scope = 'user' and user_id = ${userId} and enabled = true`,
		// The user's own launch-ready agents: public-or-not, avatar-bearing, walleted.
		sql`
			select count(*)::int as n from agent_identities ai
			where ai.user_id = ${userId} and ai.deleted_at is null
			  and ai.avatar_id is not null and ai.meta->>'solana_address' is not null
		`,
	]);

	const cfgSources = coerceArr(config?.sources);
	const narratives = await rankNarratives({
		network,
		sources: cfgSources.length ? cfgSources : undefined,
		categories: coerceArr(config?.categories),
		limit: 16,
	}).catch(() => null);

	return json(res, 200, {
		config: shapeConfig(config),
		console: recent,
		stats: stats[0] || {},
		queue_enabled: queue[0]?.enabled ?? 0,
		eligible_agents: eligible[0]?.n ?? 0,
		dry_run_locked: FORCE_DRY_RUN,
		narratives: narratives
			? { terms: narratives.terms || [], top: narratives.top || null, providers: narratives.providers || [] }
			: null,
	});
}

// A user-scope launcher is never "armed" (dry-run-locked) — expose the running flag
// honestly so the UI never implies real SOL will move.
function shapeConfig(c) {
	if (!c) return null;
	return { ...c, dry_run: FORCE_DRY_RUN ? true : c.dry_run, armed: false };
}

// Cadence floor + hourly ceiling for user scope: each enabled user launcher is
// driven by the shared cron and may synthesize a coin (LLM) per tick, so keep the
// per-user load bounded regardless of what the client asks for.
const USER_MIN_CADENCE = 60;
const USER_MAX_PER_HOUR = 60;

// Pure validation + normalisation of a config patch. Returns { ok:false, code,
// message } on a bad field, else { ok:true, next } with every value range-clamped
// and dry_run forced on (a user-scope launcher can never move SOL). No I/O — unit
// tested in tests/user-launcher.test.js.
export function validateAndBuildPatch(body, cur) {
	if (body.mode != null && !MODES.includes(body.mode)) {
		return { ok: false, code: 'invalid_mode', message: `mode must be one of ${MODES.join(', ')}` };
	}
	if (body.network != null && !['mainnet', 'devnet'].includes(body.network)) {
		return { ok: false, code: 'invalid_network', message: 'network must be mainnet or devnet' };
	}
	if (body.sources != null && (!Array.isArray(body.sources) || body.sources.some((s) => !KNOWN_SOURCES.includes(s)))) {
		return { ok: false, code: 'invalid_sources', message: `sources must be a subset of ${KNOWN_SOURCES.join(', ')}` };
	}
	if (body.categories != null && !Array.isArray(body.categories)) {
		return { ok: false, code: 'invalid_categories', message: 'categories must be an array' };
	}
	const inRange = (v, lo, hi) => { const n = Number(v); return Number.isFinite(n) && n >= lo && n <= hi; };
	if (body.target_cadence_seconds != null && !inRange(body.target_cadence_seconds, USER_MIN_CADENCE, 86_400)) {
		return { ok: false, code: 'invalid_cadence', message: `target_cadence_seconds must be ${USER_MIN_CADENCE}..86400` };
	}
	if (body.max_per_hour != null && !inRange(body.max_per_hour, 0, USER_MAX_PER_HOUR)) {
		return { ok: false, code: 'invalid_max_per_hour', message: `max_per_hour must be 0..${USER_MAX_PER_HOUR}` };
	}

	const has = (k) => Object.prototype.hasOwnProperty.call(body, k);
	const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
	const next = {
		enabled: has('enabled') ? Boolean(body.enabled) : cur.enabled,
		// dry_run is server-owned for user scope — never trust the client to clear it.
		dry_run: true,
		mode: has('mode') ? body.mode : cur.mode,
		sources: has('sources') ? body.sources : coerceArr(cur.sources),
		categories: has('categories') ? body.categories : coerceArr(cur.categories),
		target_cadence_seconds: has('target_cadence_seconds') ? clamp(Math.round(Number(body.target_cadence_seconds)), USER_MIN_CADENCE, 86_400) : cur.target_cadence_seconds,
		max_per_hour: has('max_per_hour') ? clamp(Math.round(Number(body.max_per_hour)), 0, USER_MAX_PER_HOUR) : cur.max_per_hour,
		network: has('network') ? body.network : cur.network,
	};
	return { ok: true, next };
}

async function postConfig(res, userId, cur, body) {
	const patch = validateAndBuildPatch(body, cur);
	if (!patch.ok) return error(res, 400, patch.code, patch.message);
	const next = patch.next;

	const [row] = await sql`
		update launcher_config set
			enabled = ${next.enabled},
			dry_run = ${next.dry_run},
			mode = ${next.mode},
			sources = ${JSON.stringify(next.sources)}::jsonb,
			categories = ${JSON.stringify(next.categories)}::jsonb,
			target_cadence_seconds = ${next.target_cadence_seconds},
			max_per_hour = ${next.max_per_hour},
			network = ${next.network},
			updated_at = now()
		where scope = 'user' and user_id = ${userId}
		returning *
	`;

	return json(res, 200, { ok: true, config: shapeConfig(row) });
}

// On-demand single-coin synthesis: shows exactly what the launcher would mint next.
// User-initiated only (it can call the LLM), so never wire this onto a poll.
async function previewCoin(res, config, body) {
	const mode = MODES.includes(body.mode) ? body.mode : (config?.mode || 'hybrid');
	const network = config?.network || 'mainnet';
	const coin = await pickSource({
		mode,
		network,
		categories: coerceArr(config?.categories),
		sources: coerceArr(config?.sources).length ? coerceArr(config?.sources) : undefined,
	}).catch(() => null);
	if (!coin) return error(res, 503, 'preview_unavailable', 'could not synthesize a sample coin right now');
	return json(res, 200, {
		ok: true,
		sample: {
			name: coin.name,
			symbol: coin.symbol,
			description: coin.description || '',
			kind: coin.kind,
			trigger_source: coin.trigger_source || null,
			top_narrative: coin.trigger_detail?.top_narrative || null,
		},
	});
}

async function resumeBreaker(res, userId) {
	const [row] = await sql`
		update launcher_config set paused = false, pause_reason = null, updated_at = now()
		where scope = 'user' and user_id = ${userId} returning *
	`;
	return json(res, 200, { ok: true, config: shapeConfig(row) });
}

export { FORCE_DRY_RUN, MODES, KNOWN_SOURCES, shapeConfig };

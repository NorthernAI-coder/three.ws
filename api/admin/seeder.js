// GET/POST /api/admin/seeder — control room API for the Avaturn avatar seeder.
//
//   GET  → { flag, stats, circuit, cadence_seconds, recent[] } — everything the
//          /admin/seeder console renders: whether the seeder is armed (and from
//          where), how many rigged avatars it has produced, the circuit-breaker
//          state, and a gallery of the most recent seeded avatars with live GLB
//          URLs for in-browser 3D preview.
//   POST → { enabled: boolean }            arm/disarm the seeder (flips the
//                                           `avaturn_seed` runtime flag, no deploy)
//          { action: 'run_now' }           trigger one export immediately
//
// Auth: a real admin session OR `Bearer $CRON_SECRET` (ops tooling) — the same
// contract as /api/admin/launcher and /api/admin/flags.

import { sql } from '../_lib/db.js';
import { requireAdmin } from '../_lib/admin.js';
import { cors, json, error, method, readJson, wrap } from '../_lib/http.js';
import { env } from '../_lib/env.js';
import { constantTimeEquals } from '../_lib/crypto.js';
import { publicUrl } from '../_lib/r2.js';
import { circuitState } from '../_lib/forge-scale.js';
import { logAudit } from '../_lib/audit.js';
import { getFlag, setFlag } from '../_lib/flags.js';

const FLAG_KEY = 'avaturn_seed';
const CIRCUIT_NAME = 'avaturn-seed';
// Matches the cron schedule in vercel.json (* * * * *). Surfaced so the console
// can count down to the next automatic export.
const CADENCE_SECONDS = 60;
const RECENT_LIMIT = 18;

function isCronAuth(req) {
	const auth = req.headers.authorization || '';
	const bearer = auth.toLowerCase().startsWith('bearer ') ? auth.slice(7).trim() : '';
	return !!env.CRON_SECRET && constantTimeEquals(bearer, env.CRON_SECRET);
}

// Aggregate seeder throughput + rig quality straight off the avatars table.
async function loadStats() {
	try {
		const [r] = await sql`
			select
				count(*)                                                         as n_total,
				count(*) filter (where created_at > now() - interval '60 minutes') as n_60m,
				count(*) filter (where created_at > now() - interval '24 hours')   as n_24h,
				count(*) filter (where created_at > now() - interval '7 days')     as n_7d,
				count(*) filter (where (source_meta->>'is_rigged') = 'true')       as n_rigged,
				max(created_at)                                                    as last_at
			from avatars
			where source = 'avaturn' and visibility = 'public' and deleted_at is null
		`;
		const total = Number(r?.n_total ?? 0);
		const rigged = Number(r?.n_rigged ?? 0);
		return {
			total,
			last_hour: Number(r?.n_60m ?? 0),
			last_24h: Number(r?.n_24h ?? 0),
			last_7d: Number(r?.n_7d ?? 0),
			rigged,
			rigged_pct: total ? Math.round((rigged / total) * 100) : 0,
			last_at: r?.last_at ?? null,
		};
	} catch (err) {
		return {
			total: 0,
			last_hour: 0,
			last_24h: 0,
			last_7d: 0,
			rigged: 0,
			rigged_pct: 0,
			last_at: null,
			error: err?.message?.slice(0, 140),
		};
	}
}

// Newest seeded avatars, mapped to public GLB URLs for the 3D preview gallery.
async function loadRecent() {
	try {
		const rows = await sql`
			select id, slug, name, storage_key, source_meta, created_at
			from avatars
			where source = 'avaturn' and visibility = 'public' and deleted_at is null
			order by created_at desc
			limit ${RECENT_LIMIT}
		`;
		return rows.map((a) => {
			const meta = a.source_meta || {};
			const joints = Number(meta.skeleton_joint_count) || null;
			return {
				id: a.id,
				slug: a.slug,
				name: a.name,
				glb_url: a.storage_key ? publicUrl(a.storage_key) : null,
				profile_url: a.slug ? `/avatars/${a.slug}` : null,
				body_type: meta.body_type || null,
				joints,
				is_rigged: meta.is_rigged === true || (joints != null && joints > 0),
				created_at: a.created_at,
			};
		});
	} catch {
		return [];
	}
}

async function handleGet(res) {
	const [flag, stats, recent, circuit] = await Promise.all([
		getFlag(FLAG_KEY, { fallback: env.AVATURN_SEED_ENABLED }),
		loadStats(),
		loadRecent(),
		circuitState(CIRCUIT_NAME).catch(() => ({ open: false, failures: 0, openUntil: 0 })),
	]);

	return json(res, 200, {
		ok: true,
		flag: {
			key: FLAG_KEY,
			enabled: flag.enabled,
			// Where the effective value comes from: a DB row (live control) or the
			// env fallback (no row set yet). Lets the console explain the state.
			source: flag.exists ? 'db' : 'env',
			env_fallback: !!env.AVATURN_SEED_ENABLED,
		},
		stats,
		circuit: {
			open: !!circuit.open,
			failures: Number(circuit.failures) || 0,
			open_until: Number(circuit.openUntil) || 0,
		},
		cadence_seconds: CADENCE_SECONDS,
		recent,
	});
}

// Fire one export immediately by invoking the cron endpoint with the operator
// secret. Headless export takes ~2 min; we don't await the full run — once the
// request reaches the cron it runs to completion in its own invocation, so we
// return as soon as it's accepted (or report the single-flight slot is busy).
async function triggerRunNow() {
	const origin = env.APP_ORIGIN || 'https://three.ws';
	const secret = env.CRON_SECRET || '';
	if (!secret) return { triggered: false, reason: 'CRON_SECRET unset' };
	try {
		const r = await fetch(`${origin}/api/cron/avaturn-seed-cron`, {
			headers: { authorization: `Bearer ${secret}` },
			signal: AbortSignal.timeout(4000),
		});
		const body = await r.json().catch(() => null);
		// The cron early-returns a top-level `skipped` for disarmed / single-flight.
		if (body?.skipped === 'disabled')
			return { triggered: false, reason: 'seeder is disarmed — arm it first' };
		if (body?.skipped === 'in_flight')
			return { triggered: false, reason: 'an export is already running' };
		return { triggered: true };
	} catch (err) {
		// A timeout means the export is running past our short read window — that's
		// success from the console's perspective: the run was accepted.
		if (err?.name === 'TimeoutError' || err?.name === 'AbortError')
			return { triggered: true, running: true };
		return { triggered: false, reason: err?.message?.slice(0, 140) || 'trigger failed' };
	}
}

async function handlePost(req, res, adminId) {
	const body = await readJson(req, 32 * 1024);

	if (body?.action === 'run_now') {
		const result = await triggerRunNow();
		logAudit({ userId: adminId, action: 'seeder-run-now', meta: result, req });
		if (!result.triggered)
			return error(res, 409, 'run_now_failed', result.reason || 'could not start an export');
		return json(res, 200, { ok: true, ...result });
	}

	if (typeof body?.enabled !== 'boolean') {
		return error(
			res,
			400,
			'invalid_request',
			'body must be { enabled: boolean } or { action: "run_now" }',
		);
	}

	const row = await setFlag(FLAG_KEY, { enabled: body.enabled, updatedBy: adminId });
	logAudit({
		userId: adminId,
		action: 'seeder-toggle',
		resourceId: FLAG_KEY,
		meta: { enabled: body.enabled },
		req,
	});
	return json(res, 200, {
		ok: true,
		flag: { key: FLAG_KEY, enabled: row.enabled === true, source: 'db' },
	});
}

export default wrap(async (req, res) => {
	if (cors(req, res, { methods: 'GET,POST,OPTIONS', credentials: true })) return;
	if (!method(req, res, ['GET', 'POST'])) return;

	let adminId = null;
	if (isCronAuth(req)) {
		adminId = null;
	} else {
		const admin = await requireAdmin(req, res);
		if (!admin) return; // requireAdmin already wrote 401/403
		adminId = admin.id;
	}

	if (req.method === 'GET') return handleGet(res);
	return handlePost(req, res, adminId);
});

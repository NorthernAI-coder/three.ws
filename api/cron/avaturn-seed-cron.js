// @ts-check
// GET /api/cron/avaturn-seed-cron — per-minute cron that grows the public
// gallery with randomized, fully-rigged **Avaturn** avatars.
//
// Unlike the forge seeder (text→image→mesh, returns a GLB inline from a server
// API), Avaturn has no headless export endpoint — the GLB only comes out of the
// editor via the SDK's postMessage protocol. So each tick:
//
//   1. Claims an OG single-word username for a fresh synthetic account.
//   2. Boots headless chromium against Avaturn's public demo editor (no API
//      key, same iframe the demo uses) and lets the SDK randomize a body +
//      assets + colors from the public catalog.
//   3. Exports a rigged GLB, stores it in R2, and inserts a public avatar row
//      (source=avaturn).
//
// One avatar per tick — the headless export runs to completion inside the
// invocation (no poll table needed). A Redis blocking slot stops a slow export
// on one instance from overlapping the next minute's tick. A circuit breaker
// goes quiet during Avaturn outages so the cron doesn't burn quota into a dead
// lane. Gated behind AVATURN_SEED_ENABLED so it's a no-op until an operator
// opts in (cadence is set by the cron schedule in vercel.json — start at 1/min).

import { json, method, wrapCron } from '../_lib/http.js';
import { env } from '../_lib/env.js';
import { sql } from '../_lib/db.js';
import { constantTimeEquals } from '../_lib/crypto.js';
import { OG_USERNAMES } from '../_lib/seed-prompts.js';
import {
	circuitState,
	circuitRecordFailure,
	circuitRecordSuccess,
	acquireBlockingSlot,
} from '../_lib/forge-scale.js';
import { exportRandomAvaturnAvatar } from '../_lib/avaturn-headless.js';
import { putObject } from '../_lib/r2.js';
import { inspectGlb } from '../_lib/glb-inspect.js';
import { isFlagEnabled } from '../_lib/flags.js';
import { pickBodyType } from '../_lib/avaturn-seed.js';
import { randomUUID } from 'node:crypto';

const CIRCUIT_NAME = 'avaturn-seed';
const CIRCUIT_THRESHOLD = 3;
const CIRCUIT_BASE_MS = 10 * 60_000; // 10 min × consecutive failures
// One headless export at a time across all instances. TTL is just under the
// function's maxDuration (300 s) so a crashed run's lease self-heals next tick.
const SLOT_TTL_MS = 280_000;

function requireCron(req, res) {
	const secret = process.env.CRON_SECRET || env.CRON_SECRET;
	if (!secret) {
		res.status(503).json({ error: 'not_configured', message: 'CRON_SECRET unset' });
		return false;
	}
	const auth = req.headers['authorization'] || '';
	const presented = auth.startsWith('Bearer ') ? auth.slice(7) : '';
	if (!constantTimeEquals(presented, secret)) {
		res.status(401).json({ error: 'unauthorized' });
		return false;
	}
	return true;
}

// Try to claim `word` as a username, skipping to the next free numbered slot.
// Returns the claimed username or null. (Mirrors the forge seeder's helper.)
async function claimUsername(word) {
	const existing = await sql`
		select username from users where username = ${word} or username like ${word + '%'} limit 100
	`;
	const taken = new Set(existing.map((r) => r.username));
	if (!taken.has(word)) return word;
	for (let n = 2; n <= 99; n++) {
		const candidate = `${word}${n}`;
		if (!taken.has(candidate)) return candidate;
	}
	return `${word}_${randomUUID().slice(0, 4)}`;
}

function toSlug(name) {
	const base = String(name)
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '')
		.slice(0, 48);
	return `${base || 'avatar'}-${randomUUID().slice(0, 6)}`;
}

async function runOnce() {
	const circuit = await circuitState(CIRCUIT_NAME);
	if (circuit.open) {
		const minsLeft = Math.ceil((circuit.openUntil - Date.now()) / 60_000);
		return { skipped: true, reason: `circuit open for ${minsLeft}m more (${circuit.failures} failures)` };
	}

	const baseWord = OG_USERNAMES[Math.floor(Math.random() * OG_USERNAMES.length)];
	const username = await claimUsername(baseWord);
	if (!username) return { skipped: true, reason: 'could not claim OG username — retry next tick' };

	const displayName = username.replace(/\d+$/, '').replace(/\b\w/g, (c) => c.toUpperCase());
	const email = `${username}@avaturn.three.ws`;

	const [user] = await sql`
		insert into users (email, display_name, username, plan, email_verified, created_at, updated_at)
		values (${email}, ${displayName}, ${username}, 'free', false, now(), now())
		on conflict do nothing
		returning id
	`;
	if (!user?.id) return { skipped: true, reason: 'user insert conflict — retry next tick' };

	const seed = randomUUID();
	const bodyType = pickBodyType(seed);

	try {
		// Public demo editor — no API key, no per-account session.
		const { glbBytes, exportUrl, look } = await exportRandomAvaturnAvatar({ seed, bodyType });

		const slug = toSlug(displayName);
		const storageKey = `u/${user.id}/${slug}.glb`;
		await putObject({
			key: storageKey,
			body: glbBytes,
			contentType: 'model/gltf-binary',
			metadata: { source: 'avaturn-seed' },
		});

		// Stamp the real skeleton signal so the marketplace/gallery "rigged"
		// filter and the rig badge recognize these as rigged. Avaturn exports are
		// always skinned, but the filter keys off source_meta.is_rigged /
		// skeleton_joint_count (see searchPublicAvatars), not the `rig` label —
		// without these, genuinely-rigged Avaturn avatars read as "needs rigging".
		// Inspecting the in-memory bytes adds no I/O; fall back to is_rigged=true
		// (Avaturn never exports a static mesh) if the parse ever returns null.
		const rigInfo = inspectGlb(glbBytes);
		const sourceMeta = {
			seed: true,
			avaturn: true,
			rig: 'avaturn',
			body_type: bodyType,
			is_rigged: rigInfo ? rigInfo.isRigged : true,
			skeleton_joint_count: rigInfo?.skeletonJointCount ?? null,
			skin_count: rigInfo?.skinCount ?? null,
			look,
			export_url: exportUrl,
		};

		await sql`
			insert into avatars
				(owner_id, slug, name, description, storage_key, size_bytes,
				 content_type, source, source_meta, visibility, tags,
				 model_category, created_at, updated_at)
			values (
				${user.id}, ${slug}, ${displayName},
				${'Fully-rigged Avaturn avatar — forged on three.ws'},
				${storageKey}, ${glbBytes.length}, 'model/gltf-binary',
				'avaturn',
				${JSON.stringify(sourceMeta)}::jsonb,
				'public',
				array['avatar', 'avaturn']::text[],
				'avatar', now(), now()
			)
			on conflict do nothing
		`;

		await circuitRecordSuccess(CIRCUIT_NAME);
		return { ok: true, username, user_id: user.id, slug, size_bytes: glbBytes.length, body_type: bodyType };
	} catch (err) {
		await circuitRecordFailure(CIRCUIT_NAME, { threshold: CIRCUIT_THRESHOLD, baseMs: CIRCUIT_BASE_MS });
		// Roll back the synthetic account so the next tick starts clean.
		await sql`delete from users where id = ${user.id}`.catch(() => {});
		return { ok: false, reason: `${err?.code || 'error'}: ${err?.message || err}` };
	}
}

export default wrapCron(async (req, res) => {
	if (!method(req, res, ['GET'])) return;
	if (!requireCron(req, res)) return;

	// DB flag is the live control (flip it from the admin console with no
	// redeploy); the AVATURN_SEED_ENABLED env var is the fallback default used
	// only when no app_flags row exists yet, preserving the prior behavior.
	const enabled = await isFlagEnabled('avaturn_seed', { fallback: env.AVATURN_SEED_ENABLED });
	if (!enabled) {
		return json(res, 200, {
			ok: true,
			skipped: 'disabled',
			hint: 'enable instantly via POST /api/admin/flags { "key":"avaturn_seed","enabled":true } (or set AVATURN_SEED_ENABLED=1)',
		});
	}

	// Single headless export in flight at a time, fleet-wide.
	const slot = await acquireBlockingSlot(CIRCUIT_NAME, { max: 1, ttlMs: SLOT_TTL_MS });
	if (!slot.ok) {
		return json(res, 200, { ok: true, skipped: 'in_flight', reason: 'a prior export is still running' });
	}
	try {
		const result = await runOnce();
		return json(res, 200, { ok: true, result });
	} finally {
		await slot.release();
	}
});

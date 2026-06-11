// POST /api/avatar/video-generate
//
// Submits a talking-avatar video generation job to the LongCat-Video-Avatar-1.5
// Cloud Run worker. Returns immediately with a job_id for polling.
//
// Free-plan users get 1 lifetime generation. Paid users are unlimited.
//
// Request body (JSON):
//   image_url  string  — publicly accessible reference image (PNG/JPG)
//   audio_url  string  — publicly accessible audio file (WAV/MP3)
//   prompt     string? — optional text description
//   avatar_id  string? — three.ws avatar id; resolved to a render URL
//                        when image_url is not supplied
//
// Response 202:
//   { job_id, status: "queued" }
//
// Errors:
//   400 invalid_request   — missing required fields
//   402 free_trial_used   — free user has already used their 1 free generation
//   502 worker_error      — Cloud Run worker returned an error

import { cors, error, json, wrap } from '../_lib/http.js';
import { sql } from '../_lib/db.js';
import { publicUrl } from '../_lib/r2.js';
import { getSessionUser } from '../_lib/auth.js';
import { env } from '../_lib/env.js';

// Mirror of trustedOrigin() in api/avatar/optimize.js: image_url/audio_url are
// forwarded to the LongCat worker, which fetches them server-side. Restrict them
// to https on a three.ws-controlled host (APP_ORIGIN / R2 public domain) so a
// caller can't drive the worker into an SSRF against internal/metadata hosts.
function trustedMediaUrl(url) {
	let u;
	try {
		u = new URL(url);
	} catch {
		return false;
	}
	if (u.protocol !== 'https:') return false;
	const allowed = new Set();
	try {
		if (env.APP_ORIGIN) allowed.add(new URL(env.APP_ORIGIN).host);
	} catch {
		/* ignore malformed env */
	}
	try {
		if (env.S3_PUBLIC_DOMAIN) allowed.add(new URL(env.S3_PUBLIC_DOMAIN).host);
	} catch {
		/* ignore malformed env */
	}
	return allowed.has(u.host);
}

function workerUrl() {
	const u = process.env.LONGCAT_WORKER_URL;
	if (!u)
		throw Object.assign(new Error('LONGCAT_WORKER_URL not configured'), {
			code: 'worker_unconfigured',
			status: 503,
		});
	return u.replace(/\/$/, '');
}

function workerKey() {
	const k = process.env.LONGCAT_WORKER_KEY;
	if (!k)
		throw Object.assign(new Error('LONGCAT_WORKER_KEY not configured'), {
			code: 'worker_unconfigured',
			status: 503,
		});
	return k;
}

async function resolveImageUrl(avatarId) {
	const rows = await sql`
		select storage_key from avatars
		where id = ${avatarId} and deleted_at is null
		limit 1
	`;
	if (!rows[0])
		throw Object.assign(new Error('avatar not found'), {
			code: 'avatar_not_found',
			status: 404,
		});
	return publicUrl(rows[0].storage_key);
}

export default wrap(async (req, res) => {
	if (cors(req, res, { methods: 'POST,OPTIONS', credentials: true })) return;
	if (req.method !== 'POST')
		return error(res, 405, 'method_not_allowed', `method ${req.method} not allowed`);

	let session;
	try {
		session = await getSessionUser(req);
		if (!session) throw new Error('no session');
	} catch {
		return error(res, 401, 'unauthorized', 'valid session required');
	}

	const userId = session.id ?? session.userId;

	// Check plan + usage. Free plan users get exactly 1 lifetime generation.
	const [userRow] = await sql`
		select plan from users where id = ${userId} and deleted_at is null limit 1
	`;
	const isFree = userRow?.plan === 'free';

	// Fast-path rejection. The authoritative, race-safe gate is the reservation
	// insert below — this early read just spares already-spent users the
	// validation work.
	if (isFree) {
		const [usageRow] = await sql`
			select count(*) as n from usage_events
			where user_id = ${userId} and kind = 'video_generate'
		`;
		if (Number(usageRow?.n) >= 1) {
			return error(
				res,
				402,
				'free_trial_used',
				'You have used your 1 free video. Upgrade to generate more.',
			);
		}
	}

	const body = req.body || {};
	let { image_url: imageUrl, audio_url: audioUrl, avatar_id: avatarId, prompt } = body;

	if (!audioUrl) return error(res, 400, 'invalid_request', 'audio_url is required');

	if (!imageUrl && avatarId) {
		try {
			imageUrl = await resolveImageUrl(avatarId);
		} catch (err) {
			return error(res, err.status || 400, err.code || 'invalid_request', err.message);
		}
	}

	if (!imageUrl) return error(res, 400, 'invalid_request', 'image_url or avatar_id is required');

	// The worker fetches these URLs server-side, so they must be https on a
	// three.ws-controlled host. A server-resolved avatar render (publicUrl →
	// R2 domain) already satisfies this; an arbitrary caller-supplied URL must
	// pass the same allowlist or we'd hand the worker an SSRF primitive.
	if (!trustedMediaUrl(imageUrl)) {
		return error(res, 400, 'invalid_request', 'image_url must be an https three.ws-hosted URL');
	}
	if (!trustedMediaUrl(audioUrl)) {
		return error(res, 400, 'invalid_request', 'audio_url must be an https three.ws-hosted URL');
	}

	// Atomically reserve the free-trial slot BEFORE submitting the worker job.
	// The old check-then-insert straddled the worker call, so two concurrent
	// requests could both pass the count check and both generate. Reserving
	// first closes that window: usage_events.id is a bigserial, so after our
	// reservation lands, any earlier (lower-id) video_generate row for this user
	// means another request already holds or spent the single free slot — we
	// release ours and reject. The row is deleted if worker submission fails,
	// so a worker outage never burns the trial.
	let reservationId = null;
	if (isFree) {
		const [reserved] = await sql`
			insert into usage_events (user_id, kind, meta)
			values (${userId}, 'video_generate', '{}'::jsonb)
			returning id
		`;
		reservationId = reserved.id;
		const [prior] = await sql`
			select count(*) as n from usage_events
			where user_id = ${userId} and kind = 'video_generate' and id < ${reservationId}
		`;
		if (Number(prior?.n) >= 1) {
			await releaseReservation(reservationId);
			return error(
				res,
				402,
				'free_trial_used',
				'You have used your 1 free video. Upgrade to generate more.',
			);
		}
	}

	let result;
	try {
		let workerRes;
		try {
			workerRes = await fetch(`${workerUrl()}/generate`, {
				method: 'POST',
				headers: {
					'content-type': 'application/json',
					authorization: `Bearer ${workerKey()}`,
				},
				body: JSON.stringify({
					image_url: imageUrl,
					audio_url: audioUrl,
					prompt: prompt || 'A person talking naturally.',
				}),
			});
		} catch (err) {
			await releaseReservation(reservationId);
			return error(res, 502, 'worker_unreachable', err?.message || 'worker request failed');
		}

		if (!workerRes.ok) {
			const text = await workerRes.text().catch(() => '');
			await releaseReservation(reservationId);
			return error(
				res,
				502,
				'worker_error',
				`worker returned ${workerRes.status}: ${text.slice(0, 200)}`,
			);
		}

		result = await workerRes.json();
	} catch (err) {
		await releaseReservation(reservationId);
		return error(
			res,
			502,
			'worker_error',
			err?.message || 'worker returned an unreadable response',
		);
	}

	const jobId = result.job_id;

	// Record usage so we can verify job ownership. The free-trial quota row
	// already exists (the reservation) — attach the job id to it. Paid users
	// get a best-effort audit row; a logging failure must not block them.
	try {
		if (reservationId != null) {
			await sql`
				update usage_events set meta = ${JSON.stringify({ job_id: jobId })}::jsonb
				where id = ${reservationId}
			`;
		} else {
			await sql`
				insert into usage_events (user_id, kind, meta)
				values (${userId}, 'video_generate', ${JSON.stringify({ job_id: jobId })}::jsonb)
			`;
		}
	} catch (err) {
		console.error('[video-generate] failed to record job id on usage event:', err);
	}

	return json(res, 202, { job_id: jobId, status: result.status });
});

// Best-effort delete of a free-trial reservation row after a failed worker
// submission. A delete failure leaves the slot consumed (fail-closed) rather
// than risking unlimited free generations.
async function releaseReservation(reservationId) {
	if (reservationId == null) return;
	try {
		await sql`delete from usage_events where id = ${reservationId}`;
	} catch (err) {
		console.error('[video-generate] failed to release free-trial reservation:', err);
	}
}

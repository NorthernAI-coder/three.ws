// Replicate webhook receiver. Replicate POSTs the full Prediction object here
// when our reconstruction job finishes (succeeded/failed/canceled). Verifying
// it lets us update the avatar_regen_jobs row immediately instead of waiting
// for the next /api/avatars/regenerate-status poll to drive the provider.
//
// Signature scheme — Standard Webhooks (https://www.standardwebhooks.com):
//   webhook-id        — UUID for this delivery
//   webhook-timestamp — seconds since epoch
//   webhook-signature — "v1,<base64-of-hmac_sha256(secret, id.timestamp.body)>
//                       v1,<another-sig>" (space-separated for key rotation)
//
// The secret comes from `REPLICATE_WEBHOOK_SIGNING_KEY` (set after creating a
// webhook in the Replicate dashboard). On Replicate the value is prefixed
// with `whsec_` — we strip it. The signing input is exactly `${id}.${timestamp}.${body}`
// joined with periods. Compare with timingSafeEqual.
//
// If REPLICATE_WEBHOOK_SIGNING_KEY is unset the endpoint FAILS CLOSED in
// production (401) — an unsigned webhook would otherwise let anyone who can
// guess an ext_job_id spoof job completion and drive a server-side fetch of an
// attacker-controlled URL (SSRF). The unsigned dev path is allowed only when
// NODE_ENV !== 'production' AND ALLOW_UNSIGNED_WEBHOOKS=1 is explicitly set.

import { createHmac, timingSafeEqual } from 'node:crypto';
import { sql } from '../_lib/db.js';
import { json, method, wrap, error } from '../_lib/http.js';
import { finalizeReconstructStage } from '../_lib/reconstruct-finalize.js';

const REPLAY_WINDOW_SECONDS = 5 * 60;

function stripWhsecPrefix(raw) {
	return raw.startsWith('whsec_') ? raw.slice('whsec_'.length) : raw;
}

function verifyStandardWebhook({ signingKey, id, timestamp, body, headerSig }) {
	if (!signingKey || !id || !timestamp || !headerSig) return false;

	const tsNum = Number(timestamp);
	if (!Number.isFinite(tsNum)) return false;
	const skew = Math.abs(Math.floor(Date.now() / 1000) - tsNum);
	if (skew > REPLAY_WINDOW_SECONDS) return false;

	const signed = `${id}.${timestamp}.${body}`;
	const expected = createHmac('sha256', Buffer.from(signingKey, 'base64'))
		.update(signed)
		.digest('base64');

	// Header value: "v1,<sig> v1,<sig>" — multiple sigs separated by space to
	// support rotation. Match if any v1 entry matches.
	for (const entry of String(headerSig).split(/\s+/)) {
		const [version, sig] = entry.split(',', 2);
		if (version !== 'v1' || !sig) continue;
		const a = Buffer.from(sig);
		const b = Buffer.from(expected);
		if (a.length === b.length && timingSafeEqual(a, b)) return true;
	}
	return false;
}

// Replicate serves prediction outputs from its own delivery hosts. Pin the
// fetched GLB URL to https on one of those hosts so a forged/compromised payload
// can't point the server-side fetch at an internal/metadata endpoint (SSRF).
const REPLICATE_RESULT_HOSTS = [
	'replicate.delivery',
	'replicate.com',
	'pbxt.replicate.delivery',
];

function isAllowedResultUrl(raw) {
	let u;
	try {
		u = new URL(raw);
	} catch {
		return false;
	}
	if (u.protocol !== 'https:') return false;
	const host = u.hostname.toLowerCase();
	return REPLICATE_RESULT_HOSTS.some((h) => host === h || host.endsWith(`.${h}`));
}

function extractGlbUrl(output) {
	if (!output) return null;
	if (typeof output === 'string') return output;
	if (Array.isArray(output)) {
		for (const v of output) {
			if (typeof v === 'string' && /\.glb(\?|$)/i.test(v)) return v;
		}
		for (const v of output) {
			if (typeof v === 'string' && /^https?:\/\//.test(v)) return v;
		}
	}
	if (typeof output === 'object') {
		for (const key of ['glb', 'mesh', 'mesh_url', 'output_url', 'url', 'model']) {
			if (typeof output[key] === 'string') return output[key];
		}
	}
	return null;
}

function translateStatus(s) {
	switch (s) {
		case 'starting':
		case 'queued':     return 'queued';
		case 'processing': return 'running';
		case 'succeeded':  return 'done';
		case 'failed':
		case 'canceled':   return 'failed';
		default:           return 'queued';
	}
}

async function readRaw(req, limit = 1_000_000) {
	const chunks = [];
	let total = 0;
	return new Promise((resolve, reject) => {
		req.on('data', (c) => {
			total += c.length;
			if (total > limit) {
				reject(Object.assign(new Error('payload too large'), { status: 413 }));
				req.destroy();
				return;
			}
			chunks.push(c);
		});
		req.on('end', () => resolve(Buffer.concat(chunks)));
		req.on('error', reject);
	});
}

export default wrap(async (req, res) => {
	if (!method(req, res, ['POST'])) return;

	const raw = await readRaw(req);
	const bodyText = raw.toString('utf8');

	const signingKey = process.env.REPLICATE_WEBHOOK_SIGNING_KEY
		? stripWhsecPrefix(process.env.REPLICATE_WEBHOOK_SIGNING_KEY)
		: null;

	const id        = req.headers['webhook-id'];
	const timestamp = req.headers['webhook-timestamp'];
	const headerSig = req.headers['webhook-signature'];

	let verified = false;
	if (signingKey) {
		verified = verifyStandardWebhook({ signingKey, id, timestamp, body: bodyText, headerSig });
		if (!verified) {
			return error(res, 401, 'invalid_signature', 'webhook signature mismatch');
		}
	} else {
		// Fail closed: an unsigned webhook is forgeable (spoofed job completion +
		// server-side SSRF fetch). Only accept it in dev when explicitly opted in.
		const allowUnsigned =
			process.env.NODE_ENV !== 'production' && process.env.ALLOW_UNSIGNED_WEBHOOKS === '1';
		if (!allowUnsigned) {
			return error(res, 401, 'unsigned_webhook', 'webhook signing key not configured');
		}
	}

	let prediction;
	try {
		prediction = JSON.parse(bodyText);
	} catch {
		return error(res, 400, 'invalid_json', 'body is not JSON');
	}

	const extJobId = prediction?.id;
	if (!extJobId) return error(res, 400, 'invalid_payload', 'missing prediction id');

	// Look up our job row keyed by the external prediction id. The regenerate
	// endpoint inserts (job_id, ext_job_id) at submission time so this is a
	// simple equality match. Skip silently if the prediction isn't ours —
	// other Replicate apps in the same account can land here harmlessly.
	const rows = await sql`
		select job_id, user_id, status, result_avatar_id, mode, params
		from avatar_regen_jobs
		where ext_job_id = ${extJobId}
		limit 1
	`;
	if (!rows[0]) return json(res, 200, { ok: true, ignored: 'no matching job' });
	const job = rows[0];

	const nextStatus = translateStatus(prediction?.status);
	const nextGlbUrl = nextStatus === 'done' ? extractGlbUrl(prediction?.output) : null;
	const nextError  = nextStatus === 'failed'
		? String(prediction?.error || 'replicate reported failure')
		: null;

	await sql`
		update avatar_regen_jobs
		set status = ${nextStatus},
		    result_glb_url = ${nextGlbUrl},
		    error = ${nextError},
		    updated_at = now()
		where job_id = ${job.job_id}
	`;

	// Finalize inline when this is a reconstruct job that just succeeded — the
	// user's status poll then sees resultAvatarId (or the 'rigging' stage) on its
	// next hit instead of waiting a round-trip. The shared stage handles the
	// rig-or-materialize decision, identical to the poll path, so the two never
	// drift. isAllowedResultUrl pins the fetch to Replicate's delivery hosts
	// (SSRF guard) before we hand the URL off.
	if (
		nextStatus === 'done' &&
		nextGlbUrl &&
		isAllowedResultUrl(nextGlbUrl) &&
		job.mode === 'reconstruct' &&
		!job.result_avatar_id
	) {
		try {
			await finalizeReconstructStage({
				userId: job.user_id,
				jobId: job.job_id,
				job: { ...job, provider: 'replicate' },
				glbUrl: nextGlbUrl,
			});
		} catch (err) {
			// Finalize failure isn't fatal for the webhook ack — the next
			// /regenerate-status poll will retry the materialize/rig path.
			console.warn('[replicate-webhook] finalize failed', { jobId: job.job_id, error: err?.message });
		}
	}

	return json(res, 200, { ok: true, verified, jobId: job.job_id, status: nextStatus });
});

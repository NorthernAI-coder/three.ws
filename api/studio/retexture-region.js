// Magic Brush — local region retexture.
//
//   POST /api/studio/retexture-region   submit a masked region edit → { job }
//   GET  /api/studio/retexture-region?job=<token>   poll → { status, result_url? }
//
// Repaints ONLY the masked UV region of an existing texture from a prompt and/or
// colour, preserving the rest of the surface and feathering the seam. The heavy
// SDXL inpainting runs on the GCP texture worker (workers/texture/main.py,
// /retexture_region); this endpoint is the thin, auth'd, SSRF-guarded gateway.
//
// Stateless jobs: the worker task handle (mode + taskId + worker baseUrl) is
// packed into the opaque `job` token the provider returns. We hand that straight
// back to the client and, on status, re-validate that its baseUrl is the worker
// we actually configured before polling — so a forged token can never steer the
// server's fetch at an attacker-chosen host (no SSRF, no DB row needed).

import { cors, json, method, readJson, wrap, error } from '../_lib/http.js';
import { getSessionUser, authenticateBearer, extractBearer, hasScope } from '../_lib/auth.js';
import { limits } from '../_lib/rate-limit.js';
import { assertSafePublicUrl } from '../_lib/ssrf-guard.js';
import { createRegenProvider } from '../_providers/gcp.js';
import { parse } from '../_lib/validate.js';
import { z } from 'zod';

const MODE = 'retex_region';

// Mask is a small 1-channel PNG; base64 of a 1024² mask is well under 1 MB even
// when busy. Cap generously and let readJson enforce the transport ceiling.
const MAX_MASK_B64 = 10 * 1024 * 1024;

const submitSchema = z
	.object({
		mesh_url: z.string().trim().url().max(2048),
		prompt: z.string().trim().max(500).optional().default(''),
		negative_prompt: z.string().trim().max(300).optional(),
		mask_b64: z.string().min(1).max(MAX_MASK_B64),
		color: z
			.string()
			.trim()
			.regex(/^#?[0-9a-fA-F]{3}([0-9a-fA-F]{3})?$/, 'color must be a hex value')
			.optional(),
		texture_size: z
			.union([z.literal(512), z.literal(1024), z.literal(2048)])
			.optional()
			.default(1024),
		strength: z.number().min(0.2).max(1).optional().default(0.85),
		feather: z.number().int().min(1).max(128).optional().default(24),
		seed: z.number().int().min(0).max(2 ** 31).optional().default(0),
	})
	.refine((b) => b.prompt.length >= 3 || !!b.color, {
		message: 'provide a prompt (3+ chars) and/or a color',
	});

async function resolveUser(req, scope) {
	const session = await getSessionUser(req);
	if (session) return session.id;
	const bearer = await authenticateBearer(extractBearer(req));
	if (bearer && hasScope(bearer.scope, scope)) return bearer.userId;
	return null;
}

function getProviderOr501(res) {
	try {
		return createRegenProvider();
	} catch (err) {
		error(
			res,
			501,
			'region_retex_unconfigured',
			'Region retexture requires the GCP texture worker. Set GCP_RECONSTRUCTION_KEY and GCP_TEXTURE_URL.',
			{ reason: err.message },
		);
		return null;
	}
}

// Re-validate that an opaque job token points at THE worker we configured, not
// an attacker-supplied URL. Returns true when safe to poll.
function tokenTargetsOurWorker(token) {
	try {
		const job = JSON.parse(Buffer.from(String(token), 'base64url').toString('utf8'));
		if (job?.mode !== MODE || !job?.baseUrl) return false;
		const configured = (process.env.GCP_TEXTURE_URL || '').replace(/\/$/, '');
		if (!configured) return false;
		return String(job.baseUrl).replace(/\/$/, '') === configured;
	} catch {
		return false;
	}
}

async function handleSubmit(req, res) {
	const userId = await resolveUser(req, 'avatars:write');
	if (!userId) return error(res, 401, 'unauthorized', 'sign in or provide a valid bearer token');

	const rl = await limits.upload(userId);
	if (!rl.success) return error(res, 429, 'rate_limited', 'too many requests — try again shortly');

	const body = parse(submitSchema, await readJson(req, 12 * 1024 * 1024));

	// The worker fetches the mesh server-side; validate it resolves to a public
	// host before we hand it off (the worker re-checks, but fail fast + clearly).
	try {
		await assertSafePublicUrl(body.mesh_url, { allowHttp: false });
	} catch {
		return error(res, 400, 'invalid_mesh_url', 'mesh_url must be a public https URL');
	}

	const provider = getProviderOr501(res);
	if (!provider) return;

	let submission;
	try {
		submission = await provider.submit({
			mode: MODE,
			sourceUrl: body.mesh_url,
			params: {
				prompt: body.prompt,
				negative_prompt: body.negative_prompt,
				mask_b64: body.mask_b64,
				color: body.color || null,
				texture_size: body.texture_size,
				strength: body.strength,
				feather: body.feather,
				seed: body.seed,
			},
		});
	} catch (err) {
		return error(
			res,
			err.status || 502,
			err.code || 'provider_error',
			err.message || 'texture worker rejected the job',
		);
	}

	return json(res, 202, {
		ok: true,
		job: submission.extJobId,
		status: 'queued',
		eta: submission.eta ?? null,
	});
}

async function handleStatus(req, res) {
	const userId = await resolveUser(req, 'avatars:read');
	if (!userId) return error(res, 401, 'unauthorized', 'sign in or provide a valid bearer token');

	const url = new URL(req.url, 'http://x');
	const token = url.searchParams.get('job');
	if (!token) return error(res, 400, 'invalid_request', 'job token required');
	if (!tokenTargetsOurWorker(token)) {
		return error(res, 400, 'invalid_job', 'job token is malformed or not recognized');
	}

	const provider = getProviderOr501(res);
	if (!provider) return;

	let update;
	try {
		update = await provider.status(token);
	} catch (err) {
		return error(res, 502, 'provider_error', err.message || 'status poll failed');
	}

	return json(res, 200, {
		ok: true,
		status: update.status,
		result_url: update.resultGlbUrl ?? null,
		error: update.error ?? null,
	});
}

export default wrap(async (req, res) => {
	if (cors(req, res, { methods: 'GET,POST,OPTIONS', credentials: true })) return;
	if (!method(req, res, ['GET', 'POST'])) return;
	if (req.method === 'POST') return handleSubmit(req, res);
	return handleStatus(req, res);
});

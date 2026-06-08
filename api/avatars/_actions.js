// Private module: avatar action endpoints dispatched from [id].js.
// presign, public, regenerate, regenerate-status

import { getSessionUser, authenticateBearer, extractBearer, hasScope } from '../_lib/auth.js';
import { presignUpload, headObject, r2, publicUrl, putObject } from '../_lib/r2.js';
import { storageKeyFor, enforceQuotas, searchPublicAvatars, stripOwnerFor } from '../_lib/avatars.js';
import { listAvatars } from '../_lib/avatars.js';
import { env } from '../_lib/env.js';
import { sql } from '../_lib/db.js';
import { cors, json, method, readJson, wrap, error, rateLimited } from '../_lib/http.js';
import { parse, presignUploadBody, slug as slugSchema, createAvatarBody } from '../_lib/validate.js';
import { recordEvent } from '../_lib/usage.js';
import { limits, clientIp } from '../_lib/rate-limit.js';
import { requireCsrf } from '../_lib/csrf.js';
import { z } from 'zod';
import { randomUUID } from 'crypto';
import { isValidGlbHeader } from '../_lib/glb-inspect.js';
import { getRegenProvider } from '../_lib/regen-provider.js';
import { finalizeReconstructStage, pollRiggingStage } from '../_lib/reconstruct-finalize.js';
import { textToImage } from '../_mcp3d/text-to-image.js';

// ── presign ───────────────────────────────────────────────────────────────────

async function resolvePresignUser(req, requiredScope) {
	const session = await getSessionUser(req);
	if (session) return session.id;
	const bearer = await authenticateBearer(extractBearer(req), { audience: undefined });
	if (!bearer || !hasScope(bearer.scope, requiredScope)) return null;
	return bearer.userId;
}

const handlePresign = wrap(async (req, res) => {
	if (cors(req, res, { methods: 'POST,OPTIONS', credentials: true })) return;
	if (!method(req, res, ['POST'])) return;
	const userId = await resolvePresignUser(req, 'avatars:write');
	if (!userId) return error(res, 401, 'unauthorized', 'sign in or provide a valid bearer token');
	const rl = await limits.upload(userId);
	if (!rl.success) return rateLimited(res, rl, 'upload rate exceeded');
	const body = parse(presignUploadBody, await readJson(req));
	try { await enforceQuotas(userId, body.size_bytes); }
	catch (err) { return error(res, err.status || 402, err.code || 'plan_limit', err.message); }
	const bodyAny = body;
	const slug = bodyAny.slug ? slugSchema.parse(bodyAny.slug) : `draft-${Math.random().toString(36).slice(2, 8)}`;
	const key = storageKeyFor({ userId, slug });
	const url = await presignUpload({ key, contentType: body.content_type });
	return json(res, 200, { storage_key: key, upload_url: url, method: 'PUT', headers: { 'content-type': body.content_type }, expires_in: 300 });
});

// ── upload proxy ──────────────────────────────────────────────────────────────
// Server-side upload fallback for environments where direct browser→R2 PUT is
// blocked (Codespaces previews, ephemeral domains not in the bucket CORS
// allowlist, restrictive corporate networks). The client streams the GLB to
// this endpoint and we PUT it to R2 server-side using already-authenticated
// S3 credentials. Same quotas, same key naming as presign — only the wire path
// differs. Used by account.js after a CORS-blocked presigned PUT.
//
// Body: raw octet stream (the GLB bytes). Metadata passed as query params so
// the body can be a single contiguous buffer:
//   ?slug=optional-slug&content_type=model/gltf-binary&sha256=hex-or-empty
//
// Vercel Pro caps Node function request bodies at 50 MB. Realistic avatars
// are 5–15 MB; the presign+direct path remains for anything larger.
const MAX_PROXY_UPLOAD_BYTES = 50 * 1024 * 1024;
const PROXY_CONTENT_TYPES = new Set([
	'model/gltf-binary',
	'application/octet-stream',
	'application/gltf-binary',
]);

const handleUpload = wrap(async (req, res) => {
	if (cors(req, res, { methods: 'POST,OPTIONS', credentials: true })) return;
	if (!method(req, res, ['POST'])) return;
	const userId = await resolvePresignUser(req, 'avatars:write');
	if (!userId) return error(res, 401, 'unauthorized', 'sign in or provide a valid bearer token');
	if (!(await requireCsrf(req, res, userId))) return;
	const rl = await limits.upload(userId);
	if (!rl.success) return rateLimited(res, rl, 'upload rate exceeded');

	const url = new URL(req.url, 'http://x');
	const rawContentType = url.searchParams.get('content_type') || req.headers['content-type'] || 'model/gltf-binary';
	const contentType = rawContentType.split(';')[0].trim().toLowerCase();
	if (!PROXY_CONTENT_TYPES.has(contentType)) {
		return error(res, 415, 'unsupported_media_type', `content_type must be one of: ${[...PROXY_CONTENT_TYPES].join(', ')}`);
	}

	// Two body modes:
	//   • source_url=<http(s) GLB URL> — we fetch the bytes server-side. This is
	//     the URL-import path: the browser can't fetch most avatar CDNs directly
	//     (CloudFront/Arweave/etc. send no CORS headers), so we pull it here where
	//     same-origin policy doesn't apply. SSRF-guarded against internal targets.
	//   • raw octet-stream body — the CORS-fallback path for client-held blobs.
	const sourceUrl = url.searchParams.get('source_url');
	let buffer;
	if (sourceUrl) {
		try {
			buffer = await fetchRemoteGlb(sourceUrl, MAX_PROXY_UPLOAD_BYTES);
		} catch (err) {
			return error(res, err.status || 502, err.code || 'fetch_failed', err.message || 'failed to fetch source URL');
		}
	} else {
		const declaredLength = Number(req.headers['content-length']);
		if (Number.isFinite(declaredLength) && declaredLength > MAX_PROXY_UPLOAD_BYTES) {
			return error(res, 413, 'payload_too_large', `body exceeds ${MAX_PROXY_UPLOAD_BYTES} bytes — use presigned upload for larger GLBs`);
		}
		try {
			buffer = await readRawBody(req, MAX_PROXY_UPLOAD_BYTES);
		} catch (err) {
			return error(res, err.status || 400, err.code || 'invalid_body', err.message || 'failed to read body');
		}
	}
	if (!buffer.length) return error(res, 400, 'empty_body', 'no bytes received');

	// GLB header (binary glTF 2.0 spec): 12 bytes of
	//   magic    uint32  0x46546C67  // 'glTF' little-endian
	//   version  uint32  must be 2
	//   length   uint32  total file length in bytes (must equal buffer length)
	// Catches mis-named uploads (JPEGs, HTML error pages, truncated files) and
	// sets the catalog up to only ever serve well-formed binary glTF.
	if (!isValidGlbHeader(buffer)) {
		return error(res, 415, 'invalid_glb', 'body is not a valid binary glTF 2.0 (GLB) — magic/version/length check failed');
	}

	try {
		await enforceQuotas(userId, buffer.length);
	} catch (err) {
		return error(res, err.status || 402, err.code || 'plan_limit', err.message);
	}

	const rawSlug = url.searchParams.get('slug');
	const slug = rawSlug ? slugSchema.parse(rawSlug) : `draft-${Math.random().toString(36).slice(2, 8)}`;
	const key = storageKeyFor({ userId, slug });

	const checksum = await sha256Hex(buffer);
	const claimedChecksum = (url.searchParams.get('sha256') || '').toLowerCase();
	if (claimedChecksum && claimedChecksum !== checksum) {
		return error(res, 400, 'checksum_mismatch', 'sha256 query param does not match received bytes');
	}

	await putObject({ key, body: buffer, contentType });

	return json(res, 200, {
		storage_key: key,
		size_bytes: buffer.length,
		content_type: contentType,
		checksum_sha256: checksum,
	});
});

// Fetch a remote GLB server-side for the URL-import flow. Guards against SSRF:
// the URL is attacker-controlled (any signed-in user can submit one), so we
// resolve every redirect hop's hostname to its IPs and reject anything that
// points at loopback, private, link-local, or cloud-metadata ranges before a
// single byte is read. Streamed with a hard byte cap and a wall-clock timeout.
const REMOTE_FETCH_TIMEOUT_MS = 20_000;
const MAX_REMOTE_REDIRECTS = 5;

async function fetchRemoteGlb(rawUrl, maxBytes) {
	let target;
	try {
		target = new URL(rawUrl);
	} catch {
		throw fetchError(400, 'invalid_url', 'source_url is not a valid URL');
	}
	const ac = new AbortController();
	const timer = setTimeout(() => ac.abort(), REMOTE_FETCH_TIMEOUT_MS);
	try {
		let resp;
		for (let hop = 0; hop <= MAX_REMOTE_REDIRECTS; hop++) {
			if (!['http:', 'https:'].includes(target.protocol)) {
				throw fetchError(400, 'unsupported_scheme', 'only http(s) URLs can be imported');
			}
			await assertPublicHost(target.hostname);
			resp = await fetch(target.href, {
				redirect: 'manual',
				signal: ac.signal,
				headers: { accept: 'model/gltf-binary,application/octet-stream,*/*' },
			});
			if (resp.status >= 300 && resp.status < 400 && resp.headers.get('location')) {
				if (hop === MAX_REMOTE_REDIRECTS) throw fetchError(502, 'too_many_redirects', 'source URL redirected too many times');
				target = new URL(resp.headers.get('location'), target);
				continue;
			}
			break;
		}
		if (!resp.ok) throw fetchError(502, 'fetch_failed', `source URL returned HTTP ${resp.status}`);

		const declared = Number(resp.headers.get('content-length'));
		if (Number.isFinite(declared) && declared > maxBytes) {
			throw fetchError(413, 'payload_too_large', `source file is ${declared} bytes — max ${maxBytes}`);
		}

		const reader = resp.body?.getReader();
		if (!reader) throw fetchError(502, 'empty_body', 'source URL returned no body');
		const chunks = [];
		let total = 0;
		for (;;) {
			const { done, value } = await reader.read();
			if (done) break;
			total += value.length;
			if (total > maxBytes) {
				await reader.cancel();
				throw fetchError(413, 'payload_too_large', `source file exceeds ${maxBytes} bytes`);
			}
			chunks.push(value);
		}
		return Buffer.concat(chunks.map((c) => Buffer.from(c)));
	} catch (err) {
		if (err.code && err.status) throw err;
		if (err.name === 'AbortError') throw fetchError(504, 'fetch_timeout', 'source URL timed out');
		throw fetchError(502, 'fetch_failed', err.message || 'failed to fetch source URL');
	} finally {
		clearTimeout(timer);
	}
}

function fetchError(status, code, message) {
	const err = new Error(message);
	err.status = status;
	err.code = code;
	return err;
}

// Reject hostnames that resolve to non-public address space (SSRF defense).
async function assertPublicHost(hostname) {
	const host = hostname.replace(/^\[|\]$/g, '').toLowerCase();
	if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.internal') || host.endsWith('.local')) {
		throw fetchError(400, 'blocked_host', 'source_url host is not allowed');
	}
	const { lookup } = await import('dns/promises');
	let records;
	try {
		records = await lookup(host, { all: true });
	} catch {
		throw fetchError(400, 'dns_failure', 'could not resolve source_url host');
	}
	for (const { address } of records) {
		if (isPrivateAddress(address)) {
			throw fetchError(400, 'blocked_host', 'source_url resolves to a non-public address');
		}
	}
}

function isPrivateAddress(ip) {
	if (ip.includes(':')) {
		const v6 = ip.toLowerCase();
		if (v6 === '::1' || v6 === '::') return true;
		if (v6.startsWith('fe80') || v6.startsWith('fc') || v6.startsWith('fd')) return true;
		// IPv4-mapped IPv6 (::ffff:a.b.c.d) — unwrap and re-check.
		const mapped = v6.match(/::ffff:(\d+\.\d+\.\d+\.\d+)$/);
		if (mapped) return isPrivateAddress(mapped[1]);
		return false;
	}
	const p = ip.split('.').map(Number);
	if (p.length !== 4 || p.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return true;
	const [a, b] = p;
	if (a === 0 || a === 10 || a === 127) return true;
	if (a === 169 && b === 254) return true; // link-local incl. 169.254.169.254 metadata
	if (a === 172 && b >= 16 && b <= 31) return true;
	if (a === 192 && b === 168) return true;
	if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
	if (a >= 224) return true; // multicast / reserved
	return false;
}

function readRawBody(req, limit) {
	return new Promise((resolve, reject) => {
		const chunks = [];
		let total = 0;
		req.on('data', (chunk) => {
			total += chunk.length;
			if (total > limit) {
				const err = new Error(`body exceeds ${limit} bytes`);
				err.status = 413;
				err.code = 'payload_too_large';
				reject(err);
				req.destroy();
				return;
			}
			chunks.push(chunk);
		});
		req.on('end', () => resolve(Buffer.concat(chunks)));
		req.on('error', reject);
	});
}

async function sha256Hex(buf) {
	const { createHash } = await import('crypto');
	return createHash('sha256').update(buf).digest('hex');
}

// ── public ────────────────────────────────────────────────────────────────────

// Public discovery surface — must always return 200 with a stable JSON shape so
// agent crawlers, OpenAPI probes, and the Bazaar validator see a clean response
// even when the DB is unreachable or the query parameters are malformed. Any
// internal failure degrades to an empty result set rather than a 5xx.
const handlePublic = wrap(async (req, res) => {
	if (cors(req, res, { methods: 'GET,OPTIONS', origins: '*' })) return;
	if (!method(req, res, ['GET'])) return;
	const url = new URL(req.url, 'http://x');
	const parsedLimit = Number(url.searchParams.get('limit'));
	const limit = Number.isFinite(parsedLimit) && parsedLimit > 0 ? parsedLimit : 24;
	let result;
	try {
		result = await searchPublicAvatars({
			q: url.searchParams.get('q') || undefined,
			tag: url.searchParams.get('tag') || undefined,
			limit,
			cursor: url.searchParams.get('cursor') || undefined,
			withTotals: url.searchParams.get('totals') === '1',
		});
	} catch {
		result = { avatars: [], next_cursor: null };
	}
	const avatars = Array.isArray(result?.avatars) ? result.avatars : [];
	const payload = {
		avatars: avatars.map((a) => stripOwnerFor(a, null)),
		next_cursor: result?.next_cursor ?? null,
	};
	if (Object.prototype.hasOwnProperty.call(result || {}, 'total')) {
		payload.total = result.total;
		payload.total_views = result.total_views;
	}
	res.setHeader('cache-control', 'public, max-age=60, s-maxage=60');
	return json(res, 200, payload);
});

// ── regenerate ────────────────────────────────────────────────────────────────

const regenerateSchema = z.object({
	sourceAvatarId: z.string().trim().min(1).max(100),
	mode: z.enum(['remesh', 'retex', 'rerig', 'restyle', 'reconstruct']),
	params: z.record(z.unknown()).optional(),
});

async function resolveRegenUser(req) {
	const session = await getSessionUser(req);
	const bearer = session ? null : await authenticateBearer(extractBearer(req));
	if (!session && !bearer) return null;
	if (bearer && !hasScope(bearer.scope, 'avatars:write')) return null;
	return session?.id ?? bearer?.userId;
}

const handleRegenerate = wrap(async (req, res) => {
	if (cors(req, res, { methods: 'POST,OPTIONS', credentials: true })) return;
	if (!method(req, res, ['POST'])) return;
	const userId = await resolveRegenUser(req);
	if (!userId) return error(res, 401, 'unauthorized', 'sign in or provide a valid bearer token');
	const rl = await limits.upload(userId);
	if (!rl.success) return rateLimited(res, rl);
	const body = parse(regenerateSchema, await readJson(req));
	const rows = await sql`select id, name, storage_key from avatars where id = ${body.sourceAvatarId} and owner_id = ${userId} and deleted_at is null limit 1`;
	if (!rows[0]) return error(res, 404, 'not_found', 'source avatar not found or not owned');

	let provider;
	try {
		provider = await getRegenProvider();
	} catch (err) {
		return error(res, err.status || 501, err.code || 'regen_provider_error', err.message);
	}

	if (provider.name === 'none') {
		return error(
			res,
			501,
			'regen_unconfigured',
			'Avatar regeneration requires a configured backend. Set AVATAR_REGEN_PROVIDER and the matching API token (REPLICATE_API_TOKEN, HF_TOKEN, or GCP_RECONSTRUCTION_URL).',
		);
	}

	// Real provider — submit the job, persist the external id.
	const sourceUrl = publicUrl(rows[0].storage_key);
	let submission;
	try {
		submission = await provider.instance.submit({
			userId,
			sourceAvatarId: body.sourceAvatarId,
			mode: body.mode,
			params: body.params ?? {},
			sourceUrl,
			sourceStorageKey: rows[0].storage_key,
		});
	} catch (err) {
		return error(
			res,
			err.status || 502,
			err.code || 'regen_provider_error',
			err.message || 'provider rejected submission',
		);
	}

	const jobId = `${provider.name}-${randomUUID()}`;
	await sql`
		insert into avatar_regen_jobs
			(job_id, user_id, source_avatar_id, mode, params, status, provider, ext_job_id, created_at, updated_at)
		values
			(${jobId}, ${userId}, ${body.sourceAvatarId}, ${body.mode}, ${JSON.stringify(body.params ?? {})}, 'queued', ${provider.name}, ${submission.extJobId ?? null}, now(), now())
	`;
	return json(res, 202, {
		ok: true,
		jobId,
		status: 'queued',
		eta: submission.eta ?? null,
		provider: provider.name,
	});
});

// ── regenerate-status ─────────────────────────────────────────────────────────

const handleRegenerateStatus = wrap(async (req, res) => {
	if (cors(req, res, { methods: 'GET,OPTIONS', credentials: true })) return;
	if (!method(req, res, ['GET'])) return;
	const session = await getSessionUser(req);
	const bearer = session ? null : await authenticateBearer(extractBearer(req));
	if (!session && !bearer) return error(res, 401, 'unauthorized', 'sign in or provide a valid bearer token');
	if (bearer && !hasScope(bearer.scope, 'avatars:read')) return error(res, 403, 'insufficient_scope', 'avatars:read scope required');
	const userId = session?.id ?? bearer?.userId;
	const url = new URL(req.url, 'http://x');
	const jobId = url.searchParams.get('jobId');
	if (!jobId) return error(res, 400, 'invalid_request', 'jobId required');
	const rows = await sql`
		select job_id, status, result_avatar_id, result_glb_url, error, provider, ext_job_id, created_at,
		       mode, params, source_avatar_id
		from avatar_regen_jobs
		where job_id = ${jobId} and user_id = ${userId}
		limit 1
	`;
	if (!rows[0]) return error(res, 404, 'not_found', 'job not found');
	let job = rows[0];

	// Pull a fresh status from the provider when the job is still in flight
	// and we have an external id to query. The status endpoint serves as our
	// poll trigger — no separate cron needed for short-lived jobs.
	if ((job.status === 'queued' || job.status === 'running') && job.provider && job.ext_job_id) {
		try {
			const provider = await getRegenProvider();
			if (provider.instance) {
				const update = await provider.instance.status(job.ext_job_id);
				const nextStatus = update.status;
				const nextResultUrl = update.resultGlbUrl ?? null;
				const nextError = update.error ?? null;
				if (
					nextStatus !== job.status ||
					nextResultUrl !== job.result_glb_url ||
					nextError !== job.error
				) {
					await sql`
						update avatar_regen_jobs
						set status = ${nextStatus},
							result_glb_url = ${nextResultUrl},
							error = ${nextError},
							updated_at = now()
						where job_id = ${jobId} and user_id = ${userId}
					`;
					job = {
						...job,
						status: nextStatus,
						result_glb_url: nextResultUrl,
						error: nextError,
					};
				}
			}
		} catch (err) {
			// Surface the polling error but don't fail the request — the job
			// row stays as-is and the client can retry later.
			job = { ...job, error: job.error || `provider poll failed: ${err?.message}` };
		}
	}

	// Stage 2 — the reconstructed mesh was bare and we kicked off an auto-rig
	// job. Poll that child job; the shared stage swaps in the rigged GLB when it
	// lands, or falls back to the bare mesh so the user is never left empty.
	if (job.status === 'rigging' && job.mode === 'reconstruct' && !job.result_avatar_id) {
		try {
			const result = await pollRiggingStage({ userId, jobId, job });
			job = { ...job, status: result.status, result_avatar_id: result.resultAvatarId ?? job.result_avatar_id };
		} catch (err) {
			job = { ...job, error: job.error || `rig stage failed: ${err?.message}` };
		}
	}

	// Stage 1 — the reconstruct job finished successfully but isn't materialized
	// yet. The shared stage copies the GLB into R2 and either creates the avatar
	// immediately or, when the mesh is unrigged and a rig model is configured,
	// chains a rigging job and moves us into 'rigging' (handled above next poll).
	if (
		job.status === 'done' &&
		job.mode === 'reconstruct' &&
		!job.result_avatar_id &&
		!job.source_avatar_id &&
		job.result_glb_url
	) {
		try {
			const result = await finalizeReconstructStage({ userId, jobId, job, glbUrl: job.result_glb_url });
			job = { ...job, status: result.status, result_avatar_id: result.resultAvatarId ?? job.result_avatar_id };
		} catch (err) {
			job = { ...job, error: job.error || `materialize failed: ${err?.message}` };
		}
	}

	const response = { ok: true, jobId: job.job_id, status: job.status };
	if (job.result_avatar_id) response.resultAvatarId = job.result_avatar_id;
	if (job.result_glb_url) response.resultGlbUrl = job.result_glb_url;
	if (job.error) response.error = job.error;
	if (job.provider) response.provider = job.provider;
	return json(res, 200, response);
});

// ── presign-thumbnail ─────────────────────────────────────────────────────────
// Called by the browser after rendering a GLB preview via <model-viewer>.
// The client captures toBlob() and uploads the PNG here, then PATCHes the
// avatar record with the resulting thumbnail_key.

const thumbnailPresignSchema = z.object({
	avatar_id: z.string().uuid(),
	size_bytes: z.number().int().min(1).max(2 * 1024 * 1024), // 2 MB max for a PNG thumb
});

const handlePresignThumbnail = wrap(async (req, res) => {
	if (cors(req, res, { methods: 'POST,OPTIONS', credentials: true })) return;
	if (!method(req, res, ['POST'])) return;
	const userId = await resolvePresignUser(req, 'avatars:write');
	if (!userId) return error(res, 401, 'unauthorized', 'sign in or provide a valid bearer token');

	const body = parse(thumbnailPresignSchema, await readJson(req));

	// Verify caller owns the avatar they're thumbnailing.
	const rows = await (await import('../_lib/db.js')).sql`
		select id, storage_key from avatars
		where id = ${body.avatar_id} and owner_id = ${userId} and deleted_at is null
		limit 1
	`;
	if (!rows[0]) return error(res, 404, 'not_found', 'avatar not found or not yours');

	// Thumbnail key: same prefix as the GLB, different suffix.
	const thumbKey = rows[0].storage_key.replace(/\.glb$/i, '') + '_thumb.jpg';
	const uploadUrl = await presignUpload({ key: thumbKey, contentType: 'image/jpeg' });

	return json(res, 200, {
		thumb_key: thumbKey,
		upload_url: uploadUrl,
		method: 'PUT',
		headers: { 'content-type': 'image/jpeg' },
		expires_in: 300,
	});
});

// ── presign-usdz ──────────────────────────────────────────────────────────────
// Called by the browser after a GLB upload completes. The client converts the
// GLB → USDZ in-memory via three's USDZExporter and PUTs it to R2 here, then
// PATCHes the avatar row with the returned usdz_key. Enables iOS Quick Look
// for every avatar without an external USDZ source.

const usdzPresignSchema = z.object({
	avatar_id: z.string().uuid(),
	size_bytes: z.number().int().min(1).max(50 * 1024 * 1024), // 50 MB cap — USDZ is larger than GLB
});

const handlePresignUsdz = wrap(async (req, res) => {
	if (cors(req, res, { methods: 'POST,OPTIONS', credentials: true })) return;
	if (!method(req, res, ['POST'])) return;
	const userId = await resolvePresignUser(req, 'avatars:write');
	if (!userId) return error(res, 401, 'unauthorized', 'sign in or provide a valid bearer token');

	const body = parse(usdzPresignSchema, await readJson(req));

	const rows = await sql`
		select id, storage_key from avatars
		where id = ${body.avatar_id} and owner_id = ${userId} and deleted_at is null
		limit 1
	`;
	if (!rows[0]) return error(res, 404, 'not_found', 'avatar not found or not yours');

	const usdzKey = rows[0].storage_key.replace(/\.glb$/i, '') + '.usdz';
	const uploadUrl = await presignUpload({ key: usdzKey, contentType: 'model/vnd.usdz+zip' });

	return json(res, 200, {
		usdz_key: usdzKey,
		upload_url: uploadUrl,
		method: 'PUT',
		headers: { 'content-type': 'model/vnd.usdz+zip' },
		expires_in: 300,
	});
});

// ── presign-halfbody ──────────────────────────────────────────────────────────
// Half-body (waist-up) GLB variant used in VR / first-person seats. Generated
// client-side by stripping the lower-body bone hierarchy + skinned mesh from
// the source avatar. Uploaded here, then PATCHed onto the avatar row.

const halfbodyPresignSchema = z.object({
	avatar_id: z.string().uuid(),
	size_bytes: z.number().int().min(1).max(25 * 1024 * 1024),
});

const handlePresignHalfbody = wrap(async (req, res) => {
	if (cors(req, res, { methods: 'POST,OPTIONS', credentials: true })) return;
	if (!method(req, res, ['POST'])) return;
	const userId = await resolvePresignUser(req, 'avatars:write');
	if (!userId) return error(res, 401, 'unauthorized', 'sign in or provide a valid bearer token');

	const body = parse(halfbodyPresignSchema, await readJson(req));

	const rows = await sql`
		select id, storage_key from avatars
		where id = ${body.avatar_id} and owner_id = ${userId} and deleted_at is null
		limit 1
	`;
	if (!rows[0]) return error(res, 404, 'not_found', 'avatar not found or not yours');

	const halfKey = rows[0].storage_key.replace(/\.glb$/i, '') + '_halfbody.glb';
	const uploadUrl = await presignUpload({ key: halfKey, contentType: 'model/gltf-binary' });

	return json(res, 200, {
		halfbody_key: halfKey,
		upload_url: uploadUrl,
		method: 'PUT',
		headers: { 'content-type': 'model/gltf-binary' },
		expires_in: 300,
	});
});

// ── auto-tag ──────────────────────────────────────────────────────────────────
// Called after thumbnail upload; sends the poster to Claude vision for
// auto-generated tags and a one-line description. Non-blocking — a failure
// here must never fail the upload flow.

const autoTagSchema = z.object({
	avatar_id: z.string().uuid(),
	thumb_key: z.string().min(1).max(512),
});

const AVATAR_TAG_PROMPT = `You are a 3D avatar classification assistant.
Given a screenshot of a 3D avatar, respond with ONLY a JSON object:
{
  "tags": [3-6 tags from: humanoid, robot, animal, vehicle, stylized, realistic, anime, creature, character, abstract, military, fantasy, sci-fi, casual, formal],
  "description": "One sentence describing this 3D avatar (20-60 words)."
}
Respond with nothing else — no markdown, no explanation.`;

// Classify an avatar thumbnail with a vision-capable model. Free OpenRouter
// vision is preferred (platform-funded); Anthropic is used only as a BYOK
// fallback when a server-side key is present. Throws { code: 'not_configured' }
// when no vision provider is available so the caller can skip silently.
async function classifyAvatarImage({ thumbUrl, prompt, env }) {
	if (env.OPENROUTER_API_KEY) {
		const r = await fetch('https://openrouter.ai/api/v1/chat/completions', {
			method: 'POST',
			headers: {
				'content-type': 'application/json',
				authorization: `Bearer ${env.OPENROUTER_API_KEY}`,
				'HTTP-Referer': 'https://three.ws',
				'X-Title': 'three.ws avatar auto-tag',
			},
			body: JSON.stringify({
				model: 'meta-llama/llama-3.2-11b-vision-instruct',
				max_tokens: 256,
				messages: [
					{
						role: 'user',
						content: [
							{ type: 'text', text: prompt },
							{ type: 'image_url', image_url: { url: thumbUrl } },
						],
					},
				],
			}),
		});
		if (!r.ok) throw Object.assign(new Error(`openrouter vision ${r.status}`), { code: 'vision_api_error' });
		const d = await r.json();
		return d.choices?.[0]?.message?.content || '';
	}
	if (env.ANTHROPIC_API_KEY) {
		const r = await fetch('https://api.anthropic.com/v1/messages', {
			method: 'POST',
			headers: {
				'content-type': 'application/json',
				'x-api-key': env.ANTHROPIC_API_KEY,
				'anthropic-version': '2023-06-01',
			},
			body: JSON.stringify({
				model: 'claude-haiku-4-5-20251001',
				max_tokens: 256,
				messages: [
					{
						role: 'user',
						content: [
							{ type: 'image', source: { type: 'url', url: thumbUrl } },
							{ type: 'text', text: prompt },
						],
					},
				],
			}),
		});
		if (!r.ok) throw Object.assign(new Error(`anthropic vision ${r.status}`), { code: 'vision_api_error' });
		const d = await r.json();
		return d.content?.[0]?.text || '';
	}
	throw Object.assign(new Error('no vision provider configured'), { code: 'not_configured' });
}

const handleAutoTag = wrap(async (req, res) => {
	if (cors(req, res, { methods: 'POST,OPTIONS', credentials: true })) return;
	if (!method(req, res, ['POST'])) return;
	const userId = await resolvePresignUser(req, 'avatars:write');
	if (!userId) return error(res, 401, 'unauthorized', 'sign in or provide a valid bearer token');

	const body = parse(autoTagSchema, await readJson(req));

	// Verify ownership.
	const { sql } = await import('../_lib/db.js');
	const rows = await sql`
		select id, name, tags, description, thumbnail_key
		from avatars where id = ${body.avatar_id} and owner_id = ${userId} and deleted_at is null
		limit 1
	`;
	if (!rows[0]) return error(res, 404, 'not_found', 'avatar not found');

	// Never trust thumb_key blindly: it is used for a server-side vision fetch and
	// written into avatars.thumbnail_key (which decorate() exposes as a public
	// URL). Restrict it to keys the caller can legitimately own — either their own
	// u/<userId>/ namespace, or the canonical thumb/<avatarId>.png slot for THIS
	// avatar (the shape thumbnail.js writes). Anything else would let one user
	// point the fetch at, and publicly disclose, another user's private object.
	const thumbKey = body.thumb_key;
	const ownsKey =
		thumbKey.startsWith(`u/${userId}/`) || thumbKey === `thumb/${body.avatar_id}.png`;
	if (!ownsKey) {
		return error(res, 400, 'invalid_storage_key', 'thumb_key must live under your namespace');
	}

	// Fetch the thumbnail from R2 for vision.
	const { publicUrl } = await import('../_lib/r2.js');
	const { env } = await import('../_lib/env.js');
	const thumbUrl = publicUrl(thumbKey);

	// Image classification needs a vision-capable model. Per platform policy
	// the free providers come first (OpenRouter hosts open vision models);
	// Anthropic is BYOK and only used when a server-side key is present. When
	// no vision provider is configured we skip auto-tagging rather than fail —
	// it is an enhancement, not a required step.
	let visionText;
	try {
		visionText = await classifyAvatarImage({ thumbUrl, prompt: AVATAR_TAG_PROMPT, env });
	} catch (err) {
		console.error('[auto-tag] vision error', err.message);
		return json(res, 200, { ok: false, reason: err.code || 'vision_api_error' });
	}

	let parsed;
	try {
		parsed = JSON.parse((visionText || '{}').trim());
	} catch {
		return json(res, 200, { ok: false, reason: 'parse_error' });
	}

	const newTags = Array.isArray(parsed.tags) ? parsed.tags.slice(0, 6) : [];
	const desc = typeof parsed.description === 'string' ? parsed.description.slice(0, 500) : '';

	// Only write if the avatar still has no tags/description (don't overwrite manual ones).
	const currentTags = rows[0].tags || [];
	const currentDesc = rows[0].description || '';

	const patch = {};
	if (!currentTags.length && newTags.length) patch.tags = newTags;
	if (!currentDesc && desc) patch.description = desc;
	// Always write thumbnail_key if not set yet — using the validated key only.
	if (!rows[0].thumbnail_key) patch.thumbnail_key = thumbKey;

	if (Object.keys(patch).length) {
		await sql`
			update avatars set
				tags        = coalesce(${patch.tags ?? null}::text[], tags),
				description = coalesce(${patch.description ?? null}, description),
				thumbnail_key = coalesce(${patch.thumbnail_key ?? null}, thumbnail_key),
				updated_at  = now()
			where id = ${body.avatar_id} and owner_id = ${userId}
		`;
	}

	return json(res, 200, { ok: true, tags: newTags, description: desc });
});

// ── reconstruct (Phase 1 — Selfie → Avatar engine) ────────────────────────────
// Submits a Replicate reconstruct job from selfie photos. No source avatar
// exists yet; the avatar row is materialized when the status handler observes
// a successful result and copies the generated GLB into R2.

// Photos may be either:
//   • http(s):// URL — typically an R2 object URL the client uploaded first
//   • data:image/...;base64,... — inline base64 (Replicate accepts these natively)
const photoUrlOrDataUri = z
	.string()
	.max(8 * 1024 * 1024) // generous cap to allow inline JPEGs up to ~6 MB pre-base64
	.refine(
		(v) =>
			/^https?:\/\//i.test(v) ||
			/^data:image\/(png|jpe?g|webp|heic|heif);base64,/i.test(v),
		'must be an http(s) URL or a data:image/* base64 URI',
	);

const reconstructSchema = z
	.object({
		name: z.string().trim().min(1).max(120),
		description: z.string().trim().max(500).optional(),
		photos: z.array(photoUrlOrDataUri).min(1).max(6).optional(),
		// Text → avatar: a prompt is turned into a clean frontal reference image
		// (Flux), which then feeds the exact same reconstruct → auto-rig pipeline
		// as a selfie. One of `photos` or `prompt` is required.
		prompt: z.string().trim().min(3).max(600).optional(),
		visibility: z.enum(['private', 'unlisted', 'public']).optional(),
		params: z.record(z.unknown()).optional(),
	})
	.refine((v) => (Array.isArray(v.photos) && v.photos.length > 0) || !!v.prompt, {
		message: 'provide either photos or a prompt',
		path: ['photos'],
	});

// Steer Flux toward a single, evenly-lit, full-figure humanoid on a plain
// background — that composition reconstructs and auto-rigs far more reliably
// than a busy scene — without overriding the user's own subject description.
const AVATAR_PROMPT_SUFFIX =
	', full body character, standing in a relaxed A-pose, facing forward, centered in frame, entire figure visible from head to feet, plain neutral studio background, soft even lighting, single subject, high detail, game-ready character render';

const handleReconstruct = wrap(async (req, res) => {
	if (cors(req, res, { methods: 'POST,OPTIONS', credentials: true })) return;
	if (!method(req, res, ['POST'])) return;
	const userId = await resolveRegenUser(req);
	if (!userId) return error(res, 401, 'unauthorized', 'sign in or provide a valid bearer token');
	const rl = await limits.upload(userId);
	if (!rl.success) return rateLimited(res, rl);
	const body = parse(reconstructSchema, await readJson(req));

	let provider;
	try {
		provider = await getRegenProvider();
	} catch (err) {
		return error(res, err.status || 501, err.code || 'regen_provider_error', err.message);
	}
	if (provider.name === 'none') {
		return error(
			res,
			501,
			'regen_unconfigured',
			'Avatar reconstruction requires a configured backend. Set AVATAR_REGEN_PROVIDER and the matching API token (REPLICATE_API_TOKEN, HF_TOKEN, or GCP_RECONSTRUCTION_URL).',
		);
	}

	// Text → avatar: turn the prompt into a frontal reference image, then treat
	// it exactly like a selfie. Done only once the reconstruct backend is known
	// to be live, so a configuration gap never burns a Flux generation.
	let photos = body.photos ?? null;
	let referenceImageUrl = null;
	if (!photos || !photos.length) {
		try {
			const generated = await textToImage(`${body.prompt}${AVATAR_PROMPT_SUFFIX}`, {
				aspectRatio: '2:3',
			});
			referenceImageUrl = generated.imageUrl;
			photos = [generated.imageUrl];
		} catch (err) {
			const unconfigured = err?.code === 'unconfigured';
			return error(
				res,
				unconfigured ? 501 : 502,
				unconfigured ? 'txt2img_unconfigured' : 'txt2img_error',
				err?.message || 'could not generate a reference image from your prompt',
			);
		}
	}

	let submission;
	try {
		submission = await provider.instance.submit({
			userId,
			mode: 'reconstruct',
			params: { ...(body.params ?? {}), images: photos, name: body.name },
			sourceUrl: photos[0],
		});
	} catch (err) {
		return error(
			res,
			err.status || 502,
			err.code || 'regen_provider_error',
			err.message || 'provider rejected submission',
		);
	}

	const jobId = `${provider.name}-${randomUUID()}`;
	const params = {
		images: photos,
		name: body.name,
		description: body.description ?? null,
		visibility: body.visibility ?? 'private',
		...(body.prompt
			? { source: 'prompt', prompt: body.prompt, referenceImageUrl }
			: {}),
	};
	await sql`
		insert into avatar_regen_jobs
			(job_id, user_id, source_avatar_id, mode, params, status, provider, ext_job_id, created_at, updated_at)
		values
			(${jobId}, ${userId}, ${null}, ${'reconstruct'}, ${JSON.stringify(params)}, 'queued', ${provider.name}, ${submission.extJobId ?? null}, now(), now())
	`;
	return json(res, 202, {
		ok: true,
		jobId,
		status: 'queued',
		eta: submission.eta ?? null,
		provider: provider.name,
	});
});

// ── dispatcher ────────────────────────────────────────────────────────────────

const DISPATCH = {
	presign:             handlePresign,
	upload:              handleUpload,
	'presign-thumbnail': handlePresignThumbnail,
	'presign-usdz':      handlePresignUsdz,
	'presign-halfbody':  handlePresignHalfbody,
	'auto-tag':          handleAutoTag,
	public:              handlePublic,
	reconstruct:         handleReconstruct,
	regenerate:          handleRegenerate,
	'regenerate-status': handleRegenerateStatus,
};

export function dispatch(action, req, res) {
	const fn = DISPATCH[action];
	if (!fn) return error(res, 404, 'not_found', `unknown avatar action: ${action}`);
	return fn(req, res);
}

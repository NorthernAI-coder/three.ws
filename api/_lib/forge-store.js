// Forge creation store — durable persistence + the text→3D data flywheel.
//
// /forge runs the real flux-schnell → TRELLIS pipeline (see api/forge.js) and
// hands back the Replicate delivery URL, which expires in ~1h. This module is
// the layer that makes a generator a *data engine*: it copies every generated
// mesh (and its reference image) into our own object storage so they're
// permanent, records the (prompt → image → mesh) pair, and captures the human
// verdict (kept / discarded / downloaded) — the labeled signal a future
// in-house model trains on.
//
// Every function is best-effort and fail-soft. /forge is auth-free and works on
// deployments without a database or object storage configured; when either is
// missing, these helpers no-op (return null/false/[]) and the endpoint falls
// back to returning the raw provider URL. Persistence is a bonus, never a gate.

import { createHash } from 'node:crypto';
import { randomUUID } from 'node:crypto';
import { sql } from './db.js';
import { putObject, publicUrl } from './r2.js';

// Stable, non-secret salt so a leaked DB row can't be trivially reversed to the
// raw browser-local id. The id is anonymous to begin with; this is hygiene, not
// a security boundary.
const CLIENT_SALT = 'forge:v1';

// Generations larger than this are almost certainly a runaway TRELLIS output;
// refuse to copy them into our bucket rather than ingest an unbounded blob.
const MAX_GLB_BYTES = 64 * 1024 * 1024;
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

// Forge persistence needs both a database (the creation rows) and object
// storage (durable copies). Detect from the raw env so a partially-configured
// deployment degrades to the stateless path instead of throwing on first use.
export function forgeStoreEnabled() {
	return Boolean(
		process.env.DATABASE_URL &&
			process.env.S3_ENDPOINT &&
			process.env.S3_BUCKET &&
			process.env.S3_PUBLIC_DOMAIN &&
			process.env.S3_ACCESS_KEY_ID &&
			process.env.S3_SECRET_ACCESS_KEY,
	);
}

// Hash a caller-supplied anonymous client id. Empty / missing ids collapse to a
// shared 'anon' bucket so the column is never null and gallery scoping is total.
export function hashClient(raw) {
	const value = typeof raw === 'string' ? raw.trim() : '';
	if (!value) return 'anon';
	return createHash('sha256').update(`${CLIENT_SALT}:${value}`).digest('hex');
}

export function hashIp(ip) {
	if (!ip) return null;
	return createHash('sha256').update(`${CLIENT_SALT}:ip:${ip}`).digest('hex');
}

// Record a generation the moment it starts, so the prompt + reference image are
// retained even if the mesh step later fails. Returns the new creation id (used
// as the durable object key and the client-facing handle) or null when the
// store is unavailable.
export async function createCreation({
	clientKey,
	ipHash,
	prompt,
	aspect,
	previewImageUrl,
	replicateJobId,
	textToImageModel,
	viewsRequested,
	viewsUsed,
	multiview,
	backend,
}) {
	if (!forgeStoreEnabled()) return null;
	const id = randomUUID();
	try {
		await sql`
			insert into forge_creations
				(id, client_key, ip_hash, prompt, aspect, preview_image_url,
				 replicate_job_id, text_to_image_model, views_requested, views_used,
				 multiview, backend, status, outcome)
			values
				(${id}, ${clientKey}, ${ipHash ?? null}, ${prompt}, ${aspect ?? null},
				 ${previewImageUrl ?? null}, ${replicateJobId ?? null},
				 ${textToImageModel ?? null}, ${viewsRequested ?? null}, ${viewsUsed ?? null},
				 ${typeof multiview === 'boolean' ? multiview : null}, ${backend ?? null},
				 'generating', 'generated')
		`;
		return id;
	} catch (err) {
		console.error('[forge-store] createCreation failed:', err?.message);
		return null;
	}
}

// Look up an in-flight creation by its TRELLIS prediction id, scoped to the
// requesting client so one browser can't poll another's job into existence.
export async function findByJob({ replicateJobId, clientKey }) {
	if (!forgeStoreEnabled() || !replicateJobId) return null;
	try {
		const rows = await sql`
			select id, status, glb_url, glb_key, prompt, preview_image_url,
				views_requested, views_used, multiview, backend
			from forge_creations
			where replicate_job_id = ${replicateJobId} and client_key = ${clientKey}
			limit 1
		`;
		return rows[0] ?? null;
	} catch (err) {
		console.error('[forge-store] findByJob failed:', err?.message);
		return null;
	}
}

async function copyToBucket({ sourceUrl, key, fallbackContentType, maxBytes }) {
	const resp = await fetch(sourceUrl);
	if (!resp.ok) throw new Error(`fetch ${sourceUrl}: ${resp.status}`);
	const buf = Buffer.from(await resp.arrayBuffer());
	if (buf.length > maxBytes) throw new Error(`asset too large: ${buf.length} bytes`);
	const contentType = resp.headers.get('content-type') || fallbackContentType;
	await putObject({ key, body: buf, contentType, metadata: { source: 'forge' } });
	return { bytes: buf.length, publicUrl: publicUrl(key) };
}

function imageExtFor(url) {
	const m = /\.(png|jpe?g|webp)(\?|$)/i.exec(url || '');
	return m ? m[1].toLowerCase().replace('jpeg', 'jpg') : 'webp';
}

// Copy a finished generation into durable storage and flip the row to 'done'.
// Copies the mesh (required) and the reference image (best-effort). Returns the
// durable { id, glbUrl, previewImageUrl } or null on any failure so the caller
// can fall back to the provider URL.
export async function materializeCreation({ replicateJobId, clientKey, glbUrl }) {
	if (!forgeStoreEnabled() || !replicateJobId || !glbUrl) return null;
	const existing = await findByJob({ replicateJobId, clientKey });
	if (!existing) return null;
	// Idempotent: a repeat poll after completion returns the durable copy.
	if (existing.status === 'done' && existing.glb_url) {
		return {
			id: existing.id,
			glbUrl: existing.glb_url,
			previewImageUrl: existing.preview_image_url ?? null,
		};
	}

	const keyPrefix = `forge/${clientKey.slice(0, 12)}/${existing.id}`;
	try {
		const glb = await copyToBucket({
			sourceUrl: glbUrl,
			key: `${keyPrefix}.glb`,
			fallbackContentType: 'model/gltf-binary',
			maxBytes: MAX_GLB_BYTES,
		});

		// Reference image is part of the training pair but never blocks the mesh.
		let preview = { key: null, url: existing.preview_image_url ?? null };
		if (existing.preview_image_url) {
			try {
				const ext = imageExtFor(existing.preview_image_url);
				const copied = await copyToBucket({
					sourceUrl: existing.preview_image_url,
					key: `${keyPrefix}.${ext}`,
					fallbackContentType: 'image/webp',
					maxBytes: MAX_IMAGE_BYTES,
				});
				preview = { key: `${keyPrefix}.${ext}`, url: copied.publicUrl };
			} catch (imgErr) {
				console.error('[forge-store] preview copy failed:', imgErr?.message);
			}
		}

		await sql`
			update forge_creations
			set status = 'done',
				glb_key = ${`${keyPrefix}.glb`},
				glb_url = ${glb.publicUrl},
				preview_key = ${preview.key},
				preview_image_url = ${preview.url},
				size_bytes = ${glb.bytes},
				updated_at = now()
			where id = ${existing.id} and client_key = ${clientKey}
		`;
		return { id: existing.id, glbUrl: glb.publicUrl, previewImageUrl: preview.url };
	} catch (err) {
		console.error('[forge-store] materializeCreation failed:', err?.message);
		return null;
	}
}

export async function markFailed({ replicateJobId, clientKey, error }) {
	if (!forgeStoreEnabled() || !replicateJobId) return;
	try {
		await sql`
			update forge_creations
			set status = 'failed', error = ${String(error || 'generation failed').slice(0, 500)}, updated_at = now()
			where replicate_job_id = ${replicateJobId} and client_key = ${clientKey} and status != 'done'
		`;
	} catch (err) {
		console.error('[forge-store] markFailed failed:', err?.message);
	}
}

const VALID_OUTCOMES = new Set(['accepted', 'rejected', 'generated']);

// Capture the human verdict on a creation. Scoped to the owning client so a
// verdict can't be forged for someone else's row. Returns true on a real write.
export async function recordFeedback({ id, clientKey, outcome, downloaded, rating, note }) {
	if (!forgeStoreEnabled() || !id) return false;
	const nextOutcome = VALID_OUTCOMES.has(outcome) ? outcome : null;
	const nextRating =
		Number.isInteger(rating) && rating >= 1 && rating <= 5 ? rating : null;
	const nextNote = typeof note === 'string' && note.trim() ? note.trim().slice(0, 500) : null;
	const markDownloaded = downloaded === true;
	// Nothing meaningful to record → don't touch the row.
	if (!nextOutcome && nextRating === null && nextNote === null && !markDownloaded) return false;
	try {
		const rows = await sql`
			update forge_creations
			set outcome      = coalesce(${nextOutcome}, outcome),
				rating       = coalesce(${nextRating}, rating),
				note         = coalesce(${nextNote}, note),
				downloaded   = (downloaded or ${markDownloaded}),
				feedback_at  = now(),
				updated_at   = now()
			where id = ${id} and client_key = ${clientKey}
			returning id
		`;
		return rows.length > 0;
	} catch (err) {
		console.error('[forge-store] recordFeedback failed:', err?.message);
		return false;
	}
}

// Newest durable creations for one anonymous client — powers the gallery.
export async function listCreations({ clientKey, limit = 24 }) {
	if (!forgeStoreEnabled()) return [];
	const capped = Math.min(Math.max(Number(limit) || 24, 1), 48);
	try {
		const rows = await sql`
			select id, prompt, aspect, glb_url, preview_image_url, outcome, downloaded,
				views_used, multiview, backend, created_at
			from forge_creations
			where client_key = ${clientKey} and status = 'done' and glb_url is not null
			order by created_at desc
			limit ${capped}
		`;
		return rows.map((r) => ({
			id: r.id,
			prompt: r.prompt,
			aspect: r.aspect,
			glb_url: r.glb_url,
			preview_image_url: r.preview_image_url,
			outcome: r.outcome,
			downloaded: r.downloaded,
			views_used: r.views_used ?? null,
			multiview: r.multiview ?? null,
			backend: r.backend ?? null,
			created_at: r.created_at,
		}));
	} catch (err) {
		console.error('[forge-store] listCreations failed:', err?.message);
		return [];
	}
}

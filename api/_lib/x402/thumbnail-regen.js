// api/_lib/x402/thumbnail-regen.js
//
// Avatar Thumbnail Regeneration — data layer for the x402 autonomous pipeline.
//
// Flow:
//   1. The autonomous spend loop (api/cron/x402-autonomous-loop.js) calls
//      selectStaleAsset() to find the marketplace listing whose thumbnail is
//      most overdue, then pays /api/x402/asset-download for it (real USDC).
//   2. On a successful paid download it calls enqueueRegenJob() to queue a
//      re-render, storing the value extracted from the response.
//   3. The drainer cron (api/cron/avatar-thumbnail-render.js) claims queued
//      jobs, renders the current GLB to a PNG, uploads it to R2, and calls
//      completeRegenJob() — which writes the fresh thumbnail back onto both
//      paid_assets and the linked avatars row so listings show current state.
//
// This module is the single owner of the regen schema and queue queries. It
// holds NO chromium/render dependency — rendering lives in the drainer so the
// spend-loop bundle stays lean.

import { sql } from '../db.js';

// A thumbnail is stale once it is this many days old (or never rendered, or the
// underlying model bytes changed after the last render).
export const STALE_DAYS = 30;

// Failed jobs are retried up to this many times before they stay 'failed'.
export const RETRY_MAX = 3;

// Default render dimensions for marketplace thumbnails (square).
export const DEFAULT_THUMB_SIZE = 768;

let schemaReady = false;

// Idempotent schema provisioning. Mirrors
// api/_lib/migrations/2026-06-27-avatar-thumbnail-regen.sql so a fresh DB or a
// deploy that ran ahead of the migration still works. Cheap + cached per warm
// container (regen is low-frequency anyway).
export async function ensureRegenSchema() {
	if (schemaReady) return;
	await sql`ALTER TABLE paid_assets ADD COLUMN IF NOT EXISTS thumbnail_r2_key       text`;
	await sql`ALTER TABLE paid_assets ADD COLUMN IF NOT EXISTS thumbnail_generated_at timestamptz`;
	await sql`ALTER TABLE paid_assets ADD COLUMN IF NOT EXISTS source_updated_at      timestamptz`;
	await sql`ALTER TABLE paid_assets ADD COLUMN IF NOT EXISTS avatar_id              uuid REFERENCES avatars(id) ON DELETE SET NULL`;
	await sql`
		CREATE TABLE IF NOT EXISTS avatar_thumbnail_regen_jobs (
			id                 bigserial   PRIMARY KEY,
			asset_id           uuid        REFERENCES paid_assets(id) ON DELETE CASCADE,
			asset_slug         text        NOT NULL,
			avatar_id          uuid        REFERENCES avatars(id) ON DELETE SET NULL,
			r2_key             text        NOT NULL,
			run_id             uuid,
			x402_tx_signature  text,
			amount_atomic      bigint      NOT NULL DEFAULT 0,
			status             text        NOT NULL DEFAULT 'queued'
			                               CHECK (status IN ('queued','rendering','done','failed')),
			thumbnail_r2_key   text,
			width              int         NOT NULL DEFAULT 768,
			height             int         NOT NULL DEFAULT 768,
			attempts           int         NOT NULL DEFAULT 0,
			error              text,
			reason             text,
			created_at         timestamptz NOT NULL DEFAULT now(),
			updated_at         timestamptz NOT NULL DEFAULT now(),
			rendered_at        timestamptz
		)
	`;
	await sql`
		CREATE INDEX IF NOT EXISTS avatar_thumbnail_regen_jobs_status_idx
			ON avatar_thumbnail_regen_jobs (status, created_at)
	`;
	await sql`
		CREATE UNIQUE INDEX IF NOT EXISTS avatar_thumbnail_regen_jobs_open_uniq
			ON avatar_thumbnail_regen_jobs (asset_slug)
			WHERE status IN ('queued','rendering')
	`;
	schemaReady = true;
}

// Pick the single stalest GLB listing that needs a thumbnail and has no open
// regen job already in flight. Returns null when nothing is stale (the loop
// treats this as "no work" and skips without paying).
export async function selectStaleAsset() {
	await ensureRegenSchema();
	const rows = await sql`
		SELECT pa.id, pa.slug, pa.title, pa.r2_key, pa.avatar_id,
		       pa.price_atomics, pa.thumbnail_generated_at
		  FROM paid_assets pa
		 WHERE pa.mime_type IN ('model/gltf-binary', 'model/gltf+json')
		   AND NOT EXISTS (
		         SELECT 1 FROM avatar_thumbnail_regen_jobs j
		          WHERE j.asset_slug = pa.slug
		            AND j.status IN ('queued','rendering')
		       )
		   AND (
		         pa.thumbnail_r2_key IS NULL
		      OR pa.thumbnail_generated_at IS NULL
		      OR pa.thumbnail_generated_at < now() - (${STALE_DAYS} || ' days')::interval
		      OR (pa.source_updated_at IS NOT NULL
		          AND pa.source_updated_at > pa.thumbnail_generated_at)
		       )
		 ORDER BY COALESCE(pa.thumbnail_generated_at, 'epoch'::timestamptz) ASC,
		          pa.created_at ASC
		 LIMIT 1
	`;
	return rows[0] || null;
}

// Queue a re-render after a successful paid asset-download. Idempotent against
// the open-job unique index: if a job for this listing is already in flight the
// insert is a no-op and we return null. `responseBody` is the asset-download
// JSON — we keep its slug/size as the extracted value on the job's reason field
// for observability; the source r2_key (re-presigned at render time) is what
// the drainer actually renders, since the loop's downloadUrl is short-lived.
export async function enqueueRegenJob({ asset, runId = null, txSig = null, amountAtomic = 0, responseBody = null }) {
	if (!asset?.slug || !asset?.r2_key) {
		throw new Error('enqueueRegenJob: asset.slug and asset.r2_key required');
	}
	await ensureRegenSchema();
	const reason = responseBody
		? `download_ok slug=${responseBody.slug ?? asset.slug} bytes=${responseBody.sizeBytes ?? ''}`.trim()
		: 'download_ok';
	const rows = await sql`
		INSERT INTO avatar_thumbnail_regen_jobs
			(asset_id, asset_slug, avatar_id, r2_key, run_id, x402_tx_signature,
			 amount_atomic, status, width, height, reason)
		VALUES
			(${asset.id ?? null}, ${asset.slug}, ${asset.avatar_id ?? null},
			 ${asset.r2_key}, ${runId}, ${txSig}, ${amountAtomic || 0}, 'queued',
			 ${DEFAULT_THUMB_SIZE}, ${DEFAULT_THUMB_SIZE}, ${reason})
		ON CONFLICT (asset_slug) WHERE status IN ('queued','rendering')
		DO NOTHING
		RETURNING id
	`;
	return rows[0]?.id ?? null;
}

// Atomically claim up to `limit` jobs for rendering (queued first, then
// retryable failures). FOR UPDATE SKIP LOCKED makes this safe across concurrent
// drainer invocations. Bumps attempts and flips status to 'rendering'.
export async function claimRegenJobs(limit = 3) {
	await ensureRegenSchema();
	const rows = await sql`
		UPDATE avatar_thumbnail_regen_jobs
		   SET status = 'rendering', attempts = attempts + 1, updated_at = now()
		 WHERE id IN (
		         SELECT id FROM avatar_thumbnail_regen_jobs
		          WHERE status = 'queued'
		             OR (status = 'failed' AND attempts < ${RETRY_MAX})
		          ORDER BY created_at ASC
		          LIMIT ${limit}
		          FOR UPDATE SKIP LOCKED
		       )
		RETURNING id, asset_id, asset_slug, avatar_id, r2_key, run_id,
		          width, height, attempts
	`;
	return rows;
}

// Mark a job done and write the fresh thumbnail back onto the listing and the
// linked avatar so marketplace surfaces immediately show the new render.
export async function completeRegenJob(job, thumbnailR2Key) {
	await sql`
		UPDATE avatar_thumbnail_regen_jobs
		   SET status = 'done', thumbnail_r2_key = ${thumbnailR2Key},
		       error = NULL, rendered_at = now(), updated_at = now()
		 WHERE id = ${job.id}
	`;
	if (job.asset_id || job.asset_slug) {
		await sql`
			UPDATE paid_assets
			   SET thumbnail_r2_key = ${thumbnailR2Key},
			       thumbnail_generated_at = now()
			 WHERE ${job.asset_id ? sql`id = ${job.asset_id}` : sql`slug = ${job.asset_slug}`}
		`;
	}
	if (job.avatar_id) {
		await sql`
			UPDATE avatars
			   SET thumbnail_key = ${thumbnailR2Key}, updated_at = now()
			 WHERE id = ${job.avatar_id} AND deleted_at IS NULL
		`;
	}
}

// Mark a job failed with the error. Retries happen via claimRegenJobs until
// attempts hits RETRY_MAX, after which the row stays 'failed' for inspection.
export async function failRegenJob(job, errMsg) {
	await sql`
		UPDATE avatar_thumbnail_regen_jobs
		   SET status = 'failed', error = ${String(errMsg || 'unknown').slice(0, 500)},
		       updated_at = now()
		 WHERE id = ${job.id}
	`;
}

// Deterministic R2 key for a listing's thumbnail. Keyed on slug + run so a new
// render never collides with a CDN-cached previous one.
export function thumbnailKeyFor(slug, runId) {
	const safeSlug = String(slug).replace(/[^a-zA-Z0-9._-]/g, '-').slice(0, 80);
	const suffix = runId ? String(runId).slice(0, 8) : 'r';
	return `thumbnails/assets/${safeSlug}-${suffix}.png`;
}

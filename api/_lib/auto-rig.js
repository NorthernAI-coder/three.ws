// Auto-rig on create — upgrade any freshly-created static avatar into an
// animation-ready (skeleton-bearing) one, the same way Avaturn ships rigged
// avatars. The reconstruct (prompt → avatar / selfie → avatar) pipeline already
// auto-rigs inline via reconstruct-finalize.js; this brings the SAME capability
// to every OTHER way an avatar — and therefore a 3D agent — can be born: a GLB
// upload, a URL import, or a chat/MCP "text → 3D avatar" forge save. No matter
// the path, the avatar ends up able to walk, wave, and emote.
//
// The decision mirrors reconstruct-finalize's gate exactly so the two never
// diverge:
//   • Already rigged (a skeleton is present — e.g. an Avaturn export, a
//     Mixamo/VRM upload, or any skinned GLB)? Do nothing. We never re-rig a
//     usable skeleton; canonicalization at ingest already lets it drive the
//     clip library.
//   • No rerig model configured (provider.supportsMode('rerig') === false)?
//     Do nothing — the avatar stays a static mesh, exactly as before. Rigging is
//     dormant until REPLICATE_RERIG_MODEL is set.
//   • Otherwise submit a 'rerig' job tagged { auto_rig: true } against the
//     stored mesh and let the shared completion stage (the Replicate webhook and
//     the regenerate-status poll) swap the rigged GLB in place on the SAME
//     avatar row when it lands — so the agent the user already owns simply
//     becomes animation-ready, with no sibling avatar to manage.
//
// Best-effort by contract: maybeAutoRigAvatar never throws into its caller. A
// creation request must succeed whether or not rigging could be kicked off; the
// worst case is the avatar stays static — the identical graceful state we had
// before this existed.

import { randomUUID } from 'crypto';
import { sql } from './db.js';
import { putObject, publicUrl } from './r2.js';
import { storageKeyFor } from './avatars.js';
import { getRegenProvider } from './regen-provider.js';
import { inspectGlb, isValidGlbHeader } from './glb-inspect.js';

const MAX_GLB_BYTES = 64 * 1024 * 1024; // matches reconstruct-finalize's ceiling

// Does this rig signal indicate a usable skeleton? Mirrors classifyRig
// (src/shared/rig-classify.js) on the snake_case source_meta shape so the
// server-side gate and the client-side badge agree on what "rigged" means.
export function rigInfoIsRigged(rigInfo) {
	if (!rigInfo) return false;
	if (rigInfo.is_rigged === true) return true;
	const joints = rigInfo.skeleton_joint_count;
	return typeof joints === 'number' && joints > 0;
}

async function fetchGlbBuffer(url) {
	const resp = await fetch(url);
	if (!resp.ok) throw new Error(`fetch glb: ${resp.status}`);
	const len = Number(resp.headers.get('content-length') || 0);
	if (len && len > MAX_GLB_BYTES) throw new Error(`glb too large: ${len} bytes`);
	const buf = Buffer.from(await resp.arrayBuffer());
	if (buf.length > MAX_GLB_BYTES) throw new Error(`glb too large: ${buf.length} bytes`);
	return buf;
}

// Re-run bone-name + up-axis canonicalization on a rigged GLB so the new
// skeleton lands in the canonical convention the clip retargeter expects —
// identical to the canonicalization every other stored avatar gets at ingest.
async function canonicalize(buf) {
	try {
		const { canonicalizeGLBBones } = await import('../../src/glb-canonicalize.js');
		const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
		const canonical = canonicalizeGLBBones(ab);
		if (canonical.renamed > 0 || canonical.orientationCorrected) return Buffer.from(canonical.buffer);
	} catch (err) {
		console.warn('[auto-rig] canonicalize skipped:', err?.message);
	}
	return buf;
}

/**
 * Decide whether a just-created avatar should be auto-rigged and, if so, submit
 * the rerig job. Never throws — returns a small status object the caller can log
 * or ignore.
 *
 * @param {Object} opts
 * @param {string} opts.userId         — owner of the avatar.
 * @param {{ id: string, storage_key: string }} opts.avatar — the created row.
 * @param {Object|null} [opts.rigInfo] — source_meta rig signal { is_rigged, skeleton_joint_count }.
 * @param {string} [opts.source]       — provenance tag for the job params (e.g. 'upload', 'studio').
 * @returns {Promise<{ queued: boolean, jobId?: string, skipped?: string }>}
 */
export async function maybeAutoRigAvatar({ userId, avatar, rigInfo, source = 'upload' }) {
	try {
		if (!avatar?.id || !avatar?.storage_key) return { queued: false, skipped: 'no_avatar' };

		// Already animation-ready (Avaturn, VRM, Mixamo, any skinned GLB) — leave it.
		if (rigInfoIsRigged(rigInfo)) return { queued: false, skipped: 'already_rigged' };

		let provider;
		try {
			provider = await getRegenProvider();
		} catch {
			return { queued: false, skipped: 'no_provider' };
		}
		const canRig =
			provider?.instance &&
			typeof provider.instance.supportsMode === 'function' &&
			provider.instance.supportsMode('rerig');
		if (!canRig) return { queued: false, skipped: 'no_rig_model' };

		const sourceUrl = publicUrl(avatar.storage_key);
		let submission;
		try {
			submission = await provider.instance.submit({
				userId,
				sourceAvatarId: avatar.id,
				mode: 'rerig',
				params: { auto_rig: true, source },
				sourceUrl,
				sourceStorageKey: avatar.storage_key,
			});
		} catch (err) {
			console.warn('[auto-rig] submit failed:', err?.message);
			return { queued: false, skipped: 'submit_failed' };
		}

		const jobId = `${provider.name}-${randomUUID()}`;
		await sql`
			insert into avatar_regen_jobs
				(job_id, user_id, source_avatar_id, mode, params, status, provider, ext_job_id, created_at, updated_at)
			values
				(${jobId}, ${userId}, ${avatar.id}, ${'rerig'}, ${JSON.stringify({ auto_rig: true, source })}, 'queued', ${provider.name}, ${submission.extJobId ?? null}, now(), now())
		`;
		return { queued: true, jobId };
	} catch (err) {
		// A creation flow must never fail because auto-rig couldn't start.
		console.warn('[auto-rig] maybeAutoRigAvatar error:', err?.message);
		return { queued: false, skipped: 'error' };
	}
}

/**
 * Completion stage for an auto-rig job: the rerig model finished, so fetch the
 * rigged GLB, canonicalize it, store it durably, and swap it in place on the
 * source avatar — flipping it to animation-ready without creating a sibling.
 * Shared by the Replicate webhook and the regenerate-status poll so both
 * completion paths produce an identical result.
 *
 * @returns {Promise<{ status: 'done', resultAvatarId?: string }>}
 */
export async function finalizeAutoRigStage({ userId, jobId, job, glbUrl }) {
	const avatarId = job.source_avatar_id;
	const closeJob = (resultAvatarId = null) =>
		sql`
			update avatar_regen_jobs
			set result_avatar_id = ${resultAvatarId}, status = 'done', updated_at = now()
			where job_id = ${jobId} and user_id = ${userId}
		`;

	if (!avatarId || !glbUrl) {
		await closeJob();
		return { status: 'done' };
	}

	const rows = await sql`
		select id, slug, storage_key, source_meta, tags
		from avatars
		where id = ${avatarId} and owner_id = ${userId} and deleted_at is null
		limit 1
	`;
	if (!rows[0]) {
		// Avatar was deleted between submit and completion — nothing to upgrade.
		await closeJob(avatarId);
		return { status: 'done', resultAvatarId: avatarId };
	}
	const av = rows[0];

	let glbBuf = await fetchGlbBuffer(glbUrl);
	glbBuf = await canonicalize(glbBuf);
	const info = isValidGlbHeader(glbBuf) ? inspectGlb(glbBuf) : null;

	// Write the rigged GLB to a fresh key so a CDN never serves the stale static
	// bytes, then re-point the avatar at it. The original static object is kept
	// (referenced in source_meta) as a provenance + fallback breadcrumb.
	const slug = `rigged-${Math.random().toString(36).slice(2, 8)}`;
	const newKey = storageKeyFor({ userId, slug });
	await putObject({
		key: newKey,
		body: glbBuf,
		contentType: 'model/gltf-binary',
		metadata: { source: 'auto-rig', avatar_id: avatarId, job_id: jobId },
	});

	const meta = {
		...(av.source_meta || {}),
		is_rigged: true,
		auto_rigged: true,
		rig_provider: 'auto-rig',
		rig_job_id: jobId,
		unrigged_storage_key: av.storage_key,
	};
	if (info) {
		meta.skeleton_joint_count = info.skeletonJointCount;
		meta.skin_count = info.skinCount;
		meta.node_count = info.nodeCount;
		meta.animation_count = info.animationCount;
	}
	const tags = Array.from(new Set([...(av.tags || []).filter((t) => t !== 'unrigged'), 'rigged']));

	await sql`
		update avatars
		set storage_key = ${newKey},
			size_bytes  = ${glbBuf.length},
			source_meta = ${JSON.stringify(meta)}::jsonb,
			tags        = ${tags}::text[],
			updated_at  = now()
		where id = ${avatarId} and owner_id = ${userId}
	`;
	await closeJob(avatarId);
	return { status: 'done', resultAvatarId: avatarId };
}

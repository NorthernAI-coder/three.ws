// Reconstruct-finalize — the shared tail of the selfie → 3D pipeline, called by
// both the /api/avatars/regenerate-status poll and the Replicate webhook so the
// two completion paths never drift.
//
// A reconstruction model returns a textured mesh. Whether that mesh is rigged
// depends on the model family: Hunyuan3D's generation_all and our GCP UniRig
// pipeline emit a skeleton; TRELLIS / TripoSR return a static mesh. The /scan
// page promises a *rigged* model you can animate, so when the reconstructed
// mesh has no skeleton AND the active provider has a rig model configured, we
// chain a 'rerig' job and only surface the avatar once it's rigged. If no rig
// model is configured, or rigging fails, we deliver the static mesh tagged
// `unrigged` — the user is never left empty-handed.
//
// Auto-rig is dormant by default: it activates only when the provider reports
// supportsMode('rerig') (e.g. REPLICATE_RERIG_MODEL is set), so existing
// deployments keep their exact current behavior until rigging is wired.

import { sql } from './db.js';
import { putObject, publicUrl } from './r2.js';
import { storageKeyFor, createAvatar } from './avatars.js';
import { inspectGlb, isValidGlbHeader } from './glb-inspect.js';
import { dispatchWebhooks } from './webhook-dispatch.js';
import { getRegenProvider } from './regen-provider.js';

const MAX_GLB_BYTES = 64 * 1024 * 1024; // 64 MB ceiling on a fetched model

async function fetchGlbBuffer(url) {
	const resp = await fetch(url);
	if (!resp.ok) throw new Error(`fetch glb: ${resp.status}`);
	const len = Number(resp.headers.get('content-length') || 0);
	if (len && len > MAX_GLB_BYTES) throw new Error(`glb too large: ${len} bytes`);
	const buf = Buffer.from(await resp.arrayBuffer());
	if (buf.length > MAX_GLB_BYTES) throw new Error(`glb too large: ${buf.length} bytes`);
	return buf;
}

function glbMetaFrom(info) {
	return info
		? {
			is_rigged: info.isRigged,
			skin_count: info.skinCount,
			skeleton_joint_count: info.skeletonJointCount,
			node_count: info.nodeCount,
			mesh_count: info.meshCount,
			animation_count: info.animationCount,
			glb_generator: info.generator,
		}
		: { is_rigged: null, glb_inspect_error: 'invalid_glb_header' };
}

// Store a reconstructed GLB into R2 and create the durable avatar row, marking
// the job done. Shared by every terminal path (rigged-as-is, rigged-after-chain,
// unrigged fallback) so all three produce an identical avatar shape.
async function materializeReconstructAvatar({
	userId,
	jobId,
	job,
	glbBuf,
	glbInfo,
	storageKey,
	slug,
	extraTags = [],
	sourceMetaExtra = {},
}) {
	const params = job.params || {};
	// Both the selfie capture flow and the text → avatar flow land here; tag and
	// describe the result by how it was actually made so the library stays honest.
	const fromPrompt = params.source === 'prompt';
	const baseTag = fromPrompt ? 'prompt' : 'selfie';
	const name = String(params.name || (fromPrompt ? 'My prompt avatar' : 'My selfie avatar')).slice(0, 120);
	const description = params.description ? String(params.description).slice(0, 500) : null;
	const visibility = ['private', 'unlisted', 'public'].includes(params.visibility)
		? params.visibility
		: 'private';

	await putObject({
		key: storageKey,
		body: glbBuf,
		contentType: 'model/gltf-binary',
		metadata: { source: 'reconstruct', job_id: jobId },
	});

	const tags = [baseTag, ...extraTags];
	if (glbInfo && !glbInfo.isRigged && !tags.includes('unrigged')) tags.push('unrigged');

	const promptMeta = fromPrompt
		? { prompt: params.prompt ?? null, referenceImageUrl: params.referenceImageUrl ?? null }
		: {};

	const avatar = await createAvatar({
		userId,
		storageKey,
		input: {
			slug,
			name,
			description,
			size_bytes: glbBuf.length,
			content_type: 'model/gltf-binary',
			source: 'reconstruct',
			source_meta: { jobId, provider: job.provider, ...glbMetaFrom(glbInfo), ...promptMeta, ...sourceMetaExtra },
			visibility,
			tags,
			checksum_sha256: null,
			parent_avatar_id: null,
		},
	});

	await sql`
		update avatar_regen_jobs
		set result_avatar_id = ${avatar.id}, status = 'done', updated_at = now()
		where job_id = ${jobId} and user_id = ${userId}
	`;

	dispatchWebhooks({
		userId,
		eventType: 'avatar.created',
		data: { id: avatar.id, name: avatar.name, slug: avatar.slug, source: 'reconstruct' },
	}).catch(() => {});

	return avatar;
}

// Stage 1: a reconstruct job just succeeded. Inspect the mesh and either
// deliver it immediately (already rigged, or no rig model available) or kick
// off an auto-rig job and move the parent job into the 'rigging' state.
//
// Returns { status, resultAvatarId? } reflecting the post-call job state.
export async function finalizeReconstructStage({ userId, jobId, job, glbUrl }) {
	const glbBuf = await fetchGlbBuffer(glbUrl);
	const info = isValidGlbHeader(glbBuf) ? inspectGlb(glbBuf) : null;
	const slugPrefix = job?.params?.source === 'prompt' ? 'prompt' : 'selfie';
	const slug = `${slugPrefix}-${Math.random().toString(36).slice(2, 8)}`;
	const storageKey = storageKeyFor({ userId, slug });

	let provider = null;
	try {
		provider = await getRegenProvider();
	} catch (_) {
		provider = null;
	}
	const canRig = !!(
		info &&
		!info.isRigged &&
		provider?.instance &&
		typeof provider.instance.supportsMode === 'function' &&
		provider.instance.supportsMode('rerig')
	);

	if (!canRig) {
		const avatar = await materializeReconstructAvatar({ userId, jobId, job, glbBuf, glbInfo: info, storageKey, slug });
		return { status: 'done', resultAvatarId: avatar.id };
	}

	// Store the bare mesh durably first: it gives the rig model a stable URL to
	// fetch and guarantees a fallback if rigging fails.
	await putObject({
		key: storageKey,
		body: glbBuf,
		contentType: 'model/gltf-binary',
		metadata: { source: 'reconstruct', job_id: jobId, stage: 'unrigged' },
	});
	const unriggedUrl = publicUrl(storageKey);

	let rigSubmission;
	try {
		rigSubmission = await provider.instance.submit({
			userId,
			mode: 'rerig',
			params: { ...(job.params || {}) },
			sourceUrl: unriggedUrl,
			sourceStorageKey: storageKey,
		});
	} catch (rigErr) {
		// Couldn't even start rigging — deliver the bare mesh now rather than
		// failing the whole reconstruction the user already waited for.
		const avatar = await materializeReconstructAvatar({
			userId,
			jobId,
			job,
			glbBuf,
			glbInfo: info,
			storageKey,
			slug,
			extraTags: ['unrigged'],
			sourceMetaExtra: { rigError: String(rigErr?.message || rigErr) },
		});
		return { status: 'done', resultAvatarId: avatar.id };
	}

	// Drop the (multi-MB base64) source images from the persisted params now that
	// reconstruction is done — the rig stage works off the stored GLB, not the
	// photos — so the job row stays lean across the remaining 'rigging' polls.
	const { images: _images, image: _image, ...leanParams } = job.params || {};
	const nextParams = {
		...leanParams,
		rig: { extJobId: rigSubmission.extJobId ?? null, storageKey, slug, unriggedUrl },
	};
	await sql`
		update avatar_regen_jobs
		set status = 'rigging', params = ${JSON.stringify(nextParams)}, updated_at = now()
		where job_id = ${jobId} and user_id = ${userId}
	`;
	return { status: 'rigging' };
}

// Stage 2: the parent job is in 'rigging' — poll the child rig job. On success
// swap in the rigged GLB; on failure fall back to the stored bare mesh. Returns
// { status, resultAvatarId? }; status stays 'rigging' while the rig job runs.
export async function pollRiggingStage({ userId, jobId, job }) {
	const rig = (job.params && job.params.rig) || {};
	const slug = rig.slug || `selfie-${Math.random().toString(36).slice(2, 8)}`;
	const storageKey = rig.storageKey || storageKeyFor({ userId, slug });

	let provider = null;
	try {
		provider = await getRegenProvider();
	} catch (_) {
		provider = null;
	}

	// No way to advance (provider gone or no child id): salvage the bare mesh so
	// the job can't hang forever in 'rigging'.
	if (!provider?.instance || !rig.extJobId) {
		if (!rig.unriggedUrl) return { status: 'rigging' };
		const glbBuf = await fetchGlbBuffer(rig.unriggedUrl);
		const info = isValidGlbHeader(glbBuf) ? inspectGlb(glbBuf) : null;
		const avatar = await materializeReconstructAvatar({
			userId, jobId, job, glbBuf, glbInfo: info, storageKey, slug,
			extraTags: ['unrigged'],
			sourceMetaExtra: { rigError: 'rig job not pollable' },
		});
		return { status: 'done', resultAvatarId: avatar.id };
	}

	const update = await provider.instance.status(rig.extJobId);

	if (update.status === 'done' && update.resultGlbUrl) {
		const glbBuf = await fetchGlbBuffer(update.resultGlbUrl);
		const info = isValidGlbHeader(glbBuf) ? inspectGlb(glbBuf) : null;
		const avatar = await materializeReconstructAvatar({
			userId, jobId, job, glbBuf, glbInfo: info, storageKey, slug,
			sourceMetaExtra: { rigged: true, rigJobId: rig.extJobId, reconstructGlb: rig.unriggedUrl },
		});
		return { status: 'done', resultAvatarId: avatar.id };
	}

	if (update.status === 'failed') {
		// Rigging failed — deliver the bare mesh we stored before rigging.
		const glbBuf = await fetchGlbBuffer(rig.unriggedUrl);
		const info = isValidGlbHeader(glbBuf) ? inspectGlb(glbBuf) : null;
		const avatar = await materializeReconstructAvatar({
			userId, jobId, job, glbBuf, glbInfo: info, storageKey, slug,
			extraTags: ['unrigged'],
			sourceMetaExtra: { rigFailed: true, rigError: update.error || null },
		});
		return { status: 'done', resultAvatarId: avatar.id };
	}

	return { status: 'rigging' };
}

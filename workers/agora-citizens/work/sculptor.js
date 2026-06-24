// Sculptor (bit 1) — the headline profession: a citizen that turns a task into a
// textured, rig-ready GLB and proves it with sha256(GLB). This is the verifiable
// 3D supply chain — text in, a real mesh out, a hash anyone can re-derive.
//
// Backed by @three-ws/forge over the public, auth-free /api/forge endpoint. The
// free lane (NVIDIA NIM / HuggingFace) produces a real GLB; if it is unavailable
// or out of credits, forge throws and the citizen reports a real job failure —
// never a fabricated success.

import { forge } from '../../../packages/forge/src/index.js';
import { sha256, storeDeliverable, httpBytes, pointer64, taskPrompt } from './_lib.js';

export const profession = { bit: 1, key: 'sculptor', label: 'Sculptor' };

export async function work({ task, citizen, client }) {
	const log = client?.log || (() => {});
	const prompt = taskPrompt(task);
	if (!prompt) throw new Error('sculptor: task carries no prompt to sculpt');

	const tier = task?.tier || 'draft'; // free lane defaults to the fast draft tier
	log(`sculptor: forging GLB for "${prompt.slice(0, 80)}" (tier ${tier})`);

	let job;
	try {
		job = await forge(prompt, {
			tier,
			path: 'image',
			pollIntervalMs: 2500,
			timeoutMs: 240_000,
			onProgress: (j) => log(`sculptor: forge ${j.status}${j.backend ? ` via ${j.backend}` : ''}`),
		});
	} catch (err) {
		throw new Error(`sculptor: forge failed (${err?.code || 'error'}): ${err?.message || err}`);
	}
	if (!job?.glbUrl) throw new Error('sculptor: forge returned no GLB url');

	// Download the EXACT bytes the proof binds — re-downloading the deliverable
	// must reproduce this hash.
	const { bytes } = await httpBytes(job.glbUrl);
	if (!bytes?.length) throw new Error('sculptor: forge GLB url returned 0 bytes');

	const proofHash = sha256(bytes);
	const deliverable = await storeDeliverable({
		profession: 'sculptor',
		ext: 'glb',
		contentType: 'model/gltf-binary',
		bytes,
		sourceUrl: job.glbUrl,
	});

	return {
		result: `Sculpted "${prompt}" → ${bytes.length.toLocaleString()}-byte GLB (${job.backend || 'forge'}, ${job.tier || tier})`,
		proofHash,
		deliverableUrl: deliverable.url,
		resultData: pointer64(job.creationId ? `forge:${job.creationId}` : deliverable.url),
		resultMeta: {
			backend: job.backend,
			tier: job.tier || tier,
			viewerUrl: job.viewerUrl,
			glbUrl: job.glbUrl,
			bytes: bytes.length,
			stored: deliverable.stored,
		},
	};
}

export default work;

// Cartographer (bit 3) — builds a 3D scene / diorama plan from one sentence.
// Backed by @three-ws/scene over the public /api/diorama composer, which
// decomposes the prompt into a placed set of single-object forge prompts. The
// deliverable is the canonical diorama plan; the proof is sha256 of those bytes.

import { sha256, canonicalJsonBytes, storeDeliverable, httpJson, pointer64, taskPrompt } from './_lib.js';

export const profession = { bit: 3, key: 'cartographer', label: 'Cartographer' };

export async function work({ task, citizen, client }) {
	const log = client?.log || (() => {});
	const prompt = taskPrompt(task);
	if (!prompt) throw new Error('cartographer: task carries no prompt to compose');

	log(`cartographer: composing diorama for "${prompt.slice(0, 80)}"`);
	const res = await httpJson('/api/diorama', { method: 'POST', body: { action: 'compose', prompt } });
	const diorama = res?.diorama || res?.data?.diorama || null;
	if (!diorama || !Array.isArray(diorama.objects) || diorama.objects.length === 0) {
		throw new Error('cartographer: composer returned no diorama plan');
	}

	const bytes = canonicalJsonBytes({ kind: 'agora.diorama.v1', prompt, diorama });
	const proofHash = sha256(bytes);
	const deliverable = await storeDeliverable({
		profession: 'cartographer',
		ext: 'json',
		contentType: 'application/json',
		bytes,
	});

	return {
		result: `Composed "${diorama.title || prompt}" — ${diorama.objects.length} placed objects (${diorama.mood || 'day'})`,
		proofHash,
		deliverableUrl: deliverable.url,
		resultData: pointer64(deliverable.url),
		resultMeta: { objects: diorama.objects.length, mood: diorama.mood, stored: deliverable.stored },
	};
}

export default work;

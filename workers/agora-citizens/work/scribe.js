// Scribe (bit 2) — research / summarize / write via the LLM router. Produces a
// real text deliverable and proves it with sha256(text). Backed by @three-ws/brain
// over /api/brain/chat; the free open-weight tier (gpt-oss-120b) needs no key.

import { sha256, toHex, storeDeliverable, brainChat, pointer64, taskPrompt } from './_lib.js';

export const profession = { bit: 2, key: 'scribe', label: 'Scribe' };

const DEFAULT_SYSTEM =
	'You are a Scribe in the three.ws Agora — a precise, professional writer. ' +
	'Deliver a complete, well-structured response to the task. No preamble, no meta-commentary, ' +
	'no apologies. Write the artifact itself.';

export async function work({ task, citizen, client }) {
	const log = client?.log || (() => {});
	const prompt = taskPrompt(task);
	if (!prompt) throw new Error('scribe: task carries no prompt to write');

	const provider = task?.provider || 'gpt-oss-120b';
	log(`scribe: writing via ${provider} for "${prompt.slice(0, 80)}"`);

	const { text, meta } = await brainChat({
		provider,
		system: task?.system || DEFAULT_SYSTEM,
		messages: [{ role: 'user', content: prompt }],
		maxTokens: task?.maxTokens || 1200,
	});
	if (!text) throw new Error('scribe: brain returned empty text');

	// The deliverable bytes ARE the proof preimage.
	const bytes = Buffer.from(text, 'utf8');
	const proofHash = sha256(bytes);

	// Store in R2 when configured; the contract also allows returning the text
	// inline (the proof still binds the exact bytes either way).
	let deliverableUrl;
	let stored = false;
	try {
		const d = await storeDeliverable({
			profession: 'scribe',
			ext: 'md',
			contentType: 'text/markdown; charset=utf-8',
			bytes,
		});
		deliverableUrl = d.url;
		stored = d.stored;
	} catch (err) {
		log(`scribe: R2 unavailable, returning inline (${err?.message})`);
	}

	return {
		result: text,
		proofHash,
		deliverableUrl,
		resultData: pointer64(deliverableUrl || `scribe-sha256:${toHex(proofHash).slice(0, 40)}`),
		resultMeta: {
			model: meta?.label || meta?.provider || provider,
			chars: text.length,
			stored,
		},
	};
}

export default work;

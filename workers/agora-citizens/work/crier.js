// Crier (bit 4) — turns a task's text into a real spoken-audio clip. Backed by
// @three-ws/voice over the free /api/tts/speak lane (NVIDIA Magpie TTS). The
// deliverable is the audio bytes; the proof is sha256 of exactly those bytes.

import { sha256, storeDeliverable, httpBytes, pointer64, taskPrompt } from './_lib.js';

export const profession = { bit: 4, key: 'crier', label: 'Crier' };

const EXT_FOR = { mp3: 'mp3', wav: 'wav', opus: 'ogg', aac: 'aac', flac: 'flac', pcm: 'pcm' };

export async function work({ task, citizen, client }) {
	const log = client?.log || (() => {});
	const text = taskPrompt(task);
	if (!text) throw new Error('crier: task carries no text to voice');

	const format = task?.format || 'mp3';
	const voice = task?.voice || 'nova';
	log(`crier: synthesizing ${format} voice (${voice}) for "${text.slice(0, 60)}"`);

	const { bytes, contentType } = await httpBytes('/api/tts/speak', {
		method: 'POST',
		headers: { 'content-type': 'application/json', accept: 'audio/*' },
		body: { text, voice, format },
	});
	if (!bytes?.length) throw new Error('crier: tts returned 0 audio bytes');

	const proofHash = sha256(bytes);
	const deliverable = await storeDeliverable({
		profession: 'crier',
		ext: EXT_FOR[format] || 'audio',
		contentType: contentType || 'audio/mpeg',
		bytes,
	});

	return {
		result: `Voiced a ${bytes.length.toLocaleString()}-byte ${format} clip (${voice})`,
		proofHash,
		deliverableUrl: deliverable.url,
		resultData: pointer64(deliverable.url),
		resultMeta: { bytes: bytes.length, format, voice, stored: deliverable.stored },
	};
}

export default work;

// Free NVIDIA NIM vision lane — multimodal VLM understanding over the same
// OpenAI-compatible REST surface (integrate.api.nvidia.com) and the same free
// nvapi key already used by api/chat.js. Net-new capability: hand the model an
// image (a viewer screenshot, an uploaded reference, a launch thumbnail) and a
// question, get back text — "describe this 3D model", "write alt text", "is this
// thumbnail readable", "what style is this avatar".
//
// ── Image transport (the contract that makes this non-trivial) ───────────────
// NVIDIA's hosted VLMs accept an image two ways, and which one is legal depends
// on size:
//   • Inline: embed a data URI in the message content as an HTML <img> tag,
//       <img src="data:image/jpeg;base64,…" />
//     This is REJECTED for payloads at/above ~180 KB (the documented inline cap).
//   • Asset reference: for anything larger, upload the bytes to the NVCF Assets
//     API first, then reference the returned asset id in the SAME <img> tag with
//     the `asset_id` scheme and list it in the NVCF-INPUT-ASSET-REFERENCES header:
//       <img src="data:image/jpeg;asset_id,<id>" />     + header: NVCF-INPUT-ASSET-REFERENCES: <id>
// This module picks the right path by size so callers never have to. The
// asset-id `;asset_id,` + NVCF-INPUT-ASSET-REFERENCES handshake is the same one
// documented for the TRELLIS provider (api/_providers/nvidia.js).
//
// Error codes match the provider contract used elsewhere (tts-nvidia.js):
//   not_configured | invalid_key | rate_limited | invalid_argument |
//   timeout | provider_unreachable | provider_error.

import { env } from './env.js';

const CHAT_URL = 'https://integrate.api.nvidia.com/v1/chat/completions';
const ASSETS_URL = 'https://api.nvcf.nvidia.com/v2/nvcf/assets';

// Inline data-URI images must stay under the hosted cap. NVIDIA documents ~180 KB
// on the encoded payload; measure the base64 string length (what actually rides
// in the JSON) and switch to the asset upload below this with margin.
const INLINE_B64_LIMIT = 180_000;
const DEFAULT_TIMEOUT_MS = 45_000;

// Hosted free VLMs. Default is the strongest general model; the 11B is a lighter,
// faster option. Callers may pass any of these; anything else falls back to the
// default so a typo never reaches the upstream as an invalid model.
export const VISION_MODELS = new Set([
	'meta/llama-3.2-90b-vision-instruct',
	'meta/llama-3.2-11b-vision-instruct',
	'microsoft/phi-3.5-vision-instruct',
	'nvidia/vila',
]);
export const DEFAULT_VISION_MODEL = 'meta/llama-3.2-90b-vision-instruct';

// A useful default task when the caller supplies only an image: a tight,
// platform-relevant description rather than an open-ended ramble.
export const DEFAULT_VISION_PROMPT =
	'Describe this 3D model or avatar render in two sentences: subject, style, and notable details. Be concrete and concise.';

export function visionConfigured() {
	return Boolean(env.NVIDIA_API_KEY);
}

export function resolveVisionModel(model) {
	return VISION_MODELS.has(model) ? model : DEFAULT_VISION_MODEL;
}

function providerError(status, detail) {
	let code = 'provider_error';
	if (status === 401 || status === 403) code = 'invalid_key';
	else if (status === 429) code = 'rate_limited';
	else if (status === 400 || status === 422) code = 'invalid_argument';
	const err = new Error(`NVIDIA vision returned ${status}${detail ? `: ${String(detail).slice(0, 300)}` : ''}`);
	err.code = code;
	err.providerStatus = status;
	return err;
}

// Upload image bytes to the NVCF Assets API and return the asset id. Two steps:
// register the asset (get a presigned PUT url + id), then PUT the bytes. The
// description is echoed into the required x-amz-meta header on the PUT.
async function uploadAsset({ bytes, contentType, apiKey, timeoutMs }) {
	const description = 'three.ws vision input';
	let reg;
	try {
		reg = await fetch(ASSETS_URL, {
			method: 'POST',
			headers: {
				authorization: `Bearer ${apiKey}`,
				'content-type': 'application/json',
				accept: 'application/json',
			},
			body: JSON.stringify({ contentType, description }),
			signal: AbortSignal.timeout(timeoutMs),
		});
	} catch (e) {
		throw Object.assign(new Error(`NVCF asset registration unreachable: ${e?.message}`), { code: 'provider_unreachable' });
	}
	if (!reg.ok) {
		const detail = await reg.text().catch(() => '');
		throw providerError(reg.status, detail);
	}
	const { uploadUrl, assetId } = await reg.json();
	if (!uploadUrl || !assetId) {
		throw Object.assign(new Error('NVCF asset registration returned no uploadUrl/assetId'), { code: 'provider_error' });
	}

	let put;
	try {
		put = await fetch(uploadUrl, {
			method: 'PUT',
			headers: {
				'content-type': contentType,
				'x-amz-meta-nvcf-asset-description': description,
			},
			body: bytes,
			signal: AbortSignal.timeout(timeoutMs),
		});
	} catch (e) {
		throw Object.assign(new Error(`NVCF asset upload unreachable: ${e?.message}`), { code: 'provider_unreachable' });
	}
	if (!put.ok) {
		const detail = await put.text().catch(() => '');
		throw providerError(put.status, detail);
	}
	return assetId;
}

// Ask a hosted VLM about an image.
//
//   { imageBytes: Buffer, contentType?, prompt?, model?, maxTokens?, temperature?,
//     timeoutMs?, apiKey? }
//     → { text, model, assetId|null }
//
// Throws Error with .code ∈ not_configured | invalid_key | rate_limited |
// invalid_argument | timeout | provider_unreachable | provider_error.
export async function describeImage({
	imageBytes,
	contentType = 'image/jpeg',
	prompt = DEFAULT_VISION_PROMPT,
	model = DEFAULT_VISION_MODEL,
	maxTokens = 512,
	temperature = 0.2,
	timeoutMs = DEFAULT_TIMEOUT_MS,
	apiKey,
} = {}) {
	const key = apiKey || env.NVIDIA_API_KEY;
	if (!key) {
		throw Object.assign(new Error('NVIDIA_API_KEY not set'), { code: 'not_configured' });
	}
	const bytes = Buffer.isBuffer(imageBytes) ? imageBytes : Buffer.from(imageBytes || []);
	if (!bytes.length) {
		throw Object.assign(new Error('no image bytes to analyze'), { code: 'invalid_argument' });
	}

	const resolvedModel = resolveVisionModel(model);
	const base64 = bytes.toString('base64');
	const extraHeaders = {};
	let assetId = null;
	let imgTag;

	if (base64.length < INLINE_B64_LIMIT) {
		imgTag = `<img src="data:${contentType};base64,${base64}" />`;
	} else {
		assetId = await uploadAsset({ bytes, contentType, apiKey: key, timeoutMs });
		imgTag = `<img src="data:${contentType};asset_id,${assetId}" />`;
		extraHeaders['NVCF-INPUT-ASSET-REFERENCES'] = assetId;
	}

	const userPrompt = String(prompt || DEFAULT_VISION_PROMPT).slice(0, 2000);
	const body = {
		model: resolvedModel,
		messages: [{ role: 'user', content: `${userPrompt} ${imgTag}` }],
		max_tokens: Math.min(Math.max(Number(maxTokens) || 512, 16), 2048),
		temperature: Math.min(Math.max(Number(temperature) || 0, 0), 1),
		stream: false,
	};

	let res;
	try {
		res = await fetch(CHAT_URL, {
			method: 'POST',
			headers: {
				authorization: `Bearer ${key}`,
				'content-type': 'application/json',
				accept: 'application/json',
				...extraHeaders,
			},
			body: JSON.stringify(body),
			signal: AbortSignal.timeout(timeoutMs),
		});
	} catch (e) {
		const timedOut = e?.name === 'TimeoutError' || e?.name === 'AbortError';
		throw Object.assign(new Error(`NVIDIA vision unreachable: ${e?.message}`), {
			code: timedOut ? 'timeout' : 'provider_unreachable',
		});
	}

	if (!res.ok) {
		let detail = '';
		try {
			const j = await res.json();
			detail = j?.detail || j?.message || j?.error?.message || JSON.stringify(j);
		} catch {
			detail = await res.text().catch(() => '');
		}
		throw providerError(res.status, detail);
	}

	const data = await res.json().catch(() => null);
	const text = data?.choices?.[0]?.message?.content?.trim?.() || '';
	if (!text) {
		throw Object.assign(new Error('NVIDIA vision returned an empty completion'), { code: 'provider_error' });
	}
	return { text, model: resolvedModel, assetId };
}

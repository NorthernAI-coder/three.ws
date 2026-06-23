// POST /api/vision — free multimodal image understanding for the platform.
//
// Hand a hosted NVIDIA VLM an image and a question, get back text. Net-new,
// purely additive capability on the same free nvapi key that already powers
// chat, embeddings, TTS, and 3D generation. Product uses: describe / critique a
// 3D-model render, write alt text for a launch thumbnail, auto-tag an avatar's
// style, sanity-check a generated texture.
//
// Lane: NVIDIA NIM VLM over the OpenAI-compatible REST surface
// (api/_lib/vision-nvidia.js). Small images ride inline; large ones are uploaded
// to the NVCF asset store and referenced — the lib handles the switch.
//
// Request: raw image bytes as the body (Content-Type sets the image type), or a
//   JSON body { image: <base64 or data URI>, prompt?, model?, maxTokens? }.
//   Query/JSON params: prompt (the question; defaults to a concise describe),
//   model (a VISION_MODELS id), maxTokens.
// Response: { text, model, usedAssetUpload }.

import { cors, method, readBody, readJson, error, json, wrap, rateLimited } from './_lib/http.js';
import { getSessionUser, authenticateBearer, extractBearer } from './_lib/auth.js';
import { limits, clientIp } from './_lib/rate-limit.js';
import {
	describeImage,
	visionConfigured,
	resolveVisionModel,
	VISION_MODELS,
	DEFAULT_VISION_MODEL,
	DEFAULT_VISION_PROMPT,
} from './_lib/vision-nvidia.js';

export const maxDuration = 60;

// 12 MiB — comfortably covers a high-res viewer screenshot or photo while
// bounding the in-memory buffer. Larger images route through the NVCF asset
// store inside the lib, but the request body itself is still capped here.
const MAX_IMAGE_BYTES = 12 * 1024 * 1024;
const VISION_TIMEOUT_MS = 50_000;

const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

function isAcceptedImageType(ct) {
	const type = String(ct || '').split(';')[0].trim().toLowerCase();
	return ACCEPTED_TYPES.includes(type) ? type : null;
}

export default wrap(async function handler(req, res) {
	if (cors(req, res, { methods: 'GET,POST,OPTIONS' })) return;
	if (!method(req, res, ['GET', 'POST'])) return;

	// Capability probe — lets a UI decide whether to offer "describe / critique"
	// affordances without guessing. Cheap, unauthenticated, briefly cacheable.
	if (req.method === 'GET' || req.method === 'HEAD') {
		return json(
			res,
			200,
			{
				configured: visionConfigured(),
				models: [...VISION_MODELS],
				defaultModel: DEFAULT_VISION_MODEL,
				imageTypes: ACCEPTED_TYPES,
			},
			{ 'cache-control': 'public, max-age=60' },
		);
	}

	if (!visionConfigured()) {
		return error(res, 503, 'not_configured', 'Vision is not configured (set NVIDIA_API_KEY)');
	}

	// Metered like the other free NVIDIA lanes.
	const session = await getSessionUser(req);
	const bearer = session ? null : await authenticateBearer(extractBearer(req));
	const userId = session?.id ?? bearer?.userId ?? null;
	if (userId) {
		const rl = await limits.visionUser(userId);
		if (!rl.success) return rateLimited(res, rl, 'Vision rate limit exceeded, try again later');
	} else {
		const rl = await limits.visionIp(clientIp(req));
		if (!rl.success) return rateLimited(res, rl, 'Vision rate limit exceeded, sign in for a higher limit');
	}

	const url = new URL(req.url, 'http://localhost');
	const q = url.searchParams;
	const contentType = req.headers['content-type'] || '';
	const isJson = contentType.split(';')[0].trim().toLowerCase() === 'application/json';

	let imageBytes;
	let imageType = 'image/jpeg';
	let prompt = q.get('prompt') || DEFAULT_VISION_PROMPT;
	let model = resolveVisionModel(q.get('model') || DEFAULT_VISION_MODEL);
	let maxTokens = Number(q.get('maxTokens')) || 512;

	try {
		if (isJson) {
			const body = await readJson(req, Math.ceil(MAX_IMAGE_BYTES * 1.4)); // base64 inflates ~33%
			const raw = typeof body.image === 'string' ? body.image : '';
			if (!raw) return error(res, 400, 'bad_request', 'image (base64 or data URI) is required');
			// Honor the data-URI mime if present; otherwise default to jpeg.
			const dataUri = raw.match(/^data:(image\/[a-z+]+);base64,(.*)$/i);
			const b64 = dataUri ? dataUri[2] : raw.replace(/^data:[^,]*,/, '');
			imageType = dataUri ? dataUri[1].toLowerCase() : (isAcceptedImageType(body.imageType) || 'image/jpeg');
			imageBytes = Buffer.from(b64, 'base64');
			if (typeof body.prompt === 'string' && body.prompt.trim()) prompt = body.prompt;
			if (typeof body.model === 'string') model = resolveVisionModel(body.model);
			if (Number(body.maxTokens)) maxTokens = Number(body.maxTokens);
		} else {
			const t = isAcceptedImageType(contentType);
			if (!t) {
				return error(
					res,
					415,
					'unsupported_media_type',
					`Unsupported image Content-Type "${contentType.split(';')[0] || 'none'}". Send image/jpeg, image/png, image/webp, or image/gif (or a JSON body with a base64 image).`,
				);
			}
			imageType = t;
			imageBytes = await readBody(req, MAX_IMAGE_BYTES);
		}
	} catch (e) {
		if (e?.status === 413) return error(res, 413, 'payload_too_large', 'image exceeds the 12 MB limit');
		return error(res, e?.status || 400, 'bad_request', e?.message || 'could not read request body');
	}

	if (!imageBytes?.length) return error(res, 400, 'bad_request', 'no image bytes received');

	try {
		const out = await describeImage({
			imageBytes,
			contentType: imageType,
			prompt,
			model,
			maxTokens,
			timeoutMs: VISION_TIMEOUT_MS,
		});
		return json(
			res,
			200,
			{ text: out.text, model: out.model, usedAssetUpload: Boolean(out.assetId) },
			{ 'cache-control': 'no-store' },
		);
	} catch (e) {
		const code = e?.code || 'provider_error';
		const status =
			code === 'rate_limited' ? 429 :
			code === 'invalid_argument' ? 400 :
			code === 'not_configured' ? 503 :
			502;
		return error(res, status, code, `Image understanding failed: ${e?.message || 'unknown error'}`);
	}
});

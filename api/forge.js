/**
 * Forge — browser-facing text → 3D model generator.
 *
 *   POST /api/forge          { prompt, aspect_ratio? }  → start a job
 *   GET  /api/forge?job=<id>                            → poll a job
 *
 * This is the public, auth-free twin of the 3D Studio MCP server
 * (api/mcp-3d.js): it drives the exact same real pipeline — a flux-schnell
 * text-to-image pass, then Microsoft TRELLIS mesh reconstruction on Replicate —
 * but over plain JSON so the /forge page can drive it straight from the
 * browser. There is no shared MCP/OAuth context here, so requests are rate
 * limited by client IP using the same generation/status limiters.
 *
 * No mock paths: if REPLICATE_API_TOKEN is absent the endpoint returns a clean
 * 503 with a configuration message and the page renders a designed "not
 * configured" state — it never fabricates a model.
 */

import { cors, json, method, readJson, wrap } from './_lib/http.js';
import { limits, clientIp } from './_lib/rate-limit.js';
import { textToImage } from './_mcp3d/text-to-image.js';
import { createRegenProvider } from './_providers/replicate.js';
import {
	hashClient,
	hashIp,
	createCreation,
	materializeCreation,
	markFailed,
} from './_lib/forge-store.js';

const VALID_ASPECT = new Set(['1:1', '4:3', '3:4', '16:9', '9:16']);

// A Replicate prediction id is a lowercase base32-ish token. Constrain the
// poll parameter to that shape so we never forward arbitrary strings upstream.
const JOB_ID_RE = /^[a-z0-9]{16,64}$/;

// Stable anonymous handle for the browser making the request (/forge has no
// login). Used to scope durable creations + the gallery to one client without
// trusting any of its other input.
function clientKeyFrom(req) {
	const raw = req.headers['x-forge-client'];
	return hashClient(Array.isArray(raw) ? raw[0] : raw);
}

function unconfigured(res) {
	return json(res, 503, {
		error: 'unconfigured',
		message:
			'Text-to-3D generation is not configured on this deployment (REPLICATE_API_TOKEN is missing).',
	});
}

async function startJob(req, res) {
	const ip = clientIp(req);
	const rl = await limits.mcp3dGenerate(ip);
	if (!rl.success) {
		return json(res, 429, {
			error: 'rate_limited',
			message: 'Generation limit reached. Try again shortly.',
			retry_after: Math.ceil((rl.reset - Date.now()) / 1000),
		});
	}

	const body = await readJson(req, 8_000).catch(() => null);
	const prompt = typeof body?.prompt === 'string' ? body.prompt.trim() : '';
	if (prompt.length < 3 || prompt.length > 1000) {
		return json(res, 400, {
			error: 'invalid_prompt',
			message: 'Describe one subject in 3–1000 characters.',
		});
	}
	const aspect = VALID_ASPECT.has(body?.aspect_ratio) ? body.aspect_ratio : '1:1';

	let provider;
	try {
		provider = createRegenProvider();
	} catch {
		return unconfigured(res);
	}

	try {
		const { imageUrl, model } = await textToImage(prompt, { aspectRatio: aspect });
		const job = await provider.submit({
			mode: 'reconstruct',
			params: { image: imageUrl, prompt },
		});

		// Record the generation the moment it starts so the prompt + reference
		// image survive even if the mesh step later fails. Fail-soft: a missing
		// store just means no durable copy + no gallery entry for this run.
		const creationId = await createCreation({
			clientKey: clientKeyFrom(req),
			ipHash: hashIp(ip),
			prompt,
			aspect,
			previewImageUrl: imageUrl,
			replicateJobId: job.extJobId,
			textToImageModel: model,
		});

		return json(res, 200, {
			job_id: job.extJobId,
			creation_id: creationId,
			status: 'queued',
			prompt,
			preview_image_url: imageUrl,
			text_to_image_model: model,
			eta_seconds: typeof job.eta === 'number' ? job.eta : null,
		});
	} catch (err) {
		if (err?.code === 'unconfigured') return unconfigured(res);
		return json(res, 502, {
			error: 'generation_failed',
			message: err?.message || 'The generator could not start this job.',
		});
	}
}

async function pollJob(req, res, jobId) {
	if (!JOB_ID_RE.test(jobId)) {
		return json(res, 400, { error: 'invalid_job', message: 'Malformed job id.' });
	}

	const rl = await limits.mcp3dStatus(clientIp(req));
	if (!rl.success) {
		return json(res, 429, {
			error: 'rate_limited',
			retry_after: Math.ceil((rl.reset - Date.now()) / 1000),
		});
	}

	let provider;
	try {
		provider = createRegenProvider();
	} catch {
		return unconfigured(res);
	}

	const clientKey = clientKeyFrom(req);
	const result = await provider.status(jobId);
	if (result.status === 'done' && result.resultGlbUrl) {
		// Copy the mesh + reference image into our own storage so the model is
		// permanent (Replicate delivery URLs expire in ~1h) and serve the durable
		// CDN url. Falls back to the provider url where the store is unavailable.
		const durable = await materializeCreation({
			replicateJobId: jobId,
			clientKey,
			glbUrl: result.resultGlbUrl,
		});
		return json(res, 200, {
			job_id: jobId,
			creation_id: durable?.id ?? null,
			status: 'done',
			glb_url: durable?.glbUrl ?? result.resultGlbUrl,
			durable: Boolean(durable),
		});
	}
	if (result.status === 'failed') {
		await markFailed({ replicateJobId: jobId, clientKey, error: result.error });
		return json(res, 200, {
			job_id: jobId,
			status: 'failed',
			error: result.error || 'Generation failed.',
		});
	}
	return json(res, 200, { job_id: jobId, status: result.status || 'running' });
}

export default wrap(async (req, res) => {
	if (cors(req, res, { methods: 'GET,POST,OPTIONS' })) return;
	if (!method(req, res, ['GET', 'POST'])) return;

	if (req.method === 'POST') return startJob(req, res);

	const url = new URL(req.url, 'http://localhost');
	const jobId = (url.searchParams.get('job') || '').trim();
	if (!jobId) {
		return json(res, 400, { error: 'missing_job', message: 'Pass ?job=<id> to poll a job.' });
	}
	return pollJob(req, res, jobId);
});

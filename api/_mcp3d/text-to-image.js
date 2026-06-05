// Text → image helper for the 3D Studio MCP.
//
// Provider selection (first configured wins):
//   1. GOOGLE_CLOUD_PROJECT set → Vertex AI Imagen 3 (best quality, free with GCP credits)
//   2. REPLICATE_API_TOKEN set  → flux-schnell via Replicate (fast, $0.003/image)
//
// The image-to-3D backend (TRELLIS / Hunyuan3D / TripoSR) reconstructs a
// textured GLB from the generated image. Both steps share the same call site.
//
//   GOOGLE_CLOUD_PROJECT    — GCP project id (enables Vertex AI Imagen path)
//   VERTEX_IMAGEN_MODEL     — override Imagen model (default: imagen-3.0-generate-001)
//   REPLICATE_API_TOKEN     — required when GCP not configured
//   REPLICATE_TXT2IMG_MODEL — optional Replicate model override
//
// Replicate fallback: black-forest-labs/flux-schnell — Apache-2.0,
// commercial-OK, ~1–3s per image on Replicate's fleet, $0.003/run.

const REPLICATE_BASE = 'https://api.replicate.com/v1';
const DEFAULT_TXT2IMG_MODEL = 'black-forest-labs/flux-schnell';

function readEnv(name) {
	if (typeof process !== 'undefined' && process.env && process.env[name]) return process.env[name];
	return null;
}

// Pull the first https image URL out of Replicate's `output`, which flux models
// emit as an array of URLs (sometimes a bare string for single-image models).
function extractImageUrl(output) {
	if (!output) return null;
	if (typeof output === 'string') return /^https?:\/\//.test(output) ? output : null;
	if (Array.isArray(output)) {
		for (const v of output) if (typeof v === 'string' && /^https?:\/\//.test(v)) return v;
	}
	if (typeof output === 'object') {
		for (const k of ['image', 'url', 'output']) {
			if (typeof output[k] === 'string' && /^https?:\/\//.test(output[k])) return output[k];
		}
	}
	return null;
}

// Best-effort retry hint (in seconds) for a throttled request. Prefers the
// standard Retry-After header; falls back to the "resets in ~Ns" phrasing
// Replicate uses in its throttle message. Defaults to a short, sane backoff.
function parseRetryAfter(headers, message) {
	const header = headers?.get?.('retry-after');
	const fromHeader = header ? Number.parseInt(header, 10) : NaN;
	if (Number.isFinite(fromHeader) && fromHeader > 0) return fromHeader;
	const m = /resets in ~?(\d+)\s*s/i.exec(message || '');
	if (m) return Number.parseInt(m[1], 10);
	return 10;
}

// Generate a single image from a text prompt.
//
// Prefers Vertex AI Imagen when GOOGLE_CLOUD_PROJECT is configured (free with
// GCP credits, higher quality). Falls back to Replicate flux-schnell otherwise.
export async function textToImage(prompt, { aspectRatio = '1:1' } = {}) {
	// ── Vertex AI Imagen path ────────────────────────────────────────────────
	if (readEnv('GOOGLE_CLOUD_PROJECT')) {
		const { generateImage, isConfigured } = await import('./vertex-imagen.js');
		if (isConfigured()) {
			return generateImage(prompt, { aspectRatio });
		}
	}

	// ── Replicate fallback ───────────────────────────────────────────────────
	const token = readEnv('REPLICATE_API_TOKEN');
	if (!token) {
		throw Object.assign(
			new Error(
				'text-to-image is not configured: set GOOGLE_CLOUD_PROJECT (Vertex AI) or REPLICATE_API_TOKEN (Replicate)',
			),
			{ code: 'unconfigured' },
		);
	}

	const modelRef = readEnv('REPLICATE_TXT2IMG_MODEL') || DEFAULT_TXT2IMG_MODEL;
	const isVersionHash = /^[a-f0-9]{40,64}$/i.test(modelRef);
	const slug = modelRef.match(/^([a-z0-9-]+)\/([a-z0-9._-]+)(?::([a-f0-9]+))?$/i);

	const input = {
		prompt,
		aspect_ratio: aspectRatio,
		num_outputs: 1,
		output_format: 'png',
		// A clean, evenly-lit, single-subject image on a plain background
		// reconstructs into a far better mesh than a busy scene — steer flux
		// toward that without overriding a caller's own composition cues.
		go_fast: true,
	};

	let endpoint;
	let body;
	if (isVersionHash) {
		endpoint = `${REPLICATE_BASE}/predictions`;
		body = JSON.stringify({ version: modelRef, input });
	} else if (slug) {
		const [, owner, name, pinned] = slug;
		endpoint = `${REPLICATE_BASE}/models/${owner}/${name}/predictions`;
		body = JSON.stringify(pinned ? { version: pinned, input } : { input });
	} else {
		throw new Error(`invalid REPLICATE_TXT2IMG_MODEL reference: ${modelRef}`);
	}

	let res;
	try {
		res = await fetch(endpoint, {
			method: 'POST',
			headers: {
				authorization: `Bearer ${token}`,
				'content-type': 'application/json',
				prefer: 'wait',
			},
			body,
		});
	} catch (err) {
		throw Object.assign(new Error(`text-to-image provider unreachable: ${err?.message}`), {
			code: 'provider_unreachable',
		});
	}

	const data = await res.json().catch(() => ({}));
	if (!res.ok) {
		const message = data?.detail || data?.title || `text-to-image returned ${res.status}`;
		// Replicate throttles prediction creation (notably when account credit is
		// low). Surface it as a retryable rate limit, not a generic failure, so the
		// caller can return 429 + retry hint instead of a hard 5xx.
		if (res.status === 429) {
			throw Object.assign(new Error(message), {
				code: 'rate_limited',
				retryAfter: parseRetryAfter(res.headers, message),
			});
		}
		throw Object.assign(new Error(message), { providerStatus: res.status });
	}

	// With `Prefer: wait` the prediction usually completes inline. If Replicate
	// returned before completion (slow model, timeout), surface the partial
	// state so the handler can decide — but for flux-schnell this is rare.
	const url = extractImageUrl(data.output);
	if (!url) {
		if (data.status && data.status !== 'succeeded') {
			throw new Error(`text-to-image did not complete (status: ${data.status})`);
		}
		throw new Error('text-to-image finished but produced no image');
	}
	return { imageUrl: url, predictionId: data.id, model: modelRef };
}

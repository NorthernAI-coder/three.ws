// Text → image helper for the 3D Studio MCP.
//
// Provider selection (free lanes first, per platform policy; first that serves wins):
//   1. NVIDIA_API_KEY set       → FLUX.1-schnell on NVIDIA NIM (free, ~1–2s)
//   2. GOOGLE_CLOUD_PROJECT set → Vertex AI Imagen 3 (high quality, free with GCP credits)
//   3. REPLICATE_API_TOKEN set  → flux-schnell via Replicate (paid backstop, $0.003/image)
//
// The image-to-3D backend (TRELLIS / Hunyuan3D / TripoSR) reconstructs a
// textured GLB from the generated image. Both steps share the same call site.
//
//   NVIDIA_API_KEY          — nvapi key from build.nvidia.com (enables the free NIM lane)
//   GOOGLE_CLOUD_PROJECT    — GCP project id (enables Vertex AI Imagen path)
//   VERTEX_IMAGEN_MODEL     — override Imagen model (default: imagen-3.0-generate-001)
//   REPLICATE_API_TOKEN     — paid backstop when the free lanes are absent or down
//   REPLICATE_TXT2IMG_MODEL — optional Replicate model override
//
// NIM lane: black-forest-labs/flux.1-schnell — Apache-2.0, commercial-OK, served
// free on the NVIDIA NIM catalog as a base64 PNG (no poll; returns inline).
// Replicate backstop: black-forest-labs/flux-schnell — same family, $0.003/run.

const REPLICATE_BASE = 'https://api.replicate.com/v1';
const DEFAULT_TXT2IMG_MODEL = 'black-forest-labs/flux-schnell';

// NVIDIA NIM FLUX.1-schnell — synchronous genai invoke (no 202/poll), returns
// { artifacts: [{ base64, finishReason }] }. flux-schnell is the fast 4-step
// distilled model, so a tight per-attempt timeout is safe: a hung free lane must
// hand off to the paid lanes, never stall the whole text→3D pipeline.
const NIM_FLUX_URL = 'https://ai.api.nvidia.com/v1/genai/black-forest-labs/flux.1-schnell';
const NIM_FLUX_MODEL = 'black-forest-labs/flux.1-schnell';
const NIM_TIMEOUT_MS = 60_000;

// FLUX wants explicit pixel dimensions (multiples of 64). Map the caller's
// aspect ratio to a sensible ~1MP size; anything unmapped falls back to square.
const NIM_DIMENSIONS = {
	'1:1': [1024, 1024],
	'16:9': [1344, 768],
	'9:16': [768, 1344],
	'4:3': [1024, 768],
	'3:4': [768, 1024],
	'3:2': [1216, 832],
	'2:3': [832, 1216],
};

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

// Persist a base64 PNG to object storage and return a durable https URL.
// Downstream image-to-3D providers take URLs (Replicate caps inline data URIs at
// ~256 KB — a 1024px PNG blows straight past that), so neither the Vertex inline
// data URI nor the NIM base64 artifact can be forwarded as-is.
async function persistPngBase64(b64) {
	const { putObject, publicUrl } = await import('../_lib/r2.js');
	const key = `forge/refs/${globalThis.crypto.randomUUID()}.png`;
	await putObject({ key, body: Buffer.from(b64, 'base64'), contentType: 'image/png' });
	return publicUrl(key);
}

// Vertex Imagen returns the PNG inline as a data: URI — persist it the same way
// the NIM lane persists its base64 artifact.
async function persistDataUriImage(result) {
	if (!result?.imageUrl?.startsWith('data:')) return result;
	const b64 = result.imageUrl.split(',')[1] || '';
	return { ...result, imageUrl: await persistPngBase64(b64) };
}

// Free lane: FLUX.1-schnell on NVIDIA NIM. Synchronous invoke — the artifact
// comes back inline as base64, no poll. Caller guarantees NVIDIA_API_KEY is set.
// Throws on any failure (timeout, throttle, malformed body) so the caller can
// degrade to the paid lanes; never returns a half-result.
async function nimFluxImage(prompt, aspectRatio) {
	const key = readEnv('NVIDIA_API_KEY');
	const [width, height] = NIM_DIMENSIONS[aspectRatio] || NIM_DIMENSIONS['1:1'];

	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), NIM_TIMEOUT_MS);
	let res;
	try {
		res = await fetch(NIM_FLUX_URL, {
			method: 'POST',
			headers: {
				authorization: `Bearer ${key}`,
				accept: 'application/json',
				'content-type': 'application/json',
			},
			body: JSON.stringify({
				prompt,
				mode: 'base',
				cfg_scale: 3.5,
				width,
				height,
				seed: 0,
				steps: 4,
			}),
			signal: controller.signal,
		});
	} catch (err) {
		const aborted = err?.name === 'AbortError';
		throw Object.assign(
			new Error(aborted ? 'nim flux timed out' : `nim flux unreachable: ${err?.message}`),
			{ code: aborted ? 'rate_limited' : 'provider_unreachable' },
		);
	} finally {
		clearTimeout(timer);
	}

	if (!res.ok) {
		const detail = await res.text().catch(() => '');
		const message = `nim flux returned ${res.status}${detail ? `: ${detail.slice(0, 200)}` : ''}`;
		// 429 (credit-metered free tier) is retryable; surface it so a caller can
		// route, but here it just means "fall through to the paid lanes".
		throw Object.assign(new Error(message), {
			providerStatus: res.status,
			...(res.status === 429 ? { code: 'rate_limited' } : {}),
		});
	}

	const data = await res.json().catch(() => ({}));
	const b64 = data?.artifacts?.[0]?.base64;
	if (!b64) throw new Error('nim flux finished but produced no image');
	return { imageUrl: await persistPngBase64(b64), model: NIM_FLUX_MODEL };
}

// Generate a single image from a text prompt.
//
// Tries the free lanes first (NIM FLUX, then Vertex Imagen) and degrades to the
// paid Replicate backstop on any failure — a broken or throttled preferred
// provider must hand off, never take down the whole text→3D pipeline. The last
// configured lane's error is surfaced only when nothing is left to try.
export async function textToImage(prompt, { aspectRatio = '1:1' } = {}) {
	const token = readEnv('REPLICATE_API_TOKEN');
	const hasVertex = !!readEnv('GOOGLE_CLOUD_PROJECT');

	// ── NVIDIA NIM FLUX (free, first) ─────────────────────────────────────────
	if (readEnv('NVIDIA_API_KEY')) {
		try {
			return await nimFluxImage(prompt, aspectRatio);
		} catch (err) {
			// Nothing downstream to fall through to → surface the NIM error.
			if (!hasVertex && !token) throw err;
			console.error(`nim flux failed, falling back: ${err?.message}`);
		}
	}

	// ── Vertex AI Imagen path ────────────────────────────────────────────────
	if (hasVertex) {
		try {
			const { generateImage, isConfigured } = await import('./vertex-imagen.js');
			if (isConfigured()) {
				return await persistDataUriImage(await generateImage(prompt, { aspectRatio }));
			}
		} catch (err) {
			if (!token) throw err;
			console.error(`vertex imagen failed, falling back to replicate: ${err?.message}`);
		}
	}

	// ── Replicate fallback ───────────────────────────────────────────────────
	if (!token) {
		throw Object.assign(
			new Error(
				'text-to-image is not configured: set NVIDIA_API_KEY (NIM), GOOGLE_CLOUD_PROJECT (Vertex AI), or REPLICATE_API_TOKEN (Replicate)',
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

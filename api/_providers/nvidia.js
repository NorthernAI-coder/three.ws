// NVIDIA NIM provider — the FREE TRELLIS 3D-generation backend (TEXT-ONLY).
//
// Microsoft TRELLIS hosted on NVIDIA NVCF gives `/forge` a zero-vendor-cost
// text→3D lane (GLB output) behind the platform `NVIDIA_API_KEY`. Per the
// platform free-first policy it is the default draft backend for prompt
// generations, with the paid Replicate/Meshy/Tripo lanes staying selectable.
//
// ── Why text-only ────────────────────────────────────────────────────────────
// The hosted preview API does NOT accept user images for mode:"image": every
// form — inline base64 at any size, NVCF asset references (`;asset_id,` with
// NVCF-INPUT-ASSET-REFERENCES), bare asset ids — is rejected 422; the only
// accepted image input is `data:image/png;example_id,{0..3}` referencing
// NVIDIA's predefined sample images. Verified live 2026-06-11 against the real
// endpoint and confirmed by the official schema docs — full transcripts in
// tasks/nvidia-nim/probes/trellis.md. Self-deployed TRELLIS NIMs accept real
// image input, so this constraint is about NVIDIA's hosted preview, not the
// model; if NVIDIA lifts it, the asset handshake recipe is preserved in the
// probe file and git history.
//
// The forge layer therefore routes user-photo submissions to the standing
// image backend (Replicate TRELLIS) and only sends prompts here — see
// resolveBackendId({ userImages }) in api/_lib/forge-tiers.js.
//
// ── Protocol (verified live, T0.2/T1.1 probes) ──────────────────────────────
//   submit  POST https://ai.api.nvidia.com/v1/genai/microsoft/trellis
//           Authorization: Bearer nvapi-…   Accept: application/json
//           { mode:"text", prompt, seed?, ss_sampling_steps, slat_sampling_steps, output_format:"glb" }
//           → 202 + header NVCF-REQID  (async; poll)   |   200 + body (synchronous completion)
//
//   poll    GET https://api.nvcf.nvidia.com/v2/nvcf/pexec/status/{NVCF-REQID}
//           → 202 (still running)   |   200 (done, body holds the GLB)
//
//   result  body.artifacts[0].base64  — base64-encoded .glb; we decode it and
//           persist to R2, then hand back a durable public URL like the other
//           providers (replicate/meshy return upstream URLs; TRELLIS returns the
//           bytes inline, so WE own the persist).
//
// Error codes match the established provider contract (replicate.js / meshy.js):
//   provider_unreachable / invalid_key / insufficient_credits / rate_limited /
//   provider_error — so the forge layer can route around a dead/limited lane.

import { env } from '../_lib/env.js';

const TRELLIS_INVOKE_URL = 'https://ai.api.nvidia.com/v1/genai/microsoft/trellis';
const NVCF_STATUS_URL = 'https://api.nvcf.nvidia.com/v2/nvcf/pexec/status';

// TRELLIS truncates the text prompt at 77 characters server-side; clamp so the
// request is honest about what's actually conditioning the generation.
const TRELLIS_PROMPT_MAX = 77;

// Per-request timeouts so a hung upstream never stalls a serverless function.
// A completed poll streams the full GLB (can be several MB), so it gets longer.
const SUBMIT_TIMEOUT_MS = 30_000;
const POLL_TIMEOUT_MS = 60_000;

// Sampling steps per quality tier, clamped to TRELLIS's accepted 10–50 window.
// More steps = finer geometry/texture at higher latency; draft stays cheap so
// the free lane returns a usable preview fast.
function trellisSteps(tier) {
	const id = tier?.id || tier || 'draft';
	switch (id) {
		case 'high':
			return { ss: 40, slat: 40 };
		case 'standard':
			return { ss: 25, slat: 25 };
		case 'draft':
		default:
			return { ss: 15, slat: 15 };
	}
}

// Map an upstream HTTP status onto the normalized error the forge layer routes
// on. `retryAfter` (seconds) is attached for 429 so callers can back off.
function providerError(status, message, retryAfter) {
	let code = 'provider_error';
	let mapped = 502;
	if (status === 401 || status === 403) {
		code = 'invalid_key';
		mapped = 401;
	} else if (status === 402) {
		code = 'insufficient_credits';
		mapped = 402;
	} else if (status === 429) {
		code = 'rate_limited';
		mapped = 429;
	}
	const err = Object.assign(new Error(message || `NVIDIA returned ${status}`), {
		code,
		status: mapped,
		providerStatus: status,
	});
	if (retryAfter != null) {
		const secs = Number(retryAfter);
		if (Number.isFinite(secs)) err.retryAfter = secs;
	}
	return err;
}

function buildTextBody({ prompt, tier, seed }) {
	const steps = trellisSteps(tier);
	const body = {
		mode: 'text',
		prompt: String(prompt || '').slice(0, TRELLIS_PROMPT_MAX),
		ss_sampling_steps: steps.ss,
		slat_sampling_steps: steps.slat,
		output_format: 'glb',
	};
	if (Number.isInteger(seed)) body.seed = seed;
	return body;
}

export function createNvidiaProvider() {
	const apiKey = env.NVIDIA_API_KEY;
	if (!apiKey) {
		throw Object.assign(
			new Error('NVIDIA_API_KEY env var is required for the nvidia (TRELLIS) provider'),
			{ code: 'missing_key', status: 503 },
		);
	}

	const authHeader = { authorization: `Bearer ${apiKey}` };
	const invokeHeaders = { ...authHeader, accept: 'application/json', 'content-type': 'application/json' };
	const pollHeaders = { ...authHeader, accept: 'application/json' };

	// Decode a base64 GLB and store it in R2, returning a durable public URL —
	// the same persist the Vertex inline-PNG path uses, but for model bytes.
	async function persistGlb(base64) {
		const { putObject, publicUrl } = await import('../_lib/r2.js');
		const key = `forge/nvidia/${globalThis.crypto.randomUUID()}.glb`;
		await putObject({
			key,
			body: Buffer.from(base64, 'base64'),
			contentType: 'model/gltf-binary',
		});
		return publicUrl(key);
	}

	// POST the invoke request. Returns either { done:true, glbBase64 } when the
	// generation completed synchronously (200) or { done:false, reqId } when NVCF
	// accepted it for async processing (202). Throws normalized provider errors.
	async function postInvoke(body, extraHeaders) {
		let res;
		try {
			res = await fetch(TRELLIS_INVOKE_URL, {
				method: 'POST',
				headers: { ...invokeHeaders, ...extraHeaders },
				body: JSON.stringify(body),
				signal: AbortSignal.timeout(SUBMIT_TIMEOUT_MS),
			});
		} catch (err) {
			throw Object.assign(new Error(`nvidia unreachable: ${err?.message}`), {
				code: 'provider_unreachable',
				status: 502,
			});
		}

		if (res.status === 202) {
			const reqId = res.headers.get('nvcf-reqid');
			if (!reqId) {
				throw Object.assign(new Error('NVCF accepted the job but returned no NVCF-REQID'), {
					code: 'provider_error',
					status: 502,
				});
			}
			return { done: false, reqId };
		}

		if (res.ok) {
			const data = await res.json().catch(() => ({}));
			const b64 = data?.artifacts?.[0]?.base64;
			if (!b64) {
				throw Object.assign(new Error('TRELLIS completed but returned no GLB artifact'), {
					code: 'provider_error',
					status: 502,
				});
			}
			return { done: true, glbBase64: b64 };
		}

		let detail = '';
		try {
			const d = await res.json();
			detail = d?.detail || d?.message || d?.title || '';
			// TRELLIS 422s carry `detail` as an array of validation objects — keep
			// it human-readable rather than collapsing to "[object Object]".
			if (detail && typeof detail !== 'string') detail = JSON.stringify(detail);
		} catch {
			detail = await res.text().catch(() => '');
		}
		throw providerError(res.status, detail || undefined, res.headers.get('retry-after'));
	}

	// Finish a submission: persist immediately on synchronous completion,
	// otherwise return the poll handle. Shared by the text and image paths.
	async function finishSubmit(kind, parsed) {
		if (parsed.done) {
			const resultGlbUrl = await persistGlb(parsed.glbBase64);
			return { kind, taskId: null, resultGlbUrl };
		}
		return { kind, taskId: parsed.reqId };
	}

	return {
		// Native text→3D. Returns a poll handle, or a ready R2 GLB URL when NVCF
		// completed the job within the submit request.
		async textTo3d({ prompt, tier, seed } = {}) {
			const parsed = await postInvoke(buildTextBody({ prompt, tier, seed }), {});
			return finishSubmit('text-to-3d', parsed);
		},

		// Poll an async job. Never throws — transient failures resolve to
		// 'running' so the forge poll loop keeps the job alive; only terminal
		// upstream states map to 'failed'. On 'done' the GLB is decoded, persisted
		// to R2, and returned as a durable public URL.
		async status({ taskId } = {}) {
			if (!taskId) return { status: 'failed', error: 'missing NVCF request id' };

			let res;
			try {
				res = await fetch(`${NVCF_STATUS_URL}/${encodeURIComponent(taskId)}`, {
					headers: pollHeaders,
					signal: AbortSignal.timeout(POLL_TIMEOUT_MS),
				});
			} catch (err) {
				return { status: 'running', error: `nvidia poll failed: ${err?.message}` };
			}

			if (res.status === 202) return { status: 'running' };

			if (res.ok) {
				const data = await res.json().catch(() => ({}));
				const b64 = data?.artifacts?.[0]?.base64;
				if (!b64) return { status: 'failed', error: 'TRELLIS finished but returned no GLB artifact' };
				try {
					const resultGlbUrl = await persistGlb(b64);
					return { status: 'done', resultGlbUrl };
				} catch (err) {
					return { status: 'failed', error: `failed to persist GLB: ${err?.message}` };
				}
			}

			if (res.status === 401 || res.status === 403) {
				return { status: 'failed', error: 'NVIDIA rejected the API key' };
			}
			if (res.status === 404) {
				return { status: 'failed', error: 'NVCF request not found or expired' };
			}
			// 429 / 5xx mid-flight: the job may still be alive — keep polling.
			if (res.status === 429) {
				return { status: 'running', error: 'NVIDIA is rate limiting; will retry' };
			}
			return { status: 'running', error: `NVIDIA poll returned ${res.status}` };
		},
	};
}

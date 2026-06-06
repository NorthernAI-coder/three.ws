// Tripo provider — alternative native geometry-first backend.
//
//   geometry path → POST /v2/openapi/task { type: "text_to_model" }
//       Native text→model: clean (often quad) geometry directly from the
//       prompt. `face_limit` carries the tier's poly budget.
//
//   image path    → POST /v2/openapi/task { type: "image_to_model" }
//       Single-image reconstruction with PBR textures.
//
// Tripo wraps every response in { code, data } and polls a single task
// endpoint regardless of type, so this client is simpler than Meshy's.
//
// BYOK only: the caller passes the user's Tripo key (tsk_…). The model version
// defaults to v3.1 and is overridable via TRIPO_MODEL_VERSION.

const TRIPO_BASE = 'https://api.tripo3d.ai/v2/openapi';
const DEFAULT_MODEL_VERSION = 'v3.1-20260211';

// Tripo's face_limit is unbounded upward in practice, but keep the same sane
// floor/ceiling as the rest of the pipeline so a tier can't request an
// unworkable mesh.
const FACE_MIN = 100;
const FACE_MAX = 300_000;

function clampFaces(n) {
	const v = Math.round(Number(n) || 0);
	return Math.max(FACE_MIN, Math.min(FACE_MAX, v));
}

function modelVersion() {
	if (typeof process !== 'undefined' && process.env?.TRIPO_MODEL_VERSION) {
		return process.env.TRIPO_MODEL_VERSION;
	}
	return DEFAULT_MODEL_VERSION;
}

function mapStatus(s) {
	switch (String(s || '').toLowerCase()) {
		case 'queued':
			return 'queued';
		case 'running':
			return 'running';
		case 'success':
			return 'done';
		case 'failed':
		case 'cancelled':
		case 'banned':
		case 'expired':
		case 'unknown':
			return 'failed';
		default:
			return 'queued';
	}
}

// .jpg / .jpeg / .png — Tripo's image_to_model `file` needs an explicit type.
function imageTypeFor(url) {
	const m = /\.(jpe?g|png|webp)(\?|$)/i.exec(url || '');
	const ext = m ? m[1].toLowerCase() : 'jpg';
	return ext === 'jpeg' ? 'jpg' : ext;
}

export function createTripoProvider(apiKey) {
	if (!apiKey) {
		throw Object.assign(new Error('Tripo API key is required'), { code: 'missing_key' });
	}
	const headers = {
		authorization: `Bearer ${apiKey}`,
		'content-type': 'application/json',
	};

	async function createTask(body) {
		let res;
		try {
			res = await fetch(`${TRIPO_BASE}/task`, {
				method: 'POST',
				headers,
				body: JSON.stringify(body),
			});
		} catch (err) {
			throw Object.assign(new Error(`tripo unreachable: ${err?.message}`), {
				code: 'provider_unreachable',
				status: 502,
			});
		}
		const data = await res.json().catch(() => ({}));
		if (res.status === 401 || res.status === 403) {
			throw Object.assign(new Error('Tripo rejected the API key.'), {
				code: 'invalid_key',
				status: 401,
				providerStatus: res.status,
			});
		}
		if (res.status === 402 || data?.code === 2000) {
			throw Object.assign(new Error('Tripo account is out of credits.'), {
				code: 'insufficient_credits',
				status: 402,
			});
		}
		if (res.status === 429) {
			throw Object.assign(new Error('Tripo is rate limiting this key.'), {
				code: 'rate_limited',
				status: 429,
				providerStatus: 429,
			});
		}
		// Tripo signals success with code 0; anything else is an error envelope.
		if (!res.ok || data?.code !== 0) {
			throw Object.assign(
				new Error(data?.message || `tripo returned ${res.status} (code ${data?.code})`),
				{ code: 'provider_error', status: 502, providerStatus: res.status },
			);
		}
		const taskId = data?.data?.task_id;
		if (!taskId) {
			throw Object.assign(new Error('tripo accepted the task but returned no task_id'), {
				code: 'provider_error',
				status: 502,
			});
		}
		return String(taskId);
	}

	return {
		async textToGeometry({ prompt, tier }) {
			const taskId = await createTask({
				type: 'text_to_model',
				prompt: String(prompt).slice(0, 1024),
				model_version: modelVersion(),
				face_limit: clampFaces(tier.polycount),
				texture: false,
				pbr: false,
			});
			return { kind: 'task', taskId };
		},

		async imageTo3d({ imageUrl, tier }) {
			const taskId = await createTask({
				type: 'image_to_model',
				file: { type: imageTypeFor(imageUrl), url: imageUrl },
				model_version: modelVersion(),
				face_limit: clampFaces(tier.polycount),
				texture: true,
				pbr: Boolean(tier.pbr),
			});
			return { kind: 'task', taskId };
		},

		// One status endpoint for every task type.
		async status({ taskId }) {
			let res;
			try {
				res = await fetch(`${TRIPO_BASE}/task/${encodeURIComponent(taskId)}`, { headers });
			} catch (err) {
				return { status: 'running', error: `tripo poll failed: ${err?.message}` };
			}
			const data = await res.json().catch(() => ({}));
			if (res.status === 404) return { status: 'failed', error: 'tripo task not found' };
			if (!res.ok || data?.code !== 0) {
				return { status: 'running', error: `tripo returned ${res.status}` };
			}

			const d = data.data || {};
			const status = mapStatus(d.status);
			const result = { status, progress: Number(d.progress) || 0 };

			if (status === 'done') {
				const out = d.output || d.result || {};
				const glb = out.pbr_model || out.model || out.base_model;
				if (glb) result.resultGlbUrl = glb;
				else result.error = 'tripo finished but produced no model url';
			}
			if (status === 'failed') {
				result.error = `tripo task ${d.status || 'failed'}`;
			}
			return result;
		},
	};
}

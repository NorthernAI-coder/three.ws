// GCP Cloud Run provider — implements the same contract as the Replicate provider.
//
//   submit(request)  → { extJobId, eta }
//   status(extJobId) → { status, resultGlbUrl?, resultImageUrl?, error? }
//
// Supported modes and the Cloud Run service they route to:
//
//   reconstruct  → GCP_RECONSTRUCTION_URL   (avatar-pipeline-controller)
//                  POST /reconstruct → { job_id }  GET /jobs/:id → { status, glb_url }
//
//   remesh       → GCP_REMESH_URL           (workers/remesh)
//   retex        → GCP_TEXTURE_URL          (workers/texture)
//   rembg        → GCP_REMBG_URL            (workers/rembg)
//   rerig        → GCP_RECONSTRUCTION_URL   (avatar-pipeline-controller, /rig endpoint)
//
// All workers share the same bearer secret (GCP_RECONSTRUCTION_KEY).
// Each worker exposes the same task shape:
//   POST /…  → { task_id, status: "queued" }
//   GET /tasks/:id → { task_id, status, result_url|result_gcs_url?, error? }
//
// The extJobId is a JSON envelope base64url-encoded so it can carry both
// the service discriminator and the upstream task_id without another DB call.

function readEnv(name) {
	if (typeof process !== 'undefined' && process.env?.[name]) return process.env[name];
	return null;
}

function packJobId(payload) {
	return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
}
function unpackJobId(extJobId) {
	try {
		return JSON.parse(Buffer.from(extJobId, 'base64url').toString('utf8'));
	} catch {
		return null;
	}
}

function translateStatus(s) {
	switch (s) {
		case 'queued':  return 'queued';
		case 'running': return 'running';
		case 'done':    return 'done';
		case 'failed':  return 'failed';
		default:        return 'queued';
	}
}

// Resolve which Cloud Run base URL handles a given mode.
function serviceUrlForMode(mode) {
	switch (mode) {
		case 'reconstruct':
			return readEnv('GCP_RECONSTRUCTION_URL');
		case 'remesh':
			return readEnv('GCP_REMESH_URL');
		case 'retex':
			return readEnv('GCP_TEXTURE_URL');
		case 'rembg':
			return readEnv('GCP_REMBG_URL');
		case 'rerig':
			// Rigging is handled by the pipeline controller via its /rig endpoint.
			return readEnv('GCP_RECONSTRUCTION_URL');
		default:
			return null;
	}
}

// Build the request body and path suffix for each worker's API shape.
function buildWorkerRequest(request) {
	const { mode, sourceUrl, params } = request;

	if (mode === 'reconstruct') {
		const photos = Array.isArray(params?.images) && params.images.length
			? params.images
			: [sourceUrl].filter(Boolean);
		return {
			path: '/reconstruct',
			resultKey: 'glb_url',
			body: { images: photos, body_type: params?.bodyType || 'neutral' },
		};
	}

	if (mode === 'remesh') {
		return {
			path: '/process',
			resultKey: 'result_url',
			body: {
				mesh: sourceUrl,
				operation: params?.operation || 'full',
				target_faces: params?.target_faces || 50_000,
				output_format: params?.output_format || 'glb',
			},
		};
	}

	if (mode === 'retex') {
		return {
			path: '/texture',
			resultKey: 'result_url',
			body: {
				mesh: sourceUrl,
				prompt: params?.prompt || '',
				negative_prompt: params?.negative_prompt || 'blurry, low quality, distorted',
				num_views: params?.num_views || 8,
				texture_size: params?.texture_size || 1024,
			},
		};
	}

	if (mode === 'rembg') {
		return {
			path: '/remove',
			resultKey: 'result_url',
			body: {
				image: sourceUrl,
				model: params?.model || 'rmbg2',
			},
		};
	}

	if (mode === 'rerig') {
		return {
			path: '/rig',
			resultKey: 'glb_url',
			body: {
				mesh_url: sourceUrl,
				rig_type: params?.rig_type || 'biped',
			},
		};
	}

	return null;
}

// Expected wall-clock ETAs (seconds) per mode — used to populate the
// progress indicator on the client side.
const MODE_ETA = {
	reconstruct: 120,
	remesh: 30,
	retex: 180,
	rembg: 5,
	rerig: 45,
};

export function createRegenProvider() {
	const apiKey = readEnv('GCP_RECONSTRUCTION_KEY');
	if (!apiKey) {
		throw new Error('GCP_RECONSTRUCTION_KEY env var is required for the gcp provider');
	}

	const authHeaders = {
		authorization: `Bearer ${apiKey}`,
		'content-type': 'application/json',
	};

	return {
		supportsMode(mode) {
			return Boolean(serviceUrlForMode(mode));
		},

		async submit(request) {
			const { mode } = request;
			const baseUrl = serviceUrlForMode(mode);
			if (!baseUrl) {
				throw Object.assign(
					new Error(`gcp provider: no service URL configured for mode "${mode}"`),
					{ code: 'mode_unconfigured', status: 501 },
				);
			}

			const workerReq = buildWorkerRequest(request);
			if (!workerReq) {
				throw Object.assign(
					new Error(`gcp provider: unsupported mode "${mode}"`),
					{ code: 'mode_unconfigured', status: 501 },
				);
			}

			const url = `${baseUrl.replace(/\/$/, '')}${workerReq.path}`;
			let response;
			try {
				response = await fetch(url, {
					method: 'POST',
					headers: authHeaders,
					body: JSON.stringify(workerReq.body),
				});
			} catch (err) {
				throw Object.assign(
					new Error(`gcp ${mode} service unreachable: ${err?.message}`),
					{ code: 'provider_unreachable', status: 502 },
				);
			}

			const data = await response.json().catch(() => ({}));
			if (!response.ok) {
				throw Object.assign(
					new Error(data?.detail || data?.error || `gcp service returned ${response.status}`),
					{ code: 'provider_error', status: 502, providerStatus: response.status },
				);
			}

			// Workers return either task_id (new) or job_id (legacy reconstruct).
			const taskId = data.task_id || data.job_id;
			if (!taskId) {
				throw Object.assign(
					new Error('gcp service returned no task_id'),
					{ code: 'provider_error', status: 502 },
				);
			}

			return {
				extJobId: packJobId({ mode, taskId, baseUrl, resultKey: workerReq.resultKey }),
				eta: MODE_ETA[mode] ?? 60,
			};
		},

		async status(extJobId) {
			if (!extJobId) {
				return { status: 'failed', error: 'missing ext_job_id' };
			}

			const job = unpackJobId(extJobId);
			if (!job?.taskId || !job?.baseUrl) {
				return { status: 'failed', error: 'malformed ext_job_id' };
			}

			const { mode, taskId, baseUrl, resultKey } = job;

			// Legacy reconstruct path uses /jobs/:id; new workers use /tasks/:id.
			const pollPath = mode === 'reconstruct'
				? `/jobs/${encodeURIComponent(taskId)}`
				: `/tasks/${encodeURIComponent(taskId)}`;

			let response;
			try {
				response = await fetch(
					`${baseUrl.replace(/\/$/, '')}${pollPath}`,
					{ headers: authHeaders },
				);
			} catch (err) {
				return { status: 'running', error: `poll failed: ${err?.message}` };
			}

			if (response.status === 404) {
				return { status: 'failed', error: 'task not found on gcp service' };
			}

			const data = await response.json().catch(() => ({}));
			if (!response.ok) {
				return { status: 'running', error: `gcp returned ${response.status}` };
			}

			const status = translateStatus(data.status);
			const result = { status };

			if (status === 'done') {
				const url = data[resultKey] || data.result_url || data.glb_url || data.result_gcs_url;
				if (!url) {
					result.status = 'failed';
					result.error = `${mode} finished but no result URL in response`;
				} else if (mode === 'rembg') {
					result.resultImageUrl = url;
				} else {
					result.resultGlbUrl = url;
				}
			}

			if (status === 'failed') {
				result.error = data.error || `${mode} failed`;
			}

			return result;
		},
	};
}

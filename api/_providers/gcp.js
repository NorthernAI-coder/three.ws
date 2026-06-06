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
//   stylize      → GCP_STYLIZE_URL          (workers/stylize)
//   retex        → GCP_TEXTURE_URL          (workers/texture)
//   rembg        → GCP_REMBG_URL            (workers/rembg)
//   segment      → GCP_SEGMENT_URL          (workers/segment)
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
		case 'stylize':
			return readEnv('GCP_STYLIZE_URL');
		case 'retex':
		case 'retex_region':
			// Region (magic-brush) edits run on the same texture worker.
			return readEnv('GCP_TEXTURE_URL');
		case 'rembg':
			return readEnv('GCP_REMBG_URL');
		case 'segment':
			return readEnv('GCP_SEGMENT_URL');
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
		const body = { images: photos, body_type: params?.bodyType || 'neutral' };
		// Quality-tier provenance + poly budget for the self-host high-detail path.
		// Only forwarded when set, so the default request shape is unchanged.
		if (Number.isFinite(Number(params?.target_polycount))) {
			body.target_polycount = Math.round(Number(params.target_polycount));
		}
		if (params?.tier) body.tier = params.tier;
		if (params?.path) body.path = params.path;
		return {
			path: '/reconstruct',
			resultKey: 'glb_url',
			body,
		};
	}

	if (mode === 'remesh') {
		return {
			path: '/process',
			resultKey: 'result_url',
			body: {
				mesh: sourceUrl,
				remesh_mode: params?.remesh_mode || 'triangle',
				operation: params?.operation || 'full',
				target_faces: params?.target_faces || 50_000,
				texture_size: params?.texture_size || 1024,
				output_format: params?.output_format || 'glb',
			},
		};
	}

	if (mode === 'stylize') {
		return {
			path: '/process',
			resultKey: 'result_url',
			body: {
				mesh: sourceUrl,
				style: params?.style || 'voxel',
				resolution: params?.resolution ?? null,
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

	if (mode === 'retex_region') {
		// Magic brush: repaint only the masked UV region of the existing texture.
		// The mask arrives as inline base64 (browser canvas) or a public URL.
		return {
			path: '/retexture_region',
			resultKey: 'result_url',
			body: {
				mesh: sourceUrl,
				prompt: params?.prompt || '',
				negative_prompt:
					params?.negative_prompt || 'blurry, low quality, distorted, watermark, seam',
				mask_b64: params?.mask_b64 || null,
				mask: params?.mask || null,
				color: params?.color || null,
				texture_size: params?.texture_size || 1024,
				strength: params?.strength ?? 0.85,
				feather: params?.feather ?? 24,
				seed: params?.seed ?? 0,
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

	if (mode === 'segment') {
		return {
			path: '/segment',
			resultKey: 'result_url',
			body: {
				mesh: sourceUrl,
				method: params?.method || 'auto',
				max_parts: params?.max_parts || 24,
				min_part_faces: params?.min_part_faces || 64,
				crease_angle: params?.crease_angle ?? 40,
				...(params?.only_part ? { only_part: params.only_part } : {}),
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
	stylize: 25,
	retex: 180,
	retex_region: 60,
	rembg: 5,
	segment: 45,
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

		// The reconstruction worker accepts an `images` array and fuses every
		// supplied view, so multi-view conditioning is available whenever the
		// reconstruct service is configured.
		supportsMultiview() {
			return Boolean(serviceUrlForMode('reconstruct'));
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

			// Report how the job was conditioned. For reconstruct the worker fuses
			// every image in the body; other modes are single-source.
			const viewsUsed =
				mode === 'reconstruct' && Array.isArray(workerReq.body.images)
					? workerReq.body.images.length
					: 0;

			return {
				extJobId: packJobId({ mode, taskId, baseUrl, resultKey: workerReq.resultKey }),
				eta: MODE_ETA[mode] ?? 60,
				backend: 'gcp',
				multiview: viewsUsed > 1,
				viewsUsed,
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
				// Surface remesh telemetry so callers can show topology stats.
				if (mode === 'remesh') {
					if (typeof data.face_count === 'number') result.faceCount = data.face_count;
					if (typeof data.quad_ratio === 'number') result.quadRatio = data.quad_ratio;
					if (typeof data.textured === 'boolean') result.textured = data.textured;
					if (data.texture_url) result.textureUrl = data.texture_url;
					if (data.mode) result.mode = data.mode;
				}
				// Surface the parts manifest so callers can render a selectable
				// part list without a second fetch.
				if (mode === 'segment') {
					if (data.manifest_url) result.manifestUrl = data.manifest_url;
					if (Array.isArray(data.parts)) result.parts = data.parts;
					if (typeof data.part_count === 'number') result.partCount = data.part_count;
					if (typeof data.source_faces === 'number') result.sourceFaces = data.source_faces;
					if (data.method) result.segmentMethod = data.method;
					if (Array.isArray(data.warnings) && data.warnings.length) result.warnings = data.warnings;
				}
			}

			if (status === 'failed') {
				result.error = data.error || `${mode} failed`;
			}

			return result;
		},
	};
}

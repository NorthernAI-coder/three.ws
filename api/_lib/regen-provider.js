// Avatar regeneration provider loader — shared by the regenerate / reconstruct
// endpoints, the reconstruct-finalize stage, and the Replicate webhook.
//
// Dynamically imports a provider module by name so we don't pay the cost of
// loading e.g. the Replicate SDK on every request when regeneration is unused.
// Cached per-process after first load.
//
// Provider name precedence (platform-level, env-configured):
//   1. Explicit env: AVATAR_REGEN_PROVIDER=replicate|huggingface|gcp
//   2. Inferred from credentials: REPLICATE_API_TOKEN → replicate,
//      GCP_RECONSTRUCTION_URL → gcp, HF_TOKEN → huggingface.
//
// BYOK providers (Meshy, Tripo) are NOT in this precedence chain — they are
// request-scoped (the caller supplies the key) and are loaded via
// getRegenProviderByName(). The reconstruct endpoint checks platform first and
// falls back to a user's stored BYOK key when the platform is unconfigured.

// Tier used when adapting BYOK geometry providers for the regen interface.
// Mirrors the forge "standard" tier: solid polycount, PBR textures, no HD
// surcharge so the selfie pipeline isn't pay-gated without warning.
const REGEN_TIER = Object.freeze({ polycount: 30_000, pbr: true, hd: false });

// BYOK provider names that support the reconstruct (image → 3D) mode.
export const BYOK_REGEN_PROVIDERS = Object.freeze(['meshy', 'tripo']);

// Wraps createMeshyProvider to speak the regen submit/status interface.
// ext_job_id is the raw Meshy task id — job.provider === 'meshy' tells the
// status handler which adapter to use, so no kind prefix is needed.
function createMeshyRegenAdapter(key) {
	let _meshy;
	async function meshy() {
		if (!_meshy) {
			const mod = await import('../_providers/meshy.js');
			_meshy = mod.createMeshyProvider(key);
		}
		return _meshy;
	}

	return {
		supportsMode(mode) {
			return mode === 'reconstruct';
		},
		supportsMultiview() {
			return false;
		},

		async submit({ mode, params, sourceUrl }) {
			if (mode !== 'reconstruct') {
				throw Object.assign(
					new Error(`meshy BYOK regen does not support mode "${mode}"`),
					{ code: 'mode_unconfigured', status: 501 },
				);
			}
			const images = Array.isArray(params?.images) ? params.images : [];
			const imageUrl = images[0] || sourceUrl;
			if (!imageUrl) {
				throw Object.assign(new Error('meshy regen: no image URL provided'), {
					code: 'invalid_request',
					status: 400,
				});
			}
			const provider = await meshy();
			const result = await provider.imageTo3d({
				imageUrl,
				prompt: params?.name || '',
				tier: REGEN_TIER,
			});
			// result.taskId is the Meshy task id; stored directly as ext_job_id.
			return {
				extJobId: result.taskId,
				eta: 90,
				backend: 'meshy',
			};
		},

		async status(extJobId) {
			if (!extJobId) return { status: 'failed', error: 'missing ext_job_id' };
			const provider = await meshy();
			// Meshy status always uses kind 'image-to-3d' for selfie submissions.
			return provider.status({ kind: 'image-to-3d', taskId: extJobId });
		},
	};
}

// Wraps createTripoProvider to speak the regen submit/status interface.
function createTripoRegenAdapter(key) {
	let _tripo;
	async function tripo() {
		if (!_tripo) {
			const mod = await import('../_providers/tripo.js');
			_tripo = mod.createTripoProvider(key);
		}
		return _tripo;
	}

	return {
		supportsMode(mode) {
			return mode === 'reconstruct';
		},
		supportsMultiview() {
			return false;
		},

		async submit({ mode, params, sourceUrl }) {
			if (mode !== 'reconstruct') {
				throw Object.assign(
					new Error(`tripo BYOK regen does not support mode "${mode}"`),
					{ code: 'mode_unconfigured', status: 501 },
				);
			}
			const images = Array.isArray(params?.images) ? params.images : [];
			const imageUrl = images[0] || sourceUrl;
			if (!imageUrl) {
				throw Object.assign(new Error('tripo regen: no image URL provided'), {
					code: 'invalid_request',
					status: 400,
				});
			}
			const provider = await tripo();
			const result = await provider.imageTo3d({ imageUrl, tier: REGEN_TIER });
			return {
				extJobId: result.taskId,
				eta: 60,
				backend: 'tripo',
			};
		},

		async status(extJobId) {
			if (!extJobId) return { status: 'failed', error: 'missing ext_job_id' };
			const provider = await tripo();
			return provider.status({ taskId: extJobId });
		},
	};
}

// Instantiate a named BYOK regen adapter with the given API key. Only the
// providers listed in BYOK_REGEN_PROVIDERS are supported here.
export function getRegenProviderByName(name, key) {
	if (!key) {
		throw Object.assign(new Error(`${name} regen: API key is required`), {
			code: 'missing_key',
			status: 400,
		});
	}
	switch (name) {
		case 'meshy':
			return { name, instance: createMeshyRegenAdapter(key) };
		case 'tripo':
			return { name, instance: createTripoRegenAdapter(key) };
		default:
			throw Object.assign(new Error(`unknown BYOK regen provider: ${name}`), {
				code: 'regen_provider_unknown',
				status: 501,
			});
	}
}

let _regenProviderCache = null;
let _regenProviderName = null;

export function resolveProviderName() {
	const explicit = (process.env.AVATAR_REGEN_PROVIDER || '').trim().toLowerCase();
	if (explicit) return explicit;
	// Auto-detect order is paid → free: prefer Replicate's pinned-version
	// reliability, then our own GCP Cloud Run service, then the HF Spaces queue
	// (free GPU but variable wait + cold starts).
	if (process.env.REPLICATE_API_TOKEN) return 'replicate';
	if (process.env.GCP_RECONSTRUCTION_URL) return 'gcp';
	if (process.env.HF_TOKEN) return 'huggingface';
	return 'none';
}

export async function getRegenProvider() {
	const name = resolveProviderName();
	if (name === 'none' || !name) return { name, instance: null };
	if (_regenProviderCache && _regenProviderName === name) {
		return { name, instance: _regenProviderCache };
	}
	if (name === 'replicate') {
		const mod = await import('../_providers/replicate.js');
		_regenProviderCache = mod.createRegenProvider();
		_regenProviderName = name;
		return { name, instance: _regenProviderCache };
	}
	if (name === 'huggingface' || name === 'hf') {
		const mod = await import('../_providers/huggingface.js');
		_regenProviderCache = mod.createRegenProvider();
		_regenProviderName = name;
		return { name, instance: _regenProviderCache };
	}
	if (name === 'gcp') {
		const mod = await import('../_providers/gcp.js');
		_regenProviderCache = mod.createRegenProvider();
		_regenProviderName = name;
		return { name, instance: _regenProviderCache };
	}
	throw Object.assign(new Error(`unknown AVATAR_REGEN_PROVIDER: ${name}`), {
		code: 'regen_provider_unknown',
		status: 501,
	});
}

// Resolve the provider for a job that's already in flight, routing by the
// provider name stored on the job row. BYOK providers (meshy, tripo) need the
// user's stored key to poll — fetched from the DB via the request session.
// Platform providers (replicate, gcp, huggingface) use env credentials as usual.
export async function getRegenProviderForJob(jobProvider, req) {
	if (!jobProvider) return { name: 'none', instance: null };

	// Platform providers: use the existing env-credential path.
	if (['replicate', 'gcp', 'huggingface', 'hf'].includes(jobProvider)) {
		return getRegenProvider();
	}

	// BYOK providers: re-resolve the user's stored key at poll time. The key
	// is never stored on the job row itself (it's a secret); the user's session
	// is the authority.
	if (BYOK_REGEN_PROVIDERS.includes(jobProvider)) {
		try {
			const { resolveProviderKey } = await import('./forge-provider-key.js');
			const key = await resolveProviderKey(req, null, jobProvider);
			if (!key) return { name: jobProvider, instance: null };
			return getRegenProviderByName(jobProvider, key);
		} catch {
			return { name: jobProvider, instance: null };
		}
	}

	return { name: 'none', instance: null };
}

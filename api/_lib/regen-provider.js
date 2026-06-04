// Avatar regeneration provider loader — shared by the regenerate / reconstruct
// endpoints, the reconstruct-finalize stage, and the Replicate webhook.
//
// Dynamically imports a provider module by name so we don't pay the cost of
// loading e.g. the Replicate SDK on every request when regeneration is unused.
// Cached per-process after first load.
//
// Provider name precedence:
//   1. Explicit env: AVATAR_REGEN_PROVIDER=replicate|huggingface|gcp
//   2. Inferred from credentials: REPLICATE_API_TOKEN → replicate,
//      GCP_RECONSTRUCTION_URL → gcp, HF_TOKEN → huggingface. Keeps the deploy
//      path 1-step: drop the token in env, ship.

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

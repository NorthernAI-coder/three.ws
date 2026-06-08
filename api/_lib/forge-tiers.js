// Forge quality tiers + generation-backend registry — the single source of
// truth shared by the /api/forge endpoint, the public catalog the UI renders,
// and the per-provider param builders.
//
// Two orthogonal axes describe a generation request:
//
//   path  — how geometry is produced:
//             • "image"    → image-intermediate. Text is painted into a
//               reference image (FLUX/Imagen) then reconstructed to a mesh
//               (TRELLIS / Hunyuan3D). This is the existing fast default.
//             • "geometry" → geometry-first. A native 3D model emits mesh
//               geometry directly from the prompt (or a single photo) with no
//               synthesized intermediate view, so detail isn't capped by what
//               one image implies. Meshy / Tripo text-to-3D.
//
//   tier  — how much geometric budget to spend: draft / standard / high. Maps
//           to a target polygon count where the backend supports it, plus
//           texture richness. Higher tiers cost more credits and take longer.
//
// A backend declares which paths it serves, whether it needs a user-supplied
// (BYOK) key, and its per-(path,tier) cost/latency estimates so the UI can
// communicate the trade-off before the user commits.

export const PATHS = Object.freeze(['image', 'geometry']);
export const DEFAULT_PATH = 'image';
export const TIER_IDS = Object.freeze(['draft', 'standard', 'high']);
export const DEFAULT_TIER = 'standard';

// Polygon budget + texture richness per tier. `polycount` is the target the
// poly-aware backends (Meshy, Tripo) decimate toward — 100–300k is Meshy's
// accepted range; we stay inside it. `pbr`/`hd` only apply where the backend
// produces textures (the geometry path's optional refine, or image-to-3D).
// `priceUsdcAtomics` is the retail price of one generation at this tier when
// billed directly in USDC (6 decimals) — the single source of truth for the
// x402 paid generation endpoint (api/x402/forge.js) and the public catalog.
// It is a flat per-call price, independent of the BYOK vendor `credits` above
// (which estimate Meshy/Tripo spend on the bring-your-own-key path).
export const TIERS = Object.freeze({
	draft: Object.freeze({
		id: 'draft',
		label: 'Draft',
		blurb: 'Fast, low-poly. Good for blockout and iteration.',
		polycount: 12_000,
		pbr: false,
		hd: false,
		etaMultiplier: 0.6,
		priceUsdcAtomics: 50_000, // $0.05
	}),
	standard: Object.freeze({
		id: 'standard',
		label: 'Standard',
		blurb: 'Balanced detail. The default for most assets.',
		polycount: 30_000,
		pbr: false,
		hd: false,
		etaMultiplier: 1,
		priceUsdcAtomics: 150_000, // $0.15
	}),
	high: Object.freeze({
		id: 'high',
		label: 'High',
		blurb: 'Maximum geometric detail + PBR textures. Slower, pricier.',
		polycount: 200_000,
		pbr: true,
		hd: true,
		etaMultiplier: 2.2,
		priceUsdcAtomics: 500_000, // $0.50
	}),
});

export function resolveTier(id) {
	return TIERS[id] || TIERS[DEFAULT_TIER];
}

// USDC atomic price (6 decimals) for a generation at the given tier — the
// amount the x402 endpoint quotes in its 402 challenge.
export function priceAtomicsForTier(tier) {
	return resolveTier(tier?.id || tier).priceUsdcAtomics;
}

// Human-readable USD price (e.g. "0.15") derived from the atomic price, so the
// catalog and docs never hardcode a second copy of the number.
export function priceUsdcForTier(tier) {
	return (priceAtomicsForTier(tier) / 1_000_000).toFixed(2);
}

// Generation backends. `provider` selects the api/_providers/* client that
// talks to it. `byok` names the provider-key the caller must supply (false for
// platform-keyed backends). `requiresEnv` lists env vars that must be present
// for a platform backend to be live. `baseEta` is wall-clock seconds at the
// standard tier; the tier's etaMultiplier scales it. `credits` is the estimated
// vendor credit spend per (path → tier) — null when the backend bills by GPU
// time rather than credits (TRELLIS/Hunyuan via our own infra).
export const BACKENDS = Object.freeze({
	trellis: Object.freeze({
		id: 'trellis',
		label: 'TRELLIS',
		vendor: 'Microsoft · Replicate',
		paths: Object.freeze(['image']),
		byok: false,
		provider: 'replicate',
		requiresEnv: Object.freeze(['REPLICATE_API_TOKEN']),
		polyControl: false,
		baseEta: 60,
		credits: null,
		blurb: 'Image-intermediate reconstruction. The fast default; no poly target.',
	}),
	meshy: Object.freeze({
		id: 'meshy',
		label: 'Meshy 6',
		vendor: 'Meshy AI',
		paths: Object.freeze(['geometry', 'image']),
		byok: 'meshy',
		provider: 'meshy',
		requiresEnv: Object.freeze([]),
		polyControl: true,
		baseEta: 75,
		// Meshy bills 20 credits for a text-to-3D preview (geometry), 30 for
		// image-to-3D, +10 when PBR/HD texturing is enabled (high tier).
		credits: Object.freeze({
			geometry: Object.freeze({ draft: 20, standard: 20, high: 30 }),
			image: Object.freeze({ draft: 30, standard: 30, high: 40 }),
		}),
		blurb: 'Native text→geometry (preview) + image→3D. Quad topology, t-pose ready.',
	}),
	tripo: Object.freeze({
		id: 'tripo',
		label: 'Tripo v3.1',
		vendor: 'Tripo AI',
		paths: Object.freeze(['geometry', 'image']),
		byok: 'tripo',
		provider: 'tripo',
		requiresEnv: Object.freeze([]),
		polyControl: true,
		baseEta: 70,
		// Tripo bills credits per task type; texture/quad add-ons cost extra.
		credits: Object.freeze({
			geometry: Object.freeze({ draft: 20, standard: 20, high: 30 }),
			image: Object.freeze({ draft: 30, standard: 30, high: 40 }),
		}),
		blurb: 'Cleanest quad topology. Native text→model + image→model.',
	}),
	hunyuan3d: Object.freeze({
		id: 'hunyuan3d',
		label: 'Hunyuan3D',
		vendor: 'Tencent · self-host',
		paths: Object.freeze(['image']),
		byok: false,
		provider: 'gcp',
		requiresEnv: Object.freeze(['GCP_RECONSTRUCTION_URL', 'GCP_RECONSTRUCTION_KEY']),
		polyControl: true,
		baseEta: 120,
		credits: null,
		blurb: 'Self-hosted high-poly reconstruction. Image-conditioned geometry.',
	}),
});

// Backend chosen when the caller doesn't name one, per path. Image path keeps
// the existing TRELLIS fast default; geometry path defaults to Meshy.
export const DEFAULT_BACKEND_FOR_PATH = Object.freeze({
	image: 'trellis',
	geometry: 'meshy',
});

export function resolveBackendId({ path, backend }) {
	const p = PATHS.includes(path) ? path : DEFAULT_PATH;
	if (backend && BACKENDS[backend] && BACKENDS[backend].paths.includes(p)) {
		return backend;
	}
	return DEFAULT_BACKEND_FOR_PATH[p];
}

function readEnv(name) {
	if (typeof process !== 'undefined' && process.env && process.env[name]) return process.env[name];
	return null;
}

// A platform backend is "live" only when its required env is present. BYOK
// backends are always selectable — liveness depends on the caller's key, which
// is resolved per-request, not here.
export function backendIsConfigured(backendId) {
	const b = BACKENDS[backendId];
	if (!b) return false;
	if (b.byok) return true;
	return b.requiresEnv.every((name) => Boolean(readEnv(name)));
}

// Estimated wall-clock seconds for a (backend, path, tier) combination —
// used to populate the client progress estimate and the catalog.
export function estimateEtaSeconds({ backendId, tier }) {
	const b = BACKENDS[backendId];
	if (!b) return 90;
	const t = resolveTier(tier?.id || tier);
	return Math.round(b.baseEta * t.etaMultiplier);
}

// Estimated vendor credits for a (backend, path, tier) — null when the backend
// doesn't bill in credits.
export function estimateCredits({ backendId, path, tier }) {
	const b = BACKENDS[backendId];
	if (!b || !b.credits) return null;
	const p = PATHS.includes(path) ? path : DEFAULT_PATH;
	const byPath = b.credits[p];
	if (!byPath) return null;
	const tierId = (tier?.id || tier || DEFAULT_TIER);
	return byPath[tierId] ?? byPath[DEFAULT_TIER] ?? null;
}

// Build the public catalog the /forge UI renders: every tier, and every backend
// with its supported paths, BYOK requirement, live/configured flag, and the
// time+cost estimate matrix. No secrets — safe to serve unauthenticated.
export function buildCatalog() {
	return {
		paths: PATHS,
		default_path: DEFAULT_PATH,
		default_tier: DEFAULT_TIER,
		default_backend: DEFAULT_BACKEND_FOR_PATH,
		tiers: TIER_IDS.map((id) => {
			const t = TIERS[id];
			return {
				id: t.id,
				label: t.label,
				blurb: t.blurb,
				polycount: t.polycount,
				pbr: t.pbr,
				hd: t.hd,
				price_usdc_atomics: t.priceUsdcAtomics,
				price_usdc: (t.priceUsdcAtomics / 1_000_000).toFixed(2),
			};
		}),
		backends: Object.values(BACKENDS).map((b) => ({
			id: b.id,
			label: b.label,
			vendor: b.vendor,
			paths: b.paths,
			byok: b.byok || null,
			poly_control: b.polyControl,
			configured: backendIsConfigured(b.id),
			blurb: b.blurb,
			estimates: b.paths.reduce((acc, p) => {
				acc[p] = TIER_IDS.map((tierId) => ({
					tier: tierId,
					eta_seconds: estimateEtaSeconds({ backendId: b.id, tier: tierId }),
					credits: estimateCredits({ backendId: b.id, path: p, tier: tierId }),
				}));
				return acc;
			}, {}),
		})),
	};
}

// Translate a resolved (path, tier) into the mesh-budget params the poly-aware
// providers (Meshy/Tripo) accept. Backends without poly control ignore these.
export function meshBudgetFor({ tier }) {
	const t = resolveTier(tier?.id || tier);
	return {
		targetPolycount: t.polycount,
		pbr: t.pbr,
		hd: t.hd,
	};
}

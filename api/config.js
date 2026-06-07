// Public client-config. Returns non-secret config values the browser needs.

import { cors, json, method, wrap } from './_lib/http.js';
import { resolveProviderName } from './_lib/regen-provider.js';

export default wrap(async (req, res) => {
	if (cors(req, res, { methods: 'GET,OPTIONS', credentials: false })) return;
	if (!method(req, res, ['GET'])) return;

	// Mirror the reconstruct endpoint's own resolution: an explicit
	// AVATAR_REGEN_PROVIDER, else inferred from a provider credential
	// (REPLICATE_API_TOKEN / GCP_RECONSTRUCTION_URL / HF_TOKEN). Computing it the
	// same way here keeps the feature flag from lying when only a token is set.
	const provider = resolveProviderName();
	const reconstructEnabled = provider !== 'none';

	// Whether the delivered model is auto-rigged (animation-ready). The GCP
	// pipeline rigs inline via UniRig; Replicate rigs only when a rerig model is
	// configured. HF Spaces return static meshes. The /scan page uses this to set
	// honest expectations instead of promising a rig we can't produce.
	const riggingEnabled =
		provider === 'gcp' ||
		(provider === 'replicate' && !!(process.env.REPLICATE_RERIG_MODEL || '').trim());

	const videoAvatarEnabled = !!(process.env.LONGCAT_WORKER_URL || '').trim();

	// Enterprise SAML SSO — true when an IdP is wired (explicit cert + SSO URL,
	// or a metadata URL to fetch them from). Drives the SSO button on /login.
	// Cheap env-only check so this hot endpoint doesn't pull in the SAML lib.
	const samlEnabled = Boolean(
		(process.env.SAML_IDP_CERT && process.env.SAML_IDP_SSO_URL) ||
			process.env.SAML_IDP_METADATA_URL,
	);

	return json(res, 200, {
		walletConnectProjectId: process.env.VITE_WALLETCONNECT_PROJECT_ID || '',
		privyAppId: process.env.VITE_PRIVY_APP_ID || process.env.PRIVY_APP_ID || '',
		samlEnabled,
		samlLabel: process.env.SAML_BUTTON_LABEL || 'Single sign-on (SSO)',
		features: {
			// /create/selfie + /scan use /api/avatars/reconstruct, which 501s
			// unless an ML backend is wired. The pages read this to either show the
			// capture flow or fall through to a "coming soon — try /create" panel.
			avatarReconstruct: reconstructEnabled,
			// True when the pipeline returns a rigged (animation-ready) model.
			avatarRigging: riggingEnabled,
			// /create/video uses the LongCat GPU worker on Cloud Run; only
			// available once LONGCAT_WORKER_URL is set in Vercel env.
			videoAvatar: videoAvatarEnabled,
		},
	});
});

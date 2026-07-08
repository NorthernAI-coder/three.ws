// AR launch — device-aware "View in your space" routing for a generated GLB.
//
// The pure core behind GET /api/ar (api/ar.js) and the export_ar MCP tool. Given
// a GLB URL and a User-Agent, it decides how to place the model in AR:
//
//   • iOS      → Apple Quick Look. model-viewer generates a USDZ from the GLB on
//                the fly (a real conversion via three.js USDZExporter, in-page),
//                so the launch page hands iOS a Quick Look experience with no
//                server-side USD tooling required.
//   • Android  → Google Scene Viewer via an ARCore intent:// URL (the GLB is the
//                Scene Viewer source), with a browser fallback to the WebGL viewer.
//   • desktop  → the interactive WebGL viewer (no AR hardware).
//
// It is dependency-free and side-effect-free so the routing decision is unit-
// tested in isolation, and carries ZERO payment/wallet/coin surface — AR is pure
// consumer value and ships on both the Claude and OpenAI tracks.

// A GLB URL must be https and point at a .glb/.gltf asset (query string allowed).
// AR viewers refuse other schemes, and we never hand a non-https URL to a device
// AR intent. Returns the normalized URL or throws a coded error the boundary maps
// to a clean message.
export function assertArAssetUrl(glbUrl) {
	let u;
	try {
		u = new URL(String(glbUrl));
	} catch {
		throw arError('invalid_url', 'Provide a valid https URL to a .glb model.');
	}
	if (u.protocol !== 'https:') throw arError('not_https', 'The model URL must be https.');
	if (!/\.(glb|gltf)$/i.test(u.pathname)) throw arError('not_glb', 'The model URL must point at a .glb or .gltf file.');
	return u.toString();
}

function arError(code, message) {
	const e = new Error(message);
	e.code = code;
	e.arUserMessage = true;
	return e;
}

/** Classify the AR target from a User-Agent string. */
export function detectArTarget(userAgent) {
	const ua = String(userAgent || '');
	// iPadOS 13+ reports a Mac UA; the "Mobile" token + touch is the tell, but
	// server-side we only have the string — match the explicit iOS device tokens.
	if (/\b(iphone|ipad|ipod)\b/i.test(ua)) return 'ios';
	if (/\bandroid\b/i.test(ua)) return 'android';
	return 'desktop';
}

/**
 * Build the Android Scene Viewer ARCore intent URL for a GLB. `fallbackUrl` is
 * where the browser lands if ARCore is unavailable (the WebGL viewer).
 */
export function buildSceneViewerUrl(glbUrl, { title = '', fallbackUrl = '' } = {}) {
	const params = new URLSearchParams({ file: glbUrl, mode: 'ar_preferred' });
	if (title) params.set('title', title);
	const fallback = fallbackUrl ? `S.browser_fallback_url=${encodeURIComponent(fallbackUrl)};` : '';
	return (
		`intent://arvr.google.com/scene-viewer/1.2?${params.toString()}` +
		`#Intent;scheme=https;package=com.google.ar.core;` +
		`action=android.intent.action.VIEW;${fallback}end;`
	);
}

/** The interactive WebGL viewer URL for a GLB on a given origin. */
export function buildViewerUrl(origin, glbUrl, title = '') {
	const base = String(origin || 'https://three.ws').replace(/\/$/, '');
	const t = title ? `&title=${encodeURIComponent(title)}` : '';
	return `${base}/viewer?src=${encodeURIComponent(glbUrl)}${t}`;
}

/** The device-aware AR launch URL (this endpoint) for a GLB. */
export function buildArLaunchUrl(origin, glbUrl, title = '') {
	const base = String(origin || 'https://three.ws').replace(/\/$/, '');
	const t = title ? `&title=${encodeURIComponent(title)}` : '';
	return `${base}/api/ar?src=${encodeURIComponent(glbUrl)}${t}`;
}

/**
 * Resolve the launch plan for a request. Returns:
 *   { target, action:'redirect', url }   — Android: 302 to Scene Viewer
 *   { target, action:'page' }            — iOS/desktop: serve the launch page
 * plus the resolved viewer + scene-viewer URLs for the page/tool to use.
 */
export function planArLaunch({ glbUrl, userAgent, origin, title = '' }) {
	const asset = assertArAssetUrl(glbUrl);
	const target = detectArTarget(userAgent);
	const viewerUrl = buildViewerUrl(origin, asset, title);
	const sceneViewerUrl = buildSceneViewerUrl(asset, { title, fallbackUrl: viewerUrl });
	if (target === 'android') {
		return { target, action: 'redirect', url: sceneViewerUrl, asset, viewerUrl, sceneViewerUrl };
	}
	return { target, action: 'page', asset, viewerUrl, sceneViewerUrl };
}

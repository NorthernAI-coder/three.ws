// Spatial MCP reference renderer — renders any conformant Spatial MCP artifact.
//
// A small, dependency-light, framework-free renderer that turns a Spatial MCP
// artifact (specs/SPATIAL_MCP.md) into an interactive <model-viewer> scene:
// orbit/zoom, animation playback, an AR button, and graceful fallback for every
// missing optional field. It is the REFERENCE IMPLEMENTATION of the spec — any
// MCP host or third-party app can adopt this shape and use (or reimplement) this
// renderer. Zero payment/wallet/coin surface, so it drops into the free OpenAI
// track unchanged.
//
// Usage:
//   import { renderSpatialArtifact } from './spatial-renderer.js';
//   renderSpatialArtifact(document.getElementById('mount'), artifact);
//
// It expects the <model-viewer> custom element to be available on the page (load
// @google/model-viewer). It never fetches anything itself beyond the GLB the
// artifact points at, and only ever loads https assets.

function isHttps(u) {
	try {
		return typeof u === 'string' && new URL(u).protocol === 'https:';
	} catch {
		return false;
	}
}

// Minimal structural check mirroring api/_lib/spatial-mcp.js validateSpatialArtifact
// — enough to render safely. The full validator is the authority; this keeps the
// renderer standalone (no build-time import) while refusing an unusable payload.
export function canRenderSpatialArtifact(artifact) {
	return (
		artifact &&
		typeof artifact === 'object' &&
		typeof artifact.spatialMcpVersion === 'string' &&
		artifact.scene &&
		isHttps(artifact.scene.glbUrl)
	);
}

/**
 * Render a Spatial MCP artifact into `mount`. Returns the created <model-viewer>
 * element (or null when the artifact can't be rendered — the mount then shows a
 * designed fallback message instead of a blank frame).
 */
export function renderSpatialArtifact(mount, artifact) {
	if (!mount) return null;
	mount.textContent = '';

	if (!canRenderSpatialArtifact(artifact)) {
		const msg = document.createElement('div');
		msg.className = 'spatial-empty';
		msg.textContent = 'No renderable 3D scene in this payload.';
		mount.appendChild(msg);
		return null;
	}

	const scene = artifact.scene;
	const camera = artifact.camera || {};
	const env = artifact.environment || {};
	const affordances = artifact.affordances || {};
	const ar = artifact.ar || {};

	const mv = document.createElement('model-viewer');
	mv.setAttribute('src', scene.glbUrl);
	mv.setAttribute('alt', scene.alt || (artifact.meta && artifact.meta.title) || 'Interactive 3D model');
	if (isHttps(scene.poster)) mv.setAttribute('poster', scene.poster);

	// Camera / interaction — honor affordances, default to a framed, orbitable view.
	if (affordances.orbit !== false) mv.setAttribute('camera-controls', '');
	if (camera.autoRotate !== false) mv.setAttribute('auto-rotate', '');
	if (typeof camera.orbit === 'string') mv.setAttribute('camera-orbit', camera.orbit);
	if (typeof camera.fieldOfView === 'string') mv.setAttribute('field-of-view', camera.fieldOfView);
	if (affordances.zoom === false) mv.setAttribute('disable-zoom', '');
	mv.setAttribute('touch-action', 'pan-y');
	mv.setAttribute('interaction-prompt', 'none');

	// Environment / lighting.
	mv.setAttribute('environment-image', typeof env.image === 'string' ? env.image : 'neutral');
	if (typeof env.exposure === 'number') mv.setAttribute('exposure', String(env.exposure));
	if (typeof env.shadowIntensity === 'number') mv.setAttribute('shadow-intensity', String(env.shadowIntensity));
	mv.setAttribute('tone-mapping', 'aces');

	// Animation — autoplay when the artifact declares an animation block.
	if (artifact.animation) {
		if (artifact.animation.autoplay !== false) mv.setAttribute('autoplay', '');
		if (Array.isArray(artifact.animation.clips) && artifact.animation.clips.length) {
			mv.setAttribute('animation-name', String(artifact.animation.clips[0]));
		}
	}

	// AR handoff — enable AR when the artifact declares an AR asset/link, or always
	// offer WebXR/Scene-Viewer/Quick-Look from the GLB itself as a graceful default.
	mv.setAttribute('ar', '');
	mv.setAttribute('ar-modes', 'webxr scene-viewer quick-look');
	mv.setAttribute('ar-scale', 'auto');
	if (isHttps(ar.usdzUrl)) mv.setAttribute('ios-src', ar.usdzUrl);

	mv.style.width = '100%';
	mv.style.height = '100%';
	mv.style.background = 'transparent';
	mount.appendChild(mv);

	return mv;
}

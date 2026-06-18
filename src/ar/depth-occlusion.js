// Real-world occlusion for WebXR via the depth-sensing API.
//
// On a depth-capable device the placed agent should hide behind real geometry —
// a couch, a doorway, a person walking in front — instead of always painting on
// top of the camera feed. That single perception upgrade is what separates an
// object that lives in the room from a sticker pasted on video.
//
// Mechanism (three.js gpu-optimized depth path): when the live session
// negotiated `depth-sensing` with `gpu-optimized` usage, three's WebXRManager
// pulls the per-frame XRWebGLDepthInformation, wraps its texture, and exposes a
// fullscreen occluder mesh via `renderer.xr.getDepthSensingMesh()`. That mesh's
// fragment shader writes the *real-world* depth into the depth buffer. Drawn
// before the agent (renderOrder below 0, colour-write off so the passthrough is
// untouched), it makes any agent fragment behind real geometry fail the normal
// depth test and get discarded — true occlusion, no custom shader of our own.
//
// Degrades silently: when the session has no depth-sensing feature (most devices
// today) or the UA only offered cpu-optimized data, nothing is ever attached and
// behavior is byte-for-byte identical to the pre-occlusion path — no error, no
// console noise, the AR button works exactly as before.

// Draw the occluder before the agent (default renderOrder 0) and before any
// transparent avatar material, so the depth buffer holds real-world depth by the
// time the agent is rasterized.
const OCCLUDER_RENDER_ORDER = -10000;

export class DepthOcclusion {
	/**
	 * @param {import('three').WebGLRenderer} renderer Active XR renderer.
	 * @param {import('three').Scene} scene Scene the agent renders into; the
	 *   occluder is attached here so it shares the single per-frame draw call.
	 */
	constructor(renderer, scene) {
		this._renderer = renderer;
		this._scene = scene;
		/** @type {import('three').Mesh|null} three's cached occluder, once attached. */
		this._mesh = null;
		this._enabled = false;
	}

	/**
	 * Cheap one-shot check: did the live session actually negotiate depth-sensing?
	 * Use it right after `renderer.xr.setSession` to decide whether to stand up the
	 * occluder at all — on every other device this is false and the per-frame tick
	 * never touches depth. The optional chaining guards UAs that don't populate
	 * `enabledFeatures` (the spec leaves it optional).
	 * @param {XRSession|null|undefined} session
	 * @returns {boolean}
	 */
	static sessionHasDepth(session) {
		return !!session?.enabledFeatures?.includes?.('depth-sensing');
	}

	/**
	 * Per-frame hook. Attaches three's occluder mesh the first frame real depth
	 * data is available, then returns immediately on every subsequent frame —
	 * three updates the depth texture in place, so no further work (and zero
	 * allocation) is needed in steady state. Safe to call when depth-sensing is
	 * unsupported: the renderer reports no depth and this is a no-op.
	 */
	update() {
		if (this._mesh) return; // attached — three drives the texture each frame
		const xr = this._renderer.xr;
		// Three only builds the occluder for the gpu-optimized path; if the UA
		// handed back cpu-optimized data this stays false forever and we degrade.
		if (typeof xr.hasDepthSensing !== 'function' || !xr.hasDepthSensing()) return;
		const mesh = xr.getDepthSensingMesh?.();
		if (mesh) this._attach(mesh);
	}

	/** @param {import('three').Mesh} mesh */
	_attach(mesh) {
		const material = mesh.material;
		// The occluder exists only to stamp real-world depth — it must paint no
		// colour, or the passthrough camera feed shows shader garbage where the
		// agent isn't drawn. Its own fragment shader emits gl_FragDepth only.
		material.colorWrite = false;
		material.depthWrite = true;
		// Fullscreen depth fill on a freshly-cleared buffer: always write, never
		// gate on a prior depth value.
		material.depthTest = false;
		// The vertex shader emits clip-space coordinates directly and ignores the
		// model matrix, so the mesh's world bounds are meaningless — never let
		// frustum culling drop it as the camera moves around the room.
		mesh.frustumCulled = false;
		mesh.renderOrder = OCCLUDER_RENDER_ORDER;
		this._scene.add(mesh);
		this._mesh = mesh;
		this._enabled = true;
	}

	/** True once the occluder is live in the scene. */
	get enabled() {
		return this._enabled;
	}

	/**
	 * Detach and free the occluder on session exit. three resets its own depth
	 * module on session end (dropping its reference to this mesh) and builds a
	 * fresh one on the next session, so disposing the geometry/material here frees
	 * the GPU resources without breaking a later run. The depth texture itself is
	 * an external handle owned by the XR runtime — material.dispose() never touches
	 * uniform textures, so it is correctly left alone.
	 */
	dispose() {
		if (this._mesh) {
			this._scene.remove(this._mesh);
			this._mesh.geometry?.dispose();
			this._mesh.material?.dispose();
			this._mesh = null;
		}
		this._enabled = false;
	}
}

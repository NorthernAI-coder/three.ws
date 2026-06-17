// WebXR immersive-ar session controller.
//
// Reuses the element's existing Three.js renderer by enabling XR mode on start
// and restoring the RAF loop on end. Hit-test places the agent on tap.
//
// Half-body XR mode (collapse lower-body bones) is opt-in via the `halfBody`
// constructor option — only the demo page under /demos/halfbody passes it.
// The live AR button on the main viewer enters XR with the full body, exactly
// as it did before the half-body work was added.

import { Matrix4, Mesh, MeshBasicMaterial, Quaternion, RingGeometry, Vector3 } from 'three';

const LOWER_BODY_FRAGMENTS = [
	'upleg', 'leg', 'thigh', 'knee', 'shin', 'calf',
	'foot', 'toe', 'ankle',
];

function _normalizeBone(name) {
	return String(name || '')
		.toLowerCase()
		.replace(/^mixamorig:?_?/, '')
		.replace(/^cc_base_/, '')
		.replace(/^armature[:_|]/, '')
		.replace(/^rig[:_]/, '');
}

function _isLowerBody(name) {
	const norm = _normalizeBone(name);
	return LOWER_BODY_FRAGMENTS.some((f) => norm.includes(f));
}

export class WebXRSession {
	/**
	 * @param {object} viewer  Object exposing { renderer, scene, content, controls,
	 *   activeCamera, animationManager, mixer, prevTime, _rafId, _afterAnimateHooks,
	 *   _needsRender, _updateRenderLoop } — see src/xr.js for the canonical shim.
	 * @param {object} [opts]
	 * @param {Function} [opts.onEnd]      Called after the XR session ends + restores.
	 * @param {boolean}  [opts.halfBody]   Collapse lower-body bones (demo mode).
	 * @param {Function} [opts.onAnchored] Called once on first tap with the anchored
	 *   local-space pose `{ position: Vector3, quaternion: Quaternion }` for persistence.
	 * @param {Function} [opts.onHit]      Called with `true`/`false` as the hit-test
	 *   reticle gains/loses a surface — drives the "point at the floor" searching state.
	 * @param {Element}  [opts.domOverlayRoot] Element to surface as the WebXR
	 *   `dom-overlay` root (in-session hint + exit affordance). Optional.
	 */
	constructor(viewer, { onEnd, halfBody = false, onAnchored, onHit, domOverlayRoot } = {}) {
		this._viewer = viewer;
		this._halfBody = halfBody;
		this._onEnd = onEnd;
		this._onAnchored = onAnchored;
		this._onHit = onHit;
		this._domOverlayRoot = domOverlayRoot ?? null;
		this._session = null;
		this._hitTestSource = null;
		this._localSpace = null;
		this._anchored = false;
		/** @type {XRAnchor|null} Real world anchor created on tap (feature-detected). */
		this._anchor = null;
		/** @type {XRHitTestResult|null} Most recent hit, used to create the anchor. */
		this._latestHit = null;
		/** Tap-moment hit pose, captured for persistence the instant the user taps. */
		this._latestHitMatrix = new Matrix4();
		this._hasHit = false;
		/** @type {import('three').Mesh|null} Ring reticle tracking the floor. */
		this._reticle = null;
		this._userPosition = new Vector3();
		this._savedBg = null;
		this._savedPos = null;
		this._savedRot = null;
		/** @type {Array<{ bone: import('three').Bone, scale: Vector3 }>} */
		this._halfBodyBones = [];
		this._handleEnd = this._handleEnd.bind(this);
		this._handleSelect = this._handleSelect.bind(this);
	}

	static async isSupported() {
		try {
			return !!(navigator.xr && (await navigator.xr.isSessionSupported('immersive-ar')));
		} catch {
			return false;
		}
	}

	async start() {
		const viewer = this._viewer;
		const renderer = viewer.renderer;

		// Must be set before requestSession
		renderer.xr.enabled = true;

		// `anchors` lets us bind the agent to a real XRAnchor (no drift); it is
		// optional so devices without it still run on hit-test-follow. `dom-overlay`
		// surfaces the in-session hint + exit affordance when a root is supplied.
		const sessionInit = {
			requiredFeatures: ['hit-test'],
			optionalFeatures: ['anchors', 'local-floor'],
		};
		if (this._domOverlayRoot) {
			sessionInit.optionalFeatures.push('dom-overlay');
			sessionInit.domOverlay = { root: this._domOverlayRoot };
		}

		const session = await navigator.xr.requestSession('immersive-ar', sessionInit);
		this._session = session;
		session.addEventListener('end', this._handleEnd);
		// 'select' fires on controller trigger or screen tap
		session.addEventListener('select', this._handleSelect);

		await renderer.xr.setSession(session);

		this._localSpace = await session.requestReferenceSpace('local');
		const viewerSpace = await session.requestReferenceSpace('viewer');
		this._hitTestSource = await session.requestHitTestSource({ space: viewerSpace });

		// Floor reticle — a thin ring laid flat (geometry rotated into the XZ plane
		// so the hit pose's up-normal keeps it on the surface). Hidden until a hit.
		this._buildReticle();

		// Transparent background — device camera provides the pass-through
		this._savedBg = viewer.scene.background;
		viewer.scene.background = null;
		renderer.setClearColor(0x000000, 0);

		// Save agent content transform for clean restoration on exit
		const content = viewer.content;
		this._savedPos = content?.position.clone() ?? null;
		this._savedRot = content?.rotation.clone() ?? null;

		// Half-body mode is opt-in. The live AR button never sets it; only the
		// /demos/halfbody preview passes halfBody:true.
		if (this._halfBody) this._enterHalfBody();

		// Hand the render loop to the XR system (replaces RAF)
		if (viewer._rafId !== null) {
			cancelAnimationFrame(viewer._rafId);
			viewer._rafId = null;
		}
		viewer.controls.enabled = false;

		renderer.setAnimationLoop((time, frame) => this._tick(time, frame));
	}

	_tick(time, frame) {
		const viewer = this._viewer;
		const renderer = viewer.renderer;

		const dt = viewer.prevTime ? (time - viewer.prevTime) / 1000 : 0.016;
		viewer.prevTime = time;

		if (viewer.mixer) viewer.mixer.update(dt);
		viewer.animationManager.update(dt);

		// Empathy layer and any other per-frame hooks continue uninterrupted
		if (viewer._afterAnimateHooks) {
			for (const hook of viewer._afterAnimateHooks) hook(dt);
		}

		// Track user head position from the XR camera — used by lookAt('user')
		const xrCam = renderer.xr.getCamera();
		if (xrCam) this._userPosition.setFromMatrixPosition(xrCam.matrixWorld);

		// Before anchoring: the reticle (and a content preview) track the floor the
		// phone is pointed at. After a tap, a real XRAnchor takes over (below).
		if (!this._anchored && frame && this._hitTestSource) {
			const hits = frame.getHitTestResults(this._hitTestSource);
			const pose = hits.length > 0 ? hits[0].getPose(this._localSpace) : null;
			if (pose) {
				this._latestHit = hits[0];
				this._latestHitMatrix.fromArray(pose.transform.matrix);
				if (this._reticle) {
					this._reticle.visible = true;
					this._reticle.position.setFromMatrixPosition(this._latestHitMatrix);
					this._reticle.quaternion.setFromRotationMatrix(this._latestHitMatrix);
				}
				if (viewer.content) {
					viewer.content.position.setFromMatrixPosition(this._latestHitMatrix);
				}
				this._setHit(true);
			} else {
				this._latestHit = null;
				if (this._reticle) this._reticle.visible = false;
				this._setHit(false);
			}
		}

		// Anchored: drive content from the live anchor pose every frame so it stays
		// glued to the real world as the camera moves (position only — the agent's
		// own orientation/scale are preserved). A null anchor (createAnchor missing)
		// leaves content frozen at the tap point — degraded hit-follow, never broken.
		if (this._anchor && frame) {
			const pose = frame.getPose(this._anchor.anchorSpace, this._localSpace);
			if (pose && viewer.content) {
				const p = pose.transform.position;
				viewer.content.position.set(p.x, p.y, p.z);
			}
		}

		renderer.render(viewer.scene, viewer.activeCamera);
	}

	// First tap anchors the agent at the current hit-test position. Creates a real
	// XRAnchor when the device supports it (survives the small tracking corrections
	// a raw hit pose does not); falls back to frozen hit-follow otherwise.
	async _handleSelect() {
		if (this._anchored || !this._latestHit) return;
		this._anchored = true;
		// Capture the tap-moment pose now — before the anchor's own drift correction
		// nudges it — so the persisted GPS pin matches where the user actually tapped.
		const anchorPose = this._readAnchorPose();
		if (this._reticle) this._reticle.visible = false;
		this._setHit(false);
		try {
			this._anchor = (await this._latestHit.createAnchor?.()) ?? null;
		} catch {
			// Anchor creation can reject on devices that advertise but can't honour
			// the feature — fall back to the frozen tap pose rather than failing.
			this._anchor = null;
		}
		this._onAnchored?.(anchorPose);
	}

	// Build the floor reticle: a flat ring whose geometry is pre-rotated into the
	// XZ plane so the hit pose (Y = surface normal) lays it on the surface.
	_buildReticle() {
		const geo = new RingGeometry(0.08, 0.11, 36).rotateX(-Math.PI / 2);
		const mat = new MeshBasicMaterial({
			color: 0x9b8cff, transparent: true, opacity: 0.9, depthTest: false,
		});
		const ring = new Mesh(geo, mat);
		ring.renderOrder = 999; // draw over the passthrough + agent
		ring.matrixAutoUpdate = true;
		ring.visible = false;
		this._reticle = ring;
		this._viewer.scene.add(ring);
	}

	_disposeReticle() {
		if (!this._reticle) return;
		this._viewer.scene.remove(this._reticle);
		this._reticle.geometry?.dispose();
		this._reticle.material?.dispose();
		this._reticle = null;
	}

	// Notify the host only on transitions (searching ↔ surface found), not per frame.
	_setHit(has) {
		if (has === this._hasHit) return;
		this._hasHit = has;
		this._onHit?.(has);
	}

	// Decompose the captured tap-moment hit matrix into a local-space pose the host
	// converts to a GPS pin (metres from the session origin → lat/lng + floor height).
	_readAnchorPose() {
		const position = new Vector3();
		const quaternion = new Quaternion();
		const scale = new Vector3();
		this._latestHitMatrix.decompose(position, quaternion, scale);
		return { position, quaternion };
	}

	// Returns the current XR camera (user head) position for lookAt('user')
	getUserPosition() {
		return this._userPosition.clone();
	}

	async end() {
		if (this._session) {
			try {
				await this._session.end();
			} catch {}
			// _handleEnd fires from the 'end' event
		}
	}

	_handleEnd() {
		const viewer = this._viewer;
		const renderer = viewer.renderer;

		renderer.setAnimationLoop(null);
		renderer.xr.enabled = false;

		if (this._hitTestSource) {
			try {
				this._hitTestSource.cancel();
			} catch {}
			this._hitTestSource = null;
		}
		this._disposeReticle();
		this._session = null;
		this._anchored = false;
		this._anchor = null;
		this._latestHit = null;
		this._hasHit = false;

		// Restore background
		viewer.scene.background = this._savedBg;
		renderer.setClearColor(0x000000, 1);

		// Restore agent content to its pre-AR transform
		if (viewer.content && this._savedPos) viewer.content.position.copy(this._savedPos);
		if (viewer.content && this._savedRot) viewer.content.rotation.copy(this._savedRot);

		// Restore full-body bone scales captured at XR start (no-op when halfBody
		// mode was never entered — _halfBodyBones is empty).
		this._exitHalfBody();

		viewer.controls.enabled = true;
		viewer._needsRender = true;
		viewer._updateRenderLoop();

		this._onEnd?.();
	}

	// ── Half-body mode ────────────────────────────────────────────────────────

	_enterHalfBody() {
		const content = this._viewer.content;
		if (!content) return;
		this._halfBodyBones = [];

		content.traverse((obj) => {
			if (!obj.isSkinnedMesh || !obj.skeleton) return;
			for (const bone of obj.skeleton.bones || []) {
				if (!_isLowerBody(bone.name)) continue;
				// Each bone may appear in multiple meshes; only record it once.
				if (this._halfBodyBones.some((b) => b.bone === bone)) continue;
				this._halfBodyBones.push({ bone, scale: bone.scale.clone() });
				bone.scale.set(0.0001, 0.0001, 0.0001);
			}
		});
		// Skeleton matrices need a fresh update so the zero-scale propagates
		// to every dependent vertex on the next render.
		content.traverse((obj) => {
			if (obj.isSkinnedMesh && obj.skeleton) obj.skeleton.update();
		});
	}

	_exitHalfBody() {
		for (const { bone, scale } of this._halfBodyBones) {
			bone.scale.copy(scale);
		}
		this._halfBodyBones = [];
		const content = this._viewer.content;
		if (content) {
			content.traverse((obj) => {
				if (obj.isSkinnedMesh && obj.skeleton) obj.skeleton.update();
			});
		}
	}
}

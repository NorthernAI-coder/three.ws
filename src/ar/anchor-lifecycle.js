// Pure lifecycle policy for the WebXR floor-anchor session.
//
// AR's happy path is easy; production readiness lives entirely in the unhappy
// ones — the app gets backgrounded, ARCore loses tracking in low light, a device
// advertises anchors it can't honour, the user taps before the first GPS fix.
// Each of those must resolve to a defined, recoverable outcome. The rules that
// decide those outcomes live here, free of DOM / Three.js / wall-clock, so every
// branch is proven by `tests/ar-anchor-lifecycle.test.js` rather than a phone.
//
// `src/ar/webxr.js` and `src/irl.js` consume these helpers; they own only the
// side effects (callbacks, render loop, pin persistence), never the policy.

// ── Tracking loss ───────────────────────────────────────────────────────────
// A single frame with no viewer pose is normal jitter; a sustained run of them
// means the device has lost its fix on the room. Surface "lost" only after a
// short run (not a one-frame blip) and recover the instant a pose returns —
// transition-only, exactly like the hit-test reticle's searching/found state.

/** Consecutive pose-less frames before we declare tracking lost (~0.5s @ 60fps). */
export const TRACKING_LOSS_FRAMES = 30;

/**
 * Advance the tracking-health state machine by one frame.
 * @param {{misses:number, lost:boolean}|null} prev  Prior state (null = fresh).
 * @param {boolean} hasPose   Whether this frame yielded a viewer pose.
 * @param {number} [threshold=TRACKING_LOSS_FRAMES] Misses tolerated before "lost".
 * @returns {{state:{misses:number,lost:boolean}, changed:boolean, lost:boolean}}
 *   `changed` is true only on the lost↔recovered transition, so callers can fire
 *   a host callback once per state change instead of every frame.
 */
export function nextTrackingState(prev, hasPose, threshold = TRACKING_LOSS_FRAMES) {
	const cur = prev || { misses: 0, lost: false };
	if (hasPose) {
		// A pose this frame clears the miss streak; report recovery if we were lost.
		return { state: { misses: 0, lost: false }, changed: cur.lost === true, lost: false };
	}
	const misses = cur.misses + 1;
	const lost = misses >= threshold;
	return { state: { misses, lost }, changed: lost && !cur.lost, lost };
}

// ── Visibility / interruption ────────────────────────────────────────────────
// XRSession.visibilityState ('visible' | 'visible-blurred' | 'hidden'): only the
// first means the session is in the foreground and worth animating.

/** visibilityState values where the session is interrupted (backgrounded/blurred). */
export const XR_PAUSED_STATES = new Set(['hidden', 'visible-blurred']);

/**
 * @param {string} visibilityState  XRSession.visibilityState.
 * @returns {boolean} true when the session is foreground-visible.
 */
export function isXrVisible(visibilityState) {
	return !XR_PAUSED_STATES.has(visibilityState);
}

// ── Degraded-anchor honesty ──────────────────────────────────────────────────
// When createAnchor() yields no XRAnchor the agent is frozen at the tap pose —
// it still works and still saves a pin, but it may drift. Say so rather than
// pretending it's rock-solid.

/**
 * @param {boolean} degraded  true when no real XRAnchor backs the placement.
 * @returns {string} Honest, user-facing placement copy.
 */
export function placementHint(degraded) {
	return degraded
		? 'Placed — this device can’t lock it perfectly, so it may drift a little'
		: 'Anchored — walk around, it stays put';
}

// ── Pre-GPS replay gate ──────────────────────────────────────────────────────
// The one durable side effect of a placement is the GPS pin, and it must save
// EXACTLY once. A tap with a live fix saves immediately; a tap during GPS
// warm-up holds the pose and saves on the first fix; leaving before that fix
// drops it (the user walked away — don't surprise them with a late pin). The
// gate owns the held pose and the consumed-guard so no caller can double-save,
// save zero times, or save a pose that was abandoned.

/**
 * @param {(pose:any)=>void} persist  Side effect that durably saves one pose.
 * @returns {{
 *   place:(pose:any, ready:boolean)=>'persisted'|'held',
 *   onFix:(ready:boolean)=>boolean,
 *   drop:()=>void,
 *   hasPending:()=>boolean,
 * }}
 */
export function createPersistGate(persist) {
	let pending = null;
	return {
		// A tap landed. With a live fix, persist now; otherwise hold for the fix.
		place(pose, ready) {
			if (ready) { persist(pose); return 'persisted'; }
			pending = pose;
			return 'held';
		},
		// The first GPS fix landed. Persist a held pose once, then forget it.
		// Returns true iff this call performed the (single) persist.
		onFix(ready) {
			if (!ready || pending === null) return false;
			const pose = pending;
			pending = null;
			persist(pose);
			return true;
		},
		// Session ended before a fix — drop the held pose. Idempotent.
		drop() { pending = null; },
		hasPending() { return pending !== null; },
	};
}

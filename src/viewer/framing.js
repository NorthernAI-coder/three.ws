// Pure framing geometry for a humanoid bounding box — no THREE dependency, so
// it is unit-testable and shared by viewer.setContent (initial framing) and
// viewer.frameContent (re-framing on resize). Both must agree or a resize would
// jump the camera.

/**
 * Vertical framing for a humanoid bounding box.
 *
 * `full` (default) frames the whole body: the look-at sits at the vertical
 * centre and the visible height is the full bounding box. `portrait` crops to
 * roughly head-to-mid-thigh so the avatar fills a wide or short card instead of
 * standing tiny-and-low in it — the read that works best for a small embedded
 * thumbnail. For `full` the result is mathematically identical to the previous
 * inline computation (baseY === vertical centre), so non-portrait embeds are
 * byte-for-byte unchanged.
 *
 * @param {number} bodyHeight  full bounding-box height in world units
 * @param {number} topY        world-y of the top of the head in the working frame
 * @param {'full'|'portrait'} [mode]
 * @returns {{ visH:number, baseY:number }} visible height + look-at y
 */
export function computeFramingExtent(bodyHeight, topY, mode = 'full') {
	if (mode === 'portrait') {
		const PORTRAIT_FRAC = 0.62; // head → ~mid-thigh
		const HEADROOM_FRAC = 0.04; // a little air above the crown
		const visH = bodyHeight * PORTRAIT_FRAC;
		const windowTop = topY + bodyHeight * HEADROOM_FRAC;
		return { visH, baseY: windowTop - visH / 2 };
	}
	return { visH: bodyHeight, baseY: topY - bodyHeight / 2 };
}

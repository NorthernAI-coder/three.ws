/**
 * Viewer framing geometry — unit tests for computeFramingExtent.
 *
 * The pure helper decides the visible vertical extent + look-at height the
 * camera frames. `full` must stay byte-for-byte identical to the legacy inline
 * math (so every existing embed is unchanged); `portrait` crops to
 * head-to-mid-thigh so an avatar fills a wide/short card.
 */

import { describe, it, expect } from 'vitest';
import { computeFramingExtent } from '../src/viewer/framing.js';

describe('computeFramingExtent — full (default)', () => {
	it('is the legacy full-body framing: baseY at the vertical centre, full height', () => {
		// setContent works in recentered coords: crown at +H/2, so baseY must be 0.
		const H = 1.8;
		const { visH, baseY } = computeFramingExtent(H, H / 2, 'full');
		expect(visH).toBe(H);
		expect(baseY).toBeCloseTo(0, 12);
	});

	it('reduces to bbCenter.y when topY is the box max (frameContent coords)', () => {
		// frameContent passes topY = box.max.y; baseY must equal the box centre.
		const H = 2;
		const boxMaxY = 1.4; // centre = boxMaxY - H/2 = 0.4
		const { visH, baseY } = computeFramingExtent(H, boxMaxY, 'full');
		expect(visH).toBe(H);
		expect(baseY).toBeCloseTo(0.4, 12);
	});

	it('defaults to full when no mode is given', () => {
		const H = 1.7;
		expect(computeFramingExtent(H, H / 2)).toEqual(computeFramingExtent(H, H / 2, 'full'));
	});
});

describe('computeFramingExtent — portrait', () => {
	const H = 1.8;
	const top = H / 2; // recentered crown
	const { visH, baseY } = computeFramingExtent(H, top, 'portrait');

	it('shows a cropped slice of the body, not the whole height', () => {
		expect(visH).toBeLessThan(H);
		expect(visH).toBeGreaterThan(H * 0.4); // head-to-mid-thigh, not a tight headshot
		expect(visH).toBeCloseTo(H * 0.62, 6);
	});

	it('raises the look-at above the body centre so the head sits high in frame', () => {
		expect(baseY).toBeGreaterThan(0); // above centre (which is 0 for full)
	});

	it('keeps the crown inside the framed window (with a little headroom)', () => {
		// Visible window spans [baseY - visH/2, baseY + visH/2]; its top must sit
		// at or just above the crown so the head is never clipped.
		const windowTop = baseY + visH / 2;
		expect(windowTop).toBeGreaterThanOrEqual(top);
		expect(windowTop).toBeCloseTo(top + H * 0.04, 6); // exactly the headroom
	});

	it('scales linearly with body height', () => {
		const a = computeFramingExtent(2, 1, 'portrait');
		const b = computeFramingExtent(4, 2, 'portrait');
		expect(b.visH).toBeCloseTo(a.visH * 2, 9);
		expect(b.baseY).toBeCloseTo(a.baseY * 2, 9);
	});
});

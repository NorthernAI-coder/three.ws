/**
 * ui-juice — pure-logic coverage for the shared game-feel library.
 *
 * The library's primitives are DOM transition helpers, but their geometry/math
 * cores are pure and exported separately so they assert without a DOM:
 * count-up interpolation/formatting, sparkline path generation, ring arc math,
 * and FLIP key diffing. The instant (reduced-motion) path of countUp is also
 * covered against a minimal fake element.
 */

import { describe, it, expect } from 'vitest';
import {
	lerp,
	easeOutCubic,
	countUp,
	sparklineGeometry,
	sparkline,
	ringGeometry,
	ring,
	computeFlipDeltas,
	liveDot,
} from '../src/ui-juice.js';

describe('interpolation primitives', () => {
	it('lerp moves linearly between two real values', () => {
		expect(lerp(0, 100, 0)).toBe(0);
		expect(lerp(0, 100, 1)).toBe(100);
		expect(lerp(20, 40, 0.5)).toBe(30);
		expect(lerp(-10, 10, 0.5)).toBe(0);
	});

	it('easeOutCubic is clamped to its endpoints and decelerates', () => {
		expect(easeOutCubic(0)).toBe(0);
		expect(easeOutCubic(1)).toBe(1);
		// past the midpoint of progress, output is already well past midpoint (decelerating)
		expect(easeOutCubic(0.5)).toBeGreaterThan(0.5);
	});
});

describe('countUp — instant path (reduced motion / no RAF)', () => {
	it('sets the final formatted value instantly when duration is 0', () => {
		const el = { textContent: '' };
		countUp(el, 1000, 1875, { duration: 0, format: (n) => `$${Math.round(n)}` });
		expect(el.textContent).toBe('$1875');
	});

	it('preserves caller formatting including sign and units', () => {
		const el = { textContent: '' };
		countUp(el, -5, 12.5, { duration: 0, format: (n) => `${n >= 0 ? '+' : ''}${n.toFixed(1)} SOL` });
		expect(el.textContent).toBe('+12.5 SOL');
	});

	it('jumps to target when from === to', () => {
		const el = { textContent: 'stale' };
		countUp(el, 42, 42, { format: (n) => String(n) });
		expect(el.textContent).toBe('42');
	});

	it('no-ops on a null element without throwing', () => {
		expect(() => countUp(null, 0, 10)).not.toThrow();
	});
});

describe('sparklineGeometry', () => {
	it('maps a known rising series to inverted-Y points across the box', () => {
		const geo = sparklineGeometry([0, 5, 10], 100, 20, 2);
		expect(geo.points).toHaveLength(3);
		// first x at pad, last x at width - pad
		expect(geo.points[0].x).toBe(2);
		expect(geo.points[2].x).toBe(98);
		// rising series: first point sits at the BOTTOM (max y), last at the TOP (min y)
		expect(geo.points[0].y).toBeGreaterThan(geo.points[2].y);
		expect(geo.rising).toBe(true);
		expect(geo.d.startsWith('M2 ')).toBe(true);
	});

	it('flags a net-negative series as not rising', () => {
		const geo = sparklineGeometry([10, 4, 1], 100, 20);
		expect(geo.rising).toBe(false);
	});

	it('handles a flat series without dividing by zero', () => {
		const geo = sparklineGeometry([7, 7, 7], 100, 20, 2);
		expect(geo.points.every((p) => Number.isFinite(p.y))).toBe(true);
	});

	it('returns empty geometry for no usable values', () => {
		expect(sparklineGeometry([], 100, 20).points).toHaveLength(0);
		expect(sparklineGeometry([NaN, undefined], 100, 20).points).toHaveLength(0);
	});

	it('sparkline() emits a valid svg with a path for a real series', () => {
		const svg = sparkline([1, 2, 3], { width: 80, height: 24, animate: false });
		expect(svg).toContain('<svg');
		expect(svg).toContain('<path');
		expect(svg).toContain('var(--success)');
	});
});

describe('ringGeometry', () => {
	it('computes circumference and dash for a known percentage', () => {
		const g = ringGeometry(50, 56, 5);
		const r = (56 - 5) / 2;
		const c = 2 * Math.PI * r;
		expect(g.radius).toBeCloseTo(r, 2);
		expect(g.circumference).toBeCloseTo(c, 1);
		expect(g.dash).toBeCloseTo(c / 2, 1);
		expect(g.dash + g.gap).toBeCloseTo(g.circumference, 1);
	});

	it('clamps out-of-range percentages', () => {
		expect(ringGeometry(-20).dash).toBe(0);
		const full = ringGeometry(150);
		expect(full.dash).toBeCloseTo(full.circumference, 1);
	});

	it('ring() defaults the label to a rounded percentage', () => {
		expect(ring(72.4)).toContain('>72%<');
		expect(ring(50, { label: 'GO' })).toContain('>GO<');
		expect(ring(50, { tone: 'success' })).toContain('var(--success)');
	});
});

describe('computeFlipDeltas', () => {
	it('returns the inverse offset only for keys that moved', () => {
		const first = new Map([
			['a', { x: 0, y: 0 }],
			['b', { x: 0, y: 40 }],
		]);
		const last = new Map([
			['a', { x: 0, y: 40 }],
			['b', { x: 0, y: 0 }],
		]);
		const deltas = computeFlipDeltas(first, last);
		expect(deltas.get('a')).toEqual({ dx: 0, dy: -40 });
		expect(deltas.get('b')).toEqual({ dx: 0, dy: 40 });
	});

	it('skips unmoved and newly-added keys', () => {
		const first = new Map([['a', { x: 10, y: 10 }]]);
		const last = new Map([
			['a', { x: 10, y: 10 }], // unmoved
			['new', { x: 0, y: 0 }], // added after capture
		]);
		const deltas = computeFlipDeltas(first, last);
		expect(deltas.size).toBe(0);
	});
});

describe('liveDot', () => {
	it('renders the connection state and label', () => {
		expect(liveDot('live')).toContain("data-state=\"live\"");
		expect(liveDot('live')).toContain('>live<');
		expect(liveDot('connecting')).toContain('>connecting<');
		expect(liveDot('idle')).toContain('>offline<');
		expect(liveDot('live', 'streaming')).toContain('>streaming<');
	});
});

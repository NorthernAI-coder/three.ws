/**
 * Feature Tour curriculum + track playlists — unit tests.
 *
 * The tour is driven by a generated curriculum (scripts/build-tour.mjs →
 * public/tour/curriculum.json) and navigated over a *playlist* of stop indices
 * derived per track. These tests pin the two invariants the runtime relies on:
 *   1. The generated curriculum is well-formed — every stop carries a boolean
 *      `highlight`, and the declared `tracks` metadata agrees with the stops.
 *   2. buildPlaylist() yields the right index lists for each track, always
 *      non-empty, and degrades to the full list when a curriculum has no
 *      highlights or an unknown track is requested.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { JSDOM } from 'jsdom';
import { buildPlaylist, trackMeta } from '../src/feature-tour/curriculum.js';

const curriculum = JSON.parse(
	readFileSync(resolve(__dirname, '../public/tour/curriculum.json'), 'utf8'),
);

describe('generated curriculum', () => {
	it('has stops, sections, and both tracks', () => {
		expect(curriculum.stops.length).toBeGreaterThan(0);
		expect(curriculum.sections.length).toBeGreaterThan(0);
		const ids = (curriculum.tracks || []).map((t) => t.id).sort();
		expect(ids).toEqual(['full', 'quick']);
	});

	it('marks every stop with a boolean highlight flag', () => {
		for (const stop of curriculum.stops) {
			expect(typeof stop.highlight).toBe('boolean');
		}
	});

	it('keeps track metadata consistent with the stops', () => {
		const highlights = curriculum.stops.filter((s) => s.highlight).length;
		expect(trackMeta(curriculum, 'full').stopCount).toBe(curriculum.stops.length);
		expect(trackMeta(curriculum, 'quick').stopCount).toBe(highlights);
		// Quick is a true subset and a meaningful sample of the whole.
		expect(highlights).toBeGreaterThan(0);
		expect(highlights).toBeLessThan(curriculum.stops.length);
	});

	it('includes a highlight at the start of every chapter', () => {
		for (const section of curriculum.sections) {
			const first = curriculum.stops.find((s) => s.section === section.id);
			expect(first.highlight, `first stop of ${section.id} should be a highlight`).toBe(true);
		}
	});
});

describe('buildPlaylist', () => {
	it('returns every stop index for the full track', () => {
		const full = buildPlaylist(curriculum, 'full');
		expect(full).toHaveLength(curriculum.stops.length);
		expect(full[0]).toBe(0);
		expect(full[full.length - 1]).toBe(curriculum.stops.length - 1);
	});

	it('returns only highlighted indices for the quick track', () => {
		const quick = buildPlaylist(curriculum, 'quick');
		expect(quick.length).toBe(curriculum.stops.filter((s) => s.highlight).length);
		expect(quick.every((i) => curriculum.stops[i].highlight)).toBe(true);
		// Strictly increasing — playlists preserve curriculum order.
		for (let i = 1; i < quick.length; i++) expect(quick[i]).toBeGreaterThan(quick[i - 1]);
		// The first stop (home) anchors both tracks.
		expect(quick[0]).toBe(0);
	});

	it('defaults to the full track for an unknown track id', () => {
		expect(buildPlaylist(curriculum, 'nope')).toHaveLength(curriculum.stops.length);
		expect(buildPlaylist(curriculum)).toHaveLength(curriculum.stops.length);
	});

	it('falls back to the full list when no stops are highlighted', () => {
		const flat = { stops: [{ highlight: false }, { highlight: false }] };
		expect(buildPlaylist(flat, 'quick')).toEqual([0, 1]);
	});
});

describe('free-roam activation guard', () => {
	let dom;
	let isInteractiveTarget;

	beforeAll(async () => {
		dom = new JSDOM('<!doctype html><body></body>');
		global.window = dom.window;
		global.document = dom.window.document;
		global.matchMedia = () => ({ matches: false });
		dom.window.matchMedia = global.matchMedia;
		({ isInteractiveTarget } = await import('../src/feature-tour/free-roam.js'));
	});

	afterAll(() => {
		delete global.window;
		delete global.document;
		delete global.matchMedia;
	});

	function make(html) {
		document.body.innerHTML = html;
		return document.body.firstElementChild;
	}

	it('treats links, buttons, inputs and canvases as page interactions', () => {
		expect(isInteractiveTarget(make('<a href="/x">x</a>'))).toBe(true);
		expect(isInteractiveTarget(make('<button>x</button>'))).toBe(true);
		expect(isInteractiveTarget(make('<input>'))).toBe(true);
		expect(isInteractiveTarget(make('<canvas></canvas>'))).toBe(true);
		expect(isInteractiveTarget(make('<div data-walk-block>x</div>'))).toBe(true);
	});

	it('counts a child of an interactive element as interactive', () => {
		const a = make('<a href="/x"><span>deep</span></a>');
		expect(isInteractiveTarget(a.querySelector('span'))).toBe(true);
	});

	it('treats plain empty space as walkable (not interactive)', () => {
		expect(isInteractiveTarget(make('<div><p>just text</p></div>'))).toBe(false);
		expect(isInteractiveTarget(null)).toBe(false);
	});
});

/**
 * Unit tests for the Avatar Studio pure utility helpers.
 *
 * Tests cover:
 *   - collapseAppearance: empty, partial, and full appearance collapsing
 *   - hydrateAppearance: null/missing inputs, valid inputs, field defaults
 *   - cloneAppearance: deep isolation — mutations don't bleed between copies
 *   - appearanceEqual: identity, structural equality, inequality
 *   - parseEditId: URL params with and without the `edit` key
 *   - readDraft / writeDraft / clearDraft: localStorage round-trips + expiry
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
	collapseAppearance,
	hydrateAppearance,
	cloneAppearance,
	appearanceEqual,
	parseEditId,
	readDraft,
	writeDraft,
	clearDraft,
	DRAFT_KEY,
	DRAFT_MAX_AGE_MS,
} from '../src/avatar-studio-utils.js';

// ── collapseAppearance ────────────────────────────────────────────────────────

describe('collapseAppearance', () => {
	it('returns null for a fully empty appearance', () => {
		expect(collapseAppearance({ accessories: [], morphs: {}, colors: {}, hidden: [] })).toBeNull();
	});

	it('returns null for null/undefined input', () => {
		expect(collapseAppearance(null)).toBeNull();
		expect(collapseAppearance(undefined)).toBeNull();
	});

	it('includes accessories when non-empty', () => {
		const result = collapseAppearance({ accessories: ['hat-01'], morphs: {}, colors: {}, hidden: [] });
		expect(result).toEqual({ accessories: ['hat-01'] });
	});

	it('includes morphs when non-empty', () => {
		const result = collapseAppearance({ accessories: [], morphs: { jawOpen: 0.3 }, colors: {}, hidden: [] });
		expect(result).toEqual({ morphs: { jawOpen: 0.3 } });
	});

	it('includes colors when non-empty', () => {
		const result = collapseAppearance({ accessories: [], morphs: {}, colors: { skin: '#f3c1a3' }, hidden: [] });
		expect(result).toEqual({ colors: { skin: '#f3c1a3' } });
	});

	it('includes hidden when non-empty', () => {
		const result = collapseAppearance({ accessories: [], morphs: {}, colors: {}, hidden: ['outfit'] });
		expect(result).toEqual({ hidden: ['outfit'] });
	});

	it('includes all non-empty fields together', () => {
		const input = {
			accessories: ['hat-01', 'earrings-02'],
			morphs: { jawOpen: 0.2 },
			colors: { hair: '#3b2417', skin: '#e0a878' },
			hidden: ['glasses'],
		};
		const result = collapseAppearance(input);
		expect(result).toEqual(input);
	});

	it('copies arrays — mutations to result do not affect input', () => {
		const input = { accessories: ['hat-01'], morphs: {}, colors: {}, hidden: [] };
		const result = collapseAppearance(input);
		result.accessories.push('mutated');
		expect(input.accessories).toHaveLength(1);
	});
});

// ── hydrateAppearance ─────────────────────────────────────────────────────────

describe('hydrateAppearance', () => {
	it('returns defaults for null', () => {
		const result = hydrateAppearance(null);
		expect(result).toEqual({ accessories: [], morphs: {}, colors: {}, hidden: [] });
	});

	it('returns defaults for undefined', () => {
		const result = hydrateAppearance(undefined);
		expect(result).toEqual({ accessories: [], morphs: {}, colors: {}, hidden: [] });
	});

	it('returns defaults for a non-object (string)', () => {
		const result = hydrateAppearance('bad');
		expect(result).toEqual({ accessories: [], morphs: {}, colors: {}, hidden: [] });
	});

	it('fills in missing fields with defaults', () => {
		const result = hydrateAppearance({ colors: { skin: '#abc123' } });
		expect(result.accessories).toEqual([]);
		expect(result.morphs).toEqual({});
		expect(result.hidden).toEqual([]);
		expect(result.colors).toEqual({ skin: '#abc123' });
	});

	it('round-trips a full appearance', () => {
		const raw = {
			accessories: ['hat-01'],
			morphs: { browDownLeft: 0.5 },
			colors: { hair: '#0e0e0e' },
			hidden: ['outfit'],
		};
		expect(hydrateAppearance(raw)).toEqual(raw);
	});

	it('copies arrays — mutations do not affect the source', () => {
		const raw = { accessories: ['hat-01'], morphs: {}, colors: {}, hidden: [] };
		const result = hydrateAppearance(raw);
		result.accessories.push('mutated');
		expect(raw.accessories).toHaveLength(1);
	});
});

// ── cloneAppearance ───────────────────────────────────────────────────────────

describe('cloneAppearance', () => {
	it('produces an identical but distinct object', () => {
		const a = { accessories: ['hat-01'], morphs: { jawOpen: 0.1 }, colors: { skin: '#fff' }, hidden: ['glasses'] };
		const b = cloneAppearance(a);
		expect(b).toEqual(a);
		expect(b).not.toBe(a);
	});

	it('accessories mutation does not affect clone source', () => {
		const a = { accessories: ['hat-01'], morphs: {}, colors: {}, hidden: [] };
		const b = cloneAppearance(a);
		b.accessories.push('new');
		expect(a.accessories).toHaveLength(1);
	});

	it('morphs mutation does not affect clone source', () => {
		const a = { accessories: [], morphs: { jawOpen: 0.5 }, colors: {}, hidden: [] };
		const b = cloneAppearance(a);
		b.morphs.extra = 1;
		expect(a.morphs.extra).toBeUndefined();
	});
});

// ── appearanceEqual ───────────────────────────────────────────────────────────

describe('appearanceEqual', () => {
	it('empty appearances are equal', () => {
		const a = { accessories: [], morphs: {}, colors: {}, hidden: [] };
		const b = { accessories: [], morphs: {}, colors: {}, hidden: [] };
		expect(appearanceEqual(a, b)).toBe(true);
	});

	it('identical full appearances are equal', () => {
		const a = { accessories: ['hat-01'], morphs: { jawOpen: 0.3 }, colors: { skin: '#fff' }, hidden: ['outfit'] };
		expect(appearanceEqual(a, cloneAppearance(a))).toBe(true);
	});

	it('appearances with different accessories are not equal', () => {
		const a = { accessories: ['hat-01'], morphs: {}, colors: {}, hidden: [] };
		const b = { accessories: ['hat-02'], morphs: {}, colors: {}, hidden: [] };
		expect(appearanceEqual(a, b)).toBe(false);
	});

	it('appearances with different colors are not equal', () => {
		const a = { accessories: [], morphs: {}, colors: { skin: '#fff' }, hidden: [] };
		const b = { accessories: [], morphs: {}, colors: { skin: '#000' }, hidden: [] };
		expect(appearanceEqual(a, b)).toBe(false);
	});
});

// ── parseEditId ───────────────────────────────────────────────────────────────

describe('parseEditId', () => {
	it('returns null when no edit param', () => {
		expect(parseEditId(new URLSearchParams(''))).toBeNull();
	});

	it('returns null when edit param is empty', () => {
		expect(parseEditId(new URLSearchParams('edit='))).toBeNull();
	});

	it('returns null when edit param is whitespace', () => {
		expect(parseEditId(new URLSearchParams('edit=   '))).toBeNull();
	});

	it('returns the ID when edit param is present', () => {
		const params = new URLSearchParams('edit=abc-123-def');
		expect(parseEditId(params)).toBe('abc-123-def');
	});

	it('trims whitespace from the ID', () => {
		const params = new URLSearchParams('edit=  abc-123  ');
		expect(parseEditId(params)).toBe('abc-123');
	});

	it('accepts a raw query string', () => {
		expect(parseEditId('?edit=my-id')).toBe('my-id');
	});
});

// ── draft storage ─────────────────────────────────────────────────────────────

function makeStorage(initial = {}) {
	const store = { ...initial };
	return {
		getItem: (k) => store[k] ?? null,
		setItem: (k, v) => { store[k] = v; },
		removeItem: (k) => { delete store[k]; },
		_store: store,
	};
}

describe('writeDraft / readDraft / clearDraft', () => {
	it('writes and reads back a draft', () => {
		const storage = makeStorage();
		const appearance = { accessories: ['hat-01'], morphs: {}, colors: { skin: '#fff' }, hidden: [] };
		writeDraft(storage, appearance, 'My Avatar');
		const draft = readDraft(storage);
		expect(draft).not.toBeNull();
		expect(draft.appearance).toEqual(appearance);
		expect(draft.name).toBe('My Avatar');
		expect(typeof draft.ts).toBe('number');
	});

	it('clearDraft removes the entry', () => {
		const storage = makeStorage();
		writeDraft(storage, { accessories: [] }, 'test');
		clearDraft(storage);
		expect(readDraft(storage)).toBeNull();
	});

	it('returns null for missing key', () => {
		expect(readDraft(makeStorage())).toBeNull();
	});

	it('returns null and removes expired drafts', () => {
		const storage = makeStorage();
		const oldTs = Date.now() - DRAFT_MAX_AGE_MS - 1000;
		storage.setItem(DRAFT_KEY, JSON.stringify({ appearance: {}, name: 'x', ts: oldTs }));
		expect(readDraft(storage)).toBeNull();
		expect(storage._store[DRAFT_KEY]).toBeUndefined();
	});

	it('returns null for malformed JSON', () => {
		const storage = makeStorage({ [DRAFT_KEY]: 'not-json{{{' });
		expect(readDraft(storage)).toBeNull();
	});

	it('returns null for draft without ts field', () => {
		const storage = makeStorage({ [DRAFT_KEY]: JSON.stringify({ appearance: {} }) });
		expect(readDraft(storage)).toBeNull();
	});

	it('allows null appearance in the draft (collapseAppearance returns null for empty)', () => {
		const storage = makeStorage();
		writeDraft(storage, null, 'Empty');
		const draft = readDraft(storage);
		expect(draft).not.toBeNull();
		expect(draft.appearance).toBeNull();
	});
});

// Entry desk — unit tests for the prompt-04 logic that lives in the adapter
// boundary: the entry schema, LOCAL validation that must reject a bad entry
// BEFORE any payment, the config-driven free/paid fee mode (never a hardcoded
// flag), the wire normalization that drops empty optionals, and the tolerant
// confirmation parser. These are the correctness guarantees the desk depends on;
// the 3D kiosk + SSE stepper are exercised in a real browser (see prompt 04
// acceptance), not here.
//
// Contract: docs/omniology-arena/CONTRACTS.md §1.2, §2.3.

import { describe, it, expect, afterEach } from 'vitest';
import {
	ENTRY_FIELDS,
	normalizeEntry,
	validateEntry,
	entryFeeMode,
	readEntryConfirmation,
} from '../src/game/arena/omniology-adapter.js';

describe('ENTRY_FIELDS', () => {
	it('declares the documented required fields the compose UI renders from', () => {
		const keys = ENTRY_FIELDS.map((f) => f.key);
		expect(keys).toContain('title');
		expect(keys).toContain('prompt');
		// At least one required field, so an empty submit can never pass.
		expect(ENTRY_FIELDS.some((f) => f.required)).toBe(true);
		// Every field carries a label + type so the form is self-describing.
		for (const f of ENTRY_FIELDS) {
			expect(typeof f.label).toBe('string');
			expect(['text', 'textarea', 'url']).toContain(f.type);
		}
	});
});

describe('normalizeEntry()', () => {
	it('trims strings and drops empty optionals', () => {
		const out = normalizeEntry({ title: '  Sunset  ', prompt: 'a calm beach', media_url: '   ' });
		expect(out.title).toBe('Sunset');
		expect(out.prompt).toBe('a calm beach');
		expect('media_url' in out).toBe(false); // empty optional dropped
	});

	it('keeps a required-but-empty field as "" so validation can flag it', () => {
		const out = normalizeEntry({ prompt: 'x' });
		expect(out.title).toBe(''); // required, missing → kept empty, not omitted
	});

	it('keeps a valid optional value', () => {
		const out = normalizeEntry({ title: 'a', prompt: 'b', media_url: 'https://x.test/i.png' });
		expect(out.media_url).toBe('https://x.test/i.png');
	});
});

describe('validateEntry() — rejects bad entries before payment', () => {
	it('passes a complete, valid entry', () => {
		const v = validateEntry({ title: 'Sunset', prompt: 'a calm beach at dusk' });
		expect(v.ok).toBe(true);
		expect(v.errors).toEqual({});
	});

	it('flags missing required fields', () => {
		const v = validateEntry({ title: '', prompt: '   ' });
		expect(v.ok).toBe(false);
		expect(v.errors.title).toMatch(/required/i);
		expect(v.errors.prompt).toMatch(/required/i);
	});

	it('enforces the per-field character limit', () => {
		const titleField = ENTRY_FIELDS.find((f) => f.key === 'title');
		const tooLong = 'x'.repeat(titleField.max + 1);
		const v = validateEntry({ title: tooLong, prompt: 'ok' });
		expect(v.ok).toBe(false);
		expect(v.errors.title).toMatch(new RegExp(`${titleField.max}`));
	});

	it('rejects a non-https media URL but accepts a blank optional', () => {
		const bad = validateEntry({ title: 't', prompt: 'p', media_url: 'http://insecure/x.png' });
		expect(bad.ok).toBe(false);
		expect(bad.errors.media_url).toMatch(/https/i);

		const blankOptional = validateEntry({ title: 't', prompt: 'p', media_url: '' });
		expect(blankOptional.ok).toBe(true);

		const goodUrl = validateEntry({ title: 't', prompt: 'p', media_url: 'https://cdn.test/x.png' });
		expect(goodUrl.ok).toBe(true);
	});
});

describe('entryFeeMode() — selected by config, never hardcoded', () => {
	afterEach(() => {
		delete globalThis.window;
		delete globalThis.document;
	});

	it('defaults to auto when unconfigured', () => {
		expect(entryFeeMode()).toBe('auto');
	});

	it('reads window.OMNIOLOGY_ENTRY_FEE (case-insensitive)', () => {
		globalThis.window = { OMNIOLOGY_ENTRY_FEE: 'FREE' };
		expect(entryFeeMode()).toBe('free');
		globalThis.window = { OMNIOLOGY_ENTRY_FEE: 'paid' };
		expect(entryFeeMode()).toBe('paid');
	});

	it('reads the <meta name="omniology-entry-fee"> tag', () => {
		globalThis.document = {
			querySelector: (sel) =>
				sel === 'meta[name="omniology-entry-fee"]'
					? { getAttribute: () => 'free' }
					: null,
		};
		expect(entryFeeMode()).toBe('free');
	});

	it('falls back to auto for an unrecognized value', () => {
		globalThis.window = { OMNIOLOGY_ENTRY_FEE: 'whenever' };
		expect(entryFeeMode()).toBe('auto');
	});
});

describe('readEntryConfirmation() — tolerant of both wire shapes', () => {
	it('reads the paid-path nested result envelope', () => {
		const env = {
			ok: true,
			result: { entry_id: 'e_42', status: 'accepted', round: 1421, position: 38 },
			payment: { tx: 'sig', amount: '250000' },
		};
		expect(readEntryConfirmation(env)).toEqual({
			entryId: 'e_42', status: 'accepted', round: 1421, position: 38,
		});
	});

	it('reads the free-path bare body', () => {
		const env = { entry_id: 'e_7', status: 'accepted', round: 9, position: 2 };
		expect(readEntryConfirmation(env)).toEqual({
			entryId: 'e_7', status: 'accepted', round: 9, position: 2,
		});
	});

	it('coerces string round/position and tolerates missing fields', () => {
		const env = { result: { entry_id: 'e1', round: '12', position: '4' } };
		const c = readEntryConfirmation(env);
		expect(c.round).toBe(12);
		expect(c.position).toBe(4);
		expect(c.status).toBeNull();
	});

	it('never throws on an empty/garbage envelope', () => {
		expect(readEntryConfirmation(null)).toEqual({ entryId: null, status: null, round: null, position: null });
		expect(readEntryConfirmation({})).toEqual({ entryId: null, status: null, round: null, position: null });
	});
});

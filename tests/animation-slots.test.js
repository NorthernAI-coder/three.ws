/**
 * Regression guard for the fixed agent animation-slot vocabulary
 * (src/runtime/animation-slots.js). Pins two contracts:
 *
 *  1. every slot in SLOTS has a DEFAULT_ANIMATION_MAP entry.
 *  2. every DEFAULT_ANIMATION_MAP value names a clip that actually exists in
 *     public/animations/manifest.json — a mismatch (e.g. the historic
 *     `fidget: 'Fidget'`, capitalized and never baked — see
 *     public/animations/registry.json known_issues: broken-fidget-slot)
 *     silently no-ops the gesture on every agent that hits it instead of
 *     failing loudly.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { SLOTS, DEFAULT_ANIMATION_MAP, resolveSlot } from '../src/runtime/animation-slots.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const manifest = JSON.parse(
	readFileSync(resolve(__dirname, '../public/animations/manifest.json'), 'utf8'),
);
const CLIP_NAMES = new Set(manifest.map((c) => c.name));

describe('animation-slots', () => {
	it('every declared slot has a default clip mapping', () => {
		for (const slot of SLOTS) {
			expect(DEFAULT_ANIMATION_MAP[slot], `slot "${slot}" has no default mapping`).toBeTruthy();
		}
	});

	it('every default mapping names a clip that is actually baked in the manifest', () => {
		for (const [slot, clip] of Object.entries(DEFAULT_ANIMATION_MAP)) {
			expect(CLIP_NAMES.has(clip), `slot "${slot}" → "${clip}" missing from manifest`).toBe(true);
		}
	});

	it('resolveSlot prefers an agent override over the default map', () => {
		expect(resolveSlot('wave', { wave: 'av-joy' })).toBe('av-joy');
		expect(resolveSlot('wave', null)).toBe(DEFAULT_ANIMATION_MAP.wave);
		expect(resolveSlot('wave', {})).toBe(DEFAULT_ANIMATION_MAP.wave);
	});

	it('falls back to the slot name itself for an unmapped slot', () => {
		expect(resolveSlot('not-a-real-slot', null)).toBe('not-a-real-slot');
	});
});

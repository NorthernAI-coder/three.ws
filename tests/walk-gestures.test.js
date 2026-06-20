/**
 * walk-gestures — clip-availability + def tests.
 *
 * The gesture system is only "real" if every gesture name resolves to a baked
 * clip that actually ships in public/animations/clips/. These tests fail the
 * build if a gesture points at a missing or mistyped clip, and assert the wheel
 * order stays in sync with the gesture library.
 */

import { describe, it, expect } from 'vitest';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { GESTURES, GESTURE_NAMES } from '../src/animation-state-machine.js';
import { GESTURE_ORDER } from '../src/walk-gestures.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CLIPS_DIR = resolve(__dirname, '../public/animations/clips');

describe('walk-gestures — clip availability', () => {
	it('every gesture resolves to a baked clip that exists on disk', () => {
		for (const name of GESTURE_NAMES) {
			const clip = GESTURES[name].clip;
			const path = resolve(CLIPS_DIR, `${clip}.json`);
			expect(existsSync(path), `missing clip for gesture "${name}": ${clip}.json`).toBe(true);
		}
	});

	it('loop gestures are the held ones (dance, sit, talking)', () => {
		const looping = GESTURE_NAMES.filter((n) => GESTURES[n].loop);
		expect(looping.sort()).toEqual(['dance', 'sit', 'talking']);
	});

	it('full-body gestures (sit, dance) take over the base layer; the rest overlay', () => {
		const full = GESTURE_NAMES.filter((n) => GESTURES[n].layer === 'full');
		expect(full.sort()).toEqual(['dance', 'sit']);
		const upper = GESTURE_NAMES.filter((n) => GESTURES[n].layer === 'upper');
		expect(upper).toEqual(['wave', 'point', 'cheer', 'agree', 'disagree', 'talking']);
	});
});

describe('walk-gestures — wheel order', () => {
	it('GESTURE_ORDER lists all eight gestures exactly once', () => {
		expect(GESTURE_ORDER.length).toBe(8);
		expect([...GESTURE_ORDER].sort()).toEqual([...GESTURE_NAMES].sort());
	});

	it('every ordered gesture is a known gesture', () => {
		for (const name of GESTURE_ORDER) {
			expect(GESTURES[name], `unknown gesture in order: ${name}`).toBeTruthy();
		}
	});
});

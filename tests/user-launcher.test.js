// Unit tests for the per-user Memetic Launcher endpoint's pure logic.
// The handler's I/O (auth, SQL) is exercised separately; here we lock down the
// safety-critical invariants: the dry-run lock, range validation, and clamping.

import { describe, it, expect } from 'vitest';
import { validateAndBuildPatch, shapeConfig, FORCE_DRY_RUN, MODES, KNOWN_SOURCES } from '../api/launcher/me.js';

const baseCur = {
	enabled: false,
	dry_run: true,
	mode: 'hybrid',
	sources: ['coin_intel', 'trending'],
	categories: [],
	target_cadence_seconds: 60,
	max_per_hour: 30,
	network: 'mainnet',
};

describe('user launcher — dry-run lock (safety)', () => {
	it('forces dry_run on even when the client asks to disable it', () => {
		const r = validateAndBuildPatch({ dry_run: false, enabled: true }, baseCur);
		expect(r.ok).toBe(true);
		expect(r.next.dry_run).toBe(true);
	});

	it('shapeConfig never reports armed and always dry_run when locked', () => {
		const shaped = shapeConfig({ ...baseCur, enabled: true, dry_run: false });
		expect(FORCE_DRY_RUN).toBe(true);
		expect(shaped.dry_run).toBe(true);
		expect(shaped.armed).toBe(false);
	});

	it('shapeConfig returns null for a missing row', () => {
		expect(shapeConfig(null)).toBe(null);
	});
});

describe('user launcher — validation', () => {
	it('rejects an unknown mode', () => {
		const r = validateAndBuildPatch({ mode: 'nuke' }, baseCur);
		expect(r.ok).toBe(false);
		expect(r.code).toBe('invalid_mode');
	});

	it('accepts every supported mode', () => {
		for (const mode of MODES) expect(validateAndBuildPatch({ mode }, baseCur).ok).toBe(true);
	});

	it('rejects an unknown network', () => {
		expect(validateAndBuildPatch({ network: 'testnet' }, baseCur).code).toBe('invalid_network');
	});

	it('rejects a source outside the known set', () => {
		const r = validateAndBuildPatch({ sources: ['coin_intel', 'tiktok'] }, baseCur);
		expect(r.ok).toBe(false);
		expect(r.code).toBe('invalid_sources');
	});

	it('accepts the full known source set', () => {
		expect(validateAndBuildPatch({ sources: [...KNOWN_SOURCES] }, baseCur).ok).toBe(true);
	});

	it('rejects non-array categories', () => {
		expect(validateAndBuildPatch({ categories: 'memes' }, baseCur).code).toBe('invalid_categories');
	});

	it('rejects a cadence below the 60s floor', () => {
		expect(validateAndBuildPatch({ target_cadence_seconds: 5 }, baseCur).code).toBe('invalid_cadence');
	});

	it('rejects a max_per_hour above the 60 ceiling', () => {
		expect(validateAndBuildPatch({ max_per_hour: 999 }, baseCur).code).toBe('invalid_max_per_hour');
	});
});

describe('user launcher — clamping + partial patch', () => {
	it('clamps cadence into [60, 86400] and rounds', () => {
		const r = validateAndBuildPatch({ target_cadence_seconds: 90.7 }, baseCur);
		expect(r.ok).toBe(true);
		expect(r.next.target_cadence_seconds).toBe(91);
	});

	it('clamps max_per_hour into [0, 60]', () => {
		// 60 is the ceiling and is accepted; the clamp guards rounding edge cases.
		const r = validateAndBuildPatch({ max_per_hour: 60 }, baseCur);
		expect(r.ok).toBe(true);
		expect(r.next.max_per_hour).toBe(60);
	});

	it('leaves unspecified fields untouched (partial update)', () => {
		const r = validateAndBuildPatch({ enabled: true }, baseCur);
		expect(r.next.mode).toBe('hybrid');
		expect(r.next.network).toBe('mainnet');
		expect(r.next.sources).toEqual(['coin_intel', 'trending']);
		expect(r.next.enabled).toBe(true);
	});

	it('coerces a jsonb-string current value into an array', () => {
		const r = validateAndBuildPatch({ enabled: true }, { ...baseCur, sources: '["x","oracle"]' });
		expect(r.next.sources).toEqual(['x', 'oracle']);
	});
});

import { describe, it, expect } from 'vitest';

import {
	forgeRequestHash,
	coalesceInFlight,
	registerInFlight,
	acquireBlockingSlot,
	providerSubmitAllowed,
	SCALE_LIMITS,
} from '../api/_lib/forge-scale.js';

// forge-scale provides the /forge pipeline's scaling throttles. Tests run with no
// Upstash Redis configured (the unit-test env), which is exactly the FAIL-OPEN
// contract these primitives promise: every gate must degrade to allow/no-op so
// generation keeps working when the limiter store is absent. We also lock the
// request-fingerprint semantics that in-flight coalescing depends on.

describe('forgeRequestHash', () => {
	it('is deterministic for identical inputs', () => {
		const a = forgeRequestHash({ path: 'image', tier: 'standard', backend: 'trellis', prompt: 'a red car' });
		const b = forgeRequestHash({ path: 'image', tier: 'standard', backend: 'trellis', prompt: 'a red car' });
		expect(a).toBe(b);
		expect(a).toMatch(/^[0-9a-f]{32}$/);
	});

	it('normalizes prompt whitespace and case', () => {
		const a = forgeRequestHash({ path: 'image', tier: 'standard', backend: 'trellis', prompt: 'A Red Car' });
		const b = forgeRequestHash({ path: 'image', tier: 'standard', backend: 'trellis', prompt: '  a red car  ' });
		expect(a).toBe(b);
	});

	it('is order-independent across the multi-view image set', () => {
		const front = 'https://x/front.png';
		const back = 'https://x/back.png';
		const a = forgeRequestHash({ path: 'image', tier: 'high', backend: 'meshy', images: [front, back] });
		const b = forgeRequestHash({ path: 'image', tier: 'high', backend: 'meshy', images: [back, front] });
		expect(a).toBe(b);
	});

	it('distinguishes tier, backend, path, prompt, and images', () => {
		const base = { path: 'image', tier: 'standard', backend: 'trellis', prompt: 'cat' };
		const h = forgeRequestHash(base);
		expect(forgeRequestHash({ ...base, tier: 'high' })).not.toBe(h);
		expect(forgeRequestHash({ ...base, backend: 'meshy' })).not.toBe(h);
		expect(forgeRequestHash({ ...base, path: 'geometry' })).not.toBe(h);
		expect(forgeRequestHash({ ...base, prompt: 'dog' })).not.toBe(h);
		expect(forgeRequestHash({ ...base, images: ['https://x/a.png'] })).not.toBe(h);
	});

	it('accepts a tier object or a tier id interchangeably', () => {
		const a = forgeRequestHash({ path: 'image', tier: { id: 'standard' }, backend: 'trellis', prompt: 'cat' });
		const b = forgeRequestHash({ path: 'image', tier: 'standard', backend: 'trellis', prompt: 'cat' });
		expect(a).toBe(b);
	});
});

describe('fail-open behavior without Redis', () => {
	it('coalesceInFlight returns null (always a miss)', async () => {
		expect(await coalesceInFlight('deadbeef')).toBeNull();
	});

	it('registerInFlight is a no-op that never throws', async () => {
		await expect(registerInFlight('deadbeef', 'job-123')).resolves.toBeUndefined();
	});

	it('acquireBlockingSlot grants an unbounded, releasable slot', async () => {
		const slot = await acquireBlockingSlot('hf', { max: 1, ttlMs: 1000 });
		expect(slot.ok).toBe(true);
		// A second acquire still succeeds (no shared store to count against).
		const slot2 = await acquireBlockingSlot('hf', { max: 1, ttlMs: 1000 });
		expect(slot2.ok).toBe(true);
		await expect(slot.release()).resolves.toBeUndefined();
		await expect(slot.release()).resolves.toBeUndefined(); // idempotent
	});

	it('providerSubmitAllowed allows', async () => {
		expect(await providerSubmitAllowed('replicate', { limit: 1, windowS: 10 })).toBe(true);
	});
});

describe('SCALE_LIMITS', () => {
	it('exposes sane positive defaults', () => {
		expect(SCALE_LIMITS.hfConcurrent).toBeGreaterThan(0);
		expect(SCALE_LIMITS.hfSlotTtlMs).toBeGreaterThanOrEqual(300_000);
		expect(SCALE_LIMITS.replicateSubmitLimit).toBeGreaterThan(0);
		expect(SCALE_LIMITS.replicateSubmitWindowS).toBeGreaterThan(0);
	});
});

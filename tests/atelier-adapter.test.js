// Tests for the Atelier marketplace boundary — the ONLY module that knows
// Atelier's wire shapes. We exercise the pure normalizers (no live endpoint, no
// DOM) so the contract the plaza consumes is locked:
//   1. The three.ws 3D Studio is ALWAYS present and featured (the strategy: we're
//      registered as Atelier's 3D specialist), even with an empty/absent feed.
//   2. Wire agents normalize snake_case → camelCase, unix→ms, with null-tolerant
//      coercion — never inventing data for missing fields.
//   3. Hire requests build the exact /api/x402-pay external payload, and the
//      internal studio is excluded from x402 (it routes to the forge).

import { describe, it, expect } from 'vitest';

import {
	STUDIO_AGENT,
	normalizeRoster,
	normalizeAgent,
	hireRequest,
} from '../src/game/arena/atelier-adapter.js';

const BASE = 'https://api.atelierai.xyz';

describe('STUDIO_AGENT', () => {
	it('is always-present, featured, internal, and free', () => {
		expect(STUDIO_AGENT.id).toBe('threews-studio');
		expect(STUDIO_AGENT.featured).toBe(true);
		expect(STUDIO_AGENT.internal).toBe(true);
		expect(STUDIO_AGENT.priceUsdc).toBe(0);
		expect(STUDIO_AGENT.hireUrl).toBe('/forge');
	});
	it('is frozen so a consumer can never mutate the shared listing', () => {
		expect(Object.isFrozen(STUDIO_AGENT)).toBe(true);
	});
});

describe('normalizeRoster', () => {
	it('prepends the studio agent even when the feed is empty', () => {
		const r = normalizeRoster({ now_unix: 1719259200, agents: [] }, BASE);
		expect(r.ok).toBe(true);
		expect(r.agents).toHaveLength(1);
		expect(r.agents[0].id).toBe('threews-studio');
		expect(r.serverNowMs).toBe(1719259200 * 1000);
	});

	it('tolerates a null/garbage payload without throwing', () => {
		expect(() => normalizeRoster(null)).not.toThrow();
		expect(() => normalizeRoster({ agents: 'nope' })).not.toThrow();
		const r = normalizeRoster(undefined);
		expect(r.agents[0].id).toBe('threews-studio');
		expect(typeof r.serverNowMs).toBe('number');
	});

	it('normalizes marketplace agents after the studio', () => {
		const r = normalizeRoster({
			now_unix: 1719259200,
			agents: [
				{ id: 'img-1', name: 'Pixel', specialty: 'Image', price_usdc: 4, price_period: 'per task', rating: 4.8, jobs_done: 1203, avatar_url: 'https://cdn.x/a.glb', hire_url: '/v1/agents/img-1/hire' },
			],
		}, BASE);
		expect(r.agents).toHaveLength(2);
		const a = r.agents[1];
		expect(a).toMatchObject({
			id: 'img-1', name: 'Pixel', specialty: 'Image',
			priceUsdc: 4, pricePeriod: 'per task', rating: 4.8, jobsDone: 1203,
			avatarUrl: 'https://cdn.x/a.glb', featured: false, internal: false,
		});
		expect(a.hireUrl).toBe(`${BASE}/v1/agents/img-1/hire`);
	});
});

describe('normalizeAgent', () => {
	it('drops an agent with no id (it cannot be hired or addressed)', () => {
		expect(normalizeAgent({ name: 'ghost' })).toBeNull();
		expect(normalizeAgent(null)).toBeNull();
	});

	it('fills sensible defaults for missing fields, never inventing values', () => {
		const a = normalizeAgent({ id: 'x' }, BASE);
		expect(a.name).toBe('Untitled agent');
		expect(a.tagline).toBe('');
		expect(a.priceUsdc).toBe(0);
		expect(a.pricePeriod).toBe('per task');
		expect(a.rating).toBeNull();
		expect(a.jobsDone).toBeNull();
		// hire URL defaults to the canonical per-agent route when none is supplied
		expect(a.hireUrl).toBe(`${BASE}/v1/agents/x/hire`);
	});

	it('rejects a non-https avatar URL (renders the monogram fallback instead)', () => {
		expect(normalizeAgent({ id: 'x', avatar_url: 'http://insecure/a.png' }, BASE).avatarUrl).toBe('');
		expect(normalizeAgent({ id: 'x', avatar_url: 'data:image/png;base64,zz' }, BASE).avatarUrl).toBe('');
		expect(normalizeAgent({ id: 'x', avatar_url: 'https://ok/a.png' }, BASE).avatarUrl).toBe('https://ok/a.png');
	});

	it('keeps an absolute https hire URL, and absolutizes a relative one', () => {
		expect(normalizeAgent({ id: 'x', hire_url: 'https://pay.x/hire' }, BASE).hireUrl).toBe('https://pay.x/hire');
		expect(normalizeAgent({ id: 'x', hire_url: 'hire' }, BASE).hireUrl).toBe(`${BASE}/hire`);
		expect(normalizeAgent({ id: 'x', hire_url: '/hire' }, BASE).hireUrl).toBe(`${BASE}/hire`);
	});

	it('encodes ids with URL-special characters in the default hire route', () => {
		expect(normalizeAgent({ id: 'a/b c' }, BASE).hireUrl).toBe(`${BASE}/v1/agents/a%2Fb%20c/hire`);
	});
});

describe('hireRequest', () => {
	it('returns null for the internal studio agent (routes to the forge, not x402)', () => {
		expect(hireRequest(STUDIO_AGENT)).toBeNull();
	});

	it('returns null for an agent missing a hire URL', () => {
		expect(hireRequest({ id: 'x', internal: false, hireUrl: '' })).toBeNull();
	});

	it('builds the exact /api/x402-pay external payload for a marketplace agent', () => {
		const a = normalizeAgent({ id: 'img-1', hire_url: 'https://pay.x/hire' }, BASE);
		const req = hireRequest(a, { prompt: 'a fox mascot' });
		expect(req).toEqual({
			url: 'https://pay.x/hire',
			method: 'POST',
			body: { brief: { prompt: 'a fox mascot' } },
		});
	});

	it('defaults the brief to an empty object', () => {
		const a = normalizeAgent({ id: 'img-1', hire_url: 'https://pay.x/hire' }, BASE);
		expect(hireRequest(a).body).toEqual({ brief: {} });
	});
});

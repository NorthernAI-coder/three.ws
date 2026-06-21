import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { makeRotatingFetch } from '../api/_lib/solana/connection.js';

// A Response carrying either a raw string body or a JSON-encoded object, the way a
// Solana RPC node answers a JSON-RPC POST.
const resp = (body, status = 200) =>
	new Response(typeof body === 'string' ? body : JSON.stringify(body), {
		status,
		headers: { 'content-type': 'application/json' },
	});
const VALID = { jsonrpc: '2.0', id: 1, result: { ok: true } };

// makeRotatingFetch must NEVER hand its caller (web3.js Connection or the
// /api/solana-rpc proxy) an unvalidated body. The specific production failure this
// guards: every endpoint cooling from a prior request used to fall back to a raw,
// unvalidated `fetch(soonest)` whose `[]` / HTML / truncated body went straight to
// the browser, where web3.js choked with a StructError (or silently mis-read `[]`).
describe('makeRotatingFetch — never leaks an unvalidated upstream body', () => {
	let origFetch;
	beforeEach(() => {
		origFetch = global.fetch;
	});
	afterEach(() => {
		global.fetch = origFetch;
	});

	it('fails over past a 200-but-empty `[]` body to the next healthy endpoint', async () => {
		const eps = ['https://leak-a1.test/', 'https://leak-a2.test/'];
		global.fetch = vi.fn(async (url) => (url === eps[0] ? resp('[]') : resp(VALID)));
		const out = await makeRotatingFetch(eps)(null, { method: 'POST', body: '{}' });
		expect((await out.json()).result).toEqual({ ok: true });
	});

	it('throws instead of returning `[]` when every endpoint yields garbage — even once all are cooling', async () => {
		const eps = ['https://leak-b1.test/', 'https://leak-b2.test/'];
		global.fetch = vi.fn(async () => resp('[]'));
		const rf = makeRotatingFetch(eps);
		// First request exercises and cools both endpoints.
		await expect(rf(null, { method: 'POST', body: '{}' })).rejects.toThrow();
		// Second request: both already cooling. The old code did a raw fetch(soonest)
		// and returned the `[]`; the fixed code validates the all-cooling pass and
		// still throws — the caller never sees an empty array.
		await expect(rf(null, { method: 'POST', body: '{}' })).rejects.toThrow();
	});

	it('recovers on a later request when a previously-cooled endpoint starts serving valid data', async () => {
		const eps = ['https://leak-c1.test/', 'https://leak-c2.test/'];
		let healthy = false;
		global.fetch = vi.fn(async () => (healthy ? resp({ ...VALID, result: 'recovered' }) : resp('[]')));
		const rf = makeRotatingFetch(eps);
		await expect(rf(null, { method: 'POST', body: '{}' })).rejects.toThrow(); // cools both
		healthy = true;
		// Both endpoints are still inside their cooldown window, so pass 1 skips them;
		// the cooldown-ignoring second pass re-probes and returns the now-valid body.
		const out = await rf(null, { method: 'POST', body: '{}' });
		expect((await out.json()).result).toBe('recovered');
	});

	it('returns a well-formed JSON-RPC result straight through without rotating', async () => {
		const eps = ['https://ok-d1.test/', 'https://ok-d2.test/'];
		const fetchSpy = vi.fn(async () => resp(VALID));
		global.fetch = fetchSpy;
		const out = await makeRotatingFetch(eps)(null, { method: 'POST', body: '{}' });
		expect((await out.json()).result).toEqual({ ok: true });
		// First healthy endpoint answers — no failover round-trips.
		expect(fetchSpy).toHaveBeenCalledTimes(1);
	});
});

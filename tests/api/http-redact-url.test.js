// Unit tests for redactUrl() in api/_lib/http.js — the log-sink scrubber that
// keeps a request's coordinates and device-token credential out of console /
// Sentry / ops-alert lines on a 5xx. The /irl nearby read carries the caller's
// exact position AND their device token in the query string, so a leak here
// would put a user's real-world location into off-box logging on any error.

import { describe, it, expect } from 'vitest';
import { redactUrl } from '../../api/_lib/http.js';

describe('redactUrl', () => {
	it('redacts a geolocated read while keeping the path and benign params', () => {
		const out = redactUrl('/api/irl/pins?lat=37.7749295&lng=-122.4194155&radius=40&deviceToken=abc123');
		// Position is gone.
		expect(out).not.toContain('37.7749295');
		expect(out).not.toContain('-122.4194155');
		// Credential is gone.
		expect(out).not.toContain('abc123');
		// The benign param and path survive, so the log stays useful.
		expect(out).toContain('/api/irl/pins');
		expect(out).toContain('radius=40');
		expect(out).toContain('REDACTED');
	});

	it('covers camelCase, snake_case, and origin coordinate variants', () => {
		const out = redactUrl(
			'/x?latitude=1.23456&longitude=6.54321&origin_lat=9.9&originLng=8.8&device_token=t&token=k',
		);
		for (const leak of ['1.23456', '6.54321', '9.9', '8.8', '=t', '=k']) {
			expect(out).not.toContain(leak);
		}
	});

	it('passes through a URL with no query string untouched', () => {
		expect(redactUrl('/api/irl/pins')).toBe('/api/irl/pins');
		expect(redactUrl('')).toBe('');
		expect(redactUrl(undefined)).toBe('');
	});

	it('leaves a query with no sensitive keys exactly as-is', () => {
		const url = '/api/agents?page=2&sort=recent';
		expect(redactUrl(url)).toBe(url);
	});

	it('never echoes a value when the key matches, regardless of casing', () => {
		const out = redactUrl('/p?LAT=51.5&Lng=0.12&DeviceToken=secret');
		expect(out).not.toContain('51.5');
		expect(out).not.toContain('0.12');
		expect(out).not.toContain('secret');
	});
});

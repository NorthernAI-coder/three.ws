// Plain HTTP access to a configured x402 discovery API (used by find_services).
// Real network only — no mocks. Errors normalized into one shape. The base URL
// must be supplied via X402_API_BASE; callers pass the resolved base in.

import { HTTP_TIMEOUT_MS, USER_AGENT } from '../config.js';

export async function apiRequest(base, path, { method = 'GET', query, body } = {}) {
	const url = new URL(`${base}${path}`);
	if (query) {
		for (const [key, value] of Object.entries(query)) {
			if (value === undefined || value === null || value === '') continue;
			url.searchParams.set(key, String(value));
		}
	}
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), HTTP_TIMEOUT_MS);
	let res;
	try {
		res = await fetch(url, {
			method,
			headers: {
				accept: 'application/json',
				'user-agent': USER_AGENT,
				...(body !== undefined ? { 'content-type': 'application/json' } : {}),
			},
			body: body !== undefined ? JSON.stringify(body) : undefined,
			signal: controller.signal,
		});
	} catch (err) {
		clearTimeout(timer);
		if (err?.name === 'AbortError') {
			throw Object.assign(new Error(`${path} timed out after ${HTTP_TIMEOUT_MS}ms`), { code: 'timeout' });
		}
		throw Object.assign(new Error(`${path} request failed: ${err?.message || err}`), { code: 'network_error' });
	}
	clearTimeout(timer);
	const text = await res.text();
	let data;
	try {
		data = text ? JSON.parse(text) : {};
	} catch {
		data = { raw: text };
	}
	if (!res.ok) {
		const message = data?.message || data?.error || `${path} returned HTTP ${res.status}`;
		throw Object.assign(new Error(message), { code: 'upstream_error', status: res.status, body: data });
	}
	return data;
}

// SSRF guard primitives, shared by every server-side fetcher of untrusted URLs.
//
// Fetching an attacker-supplied URL from a server reachable by the internet is a
// classic SSRF vector: the URL can point at cloud metadata (169.254.169.254),
// RFC1918 ranges, or loopback, and we'd happily proxy the response back. The
// defenses here are the ones api/_lib/fetch-model.js pioneered, factored out so
// the x402 monetize proxy (and anything else) enforces the exact same policy:
//   1. Scheme allowlist — https only (http permitted in dev).
//   2. DNS resolution on OUR side; every resolved address checked against an IP
//      blocklist before a socket opens.
//   3. Connections pinned to the validated addresses (custom undici lookup) so a
//      DNS-rebinding host can't swap in a private IP at connect time.
//   4. Redirects followed manually, re-validating the target host each hop.

import { lookup } from 'node:dns/promises';
import { Agent } from 'undici';

const IS_DEV = process.env.NODE_ENV !== 'production';

export class SsrfError extends Error {
	constructor(message, code = 'blocked') {
		super(message);
		this.name = 'SsrfError';
		this.code = code;
	}
}

export function isPrivateIPv4(ip) {
	const p = ip.split('.').map(Number);
	if (p.length !== 4 || p.some((n) => Number.isNaN(n))) return true;
	if (p[0] === 10) return true;
	if (p[0] === 127) return true;
	if (p[0] === 0) return true;
	if (p[0] === 169 && p[1] === 254) return true; // link-local, cloud metadata
	if (p[0] === 172 && p[1] >= 16 && p[1] <= 31) return true;
	if (p[0] === 192 && p[1] === 168) return true;
	if (p[0] === 192 && p[1] === 0 && p[2] === 0) return true; // IETF
	if (p[0] === 192 && p[1] === 0 && p[2] === 2) return true; // docs
	if (p[0] === 198 && (p[1] === 18 || p[1] === 19)) return true; // benchmark
	if (p[0] === 198 && p[1] === 51 && p[2] === 100) return true; // docs
	if (p[0] === 203 && p[1] === 0 && p[2] === 113) return true; // docs
	if (p[0] >= 224) return true; // multicast + reserved
	return false;
}

export function isPrivateIPv6(ip) {
	const lower = ip.toLowerCase();
	if (lower === '::' || lower === '::1') return true;
	if (lower.startsWith('fe80:') || lower.startsWith('fe80::')) return true; // link-local
	if (lower.startsWith('fc') || lower.startsWith('fd')) return true; // ULA fc00::/7
	if (lower.startsWith('::ffff:')) {
		const mapped = lower.replace(/^::ffff:/, '');
		if (/^\d+\.\d+\.\d+\.\d+$/.test(mapped)) return isPrivateIPv4(mapped);
	}
	if (lower.startsWith('2001:db8:')) return true; // docs
	return false;
}

export function isPrivateAddress(address, family) {
	if (family === 4) return isPrivateIPv4(address);
	if (family === 6) return isPrivateIPv6(address);
	return true; // unknown family → unsafe
}

// Resolve `host` once, reject if ANY resolved address is private, and return the
// validated address list to pin the connection to.
export async function resolvePublicHost(host) {
	if (!host) throw new SsrfError('missing host', 'invalid_url');
	let resolved;
	try {
		resolved = await lookup(host, { all: true });
	} catch {
		throw new SsrfError(`DNS lookup failed for ${host}`, 'dns_failed');
	}
	const addrs = Array.isArray(resolved) ? resolved : [resolved];
	if (!addrs.length) throw new SsrfError(`DNS lookup failed for ${host}`, 'dns_failed');
	for (const { address, family } of addrs) {
		if (isPrivateAddress(address, family)) {
			throw new SsrfError(`host resolves to private address: ${address}`, 'private_address');
		}
	}
	return addrs;
}

// undici Agent whose DNS lookup only yields the pre-validated addresses for
// `expectedHost`, closing the check-then-connect TOCTOU.
export function pinnedAgent(expectedHost, addrs) {
	return new Agent({
		connect: {
			lookup(hostname, _opts, cb) {
				if (hostname !== expectedHost) {
					cb(new SsrfError(`unexpected connect host: ${hostname}`, 'host_pin_mismatch'));
					return;
				}
				const safe = addrs.filter((a) => !isPrivateAddress(a.address, a.family));
				if (!safe.length) {
					cb(new SsrfError('no public address to connect to', 'private_address'));
					return;
				}
				cb(null, safe.map((a) => ({ address: a.address, family: a.family })));
			},
		},
	});
}

// Parse + scheme-check a URL. https only (http allowed in dev). Returns the URL.
export function validatePublicUrl(rawUrl, { allowHttp = IS_DEV } = {}) {
	let url;
	try {
		url = new URL(rawUrl);
	} catch {
		throw new SsrfError('invalid URL', 'invalid_url');
	}
	if (url.protocol !== 'https:' && !(allowHttp && url.protocol === 'http:')) {
		throw new SsrfError(`scheme not allowed: ${url.protocol}`, 'scheme_not_allowed');
	}
	return url;
}

// Static + DNS validation for a user-supplied target URL at registration time.
// Resolves the host so a URL pointing at a private IP is rejected before we ever
// store it. Returns the normalized href.
export async function assertPublicHttpsUrl(rawUrl, opts = {}) {
	const url = validatePublicUrl(rawUrl, opts);
	await resolvePublicHost(url.hostname);
	return url.href;
}

// SSRF-guarded fetch of an untrusted URL, re-validating each redirect hop and
// returning the parsed JSON (or raw text when not JSON). Used by the x402 paid
// proxy to relay a buyer's call to the agent's upstream `target_url`.
export async function safeFetchJson(
	rawUrl,
	{ method = 'GET', headers = {}, body, timeoutMs = 25_000, maxRedirects = 3, allowHttp } = {},
) {
	let currentUrl = validatePublicUrl(rawUrl, { allowHttp });
	let redirects = 0;
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), timeoutMs);
	let agent = null;
	try {
		while (true) {
			const addrs = await resolvePublicHost(currentUrl.hostname);
			if (agent) await agent.close().catch(() => {});
			agent = pinnedAgent(currentUrl.hostname, addrs);

			const res = await fetch(currentUrl, {
				method,
				redirect: 'manual',
				signal: controller.signal,
				dispatcher: agent,
				headers: {
					'user-agent': '3d-agent-x402/1.0 (+https://three.ws/)',
					accept: 'application/json, text/plain;q=0.8, */*;q=0.5',
					...(body != null ? { 'content-type': 'application/json' } : {}),
					...headers,
				},
				...(body != null ? { body: typeof body === 'string' ? body : JSON.stringify(body) } : {}),
			});

			if (res.status >= 300 && res.status < 400 && res.headers.get('location')) {
				if (++redirects > maxRedirects) {
					throw new SsrfError('too many redirects', 'too_many_redirects');
				}
				currentUrl = validatePublicUrl(new URL(res.headers.get('location'), currentUrl).toString(), {
					allowHttp,
				});
				continue;
			}

			const text = await res.text();
			let data = text;
			const ct = res.headers.get('content-type') || '';
			if (ct.includes('application/json') || ct.includes('+json')) {
				try {
					data = text ? JSON.parse(text) : null;
				} catch {
					data = text;
				}
			}
			return { status: res.status, ok: res.ok, contentType: ct, data };
		}
	} finally {
		clearTimeout(timer);
		if (agent) await agent.close().catch(() => {});
	}
}

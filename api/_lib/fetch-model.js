// SSRF-hardened model fetcher.
//
// Arbitrary URL fetching from a server reachable by the internet is a classic
// SSRF vector: an attacker can point "url" at internal metadata endpoints
// (169.254.169.254 on AWS/GCP), private RFC1918 ranges, or loopback and we'd
// happily proxy the response back to them. Defenses here:
//   1. Scheme allowlist — only https by default (http permitted in dev).
//   2. DNS resolution happens on OUR side, and the resolved address is
//      checked against an IP blocklist before the connection is opened.
//   3. Follow redirects manually, re-validating the target host each hop.
//   4. Size limit — we stop reading after N bytes.
//   5. Timeout — total request + streaming is bounded.

import { lookup } from 'node:dns/promises';
import { Agent } from 'undici';
import { env } from './env.js';

const DEFAULT_MAX_BYTES = 50 * 1024 * 1024; // 50 MB
const DEFAULT_TIMEOUT_MS = 20_000;
const MAX_REDIRECTS = 3;

const IS_DEV = env.NODE_ENV !== 'production';

export class FetchModelError extends Error {
	constructor(message, code = 'fetch_failed') {
		super(message);
		this.code = code;
	}
}

function isPrivateIPv4(ip) {
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

function isPrivateIPv6(ip) {
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

function isPrivateAddress(address, family) {
	if (family === 4) return isPrivateIPv4(address);
	if (family === 6) return isPrivateIPv6(address);
	// Unknown family — treat as unsafe.
	return true;
}

// Resolve `host` once, reject if ANY resolved address is private, and return the
// validated address list. The caller pins the connection to exactly these
// addresses (via a custom undici `lookup`) so a DNS-rebinding attacker who
// returns a public IP at validation time and a private IP at connect time
// cannot reach internal services — we never re-resolve through the OS.
async function resolvePublicHost(host) {
	if (!host) throw new FetchModelError('missing host', 'invalid_url');
	let resolved;
	try {
		resolved = await lookup(host, { all: true });
	} catch (e) {
		throw new FetchModelError(`DNS lookup failed for ${host}`, 'dns_failed');
	}
	const addrs = Array.isArray(resolved) ? resolved : [resolved];
	if (!addrs.length) throw new FetchModelError(`DNS lookup failed for ${host}`, 'dns_failed');
	for (const { address, family } of addrs) {
		if (isPrivateAddress(address, family)) {
			throw new FetchModelError(
				`host resolves to private address: ${address}`,
				'private_address',
			);
		}
	}
	return addrs;
}

// Build an undici Agent whose DNS `lookup` only ever yields the pre-validated
// addresses for `expectedHost`. Any connect attempt to a different host (e.g.
// after an internal redirect we didn't re-pin) or with no validated address is
// refused. This closes the check-then-connect TOCTOU: the address the socket
// connects to is byte-for-byte one we already asserted is public.
function pinnedAgent(expectedHost, addrs) {
	return new Agent({
		connect: {
			lookup(hostname, _opts, cb) {
				if (hostname !== expectedHost) {
					cb(new FetchModelError(`unexpected connect host: ${hostname}`, 'host_pin_mismatch'));
					return;
				}
				// undici accepts an array of { address, family } entries. Re-assert
				// here as defense-in-depth in case a resolver returned mixed records.
				const safe = addrs.filter((a) => !isPrivateAddress(a.address, a.family));
				if (!safe.length) {
					cb(new FetchModelError('no public address to connect to', 'private_address'));
					return;
				}
				cb(null, safe.map((a) => ({ address: a.address, family: a.family })));
			},
		},
	});
}

function validateUrl(rawUrl) {
	let url;
	try {
		url = new URL(rawUrl);
	} catch {
		throw new FetchModelError('invalid URL', 'invalid_url');
	}
	if (url.protocol !== 'https:' && !(IS_DEV && url.protocol === 'http:')) {
		throw new FetchModelError(`scheme not allowed: ${url.protocol}`, 'scheme_not_allowed');
	}
	return url;
}

/**
 * Fetch bytes from an untrusted URL with SSRF protection.
 *
 * @param {string} rawUrl
 * @param {{ maxBytes?: number, timeoutMs?: number }} opts
 * @returns {Promise<{ bytes: Uint8Array, url: string, contentType: string, filename: string }>}
 */
export async function fetchModel(rawUrl, opts = {}) {
	const maxBytes = opts.maxBytes ?? DEFAULT_MAX_BYTES;
	const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;

	let currentUrl = validateUrl(rawUrl);
	let redirects = 0;
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), timeoutMs);

	let agent = null;
	try {
		while (true) {
			// Resolve + validate on THIS hop, then pin the connection to exactly
			// those addresses. Re-done every redirect so a redirect target that
			// rebinds to a private IP is caught and refused.
			const addrs = await resolvePublicHost(currentUrl.hostname);
			if (agent) await agent.close().catch(() => {});
			agent = pinnedAgent(currentUrl.hostname, addrs);

			const res = await fetch(currentUrl, {
				method: 'GET',
				redirect: 'manual',
				signal: controller.signal,
				dispatcher: agent,
				headers: {
					'user-agent': '3d-agent-mcp/1.0 (+https://three.ws/)',
					accept: 'model/gltf-binary, model/gltf+json, application/octet-stream, */*;q=0.5',
				},
			});

			if (res.status >= 300 && res.status < 400 && res.headers.get('location')) {
				if (++redirects > MAX_REDIRECTS) {
					throw new FetchModelError('too many redirects', 'too_many_redirects');
				}
				const next = new URL(res.headers.get('location'), currentUrl);
				currentUrl = validateUrl(next.toString());
				continue;
			}

			if (!res.ok) {
				throw new FetchModelError(`upstream returned ${res.status}`, 'upstream_error');
			}

			const lenHeader = res.headers.get('content-length');
			if (lenHeader && Number(lenHeader) > maxBytes) {
				throw new FetchModelError(
					`file too large (${lenHeader} > ${maxBytes} bytes)`,
					'file_too_large',
				);
			}

			const reader = res.body?.getReader();
			if (!reader) throw new FetchModelError('no response body', 'no_body');

			const chunks = [];
			let received = 0;
			while (true) {
				const { done, value } = await reader.read();
				if (done) break;
				received += value.byteLength;
				if (received > maxBytes) {
					try {
						reader.cancel();
					} catch {}
					throw new FetchModelError(
						`file exceeded ${maxBytes} bytes during download`,
						'file_too_large',
					);
				}
				chunks.push(value);
			}

			const bytes = new Uint8Array(received);
			let offset = 0;
			for (const chunk of chunks) {
				bytes.set(chunk, offset);
				offset += chunk.byteLength;
			}

			const contentType = res.headers.get('content-type') || 'application/octet-stream';
			const filename = currentUrl.pathname.split('/').pop() || 'model';

			return {
				bytes,
				url: currentUrl.toString(),
				contentType,
				filename,
			};
		}
	} finally {
		clearTimeout(timer);
		if (agent) await agent.close().catch(() => {});
	}
}

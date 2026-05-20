// SSRF guard for fetches that follow a user- or DB-supplied URL.
//
// Resolves the hostname to every A/AAAA record and rejects if any address lands
// in RFC1918, loopback, link-local, unique-local, multicast, reserved, or cloud
// metadata ranges. Caller fetches normally after the check. This does NOT pin
// the resolved IP — a hostile DNS server could swap the record between the
// check and the connect (DNS rebinding). The TOCTOU window is tiny for one-shot
// fetches and the upside of staying on the platform fetch path outweighs it for
// our use cases (image/glb fetch from random user URLs).

import { promises as dns } from 'node:dns';
import net from 'node:net';

// Cloud metadata services we never want a server-side fetch to reach.
const METADATA_IPS = new Set([
	'169.254.169.254', // AWS / Azure / GCP / Oracle / Alibaba IMDS
	'fd00:ec2::254',   // AWS IMDSv2 IPv6
	'100.100.100.200', // Alibaba
]);

function isPrivateIPv4(ip) {
	const o = ip.split('.').map(Number);
	if (o.length !== 4 || o.some((n) => Number.isNaN(n) || n < 0 || n > 255)) return true;
	if (o[0] === 10) return true;                                   // 10.0.0.0/8
	if (o[0] === 172 && o[1] >= 16 && o[1] <= 31) return true;      // 172.16.0.0/12
	if (o[0] === 192 && o[1] === 168) return true;                  // 192.168.0.0/16
	if (o[0] === 127) return true;                                  // loopback
	if (o[0] === 169 && o[1] === 254) return true;                  // link-local + metadata
	if (o[0] === 0) return true;                                    // 0.0.0.0/8
	if (o[0] >= 224) return true;                                   // multicast 224/4 + reserved 240/4
	if (o[0] === 100 && o[1] >= 64 && o[1] <= 127) return true;     // CGNAT 100.64/10
	if (o[0] === 198 && (o[1] === 18 || o[1] === 19)) return true;  // benchmarking 198.18/15
	return false;
}

function isPrivateIPv6(ip) {
	const lower = ip.toLowerCase();
	if (lower === '::1' || lower === '::' || lower === '0:0:0:0:0:0:0:1') return true; // loopback / unspecified
	if (lower.startsWith('fe80:') || lower.startsWith('fe8') || lower.startsWith('fe9') ||
		lower.startsWith('fea') || lower.startsWith('feb')) return true;               // link-local fe80::/10
	if (lower.startsWith('fc') || lower.startsWith('fd')) return true;                 // unique-local fc00::/7
	if (lower.startsWith('ff')) return true;                                           // multicast ff00::/8
	if (lower.startsWith('::ffff:')) {
		const v4 = lower.slice(7);
		return isPrivateIPv4(v4);
	}
	return false;
}

function isBlockedAddress(ip) {
	if (METADATA_IPS.has(ip.toLowerCase())) return true;
	const fam = net.isIP(ip);
	if (fam === 4) return isPrivateIPv4(ip);
	if (fam === 6) return isPrivateIPv6(ip);
	return true; // unparseable → reject
}

export class SsrfBlockedError extends Error {
	constructor(reason) {
		super(reason);
		this.code = 'ssrf_blocked';
		this.status = 400;
	}
}

// Parse + protocol-check + DNS-resolve + per-address allowlist check. Throws
// `SsrfBlockedError` on any failure. Returns the parsed URL on success.
export async function assertSafePublicUrl(input, { allowHttp = false } = {}) {
	if (!input || typeof input !== 'string') throw new SsrfBlockedError('url must be a string');
	let url;
	try {
		url = new URL(input);
	} catch {
		throw new SsrfBlockedError('url is not a valid URL');
	}
	if (url.protocol === 'http:' && !allowHttp) {
		throw new SsrfBlockedError('http:// not allowed — use https://');
	}
	if (url.protocol !== 'https:' && url.protocol !== 'http:') {
		throw new SsrfBlockedError(`unsupported protocol ${url.protocol}`);
	}
	const host = url.hostname;
	if (!host) throw new SsrfBlockedError('url missing hostname');
	// Literal IP in the URL? Check directly without DNS.
	const literal = net.isIP(host);
	if (literal) {
		if (isBlockedAddress(host)) {
			throw new SsrfBlockedError(`host ${host} resolves to a blocked range`);
		}
		return url;
	}
	let records;
	try {
		records = await dns.lookup(host, { all: true, verbatim: true });
	} catch (err) {
		throw new SsrfBlockedError(`dns lookup failed for ${host}: ${err.code || err.message}`);
	}
	if (!records?.length) throw new SsrfBlockedError(`no addresses for ${host}`);
	for (const r of records) {
		if (isBlockedAddress(r.address)) {
			throw new SsrfBlockedError(`host ${host} resolves to a blocked range`);
		}
	}
	return url;
}

// Convenience: assert + fetch. Uses the global fetch. Same options as fetch,
// minus that the URL must pass `assertSafePublicUrl`.
export async function fetchSafePublicUrl(input, init = {}, opts = {}) {
	const url = await assertSafePublicUrl(input, opts);
	return fetch(url.toString(), init);
}

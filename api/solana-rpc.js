// Browser-safe Solana JSON-RPC proxy.
//
// Public RPC (api.mainnet-beta.solana.com) returns 403 to many browser
// requests, breaking /studio's launch panel (balance polling, tx send,
// confirmation). This proxy forwards JSON-RPC POSTs to Helius when
// HELIUS_API_KEY is set, otherwise to the public RPC server-side (which
// the Solana Labs nodes don't block from datacentre IPs the same way).
//
// Usage from browser:
//   new Connection('/api/solana-rpc')            -> mainnet
//   new Connection('/api/solana-rpc?net=devnet') -> devnet
//
// Hardening: this proxy fronts a keyed (paid) upstream, so it is rate-limited
// per-IP with a global hourly ceiling and only forwards an allowlist of the
// read/send methods the launch panel needs — never the expensive scan methods
// (getProgramAccounts, getBlock*) that would let an anonymous caller drain the
// upstream quota.

import { cors, method, wrap, readJson, error, rateLimited } from './_lib/http.js';
import { limits, clientIp } from './_lib/rate-limit.js';

const PUBLIC_MAINNET = 'https://api.mainnet-beta.solana.com';
const PUBLIC_DEVNET  = 'https://api.devnet.solana.com';

// Methods a browser Connection needs to read balances/accounts, build, simulate,
// send, and confirm transactions. Deliberately excludes getProgramAccounts and
// the getBlock* family — heavy scans that have no place in the launch panel and
// are the prime vector for upstream quota abuse.
const ALLOWED_METHODS = new Set([
	'getBalance',
	'getAccountInfo',
	'getMultipleAccounts',
	'getLatestBlockhash',
	'getRecentBlockhash',
	'isBlockhashValid',
	'getFeeForMessage',
	'getMinimumBalanceForRentExemption',
	'getSignatureStatuses',
	'getSignaturesForAddress',
	'getTransaction',
	'sendTransaction',
	'simulateTransaction',
	'getTokenAccountBalance',
	'getTokenAccountsByOwner',
	'getTokenSupply',
	// Inherently bounded — returns at most the top 20 holders of one mint.
	'getTokenLargestAccounts',
	'getEpochInfo',
	'getSlot',
	'getBlockHeight',
	'getGenesisHash',
	'getHealth',
	'getVersion',
]);

// getProgramAccounts is an unbounded scan in the general case — the prime
// vector for draining the keyed upstream — so it is NOT in ALLOWED_METHODS.
// We permit it ONLY when the caller supplies a `filters` array that bounds the
// result set (e.g. a memcmp on a specific mint, as the pump dashboard's bonding
// curve probe does). A filtered, slice-limited query is cheap; a bare scan is
// still refused.
function isBoundedProgramScan(entry) {
	if (entry.method !== 'getProgramAccounts') return false;
	const opts = Array.isArray(entry.params) ? entry.params[1] : null;
	return !!(opts && Array.isArray(opts.filters) && opts.filters.length > 0);
}

// Cap batch requests so a single POST can't fan out into hundreds of upstream
// calls and sidestep the per-request rate limit.
const MAX_BATCH = 10;

function upstreamUrl(network) {
	if (network === 'devnet') {
		return process.env.SOLANA_RPC_URL_DEVNET || PUBLIC_DEVNET;
	}
	return process.env.SOLANA_RPC_URL || PUBLIC_MAINNET;
}

// Validate one or a batch of JSON-RPC payloads. Returns an error code string,
// or null when every entry is a well-formed call to an allowlisted method.
function rejectReason(body) {
	const entries = Array.isArray(body) ? body : [body];
	if (entries.length === 0) return 'empty_request';
	if (entries.length > MAX_BATCH) return 'batch_too_large';
	for (const e of entries) {
		if (!e || typeof e !== 'object') return 'malformed_request';
		if (typeof e.method !== 'string') return 'malformed_request';
		if (ALLOWED_METHODS.has(e.method)) continue;
		if (isBoundedProgramScan(e)) continue; // filtered getProgramAccounts is allowed
		if (e.method === 'getProgramAccounts') return 'unbounded_scan';
		return 'method_not_allowed';
	}
	return null;
}

export default wrap(async function handler(req, res) {
	if (cors(req, res, { methods: 'POST,OPTIONS', credentials: false })) return;
	if (!method(req, res, ['POST'])) return;

	const ip = clientIp(req);
	const [ipRl, globalRl] = await Promise.all([limits.solanaRpcIp(ip), limits.solanaRpcGlobal()]);
	if (!ipRl.success || !globalRl.success) {
		return rateLimited(res, ipRl, 'too many RPC requests');
	}

	const url = new URL(req.url, 'http://x');
	const network = url.searchParams.get('net') === 'devnet' ? 'devnet' : 'mainnet';

	let body;
	try {
		body = await readJson(req, 200_000);
	} catch (e) {
		return error(res, e.status || 400, 'bad_body', 'failed to read JSON body');
	}

	const reason = rejectReason(body);
	if (reason) {
		const msg =
			reason === 'method_not_allowed'
				? 'this RPC method is not permitted through the proxy'
				: reason === 'unbounded_scan'
					? 'getProgramAccounts requires a bounding `filters` array through this proxy'
					: reason === 'batch_too_large'
						? `batch exceeds ${MAX_BATCH} requests`
						: 'malformed JSON-RPC request';
		const status = reason === 'method_not_allowed' || reason === 'unbounded_scan' ? 403 : 400;
		return error(res, status, reason, msg);
	}

	let upstream;
	try {
		upstream = await fetch(upstreamUrl(network), {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify(body),
		});
	} catch (e) {
		return error(res, 502, 'upstream_error', 'rpc upstream failed');
	}

	const text = await upstream.text();
	res.statusCode = upstream.status;
	res.setHeader('content-type', 'application/json; charset=utf-8');
	res.setHeader('cache-control', 'no-store');
	res.end(text);
});

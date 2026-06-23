// /api/vanity/cert — proof-of-grind certificate registry lookup (public, read-only).
//
//   GET /api/vanity/cert?address=<base58>   → canonical cert record for an address
//   GET /api/vanity/cert?id=<certId>        → canonical cert record by certId
//
// A proof-of-grind certificate verifies entirely offline (signature, pattern,
// difficulty, split-key non-custody). This endpoint adds the freshness/uniqueness
// guarantee: it returns the FIRST certificate registered for an address so a
// buyer or resale marketplace can confirm the cert they hold is the canonical
// original — not a second "freshly ground" proof minted to re-sell the same
// wallet. Returns ONLY public, secret-free metadata (the store allowlists fields;
// secrets are structurally un-persistable). Readable cross-origin so the
// /vanity/verify page and third-party verifiers can call it.

import { wrap, cors, error, json } from '../_lib/http.js';
import { limits, clientIp } from '../_lib/rate-limit.js';
import { getCanonicalByAddress, getByCertId } from '../_lib/vanity-cert-store.js';

const BASE58_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const CERTID_RE = /^[0-9a-f]{64}$/i;

export default wrap(async (req, res) => {
	if (cors(req, res, { methods: 'GET,OPTIONS', origins: '*' })) return;
	if (req.method !== 'GET') {
		res.setHeader('allow', 'GET');
		return error(res, 405, 'method_not_allowed', 'use GET');
	}

	const rl = await limits.publicIp(clientIp(req));
	if (!rl.success) {
		res.setHeader('retry-after', '1');
		return error(res, 429, 'rate_limited', 'too many requests');
	}

	const url = new URL(req.url, 'http://x');
	const address = (url.searchParams.get('address') || '').trim();
	const id = (url.searchParams.get('id') || '').trim();

	if (!address && !id) {
		return error(res, 400, 'missing_param', 'supply ?address=<base58> or ?id=<certId>');
	}

	let record = null;
	try {
		if (id) {
			if (!CERTID_RE.test(id)) return error(res, 400, 'invalid_id', 'certId must be 64 hex chars');
			record = await getByCertId(id);
		} else {
			if (!BASE58_RE.test(address)) return error(res, 400, 'invalid_address', 'address must be a Base58 Solana public key');
			record = await getCanonicalByAddress(address);
		}
	} catch (err) {
		return error(res, 502, 'registry_error', err.message);
	}

	return json(
		res,
		200,
		{
			found: !!record,
			canonical: record || null,
			note: record
				? 'This is the canonical (first-issued) proof-of-grind certificate for this address. A certificate with a different certId for the same address is a duplicate/re-sale and is not fresh.'
				: 'No certificate is registered for this address. The certificate may still verify offline, but its single-issuance freshness cannot be confirmed by the registry.',
		},
		{ 'cache-control': 'public, max-age=30' },
	);
});

// GET /api/healthz
// ----------------
// Lightweight liveness/readiness endpoint. Returns 200 with uptime + a small
// summary block compatible with the pump-dashboard's API status panel.
//
// Intentionally has no DB / RPC dependencies — this should stay green even
// when downstream systems are degraded so it's safe to wire to uptime probes.

import { cors, json, method, wrap } from './_lib/http.js';

const STARTED_AT = Date.now();
const VERSION = process.env.VERCEL_GIT_COMMIT_SHA || process.env.npm_package_version || 'dev';

const RESEND_CACHE_TTL_MS = 5 * 60 * 1000;
let _resendCache = { value: null, expiresAt: 0 };

// Exported for tests so each case starts with a cold cache.
export function _resetResendCache() {
	_resendCache = { value: null, expiresAt: 0 };
}

async function probeResend() {
	const now = Date.now();
	if (_resendCache.value && _resendCache.expiresAt > now) {
		return _resendCache.value;
	}

	const key = process.env.RESEND_API_KEY;
	if (!key) {
		_resendCache = { value: 'missing', expiresAt: now + RESEND_CACHE_TTL_MS };
		return 'missing';
	}

	let result;
	try {
		const r = await fetch('https://api.resend.com/domains', {
			method: 'GET',
			headers: { Authorization: `Bearer ${key}` },
			signal: AbortSignal.timeout(3000),
		});
		if (r.ok) {
			result = 'configured';
		} else if (r.status === 401) {
			// Send-only ("restricted") keys legitimately can't list domains.
			const body = await r.text().catch(() => '');
			result = body.includes('restricted_api_key') ? 'configured' : 'key_invalid';
		} else if (r.status === 403) {
			result = 'configured';
		} else {
			result = 'key_invalid';
		}
	} catch {
		result = 'key_invalid';
	}

	_resendCache = { value: result, expiresAt: now + RESEND_CACHE_TTL_MS };
	return result;
}

export default wrap(async (req, res) => {
	if (cors(req, res, { methods: 'GET,OPTIONS', origins: '*' })) return;
	if (!method(req, res, ['GET'])) return;

	const uptimeMs = Date.now() - STARTED_AT;
	const resend = await probeResend();
	return json(res, 200, {
		status: 'ok',
		service: '3d-agent',
		version: VERSION,
		uptime: Math.floor(uptimeMs / 1000),
		uptimeMs,
		resend,
		// Match the pump-dashboard health shape so the existing UI binding works
		// without conditional logic.
		monitor: { running: true, mode: 'serverless', claimsDetected: 0 },
		watches: { total: 0, active: 0 },
	}, { 'cache-control': 'public, max-age=2, s-maxage=2' });
});

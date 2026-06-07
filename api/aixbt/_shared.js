// Shared error responder for the /api/aixbt/* endpoints.
//
// Maps the typed errors thrown by api/_lib/aixbt.js onto stable JSON envelopes
// the frontend can branch on. The "not configured" case carries a setup hint so
// the UI can render an actionable empty state instead of a dead error.

import { error, serverError } from '../_lib/http.js';

export function respondAixbtError(res, err) {
	if (err?.code === 'aixbt_not_configured') {
		return error(res, 503, err.code, err.message, {
			setup: 'Set AIXBT_API_KEY (full aixbt.tech subscription or an x402 key pass from https://api.aixbt.tech/x402/v2/api-keys).',
		});
	}
	const status = Number(err?.status) || 502;
	// 4xx/“upstream is the fault” (502/503/504/429) carry their descriptive code
	// + message; only genuine internal faults get the sanitized 5xx treatment.
	if (err?.code && (status < 500 || status === 502 || status === 503 || status === 504 || status === 429)) {
		return error(res, status, err.code, err.message || 'aixbt request failed');
	}
	return serverError(res, 500, 'aixbt_error', err);
}

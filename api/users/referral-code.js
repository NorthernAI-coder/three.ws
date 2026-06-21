// /api/users/referral-code — customize the signed-in user's referral code.
//
//   GET  ?code=<desired>  → live availability check for the code editor:
//                           { available, reason, code }
//                           reason ∈ ok | current | invalid | reserved | taken
//   PUT  { code }         → claim the code:
//                           { referral_code, changed }
//
// Codes default to the member's name at signup (api/_lib/referrals.js); this is
// where they make it their own. Stored uppercase-canonical so the UNIQUE index
// enforces case-insensitive global uniqueness and every ?ref= lookup matches
// without per-call lowering.

import { getSessionUser, authenticateBearer, extractBearer } from '../_lib/auth.js';
import { requireCsrf } from '../_lib/csrf.js';
import { cors, json, error, method, wrap, rateLimited, readJson } from '../_lib/http.js';
import { limits, clientIp } from '../_lib/rate-limit.js';
import {
	getReferralCodeAvailability,
	setReferralCode,
	REFERRAL_CODE_MIN_LEN,
	REFERRAL_CODE_MAX_LEN,
} from '../_lib/referrals.js';

async function resolveAuth(req) {
	const session = await getSessionUser(req);
	if (session) return { userId: session.id, session };
	const bearer = await authenticateBearer(extractBearer(req));
	if (bearer) return { userId: bearer.userId, session: null };
	return null;
}

export default wrap(async (req, res) => {
	if (cors(req, res, { methods: 'GET,PUT,OPTIONS', credentials: true })) return;
	if (!method(req, res, ['GET', 'PUT'])) return;

	const rl = await limits.authIp(clientIp(req));
	if (!rl.success) return rateLimited(res, rl);

	const auth = await resolveAuth(req);
	if (!auth) return error(res, 401, 'unauthorized', 'sign in required');

	if (req.method === 'GET') {
		const url = new URL(req.url, 'http://localhost');
		const result = await getReferralCodeAvailability(auth.userId, url.searchParams.get('code'));
		return json(res, 200, {
			...result,
			min_length: REFERRAL_CODE_MIN_LEN,
			max_length: REFERRAL_CODE_MAX_LEN,
		});
	}

	// PUT — a mutation: CSRF only applies to cookie sessions (bearer tokens are
	// not ambient credentials and so aren't CSRF-able).
	if (auth.session && !(await requireCsrf(req, res, auth.userId))) return;

	const body = await readJson(req);
	try {
		const result = await setReferralCode(auth.userId, body?.code);
		return json(res, 200, result);
	} catch (err) {
		if (err && err.name === 'ReferralCodeError') {
			return error(res, err.status, err.reason, err.message);
		}
		throw err;
	}
});

import { getSessionUser, authenticateBearer, extractBearer } from '../_lib/auth.js';
import { cors, json, error, method, wrap, rateLimited } from '../_lib/http.js';
import { limits, clientIp } from '../_lib/rate-limit.js';
import { getMembershipCard } from '../_lib/referrals.js';

// GET /api/users/referrals — the signed-in user's membership card payload:
// referral code (lazily minted if absent), referral count + lifetime earnings,
// signup position ("member #N"), and a derived score. Powers the 3D referral
// card on /dashboard/referrals.
export default wrap(async (req, res) => {
	if (cors(req, res, { methods: 'GET,OPTIONS', credentials: true })) return;
	if (!method(req, res, ['GET'])) return;

	const session = await getSessionUser(req);
	const bearer = session ? null : await authenticateBearer(extractBearer(req));
	if (!session && !bearer) return error(res, 401, 'unauthorized', 'sign in required');
	const userId = session?.id ?? bearer.userId;

	const rl = await limits.authIp(clientIp(req));
	if (!rl.success) return rateLimited(res, rl);

	const card = await getMembershipCard(userId);
	if (!card) return error(res, 404, 'not_found', 'user not found');

	return json(res, 200, card);
});

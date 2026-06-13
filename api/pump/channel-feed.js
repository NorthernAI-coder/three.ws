import { cors, json, method, wrap, rateLimited } from '../_lib/http.js';
import { limits, clientIp } from '../_lib/rate-limit.js';
import { getMints, getWhales, getClaims } from '../_lib/channel-feed-sources.js';

export default wrap(async (req, res) => {
	if (cors(req, res, { methods: 'GET,OPTIONS' })) return;
	if (!method(req, res, ['GET'])) return;

	const rl = await limits.mcpIp(clientIp(req));
	if (!rl.success) return rateLimited(res, rl);

	const url = new URL(req.url, 'http://x');
	const kindsParam = url.searchParams.get('kinds');
	const allowed = kindsParam ? new Set(kindsParam.split(',').map(s => s.trim())) : null;
	const limitParam = url.searchParams.get('limit');
	const limitRaw = limitParam ? parseInt(limitParam, 10) : 100;
	const limit = Math.min(Math.max(Number.isFinite(limitRaw) ? limitRaw : 100, 1), 200);

	const [mints, whales, claims] = await Promise.all([
		(!allowed || allowed.has('mint')) ? getMints().catch(() => []) : [],
		(!allowed || allowed.has('whale')) ? getWhales().catch(() => []) : [],
		(!allowed || allowed.has('claim')) ? getClaims().catch(() => []) : [],
	]);

	const seen = new Set();
	const all = [
		...mints.map(e => ({ ...e, kind: 'mint' })),
		...whales.map(e => ({ ...e, kind: 'whale' })),
		...claims.map(e => ({ ...e, kind: 'claim', signature: e.signature || e.tx_signature })),
	]
		.filter(e => {
			const sig = e.signature || e.tx_signature;
			if (!sig || seen.has(sig)) return false;
			seen.add(sig);
			return true;
		})
		.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0))
		.slice(0, limit);

	return json(res, 200, { items: all });
});

// @ts-check
// GET/POST /api/cron/pulse-tick — drives one tick of the autonomous agent
// activity engine (api/_lib/circulation.js). Fully inert unless CIRCULATION_ENABLED
// is set and a treasury secret is configured; in that case it grows the operated
// agent pool and has those agents transact with one another on-chain, so the live
// money feed reflects real wallet activity.

import { json, method, wrap } from '../_lib/http.js';
import { env } from '../_lib/env.js';
import { constantTimeEquals } from '../_lib/crypto.js';
import { runCirculationTick } from '../_lib/circulation.js';

function requireCron(req, res) {
	const secret = process.env.CRON_SECRET || env.CRON_SECRET;
	if (!secret) {
		res.status(503).json({ error: 'not_configured', message: 'CRON_SECRET unset' });
		return false;
	}
	const auth = req.headers['authorization'] || '';
	const presented = auth.startsWith('Bearer ') ? auth.slice(7) : '';
	if (!constantTimeEquals(presented, secret)) {
		res.status(401).json({ error: 'unauthorized' });
		return false;
	}
	return true;
}

export default wrap(async (req, res) => {
	if (!method(req, res, ['GET', 'POST'])) return;
	if (!requireCron(req, res)) return;

	const out = await runCirculationTick();
	return json(res, 200, out);
});

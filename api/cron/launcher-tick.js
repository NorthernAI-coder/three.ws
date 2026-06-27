// @ts-check
// GET/POST /api/cron/launcher-tick — drives one tick of the autonomous coin
// launcher engine (api/_lib/launcher-engine.js). Fully inert unless a
// launcher_config row is enabled; the seeded global row ships disabled + dry_run,
// so no SOL moves and no coin mints until an operator explicitly arms it. When
// armed, it makes pool agents mint pump.fun coins riding live cultural narratives
// — the same real on-chain path a human owner uses.

import { json, error, method, wrapCron } from '../_lib/http.js';
import { env } from '../_lib/env.js';
import { constantTimeEquals } from '../_lib/crypto.js';
import { runLauncherTick } from '../_lib/launcher-engine.js';

function requireCron(req, res) {
	const secret = process.env.CRON_SECRET || env.CRON_SECRET;
	if (!secret) {
		error(res, 503, 'not_configured', 'CRON_SECRET unset');
		return false;
	}
	const auth = req.headers['authorization'] || '';
	const presented = auth.startsWith('Bearer ') ? auth.slice(7) : '';
	if (!constantTimeEquals(presented, secret)) {
		error(res, 401, 'unauthorized', 'invalid cron secret');
		return false;
	}
	return true;
}

export default wrapCron(async (req, res) => {
	if (!method(req, res, ['GET', 'POST'])) return;
	if (!requireCron(req, res)) return;

	const out = await runLauncherTick();
	return json(res, 200, out);
});

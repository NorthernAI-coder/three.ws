// @ts-check
// GET/POST /api/cron/launcher-tick — drives one tick of the autonomous coin
// launcher engine (api/_lib/launcher-engine.js). The seeded global row ships LIVE
// (enabled, real, with a standing dev buy), so pool agents mint pump.fun coins
// riding live cultural narratives on a cadence — the same real on-chain path a
// human owner uses. Still inert for any scope whose launcher_config row is
// disabled, and bounded by per-launch/daily SOL caps, an hourly ceiling, the
// cadence gate, and the circuit breaker. With no master wallet funded, each tick
// records a clean 'skipped' run instead of minting.

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

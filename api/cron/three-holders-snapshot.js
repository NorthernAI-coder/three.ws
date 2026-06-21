// @ts-check
// GET /api/cron/three-holders-snapshot — refresh the cached $THREE holder set.
//
// The public holder leaderboard (api/leaderboard.js), its OG share card
// (api/og-leaderboard.js), and the token stats panel (api/three-token/[action].js)
// all need the full $THREE holder set to rank wallets and compute % of supply.
// Reading that live meant a full Helius DAS `getTokenAccounts` walk on every
// edge-cache miss — so DAS credit burn scaled with page/bot traffic, not with how
// often the data actually changes.
//
// This cron runs ONE scan every 5 minutes and writes the result to
// three_holder_snapshot; the public surfaces serve from that snapshot. Net effect:
// $THREE holder DAS calls drop from traffic-driven to a fixed ~12/hour, and the
// OG-card crawler-amplification vector is gone.
//
// Standalone (not [name].js) so the import graph stays minimal — just the snapshot
// module and its Helius/DB dependencies.

import { error, json, method, wrap } from '../_lib/http.js';
import { env } from '../_lib/env.js';
import { constantTimeEquals } from '../_lib/crypto.js';
import { refreshThreeHolderSnapshot } from '../_lib/coin/three-holders.js';

// Vercel cron invokes with `Authorization: Bearer <CRON_SECRET>`; manual probes
// may use `X-Cron-Secret: <CRON_SECRET>`. Accept either, constant-time.
function requireCron(req, res) {
	const secret = process.env.CRON_SECRET || env.CRON_SECRET;
	if (!secret) {
		error(res, 503, 'not_configured', 'CRON_SECRET unset');
		return false;
	}
	const auth = req.headers['authorization'] || '';
	const bearer = auth.startsWith('Bearer ') ? auth.slice(7) : '';
	const header = req.headers['x-cron-secret'] || '';
	if (constantTimeEquals(bearer, secret) || constantTimeEquals(header, secret)) return true;
	error(res, 401, 'unauthorized', 'invalid cron secret');
	return false;
}

export default wrap(async (req, res) => {
	if (!method(req, res, ['GET', 'POST'])) return;
	if (!requireCron(req, res)) return;

	if (!process.env.HELIUS_API_KEY) {
		// No key → the snapshot can't refresh; the public reads keep serving the
		// last good snapshot (or live-fall-back) and degrade gracefully.
		return json(res, 200, { ok: false, reason: 'HELIUS_API_KEY unset', refreshed: false });
	}

	const started = Date.now();
	try {
		const result = await refreshThreeHolderSnapshot();
		console.log(
			`[three-holders-snapshot] refreshed ${result.holders} holders in ${Date.now() - started}ms`,
		);
		return json(res, 200, { ok: true, refreshed: true, ...result, elapsed_ms: Date.now() - started });
	} catch (err) {
		// Never throw: a failed scan leaves the prior snapshot intact (the refresh
		// only deletes inside a successful scan), so public reads are unaffected.
		console.error('[three-holders-snapshot] refresh failed:', err?.message || err);
		return json(res, 200, { ok: false, refreshed: false, error: err?.message || String(err) });
	}
});

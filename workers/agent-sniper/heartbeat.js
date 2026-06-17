// agent-sniper — liveness heartbeat.
//
// A long-lived worker that holds a websocket feed open has one catastrophic
// failure mode: it stays UP but goes silent — the process is alive, the feed is
// dead, and nothing snipes. A crash is loud (Cloud Run restarts it); a silent
// dead feed is invisible. The heartbeat makes "is the sniper actually working?"
// answerable from the outside without SSHing into the instance.
//
// We reuse the existing `bot_heartbeat` table (migration 2026-06-01-pump-alerts)
// — the same row shape the pumpfun-monitor cron uses and /api/healthz already
// reads — keyed `worker='agent-sniper'`. `last_beat_at` is the liveness clock;
// `meta` carries the operational truth the status endpoint surfaces:
//
//   mode            simulate | live
//   network         mainnet  | devnet
//   feedConnected   is the PumpPortal subscription currently up
//   lastEventAgeMs  how long since the last feed event (silence detector)
//   strategies      active armed strategies the worker is watching
//   globalKill      is the new-buy kill switch engaged
//   reconnects      cumulative feed re-subscribes since boot
//   errors          cumulative executor/RPC errors since boot
//   bootAt          process start (for uptime)
//
// Best-effort: a DB blip must never crash the trade loop, so every write is
// guarded. Secrets are never written here.

import { sql } from '../../api/_lib/db.js';
import { log } from './log.js';

const WORKER = 'agent-sniper';

/**
 * Upsert the sniper's heartbeat row. Fire-and-forget safe — swallows DB errors
 * (a transient Neon blip must not take down the worker), but logs them so a
 * sustained DB outage is visible in the worker's own logs.
 *
 * @param {string} mode      simulate | live
 * @param {() => object} snapshot  returns the current operational meta
 */
export async function writeHeartbeat(mode, meta) {
	try {
		await sql`
			INSERT INTO bot_heartbeat (worker, mode, last_beat_at, meta)
			VALUES (${WORKER}, ${mode}, now(), ${JSON.stringify(meta || {})}::jsonb)
			ON CONFLICT (worker) DO UPDATE
			SET mode = excluded.mode,
			    last_beat_at = excluded.last_beat_at,
			    meta = excluded.meta
		`;
	} catch (err) {
		log.warn('heartbeat write failed', { err: err?.message });
	}
}

/**
 * Start a heartbeat loop. Writes immediately, then every `intervalMs`. Returns a
 * stop function. `getMeta` is called on every beat so the row always reflects
 * the live operational state (feed up?, silence age, active strategies, error
 * counts) rather than a stale boot snapshot.
 *
 * @param {object} opts
 * @param {string} opts.mode
 * @param {number} opts.intervalMs
 * @param {() => object} opts.getMeta
 * @returns {() => void} stop
 */
export function startHeartbeat({ mode, intervalMs, getMeta }) {
	const beat = () => writeHeartbeat(mode, safeMeta(getMeta));
	beat();
	const timer = setInterval(beat, intervalMs);
	if (typeof timer.unref === 'function') timer.unref();
	return () => clearInterval(timer);
}

function safeMeta(getMeta) {
	try {
		return getMeta() || {};
	} catch {
		return {};
	}
}

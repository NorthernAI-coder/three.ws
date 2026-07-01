// @ts-check
// GET /api/cron/db-retention — keep the database under its storage cap.
//
// Why this exists
// ---------------
// The platform runs on a Neon branch with a hard project-size cap (512 MB on the
// free tier). Two families of tables grow without bound and, left alone, march the
// branch straight into that cap — at which point Postgres raises SQLSTATE 53100
// ("could not extend file because project size limit … exceeded") and every WRITE
// path starts failing (the production incident this cron closes out):
//
//   1. The pump.fun intel firehose. `pump_coin_intel` ingests ~15–20k new mints a
//      day (≈30 MB/day), and its mint-keyed satellites (`pump_coin_wallets`,
//      `coin_smart_money`, `smart_money_scored`, `pump_coin_outcomes`,
//      `oracle_conviction`, `oracle_conviction_history`) grow in lockstep — ~60 MB
//      a day across the family. Nothing pruned it, so it accreted until the branch
//      was full.
//   2. `avatar_regen_jobs`. Each reconstruct job's `params` carries the multi-MB
//      base64 SOURCE images. The live path drops them once a job leaves
//      reconstruction (reconstruct-finalize.js), but terminal (done/failed) jobs
//      that took another route kept them — 346 rows were holding 43 MB.
//
// What it does
// ------------
// Runs on a schedule and, idempotently + bounded so a single tick can never run
// away past the function's maxDuration:
//
//   A. FIREHOSE RETENTION. Deletes every mint (and its satellite rows) older than
//      the retention window. The window self-tunes: normally PUMP_INTEL_RETENTION_
//      DAYS, but when the branch is over the high-water mark it tightens to
//      PUMP_INTEL_MIN_RETENTION_DAYS so the cap is never actually hit. This is the
//      self-healing valve — it sheds the oldest firehose data under storage
//      pressure and relaxes again once space is reclaimed. The engine's own judge
//      window (smart-money-rollup.js) resolves coins within a day or two of launch,
//      so a multi-day window keeps everything load-bearing; wallet reputation
//      (`wallet_reputation`, wallet-keyed, the durable output) and the win/loss
//      ground truth (`pumpfun_graduations`) are never touched.
//   B. AVATAR JOB HYGIENE. Strips the base64 source images from terminal jobs past
//      a day old, and deletes terminal jobs past 30 days.
//   C. VACUUM. Plain VACUUM on the tables it pruned so the freed pages become
//      reusable and Neon's storage GC can return them.
//
// DELETE (not UPDATE) is used for the firehose because DELETE settles xmax in place
// and does NOT extend a relation file — it therefore succeeds even AT the cap,
// where an UPDATE (which writes a new tuple version, needing a fresh page) would
// itself fail with 53100. The image-strip UPDATE is guarded for the same reason.
//
// Everything here operates on the platform's OWN runtime launch/intel records at
// runtime and hardcodes no specific mint — generic retention plumbing, not an
// endorsement of any coin.

import { error, json, method, wrapCron } from '../_lib/http.js';
import { env } from '../_lib/env.js';
import { constantTimeEquals } from '../_lib/crypto.js';
import { sql, isDbCapacityError } from '../_lib/db.js';
import { sendOpsAlert } from '../_lib/alerts.js';

// Mint-keyed satellites of pump_coin_intel, deleted before the master so no run
// orphans a satellite row. Every name here is a fixed constant (never user input),
// so splicing it into the DELETE text below is safe. Verified to carry a `mint`
// column. Deliberately EXCLUDES: wallet_reputation / smart_wallet_reputation
// (wallet-keyed accumulated output — the durable product value), and
// pumpfun_graduations (small, slow-growing win/loss ground truth the judge reads).
const FIREHOSE_SATELLITES = [
	'pump_coin_wallets',
	'coin_smart_money',
	'smart_money_scored',
	'pump_coin_outcomes',
	'oracle_conviction',
	'oracle_conviction_history',
];

// Bounds so a single tick stays well under the function's maxDuration. The cron
// re-runs on its schedule, so a large backlog (the first prune once data crosses
// the window, or a pressure-valve catch-up) is chewed through over several ticks.
const MINT_BATCH = 2000; // mints per cascade batch
const MAX_MINTS_PER_RUN = 40_000; // ceiling per tick across all batches
const REGEN_STRIP_BATCH = 200;
const REGEN_DELETE_BATCH = 500;
const REGEN_MAX_ITERS = 40;

function clampInt(raw, min, max, dflt) {
	const n = Number.parseInt(String(raw ?? ''), 10);
	if (!Number.isFinite(n)) return dflt;
	return Math.min(max, Math.max(min, n));
}

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

async function dbSizeMb() {
	const [{ mb }] = await sql`SELECT (pg_database_size(current_database()) / 1048576.0)::int AS mb`;
	return Number(mb) || 0;
}

async function tableExists(name) {
	const [{ reg }] = await sql`SELECT to_regclass(${'public.' + name}) AS reg`;
	return reg != null;
}

// ── A. Firehose retention (cascade prune older than cutoffDays) ───────────────
async function pruneFirehose(cutoffDays) {
	if (!(await tableExists('pump_coin_intel'))) return { mints: 0, perTable: {} };

	// Resolve satellite existence once (a fresh deploy may not have every table).
	const liveSatellites = [];
	for (const t of FIREHOSE_SATELLITES) {
		if (await tableExists(t)) liveSatellites.push(t);
	}

	const perTable = {};
	let totalMints = 0;
	const maxBatches = Math.ceil(MAX_MINTS_PER_RUN / MINT_BATCH);
	for (let i = 0; i < maxBatches; i++) {
		const olds = await sql`
			SELECT mint FROM pump_coin_intel
			WHERE first_seen_at < now() - ${cutoffDays} * interval '1 day'
			LIMIT ${MINT_BATCH}
		`;
		if (!olds.length) break;
		const mints = olds.map((r) => r.mint);

		for (const t of liveSatellites) {
			// t is a fixed constant from FIREHOSE_SATELLITES — safe to splice; the
			// mint list is bound as $1. DELETE settles xmax in place (no file
			// extension), so it works even at the cap.
			const del = await sql(`DELETE FROM ${t} WHERE mint = ANY($1) RETURNING mint`, [mints]);
			perTable[t] = (perTable[t] || 0) + del.length;
		}
		const delIntel = await sql`DELETE FROM pump_coin_intel WHERE mint = ANY(${mints}) RETURNING mint`;
		perTable['pump_coin_intel'] = (perTable['pump_coin_intel'] || 0) + delIntel.length;

		totalMints += mints.length;
		if (olds.length < MINT_BATCH) break;
	}
	return { mints: totalMints, perTable };
}

// ── B. avatar_regen_jobs hygiene ──────────────────────────────────────────────
async function pruneRegenJobs() {
	if (!(await tableExists('avatar_regen_jobs'))) return { stripped: 0, deleted: 0 };

	// Delete terminal jobs past 30 days first (DELETE frees space without
	// extending a file, so it is safe even under storage pressure).
	let deleted = 0;
	for (let i = 0; i < REGEN_MAX_ITERS; i++) {
		const del = await sql`
			DELETE FROM avatar_regen_jobs
			WHERE job_id IN (
				SELECT job_id FROM avatar_regen_jobs
				WHERE status IN ('done', 'failed') AND created_at < now() - interval '30 days'
				LIMIT ${REGEN_DELETE_BATCH}
			) RETURNING job_id
		`;
		deleted += del.length;
		if (del.length < REGEN_DELETE_BATCH) break;
	}

	// Strip the multi-MB base64 source images from terminal jobs older than a day —
	// never read for a finished job. This is an UPDATE (rewrites the row), so it can
	// need to extend a file; if the branch is at the cap the DELETE prune above will
	// have freed space, but guard anyway so a capacity blip degrades to "skip the
	// strip this tick" rather than failing the whole cron.
	let stripped = 0;
	try {
		for (let i = 0; i < REGEN_MAX_ITERS; i++) {
			const upd = await sql`
				UPDATE avatar_regen_jobs
				SET params = (params - 'images') - 'image', updated_at = now()
				WHERE job_id IN (
					SELECT job_id FROM avatar_regen_jobs
					WHERE status IN ('done', 'failed')
					  AND created_at < now() - interval '1 day'
					  AND (params ? 'images' OR params ? 'image')
					LIMIT ${REGEN_STRIP_BATCH}
				) RETURNING job_id
			`;
			stripped += upd.length;
			if (upd.length < REGEN_STRIP_BATCH) break;
		}
	} catch (err) {
		if (!isDbCapacityError(err)) throw err;
	}
	return { stripped, deleted };
}

// ── C. Best-effort VACUUM of the tables we pruned ─────────────────────────────
async function vacuumTables(names) {
	for (const t of names) {
		try {
			// Plain VACUUM (never FULL): FULL rewrites the whole table into a fresh
			// file, needing free space ≈ the table's live size — the one thing we lack
			// near the cap. Plain VACUUM marks dead tuples reusable and lets Neon's
			// storage GC return the space. Single-statement over the HTTP driver runs
			// in autocommit, so VACUUM's no-transaction rule is satisfied.
			await sql(`VACUUM ${t}`);
		} catch {
			/* best-effort — reclaim happens on the next autovacuum regardless */
		}
	}
}

export default wrapCron(async (req, res) => {
	if (!method(req, res, ['GET', 'POST'])) return;
	if (!requireCron(req, res)) return;

	const started = Date.now();
	const retentionDays = clampInt(process.env.PUMP_INTEL_RETENTION_DAYS, 2, 365, 14);
	const minDays = clampInt(process.env.PUMP_INTEL_MIN_RETENTION_DAYS, 1, retentionDays, 3);
	const highWaterMb = clampInt(process.env.DB_RETENTION_HIGH_WATER_MB, 128, 100_000, 470);

	const sizeBeforeMb = await dbSizeMb();
	const underPressure = sizeBeforeMb >= highWaterMb;
	// Self-healing valve: tighten the window to the floor while the branch is over
	// the high-water mark, so the cap is never actually reached; relax to the full
	// window once GC has returned the freed space and size drops back under it.
	const cutoffDays = underPressure ? minDays : retentionDays;

	const firehose = await pruneFirehose(cutoffDays);
	const regen = await pruneRegenJobs();

	// VACUUM only tables we actually deleted from this tick.
	const touched = Object.keys(firehose.perTable).filter((t) => firehose.perTable[t] > 0);
	if (regen.deleted > 0 || regen.stripped > 0) touched.push('avatar_regen_jobs');
	await vacuumTables(touched);

	const sizeAfterMb = await dbSizeMb();

	// One deduped signal when the valve engages so ops knows storage is tight and a
	// Neon plan bump (for a longer history window) is worth considering. Neon's GC
	// is not instant, so sizeAfter may still read high right after a prune — that's
	// expected; the space returns within the branch's history-retention window.
	if (underPressure) {
		sendOpsAlert(
			'db retention pressure valve engaged',
			`db ${sizeBeforeMb}MB ≥ high-water ${highWaterMb}MB — tightened firehose retention to ${minDays}d; pruned ${firehose.mints} mints. Raise the Neon storage plan (or DB_RETENTION_HIGH_WATER_MB / PUMP_INTEL_RETENTION_DAYS) for a longer window.`,
			{ signature: 'db:retention-pressure' },
		);
	}

	return json(res, 200, {
		ok: true,
		size_before_mb: sizeBeforeMb,
		size_after_mb: sizeAfterMb,
		high_water_mb: highWaterMb,
		under_pressure: underPressure,
		retention_days: retentionDays,
		cutoff_days: cutoffDays,
		firehose,
		regen,
		vacuumed: touched,
		took_ms: Date.now() - started,
	});
});

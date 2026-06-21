// @ts-check
// GET /api/cron/auto-rig-sweep — completion backstop for auto-rig jobs.
//
// When a static avatar is created (upload, URL import, chat/MCP forge save) the
// platform fires a background 'rerig' job tagged auto_rig and swaps the rigged
// GLB in place once it lands. Completion is normally driven by the Replicate
// webhook (instant) or, for browser flows, the regenerate-status poll. Headless
// creations (MCP) never poll, so a single dropped webhook would otherwise leave
// the avatar stuck static forever with its job pinned at 'running'.
//
// This sweep is the safety net: every few minutes it finds auto_rig jobs that
// have gone quiet, asks the provider for their real status, and finalizes (or
// fails) them. It deliberately ignores jobs touched in the last few minutes so
// it never races the webhook for a job that's completing normally.
//
// Auto-rig only ever runs on the platform Replicate provider (rerig is the only
// mode it supports), so a single getRegenProvider() resolves every job here —
// no per-job BYOK key juggling.

import { error, json, method, wrap } from '../_lib/http.js';
import { env } from '../_lib/env.js';
import { constantTimeEquals } from '../_lib/crypto.js';
import { sql } from '../_lib/db.js';
import { getRegenProvider } from '../_lib/regen-provider.js';
import { finalizeAutoRigStage } from '../_lib/auto-rig.js';

// Leave the webhook a clear runway before we touch a job: most rigs finish in
// 60–90s, so a 3-minute quiet window means we only ever sweep genuinely stalled
// work, never a job that's about to complete on its own.
const QUIET_WINDOW = "3 minutes";
// Don't chase jobs forever — anything older than this that still isn't done is
// treated as dead and failed out so the queue can't accrete zombies.
const MAX_AGE = "6 hours";
const BATCH = 25;

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

async function failJob(jobId, userId, reason) {
	await sql`
		update avatar_regen_jobs
		set status = 'failed', error = ${reason}, updated_at = now()
		where job_id = ${jobId} and user_id = ${userId}
	`;
}

export default wrap(async (req, res) => {
	if (!method(req, res, ['GET', 'POST'])) return;
	if (!requireCron(req, res)) return;

	// Candidate jobs: our auto_rig rerig jobs that are still open, have gone quiet
	// (webhook missed or never arrived), and aren't yet materialized.
	const rows = await sql`
		select job_id, user_id, source_avatar_id, ext_job_id, status, created_at
		from avatar_regen_jobs
		where mode = 'rerig'
		  and (params->>'auto_rig') = 'true'
		  and status in ('queued', 'running')
		  and result_avatar_id is null
		  and updated_at < now() - ${QUIET_WINDOW}::interval
		  and created_at > now() - ${MAX_AGE}::interval
		order by updated_at asc
		limit ${BATCH}
	`;

	const summary = { scanned: rows.length, finalized: 0, failed: 0, pending: 0, errored: 0 };

	if (!rows.length) {
		// Sweep the truly-dead tail too: open auto_rig jobs older than MAX_AGE that
		// will never complete — fail them so the queue stays clean.
		const reaped = await sql`
			update avatar_regen_jobs
			set status = 'failed', error = 'auto-rig job exceeded max age without completing', updated_at = now()
			where mode = 'rerig'
			  and (params->>'auto_rig') = 'true'
			  and status in ('queued', 'running')
			  and result_avatar_id is null
			  and created_at <= now() - ${MAX_AGE}::interval
			returning job_id
		`;
		summary.reaped = reaped.length;
		return json(res, 200, { ok: true, ...summary });
	}

	let provider;
	try {
		provider = await getRegenProvider();
	} catch (err) {
		return json(res, 200, { ok: false, reason: 'provider_unavailable', detail: err?.message, ...summary });
	}
	if (!provider?.instance) {
		return json(res, 200, { ok: false, reason: 'no_provider', ...summary });
	}

	for (const job of rows) {
		try {
			if (!job.ext_job_id) {
				// Submitted without an external id — unpollable, so it can never
				// complete. Fail it out.
				await failJob(job.job_id, job.user_id, 'auto-rig job has no provider id to poll');
				summary.failed++;
				continue;
			}

			const update = await provider.instance.status(job.ext_job_id);

			if (update.status === 'done' && update.resultGlbUrl) {
				await finalizeAutoRigStage({
					userId: job.user_id,
					jobId: job.job_id,
					job,
					glbUrl: update.resultGlbUrl,
				});
				summary.finalized++;
			} else if (update.status === 'failed') {
				await failJob(job.job_id, job.user_id, update.error || 'provider reported rig failure');
				summary.failed++;
			} else {
				// Still genuinely running — bump the row so it isn't re-swept next
				// tick and record the live provider status.
				await sql`
					update avatar_regen_jobs
					set status = ${update.status || 'running'}, updated_at = now()
					where job_id = ${job.job_id} and user_id = ${job.user_id}
				`;
				summary.pending++;
			}
		} catch (err) {
			console.warn('[auto-rig-sweep] job error', { jobId: job.job_id, error: err?.message });
			summary.errored++;
		}
	}

	return json(res, 200, { ok: true, ...summary });
});

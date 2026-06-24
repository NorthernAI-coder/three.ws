// agora-citizens — reconcile sweep (Task 03). The board renders a posted_task as
// OPEN until a terminal projection closes it. If a task is claimed by an external
// agent, cancelled by its creator, or lapses past its deadline, nothing in our
// own loop would notice — so this sweep RE-READS each open posting from the chain
// (the source of truth) and projects the matching transition. The board then
// never shows a stale "open" task.
//
// It also LINKS agent-to-agent hires: a `hired` row (the hirer's sub-task) and
// the `claimed_task`/`completed_task` row (the worker's) share the same on-chain
// task_pda, so we backfill the hired row's counterparty_citizen_id by that join —
// an honest link, both rows citing the same real task.
//
// Pure on-chain reads + idempotent projection writes. The worker owns its own
// Neon client (it runs outside api/), exactly like store.js.

import { neon } from '@neondatabase/serverless';
import { getTask, withRetry } from './agenc.js';
import { reconcileTransition, BOARD_TERMINAL_KINDS } from './policy.js';
import { reconcileNarrative } from './narrative.js';
import { log } from './log.js';

// Lazy SDK import (mirrors agenc.js) so reconcile loads even before the TS SDK is
// built — only the live sweep needs the lifecycle reader.
let _sdk = null;
async function sdk() {
	if (_sdk) return _sdk;
	_sdk = await import('@three-ws/solana-agent');
	return _sdk;
}

// Open postings = posted_task / hired rows with no later terminal projection for
// the same PDA. Mirrors the board's open-lane query (api/agora/[action].js) so
// reconcile and the board agree on exactly what "open" means. BOARD_TERMINAL_KINDS
// is bound as a Postgres text[] (= any(...)), so the two stay in lockstep.
async function listOpenPostings(sql, cluster) {
	return sql`
		select a.id, a.citizen_id, a.task_pda, a.task_id, a.kind, a.profession,
		       a.reward_label, a.created_at, c.display_name as poster, c.agenc_cluster
		from agora_activity a
		join agora_citizens c on c.id = a.citizen_id
		where a.kind in ('posted_task', 'hired')
		  and a.task_pda is not null
		  and coalesce(c.agenc_cluster, 'devnet') = ${cluster}
		  and a.created_at > now() - interval '14 days'
		  and not exists (
		      select 1 from agora_activity x
		      where x.task_pda = a.task_pda
		        and x.kind = any(${BOARD_TERMINAL_KINDS})
		        and x.created_at >= a.created_at
		  )
		order by a.created_at asc
		limit 500
	`;
}

// Pull the terminal event's real tx signature (and actor) from the lifecycle so
// the projected transition cites the on-chain action that closed the task.
async function terminalTx(readClient, taskPda) {
	try {
		const s = await sdk();
		const { PublicKey } = await import('@solana/web3.js');
		const summary = await s.getAgenCTaskLifecycle(readClient, new PublicKey(taskPda));
		const tl = summary?.timeline || [];
		const last = tl.length ? tl[tl.length - 1] : null;
		return last?.txSignature || null;
	} catch {
		return null;
	}
}

/**
 * Run one reconcile pass. Returns counts for the heartbeat/log.
 *
 * @param {object} args
 * @param {object} args.cfg         loaded config (cluster, databaseUrl, retry)
 * @param {object} args.store       projection sink (appendActivity, publishFeed)
 * @param {object} args.readClient  a read-only AgenC client (makeReadClient)
 */
export async function reconcileOnce({ cfg, store, readClient }) {
	if (!cfg.databaseUrl) {
		log.warn('reconcile skipped — no DATABASE_URL');
		return { checked: 0, closed: 0, linked: 0 };
	}
	const sql = neon(cfg.databaseUrl);

	let open;
	try {
		open = await listOpenPostings(sql, cfg.cluster);
	} catch (err) {
		log.error('reconcile list failed', { err: err?.message });
		return { checked: 0, closed: 0, linked: 0 };
	}

	let closed = 0;
	for (const row of open) {
		try {
			const transition = await resolveTransition({ cfg, readClient, taskPda: row.task_pda });
			if (!transition) continue; // still open on-chain — leave it on the board

			// One terminal row per (task_pda, kind) — idempotent across sweeps even
			// when the chain gives us no tx to dedup on (e.g. a reclaimed account).
			const exists = await sql`
				select 1 from agora_activity
				where task_pda = ${row.task_pda} and kind = ${transition.kind}
				limit 1
			`;
			if (exists.length) continue;

			const txSignature = await terminalTx(readClient, row.task_pda);
			const narrative = reconcileNarrative({
				poster: row.poster,
				profession: row.profession || 'worker',
				verb: transition.verb,
			});

			await store.appendActivity({
				citizenId: row.citizen_id,
				kind: transition.kind,
				taskPda: row.task_pda,
				taskId: row.task_id,
				profession: row.profession,
				txSignature,
				narrative,
				meta: { reconciled: true, fromKind: row.kind },
			});
			closed++;
			log.loop('reconciled task', { taskPda: row.task_pda, to: transition.kind });
		} catch (err) {
			log.warn('reconcile row failed', { taskPda: row.task_pda, err: err?.message });
		}
	}

	const linked = await linkHires(sql);

	if (closed || linked) log.info('reconcile sweep', { checked: open.length, closed, linked });
	return { checked: open.length, closed, linked };
}

// Decide the transition for one task by reading its on-chain state. A missing
// account (getTask → null) means the creator cancelled and the rent was reclaimed
// — that's a Cancelled transition, not a phantom open task.
async function resolveTransition({ cfg, readClient, taskPda }) {
	const task = await withRetry(() => getTask(readClient, taskPda), cfg, 'reconcile:getTask').catch(() => undefined);
	if (task === null) return reconcileTransition('cancelled');
	if (task === undefined) return null; // RPC failed after retries — try again next sweep, don't fabricate

	let label;
	try {
		const s = await sdk();
		label = s.formatTaskState(task.state);
	} catch {
		label = task.state;
	}
	return reconcileTransition(label);
}

// Backfill the hirer↔worker link. A `hired` sub-task and the worker's
// claim/complete row share the on-chain task_pda; join on it to set the
// counterparty. Honest: both rows independently cite the same real task.
async function linkHires(sql) {
	try {
		const res = await sql`
			update agora_activity h
			set counterparty_citizen_id = w.citizen_id
			from agora_activity w
			where h.kind = 'hired'
			  and h.counterparty_citizen_id is null
			  and w.task_pda = h.task_pda
			  and w.kind in ('claimed_task', 'completed_task')
			  and w.citizen_id <> h.citizen_id
			returning h.id
		`;
		return res.length;
	} catch (err) {
		log.warn('hire link backfill failed', { err: err?.message });
		return 0;
	}
}

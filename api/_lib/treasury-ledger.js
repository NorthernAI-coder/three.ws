// @ts-check
// api/_lib/treasury-ledger.js
//
// Durable accounting + audit trail for the economy master wallet's SOL movements.
// The treasury-topup cron calls recordSweep() after every sweep; this module
// persists one row per transfer/skip/reject plus a `summary` row per run into the
// append-only treasury_ledger table (migration 20260702100000_treasury_ledger.sql),
// computes the reconciliation, flags breaches, and chains the summary rows with a
// tamper-evident hash so a retroactive edit or deletion is detectable.
//
// Ground truth is the chain: every transfer row carries its on-chain signature.
// This table is the queryable index + the off-chain context (run, caps, balances)
// an auditor needs and the blockchain does not hold.
//
// Nothing here ever throws into the cron's money path: a DB failure degrades to a
// logged warning, never a lost or double transfer (the transfers already landed
// on-chain before we record them).

import { createHash } from 'node:crypto';
import { sql } from './db.js';

const LAMPORTS_PER_SOL = 1_000_000_000;

// Per-transfer fee headroom used by reconciliation. A System transfer with the
// priority fee sendSol sets costs ~5k lamports base + a few hundred priority;
// 0.00002 SOL (20k lamports) is a generous ceiling that never false-positives a
// breach on ordinary fees while still catching any real out-of-band outflow.
const PER_TX_FEE_SOL = 0.00002;
// Reconciliation slack for rounding/RPC balance jitter (lamport-scale).
const RECONCILE_EPSILON_SOL = 0.00001;

function round(n) {
	return Math.round(Number(n) * 1e9) / 1e9;
}

/**
 * Belt-and-suspenders: create the ledger table if the migration hasn't run yet,
 * so the writer works on a fresh environment. Mirrors the pattern other
 * autonomous pipelines use. Safe to call on every sweep (idempotent DDL).
 */
export async function ensureLedgerTable() {
	await sql`
		create table if not exists treasury_ledger (
			id bigserial primary key,
			ts timestamptz not null default now(),
			sweep_id uuid not null,
			seq bigint not null default 0,
			kind text not null,
			master text not null,
			network text not null default 'mainnet',
			engine_name text,
			engine_pubkey text,
			amount_lamports bigint,
			amount_sol numeric(20,9),
			status text not null,
			reason text,
			tx_signature text,
			master_sol_before numeric(20,9),
			master_sol_after numeric(20,9),
			spent_sol numeric(20,9),
			reserve_sol numeric(20,9),
			per_topup_max_sol numeric(20,9),
			run_cap_sol numeric(20,9),
			expected_after_sol numeric(20,9),
			unexplained_sol numeric(20,9),
			breach boolean not null default false,
			git_sha text,
			prev_hash text,
			row_hash text,
			meta jsonb not null default '{}'::jsonb
		)
	`;
	await sql`create index if not exists treasury_ledger_ts on treasury_ledger (ts desc)`;
	await sql`create index if not exists treasury_ledger_sweep on treasury_ledger (sweep_id)`;
	await sql`create index if not exists treasury_ledger_engine on treasury_ledger (engine_name, ts desc)`;
}

/**
 * Reconcile a sweep against on-chain reality. PURE — no I/O — so the breach logic
 * is unit-tested exhaustively.
 *
 * Two independent breach signals, both meaning "the master lost SOL this cron did
 * NOT send" (i.e. the key was used out of band — the exact regulatory/compromise
 * condition to catch):
 *   • unexplained  — within this run: (before − after) exceeded our sends + fees.
 *   • interRunDrop — between runs: this run started below where the last run ended
 *                    (the master can only gain between runs via a deposit; a drop
 *                    is unaccounted outflow).
 *
 * @param {object} p
 * @param {number} p.masterBefore   master SOL at sweep start
 * @param {number} p.masterAfter    master SOL after the transfers landed
 * @param {number} p.spentSol       SOL this sweep actually transferred out
 * @param {number} p.fundedCount    number of transfers (for the fee allowance)
 * @param {number|null} [p.prevAfter] previous sweep's recorded master_sol_after
 * @returns {{ expectedAfterSol:number, unexplainedSol:number, interRunDropSol:number, breach:boolean, reasons:string[] }}
 */
export function reconcile({ masterBefore, masterAfter, spentSol, fundedCount, prevAfter = null }) {
	const feeAllowance = Math.max(0, fundedCount) * PER_TX_FEE_SOL;
	const expectedAfterSol = round(masterBefore - spentSol - feeAllowance);

	// Positive = more SOL left than we sent (+fees). Negative = the master gained
	// mid-sweep (a deposit) — never a breach.
	const observedOutflow = masterBefore - masterAfter;
	const unexplainedSol = round(Math.max(0, observedOutflow - spentSol - feeAllowance - RECONCILE_EPSILON_SOL));

	let interRunDropSol = 0;
	if (prevAfter != null && Number.isFinite(prevAfter)) {
		interRunDropSol = round(Math.max(0, prevAfter - masterBefore - RECONCILE_EPSILON_SOL));
	}

	const reasons = [];
	if (unexplainedSol > 0) reasons.push('unexplained_outflow');
	if (interRunDropSol > 0) reasons.push('inter_run_drop');

	return { expectedAfterSol, unexplainedSol, interRunDropSol, breach: reasons.length > 0, reasons };
}

/**
 * Canonical, order-stable serialization of a summary row's material fields.
 * Feeds the hash chain — must be deterministic and cover everything an auditor
 * would care was not altered (balances, caps, and every transfer's amount+sig).
 * @param {object} s
 * @returns {string}
 */
export function canonicalSummary(s) {
	const transfers = (s.transfers || []).map((t) => [t.name, t.pubkey, t.amountLamports, t.signature, t.status]);
	return JSON.stringify([
		s.sweepId,
		s.seq,
		s.master,
		s.network,
		round(s.masterBefore),
		round(s.masterAfter),
		round(s.spentSol),
		round(s.reserveSol),
		round(s.perTopupMaxSol),
		round(s.runCapSol),
		round(s.expectedAfterSol),
		round(s.unexplainedSol),
		!!s.breach,
		s.gitSha || null,
		transfers,
	]);
}

/** sha256(prevHash || canonical) as hex — the tamper-evident link. */
export function hashRow(prevHash, canonical) {
	return createHash('sha256').update(String(prevHash || '')).update('\n').update(canonical).digest('hex');
}

/**
 * Persist one sweep: every transfer/skip/reject line + a chained summary row.
 * Never throws into the caller — a DB error is logged and swallowed (the money
 * already moved on-chain; losing the record is bad, but must not trigger a retry
 * that could double-send). Returns the summary's audit fields for alerting.
 *
 * @param {object} p
 * @param {string} p.sweepId          uuid grouping this run's rows
 * @param {string} p.master           master pubkey (base58)
 * @param {'mainnet'|'devnet'} p.network
 * @param {number} p.masterBefore
 * @param {number} p.masterAfter
 * @param {number} p.spentSol
 * @param {number} p.reserveSol
 * @param {number} p.perTopupMaxSol
 * @param {number} p.runCapSol
 * @param {Array<{name:string,pubkey:string,sol:number,signature:string}>} p.funded
 * @param {Array<{name:string,pubkey:string,sol:number,reason:string}>} p.failed
 * @param {Array<{name:string,reason:string}>} p.skipped
 * @param {Array<{name:string,pubkey:string,reason:string}>} p.rejected
 * @returns {Promise<{ ok:boolean, sweepId:string, breach:boolean, unexplainedSol:number, interRunDropSol:number, reasons:string[], seq:number, rowHash:string|null }>}
 */
export async function recordSweep(p) {
	const gitSha = process.env.VERCEL_GIT_COMMIT_SHA || null;
	const funded = p.funded || [];
	const failed = p.failed || [];
	const skipped = p.skipped || [];
	const rejected = p.rejected || [];

	// Previous summary → seq + prev_hash (the chain head). One cron instance runs
	// at a time, so this read-then-write is not racy in practice.
	let prevSeq = 0;
	let prevHash = '';
	let prevAfter = null;
	try {
		const [prev] = await sql`
			select seq, row_hash, master_sol_after
			from treasury_ledger
			where kind = 'summary' and master = ${p.master}
			order by seq desc, id desc
			limit 1
		`;
		if (prev) {
			prevSeq = Number(prev.seq) || 0;
			prevHash = prev.row_hash || '';
			prevAfter = prev.master_sol_after != null ? Number(prev.master_sol_after) : null;
		}
	} catch {
		/* first-ever sweep, or table absent until ensureLedgerTable ran */
	}
	const seq = prevSeq + 1;

	const rec = reconcile({
		masterBefore: p.masterBefore,
		masterAfter: p.masterAfter,
		spentSol: p.spentSol,
		fundedCount: funded.length,
		prevAfter,
	});

	const transfers = funded.map((f) => ({
		name: f.name,
		pubkey: f.pubkey,
		amountLamports: Math.round(f.sol * LAMPORTS_PER_SOL),
		signature: f.signature,
		status: 'funded',
	}));
	const rowHash = hashRow(
		prevHash,
		canonicalSummary({
			sweepId: p.sweepId,
			seq,
			master: p.master,
			network: p.network,
			masterBefore: p.masterBefore,
			masterAfter: p.masterAfter,
			spentSol: p.spentSol,
			reserveSol: p.reserveSol,
			perTopupMaxSol: p.perTopupMaxSol,
			runCapSol: p.runCapSol,
			expectedAfterSol: rec.expectedAfterSol,
			unexplainedSol: rec.unexplainedSol,
			breach: rec.breach,
			gitSha,
			transfers,
		}),
	);

	try {
		// Line rows: transfers, then failed, then rejected, then skipped.
		for (const f of funded) {
			await sql`
				insert into treasury_ledger
					(sweep_id, seq, kind, master, network, engine_name, engine_pubkey, amount_lamports, amount_sol, status, tx_signature, git_sha)
				values (${p.sweepId}, ${seq}, 'transfer', ${p.master}, ${p.network}, ${f.name}, ${f.pubkey},
					${Math.round(f.sol * LAMPORTS_PER_SOL)}, ${round(f.sol)}, 'funded', ${f.signature}, ${gitSha})
			`;
		}
		for (const f of failed) {
			await sql`
				insert into treasury_ledger
					(sweep_id, seq, kind, master, network, engine_name, engine_pubkey, amount_lamports, amount_sol, status, reason, git_sha)
				values (${p.sweepId}, ${seq}, 'transfer', ${p.master}, ${p.network}, ${f.name}, ${f.pubkey},
					${Math.round((f.sol || 0) * LAMPORTS_PER_SOL)}, ${round(f.sol || 0)}, 'failed', ${f.reason || 'send_failed'}, ${gitSha})
			`;
		}
		for (const r of rejected) {
			await sql`
				insert into treasury_ledger
					(sweep_id, seq, kind, master, network, engine_name, engine_pubkey, status, reason, git_sha)
				values (${p.sweepId}, ${seq}, 'reject', ${p.master}, ${p.network}, ${r.name}, ${r.pubkey}, 'rejected', ${r.reason}, ${gitSha})
			`;
		}
		for (const s of skipped) {
			await sql`
				insert into treasury_ledger
					(sweep_id, seq, kind, master, network, engine_name, status, reason, git_sha)
				values (${p.sweepId}, ${seq}, 'skip', ${p.master}, ${p.network}, ${s.name}, 'skipped', ${s.reason}, ${gitSha})
			`;
		}
		// Summary row (chained) last, so its hash can cover the transfers above.
		await sql`
			insert into treasury_ledger
				(sweep_id, seq, kind, master, network, status, reason,
				 master_sol_before, master_sol_after, spent_sol, reserve_sol, per_topup_max_sol, run_cap_sol,
				 expected_after_sol, unexplained_sol, breach, git_sha, prev_hash, row_hash, meta)
			values (${p.sweepId}, ${seq}, 'summary', ${p.master}, ${p.network},
				${rec.breach ? 'breach' : 'ok'}, ${rec.reasons.join(',') || null},
				${round(p.masterBefore)}, ${round(p.masterAfter)}, ${round(p.spentSol)},
				${round(p.reserveSol)}, ${round(p.perTopupMaxSol)}, ${round(p.runCapSol)},
				${rec.expectedAfterSol}, ${rec.unexplainedSol}, ${rec.breach}, ${gitSha}, ${prevHash || null}, ${rowHash},
				${JSON.stringify({ interRunDropSol: rec.interRunDropSol, funded: funded.length, failed: failed.length, skipped: skipped.length, rejected: rejected.length })}::jsonb)
		`;
	} catch (e) {
		console.warn('[treasury-ledger] persist failed:', e?.message || e);
		return { ok: false, sweepId: p.sweepId, breach: rec.breach, unexplainedSol: rec.unexplainedSol, interRunDropSol: rec.interRunDropSol, reasons: rec.reasons, seq, rowHash: null };
	}

	return { ok: true, sweepId: p.sweepId, breach: rec.breach, unexplainedSol: rec.unexplainedSol, interRunDropSol: rec.interRunDropSol, reasons: rec.reasons, seq, rowHash };
}

/**
 * Read recent ledger rows for the owner/accounting endpoint. Cursor by id
 * (descending, strictly-less-than) for stable pagination.
 * @param {object} [opts]
 * @param {number} [opts.limit]
 * @param {number|null} [opts.beforeId]
 * @param {string|null} [opts.engine]      filter to one engine_name
 * @param {boolean} [opts.breachOnly]
 * @param {string|null} [opts.kind]        e.g. 'transfer' | 'summary'
 * @returns {Promise<Array<object>>}
 */
export async function getLedger({ limit = 100, beforeId = null, engine = null, breachOnly = false, kind = null } = {}) {
	const lim = Math.min(1000, Math.max(1, Number(limit) || 100));
	const rows = await sql`
		select * from treasury_ledger
		where (${beforeId}::bigint is null or id < ${beforeId})
		  and (${engine}::text is null or engine_name = ${engine})
		  and (${kind}::text is null or kind = ${kind})
		  and (${breachOnly} = false or breach = true)
		order by id desc
		limit ${lim}
	`;
	return rows;
}

/**
 * Accounting rollup since a timestamp: total moved, per-engine totals, breach
 * count. Reads only `transfer`/`summary` rows.
 * @param {object} [opts]
 * @param {string|null} [opts.since]  ISO timestamp; null = all time
 * @returns {Promise<{ since:string|null, total_sol:number, transfers:number, breaches:number, per_engine:Array<{engine:string,sol:number,count:number}> }>}
 */
export async function reconcileTotals({ since = null } = {}) {
	const [tot] = await sql`
		select
			coalesce(sum(amount_sol) filter (where kind = 'transfer' and status = 'funded'), 0)::float8 as total_sol,
			count(*) filter (where kind = 'transfer' and status = 'funded') as transfers,
			count(*) filter (where kind = 'summary' and breach = true) as breaches
		from treasury_ledger
		where (${since}::timestamptz is null or ts >= ${since})
	`;
	const perEngine = await sql`
		select engine_name as engine,
			coalesce(sum(amount_sol), 0)::float8 as sol,
			count(*) as count
		from treasury_ledger
		where kind = 'transfer' and status = 'funded'
		  and (${since}::timestamptz is null or ts >= ${since})
		group by engine_name
		order by sol desc
	`;
	return {
		since,
		total_sol: round(tot?.total_sol || 0),
		transfers: Number(tot?.transfers || 0),
		breaches: Number(tot?.breaches || 0),
		per_engine: perEngine.map((r) => ({ engine: r.engine, sol: round(r.sol), count: Number(r.count) })),
	};
}

/**
 * Re-derive the summary hash chain and report the first broken link, if any —
 * the tamper check for the audit endpoint. Verifies both each row's own hash and
 * that each links to its predecessor.
 * @param {number} [limit] most recent N summaries to verify
 * @returns {Promise<{ ok:boolean, checked:number, brokenAt:number|null, reason:string|null }>}
 */
export async function verifyChain(limit = 500) {
	const rows = await sql`
		select sweep_id, seq, master, network, master_sol_before, master_sol_after, spent_sol,
			reserve_sol, per_topup_max_sol, run_cap_sol, expected_after_sol, unexplained_sol,
			breach, git_sha, prev_hash, row_hash
		from treasury_ledger
		where kind = 'summary'
		order by seq asc
		limit ${Math.min(5000, Math.max(1, limit))}
	`;
	let prevHash = '';
	let checked = 0;
	for (const r of rows) {
		// Rebuild the transfer list this summary covered from its line rows.
		const lines = await sql`
			select engine_name, engine_pubkey, amount_lamports, tx_signature, status
			from treasury_ledger
			where sweep_id = ${r.sweep_id} and kind = 'transfer' and status = 'funded'
			order by id asc
		`;
		const transfers = lines.map((l) => ({
			name: l.engine_name,
			pubkey: l.engine_pubkey,
			amountLamports: l.amount_lamports != null ? Number(l.amount_lamports) : null,
			signature: l.tx_signature,
			status: 'funded',
		}));
		const canonical = canonicalSummary({
			sweepId: r.sweep_id,
			seq: Number(r.seq),
			master: r.master,
			network: r.network,
			masterBefore: Number(r.master_sol_before),
			masterAfter: Number(r.master_sol_after),
			spentSol: Number(r.spent_sol),
			reserveSol: Number(r.reserve_sol),
			perTopupMaxSol: Number(r.per_topup_max_sol),
			runCapSol: Number(r.run_cap_sol),
			expectedAfterSol: Number(r.expected_after_sol),
			unexplainedSol: Number(r.unexplained_sol),
			breach: r.breach,
			gitSha: r.git_sha,
			transfers,
		});
		const expected = hashRow(prevHash, canonical);
		if ((r.prev_hash || '') !== (prevHash || '')) {
			return { ok: false, checked, brokenAt: Number(r.seq), reason: 'prev_hash_mismatch' };
		}
		if (r.row_hash !== expected) {
			return { ok: false, checked, brokenAt: Number(r.seq), reason: 'row_hash_mismatch' };
		}
		prevHash = r.row_hash;
		checked++;
	}
	return { ok: true, checked, brokenAt: null, reason: null };
}

export { LAMPORTS_PER_SOL, PER_TX_FEE_SOL, RECONCILE_EPSILON_SOL };

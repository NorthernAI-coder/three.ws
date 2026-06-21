// $THREE holder snapshot — the cached read/write layer behind the public holder
// leaderboard, its OG share card, and the token stats panel.
//
// Why this exists: those three public surfaces each used to call
// fetchHolderBalances({ mint: THREE_MINT }) directly — a full Helius DAS
// `getTokenAccounts` walk of EVERY $THREE holder — on every edge-cache miss. That
// recomputed a slowly-changing set on web/bot traffic, so DAS credit burn scaled
// with page views (and the OG card amplified it: every crawler/unfurl that missed
// cache triggered a full scan). This module flips that around: a single cron
// (api/cron/three-holders-snapshot.js) runs ONE scan every few minutes and writes
// the result to three_holder_snapshot; the public reads serve from that snapshot
// for the cost of a single DB query.
//
// threeHolderBalances() returns the exact same Map<wallet, bigint> shape that
// fetchHolderBalances() returns, so call sites swap their data source in one line
// and every downstream derivation (ranking, tiers, % of supply) is untouched.

import { sql } from '../db.js';
import { TOKEN_MINT as THREE_MINT } from '../token/config.js';
import { fetchHolderBalances } from './holders.js';
import { acquireLock, releaseLock } from '../cache.js';

const UPSERT_CHUNK = 2000; // rows per batched upsert — mirrors persistHolderSnapshot
// A snapshot older than this is treated as missing: the reader falls back to a
// live scan so a stalled cron degrades to "slightly more expensive" rather than
// "serving hours-old holder data". The cron runs every 5m, so 30m tolerates a few
// missed ticks before falling back.
const MAX_SNAPSHOT_AGE_MS = 30 * 60_000;

let _ensured = null;
function ensureTables() {
	if (_ensured) return _ensured;
	_ensured = (async () => {
		await sql`
			create table if not exists three_holder_snapshot (
				wallet      text primary key,
				balance     bigint not null,
				updated_at  timestamptz not null default now()
			)
		`;
		await sql`
			create index if not exists three_holder_snapshot_balance_idx
				on three_holder_snapshot (balance desc)
		`;
		await sql`
			create table if not exists three_holder_snapshot_meta (
				id           smallint primary key default 1,
				snapshot_at  timestamptz,
				holder_count integer not null default 0
			)
		`;
		await sql`
			insert into three_holder_snapshot_meta (id, snapshot_at, holder_count)
			values (1, null, 0)
			on conflict (id) do nothing
		`;
		return true;
	})().catch((err) => {
		console.error('[three-holders] ensureTables failed:', err?.message || err);
		_ensured = null; // allow a retry on the next call
		return false;
	});
	return _ensured;
}

/**
 * Run a full $THREE holder scan and atomically refresh the snapshot table.
 * Called by the cron only. Returns { holders, scannedAt } for logging.
 */
export async function refreshThreeHolderSnapshot() {
	const balances = await fetchHolderBalances({ mint: THREE_MINT });
	return persistThreeHolderSnapshot(balances);
}

/**
 * Persist an already-scanned Map<wallet, bigint> to the snapshot table. Split out
 * of refreshThreeHolderSnapshot so the cold-fallback read path can reuse a single
 * scan for BOTH the response and self-healing the cache — never scanning twice.
 */
export async function persistThreeHolderSnapshot(balances) {
	if (!(await ensureTables())) throw new Error('three_holder_snapshot table unavailable');

	const wallets = [...balances.keys()].filter((w) => balances.get(w) > 0n);
	const now = new Date();

	// Batched multi-row upsert via unnest — one round-trip per chunk instead of
	// one per holder (thousands of serial Neon HTTP calls otherwise).
	for (let i = 0; i < wallets.length; i += UPSERT_CHUNK) {
		const chunk = wallets.slice(i, i + UPSERT_CHUNK);
		const balanceStrs = chunk.map((w) => balances.get(w).toString());
		await sql`
			insert into three_holder_snapshot (wallet, balance, updated_at)
			select u.wallet, u.balance, ${now}
			from unnest(${chunk}::text[], ${balanceStrs}::bigint[]) as u(wallet, balance)
			on conflict (wallet) do update set
				balance = excluded.balance,
				updated_at = excluded.updated_at
		`;
	}

	// Hard-delete wallets that fully exited since the last snapshot — this is a
	// pure cache, so there's no accrual to preserve (unlike coin_holders). Neon's
	// HTTP client expands arrays into Postgres params, so use `<> all(...)`.
	if (wallets.length > 0) {
		await sql`
			delete from three_holder_snapshot
			where not (wallet = any(${wallets}))
		`;
	} else {
		// An empty scan almost certainly means Helius was unreachable, not that
		// $THREE has zero holders — never wipe a good snapshot on a bad scan.
		throw new Error('holder scan returned 0 holders — refusing to wipe snapshot');
	}

	await sql`
		update three_holder_snapshot_meta
		set snapshot_at = ${now}, holder_count = ${wallets.length}
		where id = 1
	`;

	return { holders: wallets.length, scannedAt: now.toISOString() };
}

/**
 * Read the cached snapshot as a Map<wallet, bigint>. Returns null when there is
 * no fresh snapshot (table missing, never populated, or older than
 * MAX_SNAPSHOT_AGE_MS) so the caller can fall back to a live scan.
 */
export async function readThreeHolderSnapshot() {
	let meta;
	try {
		[meta] = await sql`select snapshot_at, holder_count from three_holder_snapshot_meta where id = 1`;
	} catch {
		// Table not created yet (migration pending on a fresh deploy) — signal the
		// caller to live-scan rather than erroring the public read.
		return null;
	}
	if (!meta?.snapshot_at) return null;
	const ageMs = Date.now() - new Date(meta.snapshot_at).getTime();
	if (ageMs > MAX_SNAPSHOT_AGE_MS) return null;

	const rows = await sql`select wallet, balance from three_holder_snapshot`;
	const balances = new Map();
	for (const r of rows) {
		// Neon returns bigint columns as strings to preserve precision.
		balances.set(r.wallet, BigInt(r.balance));
	}
	return balances.size > 0 ? balances : null;
}

// Cross-instance lock + TTL for the cold-fallback scan. The full DAS walk takes
// several seconds; 90s is comfortably longer so a slow scan keeps the lock, and
// it auto-expires if the holder's lambda dies mid-scan.
const COLD_SCAN_LOCK_KEY = 'three:holders:coldscan';
const COLD_SCAN_LOCK_TTL = 90;
// In-process single-flight: coalesce concurrent cold scans within ONE warm
// lambda so a burst of cache-miss requests on the same instance shares one scan.
let _inflightColdScan = null;

/**
 * The drop-in replacement for fetchHolderBalances({ mint: THREE_MINT }) on public
 * read paths: serve the cached snapshot, falling back to a single live scan only
 * on a cold start (snapshot missing/stale). Same Map<wallet, bigint> shape, so
 * callers' downstream ranking/tier/percentage logic is unchanged.
 *
 * The cold fallback is stampede-guarded. Without it, a traffic spike against a
 * missing/stale snapshot (cold deploy, or a stalled cron) had EVERY uncached
 * request to the leaderboard, token stats, and OG card independently fire a full
 * multi-second Helius DAS walk — N concurrent scans burning credits. Now: an
 * in-process single-flight collapses concurrent callers on one instance, and a
 * cross-instance Redis lock ensures only one lambda platform-wide runs the scan
 * — and the winner refreshes the shared snapshot so the fallback self-heals and
 * everyone else reads from cache.
 */
export async function threeHolderBalances() {
	const snap = await readThreeHolderSnapshot();
	if (snap) return snap;
	if (_inflightColdScan) return _inflightColdScan;
	_inflightColdScan = coldFallbackScan().finally(() => { _inflightColdScan = null; });
	return _inflightColdScan;
}

async function coldFallbackScan() {
	const gotLock = await acquireLock(COLD_SCAN_LOCK_KEY, COLD_SCAN_LOCK_TTL);
	if (!gotLock) {
		// Another instance is scanning. Wait briefly for it to refresh the snapshot,
		// then serve from cache. If it never appears (slow/dead holder), scan
		// ourselves rather than hanging the request.
		for (let i = 0; i < 12; i++) {
			await new Promise((r) => setTimeout(r, 500));
			const snap = await readThreeHolderSnapshot();
			if (snap) return snap;
		}
		return fetchHolderBalances({ mint: THREE_MINT });
	}
	try {
		// Winner: one live scan serves this response AND self-heals the shared
		// snapshot, so subsequent reads hit cache instead of scanning. Persist is
		// fire-and-forget — a write failure (e.g. snapshot table not migrated yet)
		// must never break the page, and we never scan twice.
		const balances = await fetchHolderBalances({ mint: THREE_MINT });
		persistThreeHolderSnapshot(balances).catch((err) =>
			console.warn('[three-holders] cold snapshot persist failed:', err?.message || err),
		);
		return balances;
	} finally {
		await releaseLock(COLD_SCAN_LOCK_KEY);
	}
}

// Holder snapshot via Helius's DAS API (helius-sdk).
//
// Pump.fun tokens are issued on Token-2022 (createV2). Helius's `getTokenAccounts`
// indexes both the legacy SPL Token program and Token-2022 transparently, so a
// single mint filter returns every holder regardless of token program. This
// replaces the previous direct-RPC `getProgramAccounts` walk, which:
//   • returned thousands of accounts in a single un-paginated response (OOM risk)
//   • required two separate calls (one per token program)
//   • was slower for popular mints (Helius's DAS-indexed path is purpose-built)
//
// Each token account belongs to an owner wallet (the "holder"). We aggregate
// balances by owner — a single owner can have multiple token accounts (rare
// for retail wallets but does happen with multisigs).
//
// Snapshots are persisted into coin_holders via upsert; balances of zero
// (i.e. holders that fully exited) are KEPT in the table at balance=0 because
// their accrued_reflection_lamports might still be unpaid. The reflection
// payout flow filters by balance > min_holder_balance at distribution time.

import { sql } from '../db.js';
import { createHelius } from 'helius-sdk';

const PAGE_LIMIT = 1000;
const MAX_PAGES = 200; // hard ceiling — 200k holders before we abort, matches Helius limits

let _heliusMainnet = null;
let _heliusDevnet = null;

function helius(network) {
	const apiKey = process.env.HELIUS_API_KEY;
	if (!apiKey) throw new Error('HELIUS_API_KEY not set');
	if (network === 'devnet') {
		if (!_heliusDevnet) _heliusDevnet = createHelius({ apiKey, cluster: 'devnet' });
		return _heliusDevnet;
	}
	if (!_heliusMainnet) _heliusMainnet = createHelius({ apiKey, cluster: 'mainnet' });
	return _heliusMainnet;
}

/**
 * Fetch all holders of a given mint via Helius's DAS-indexed `getTokenAccounts`.
 * Aggregates per-owner balances across multiple token accounts.
 *
 * @param {object} opts
 * @param {string} opts.mint
 * @param {'mainnet'|'devnet'} [opts.network]
 * @returns {Promise<Map<string, bigint>>}  owner → token-units (BigInt)
 */
export async function fetchHolderBalances({ mint, network = 'mainnet' }) {
	const client = helius(network);
	const balances = new Map();

	let cursor;
	for (let page = 0; page < MAX_PAGES; page++) {
		const resp = await client.getTokenAccounts({
			mint,
			limit: PAGE_LIMIT,
			...(cursor ? { cursor } : {}),
			options: { showZeroBalance: false },
		});

		const accounts = resp?.token_accounts || [];
		for (const acc of accounts) {
			const owner = acc.owner;
			if (!owner) continue;
			// Helius types `amount` as `number`, but its underlying value comes
			// from a string in the JSON response. Coerce through String() so
			// BigInt() never sees scientific notation for huge supplies.
			const amountStr = acc.amount == null ? null : String(acc.amount);
			if (!amountStr || amountStr === '0') continue;
			const n = BigInt(amountStr);
			if (n === 0n) continue;
			balances.set(owner, (balances.get(owner) || 0n) + n);
		}

		// Helius returns a cursor when more pages remain. Empty/missing cursor
		// or short page → we're done.
		if (!resp?.cursor || accounts.length < PAGE_LIMIT) break;
		cursor = resp.cursor;
	}

	return balances;
}

/**
 * Persist a holder snapshot into coin_holders. Returns counts for logging.
 * Wallets with balance=0 in the snapshot are downgraded to balance=0 in DB
 * (so they stop accruing reflection) but the row is preserved so any pending
 * accrued_reflection_lamports remains claimable.
 *
 * @param {object} opts
 * @param {string} opts.coinId
 * @param {Map<string, bigint>} opts.balances
 */
export async function persistHolderSnapshot({ coinId, balances }) {
	const now = new Date();
	const wallets = [...balances.keys()];

	// Insert/update each wallet. Postgres jsonb-style would be nice but we
	// don't have batch tooling wired in; for snapshots of a few thousand
	// holders this is fast enough on Solana traffic.
	for (const wallet of wallets) {
		const bal = balances.get(wallet);
		await sql`
			insert into coin_holders (coin_id, wallet, balance, first_seen, last_seen)
			values (${coinId}, ${wallet}, ${bal.toString()}, ${now}, ${now})
			on conflict (coin_id, wallet) do update set
				balance = excluded.balance,
				last_seen = excluded.last_seen
		`;
	}

	// Mark wallets that vanished from the snapshot as balance=0 so they stop
	// accruing reflection. Neon's HTTP client expands arrays into Postgres
	// array params, so we use `NOT (wallet = ANY($1))` rather than `NOT IN`.
	if (wallets.length > 0) {
		await sql`
			update coin_holders
			set balance = 0
			where coin_id = ${coinId}
			  and balance > 0
			  and not (wallet = any(${wallets}))
		`;
	} else {
		await sql`
			update coin_holders set balance = 0
			where coin_id = ${coinId} and balance > 0
		`;
	}

	await sql`
		update coin_launches
		set last_snapshot_at = ${now}, updated_at = ${now}
		where id = ${coinId}
	`;

	const positive = wallets.filter((w) => balances.get(w) > 0n).length;
	return { totalAccounts: wallets.length, positive };
}

/**
 * Read the current eligible-holder set from DB. Returns {wallet, balance}
 * tuples for everyone with balance > min_holder_balance, sorted descending
 * by balance.
 */
export async function readEligibleHolders({ coinId, minBalance = 0n }) {
	const rows = await sql`
		select wallet, balance::text as balance
		from coin_holders
		where coin_id = ${coinId} and balance > ${minBalance.toString()}::bigint
		order by balance::numeric desc
	`;
	return rows.map((r) => ({ wallet: r.wallet, balance: BigInt(r.balance) }));
}

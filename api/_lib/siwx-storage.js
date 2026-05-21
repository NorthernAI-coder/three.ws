// Postgres-backed implementation of the @x402/extensions/sign-in-with-x
// SIWxStorage interface. Two tables back this adapter (see
// api/_lib/migrations/2026-05-21-siwx.sql):
//
//   siwx_payments(resource, address, network, paid_at, expires_at,
//                 last_used_at, use_count)
//     — one row per (resource, address). expires_at NULL = permanent grant
//       (downloadable assets); set to now()+TTL for time-pass access.
//
//   siwx_nonces(nonce, resource, address, used_at)
//     — replay-protection. Garbage-collected by api/cron/siwx-gc.js.
//
// Address normalization happens here, not at the DB layer: CAIP-122 carries
// addresses in their canonical-per-chain form, which differs by namespace:
//   eip155:*  → lowercase hex (NOT EIP-55 checksummed)
//   solana:*  → Base58 (case-sensitive, leave as-is)
// Every read + write goes through normalizeAddress() so lookups are
// case-insensitive on EVM while staying byte-for-byte exact on Solana.

import { sql } from './db.js';

// Pull off the CAIP-2 namespace ('eip155' / 'solana' / etc.) without parsing
// the reference, so a future chain like 'eip155:42161' or 'solana:devnet'
// shares the same normalization branch.
function namespaceOf(chainId) {
	if (!chainId || typeof chainId !== 'string') return null;
	const colon = chainId.indexOf(':');
	return colon === -1 ? chainId.toLowerCase() : chainId.slice(0, colon).toLowerCase();
}

export function normalizeAddress(chainId, address) {
	if (!address) return address;
	const ns = namespaceOf(chainId);
	if (ns === 'eip155') return String(address).toLowerCase();
	return String(address);
}

async function hasPaid(resource, address) {
	if (!resource || !address) return false;
	const rows = await sql`
		select expires_at
		  from siwx_payments
		 where resource = ${resource}
		   and address  = ${address}
		 limit 1
	`;
	if (!rows.length) return false;
	const exp = rows[0].expires_at;
	if (exp && new Date(exp).getTime() <= Date.now()) return false;
	await sql`
		update siwx_payments
		   set last_used_at = now(),
		       use_count    = use_count + 1
		 where resource = ${resource}
		   and address  = ${address}
	`;
	return true;
}

async function recordPayment(resource, address, opts = {}) {
	if (!resource || !address) return;
	const network = opts.network || null;
	const ttlSeconds = Number.isFinite(opts.ttlSeconds) ? Number(opts.ttlSeconds) : null;
	const expiresAt = ttlSeconds && ttlSeconds > 0
		? new Date(Date.now() + ttlSeconds * 1000).toISOString()
		: null;
	await sql`
		insert into siwx_payments (resource, address, network, paid_at, expires_at)
		values (${resource}, ${address}, ${network}, now(), ${expiresAt})
		on conflict (resource, address) do update
		   set network    = excluded.network,
		       paid_at    = excluded.paid_at,
		       expires_at = excluded.expires_at
	`;
}

async function hasUsedNonce(nonce) {
	if (!nonce) return false;
	const rows = await sql`select 1 from siwx_nonces where nonce = ${nonce} limit 1`;
	return rows.length > 0;
}

async function recordNonce(nonce, ctx = {}) {
	if (!nonce) return;
	await sql`
		insert into siwx_nonces (nonce, resource, address, used_at)
		values (${nonce}, ${ctx.resource || ''}, ${ctx.address || ''}, now())
		on conflict (nonce) do nothing
	`;
}

export const siwxStorage = {
	hasPaid,
	recordPayment,
	hasUsedNonce,
	recordNonce,
};

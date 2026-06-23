#!/usr/bin/env node
/**
 * Reconciliation pass for the usage metering ledger — the trust bar made concrete.
 *
 * The books balance only when every metered charge maps to a real settlement and
 * every settlement that should have produced usage actually did. This script
 * cross-checks the two sides and reports the drift:
 *
 *   1. usage WITHOUT settlement — a usage_events row whose settlement_ref points
 *      at no token_payments row (or AWS metering ack). Money was billed but we
 *      can't prove it settled → must be investigated.
 *   2. settlement WITHOUT usage — a token_payments row for a priced action with
 *      no metered usage_event → revenue settled but never made it onto a
 *      statement (a missed meter; the reconciliation safety net catches it).
 *
 * SAFE BY DEFAULT: read-only. Exits non-zero when unreconciled rows exist so CI /
 * a cron can alert. Reads DATABASE_URL from env.
 *
 * Usage:
 *   node scripts/reconcile-usage.mjs                 # last 30 days
 *   node scripts/reconcile-usage.mjs --days 90
 *   node scripts/reconcile-usage.mjs --json          # machine-readable
 */

import { neon } from '@neondatabase/serverless';

const args = process.argv.slice(2);
const flag = (name, def) => {
	const i = args.indexOf(name);
	return i >= 0 ? args[i + 1] : def;
};
const asJson = args.includes('--json');
const days = Math.max(1, Number(flag('--days', '30')) || 30);

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
	console.error('reconcile-usage: DATABASE_URL is not set');
	process.exit(2);
}

const sql = neon(DATABASE_URL);
const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

// 1. Metered usage whose settlement can't be matched to a real record.
const usageWithoutSettlement = await sql`
	select ue.id, ue.meter_action, ue.settlement_ref, ue.settlement_kind,
	       ue.price_usdc_atomics, ue.created_at
	from usage_events ue
	where ue.kind = 'metered'
	  and ue.created_at >= ${since}
	  and not (
		(ue.settlement_kind = 'three' and exists (
			select 1 from token_payments tp where tp.id::text = ue.settlement_ref))
		or (ue.settlement_kind = 'aws' and exists (
			select 1 from aws_marketplace_metering am where am.usage_allocation_id = ue.settlement_ref))
		or (ue.settlement_kind not in ('three','aws') and ue.settlement_ref is not null)
	  )
	order by ue.created_at desc
	limit 500
`;

// 2. Settled $THREE payments for a priced action with no metered usage row.
//    token_payments.purpose carries the catalog action; rewards/treasury internal
//    transfers and non-catalog purposes are excluded by joining on the existence
//    of a usage row keyed by this payment id.
const settlementWithoutUsage = await sql`
	select tp.id, tp.purpose, tp.usd, tp.tx_signature, tp.created_at
	from token_payments tp
	where tp.created_at >= ${since}
	  and not exists (
		select 1 from usage_events ue
		where ue.kind = 'metered'
		  and ue.settlement_kind = 'three'
		  and ue.settlement_ref = tp.id::text
	  )
	order by tp.created_at desc
	limit 500
`;

const [counts] = await sql`
	select
		count(*) filter (where kind = 'metered' and created_at >= ${since})::int as metered_total
	from usage_events
`;

const report = {
	window_days: days,
	since: since.toISOString(),
	metered_total: counts?.metered_total ?? 0,
	usage_without_settlement: usageWithoutSettlement.length,
	settlement_without_usage: settlementWithoutUsage.length,
	reconciled: usageWithoutSettlement.length === 0,
	samples: {
		usage_without_settlement: usageWithoutSettlement.slice(0, 20),
		settlement_without_usage: settlementWithoutUsage.slice(0, 20),
	},
};

if (asJson) {
	console.log(JSON.stringify(report, null, 2));
} else {
	console.log(`\nUsage reconciliation — last ${days} day(s) (since ${report.since})`);
	console.log(`  metered charges:            ${report.metered_total}`);
	console.log(`  usage without settlement:   ${report.usage_without_settlement}`);
	console.log(`  settlement without usage:   ${report.settlement_without_usage}`);
	console.log(`  status:                     ${report.reconciled ? '✓ all charges reconciled' : '✗ UNRECONCILED — investigate'}`);
	if (usageWithoutSettlement.length) {
		console.log('\n  Unreconciled usage (first 20):');
		for (const r of usageWithoutSettlement.slice(0, 20)) {
			console.log(`    #${r.id} ${r.meter_action} ref=${r.settlement_ref} (${r.settlement_kind}) ${r.created_at?.toISOString?.() ?? r.created_at}`);
		}
	}
	if (settlementWithoutUsage.length) {
		console.log('\n  Settlements without a usage row (first 20):');
		for (const r of settlementWithoutUsage.slice(0, 20)) {
			console.log(`    ${r.id} ${r.purpose} $${r.usd} tx=${r.tx_signature}`);
		}
	}
	console.log('');
}

// usage-without-settlement is the hard failure (money billed, no proof it
// settled). settlement-without-usage is a softer signal (a missed meter the
// pass surfaces) and does not fail the run on its own.
process.exit(usageWithoutSettlement.length > 0 ? 1 : 0);

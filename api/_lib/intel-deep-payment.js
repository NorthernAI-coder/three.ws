// Pay-per-use proof for the $THREE Intel Deep Report — the consumption lever of
// Token Utility applied to intelligence.
//
// Anyone (holder or not) may pay $THREE for ONE per-token Deep Report instead of
// the report being a held perk. The payment runs through the existing token rail
// (api/_lib/token: quote → settle), which records a settled `consumption` row in
// token_payments bound to ref_type:'intel' and the client nonce as ref_id. The
// client then POSTs the report request with { payment_id, ref_id }, and this
// module is the server's authority on whether that proof buys a report.
//
// Unlike the Forge redemption ledger, this one STORES the generated dossier:
//   • assertIntelPayment()   — read-only validation: the payment is a settled
//     `consumption` for intel.deep, ref-bound, correctly priced, and recent.
//   • getStoredReport()      — the dossier already bought with this payment, or
//     null. A retry (network hiccup on the way back) returns the SAME report —
//     the buyer never loses a paid report and is never charged twice.
//   • claimReport()          — atomically persist the freshly generated dossier.
//     The payment_id PRIMARY KEY makes it race-safe: a concurrent generation that
//     stored first wins, and this caller is handed the stored copy instead.
//
// Security model: authorization rests on the (payment_id, ref_id) pair. payment_id
// is a server-minted UUID returned only to the settling client; ref_id is the
// client nonce recorded on the payment at quote time. Each pair buys exactly one
// report, for exactly the one token mint it was first redeemed against.

import { sql } from './db.js';
import { priceForAction } from './pricing/catalog.js';

// How long after settlement a payment may be redeemed for a report. Generous: a
// report is normally generated seconds after settling, but a buyer may pay, get
// distracted, and come back. Older than this is treated as stale.
const REDEMPTION_WINDOW_MS = 24 * 60 * 60 * 1000;

const INTEL_DEEP_ACTION = 'intel.deep';
const INTEL_REF_TYPE = 'intel';
const CONSUMPTION_PURPOSE = 'consumption';

function payErr(message, status, code, extra = {}) {
	return Object.assign(new Error(message), { status, code, ...extra });
}

// Direct lookup of one settled payment — lighter than listPayments (which pulls
// in the on-chain settle/verify module) and all this path needs.
async function lookupPayment(paymentId) {
	const [row] = await sql`
		select id, purpose, usd, ref_type, ref_id, confirmed_at, created_at
		from token_payments
		where id = ${paymentId}
		limit 1
	`;
	return row || null;
}

/**
 * The dossier already bought with this payment (with the mint it covers), or null.
 * @param {string} paymentId
 * @returns {Promise<{ mint: string, report: object } | null>}
 */
export async function getStoredReport(paymentId) {
	if (!paymentId) return null;
	const [row] = await sql`
		select mint, report from intel_deep_reports where payment_id = ${paymentId} limit 1
	`;
	return row ? { mint: row.mint, report: row.report } : null;
}

/**
 * Validate that a settled $THREE payment proves entitlement to one Deep Report.
 * Read-only: does not consume or store anything.
 *
 * @param {object} params
 * @param {string} params.paymentId    token_payments.id returned by settle
 * @param {string} params.refId        the client nonce the payment was bound to
 * @param {number} [params.discountBps] holder fee discount (bps) when a tier pass
 *                                      rode along at quote time, so the expected
 *                                      price matches what the client was quoted
 * @returns {Promise<{ ok: true, payment: { id, usd, settledAt } }>}
 * @throws  402 payment_invalid | 402 payment_expired | 400 bad_request
 */
export async function assertIntelPayment({ paymentId, refId, discountBps = 0 }) {
	if (!paymentId || !refId) {
		throw payErr('payment_id and ref_id are required', 400, 'bad_request');
	}

	const payment = await lookupPayment(paymentId);
	if (!payment) {
		throw payErr('No settled $THREE payment found for this report.', 402, 'payment_invalid');
	}
	if (payment.purpose !== CONSUMPTION_PURPOSE || payment.ref_type !== INTEL_REF_TYPE) {
		throw payErr('This payment is not an Intel Deep Report payment.', 402, 'payment_invalid');
	}
	if (payment.ref_id !== refId) {
		throw payErr('This payment does not match this report.', 402, 'payment_invalid');
	}

	// Price must equal the catalog price for intel.deep (holder discount applied
	// when a pass rides along), so an underpaid quote can't be redeemed.
	const expectedUsd = Number(priceForAction(INTEL_DEEP_ACTION, { discountBps }).usd);
	const paidUsd = Number(payment.usd);
	if (!(Math.abs(paidUsd - expectedUsd) < 0.005)) {
		throw payErr(
			`This payment ($${paidUsd.toFixed(2)}) does not cover a Deep Report ($${expectedUsd.toFixed(2)}).`,
			402,
			'payment_invalid',
		);
	}

	const settledAt = payment.confirmed_at || payment.created_at;
	const ageMs = Date.now() - new Date(settledAt).getTime();
	if (!(ageMs >= 0) || ageMs > REDEMPTION_WINDOW_MS) {
		throw payErr('This payment has expired — pay again for a fresh report.', 402, 'payment_expired');
	}

	return { ok: true, payment: { id: payment.id, usd: paidUsd, settledAt } };
}

/**
 * Atomically persist a generated dossier against its payment. Race-safe via the
 * payment_id PRIMARY KEY: if a concurrent generation stored first, nothing is
 * inserted and the already-stored report is returned instead — so two racing
 * requests for the same payment always converge on one dossier.
 *
 * @param {object} params
 * @param {string} params.paymentId
 * @param {string} params.refId
 * @param {string} params.mint
 * @param {object} params.report
 * @returns {Promise<{ report: object, fresh: boolean }>}
 */
export async function claimReport({ paymentId, refId, mint, report }) {
	const rows = await sql`
		insert into intel_deep_reports (payment_id, ref_id, mint, report)
		values (${paymentId}, ${refId}, ${mint}, ${JSON.stringify(report)}::jsonb)
		on conflict (payment_id) do nothing
		returning report
	`;
	if (rows.length > 0) return { report: rows[0].report, fresh: true };
	// Lost the race (or a re-POST): return whatever is stored for this payment.
	const stored = await getStoredReport(paymentId);
	return { report: stored?.report ?? report, fresh: false };
}

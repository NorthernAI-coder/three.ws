-- Migration: intel_deep_reports — single-use ledger + result store for the
-- pay-per-use $THREE Intel Deep Report (catalog action `intel.deep`).
-- Apply: node scripts/apply-migrations.mjs --apply --file 2026-06-18-intel-deep-reports.sql
-- Idempotent.
--
-- Token Utility — the consumption lever, applied to intelligence. A caller pays
-- $THREE for ONE per-token Deep Report (api/_lib/token quote → settle records the
-- payment in token_payments as a `consumption`/ref_type:'intel' row). This table
-- binds ONE settled payment to ONE generated report:
--   • PRIMARY KEY on payment_id ⇒ "one payment = one report", forever.
--   • The full report jsonb is stored alongside, so a network hiccup on the way
--     back never costs the buyer their paid report — a retry returns the SAME
--     stored dossier (idempotent), it never regenerates or double-charges.
--   • mint is recorded so a payment redeemed for one token can't be replayed
--     against another; a mismatched retry is rejected, a matching one is served
--     from the store.
--
-- No secrets are stored: payment_id references the public token_payments ledger
-- and the report is derived entirely from public on-chain + market intelligence.

begin;

create table if not exists intel_deep_reports (
    -- The settled consumption payment this report was bought with (one row ever).
    payment_id   uuid primary key references token_payments(id) on delete cascade,
    -- The client nonce the payment was quoted/settled against (token_payments.ref_id).
    -- Re-checked on redemption so possession of payment_id alone can't redeem.
    ref_id       text not null,
    -- The token mint the report covers. Binds the payment to one subject.
    mint         text not null,
    -- The full generated dossier, returned verbatim on every idempotent retry.
    report       jsonb not null,
    created_at   timestamptz not null default now()
);

create index if not exists intel_deep_reports_created
    on intel_deep_reports (created_at desc);

commit;

# Task 07 — Close the Reconciliation Blind Spot

## Mission

The financial-integrity system currently reconciles `x402_autonomous_log` and
`agent_payment_intents` against the chain — but **never reads
`x402_self_facilitator_log` or `x402_ring_ledger`**. Ring settlements that
exist only in the facilitator log are unverified, and ledger sweeps are
unchecked. Extend reconciliation so every ring row is proven on chain and every
on-chain ring movement is proven in a ledger — the same standard the economy
master already meets.

## Context you must know

- Existing reconciler: `api/_lib/x402/revenue-reconciliation.js` — `run(ctx)`,
  outbound from `x402_autonomous_log` (`loadOutboundRecords` :107-133), inbound
  from `agent_payment_intents` (`loadInboundRecords` :137-163), verdicts →
  `payment_reconciliation` (schema :76-103), ops alert on discrepancy
  (:381-393). Registered in the autonomous registry (`revenue-reconciliation`
  entry :2858-2870).
- Gold standard to mirror: `api/cron/economy-reconcile.js` — three checks
  (tamper, unrecorded outbound, ledger-vs-chain integrity) with
  `getSignatureStatuses` over a 72h window, `upsertVerdict` (:58).
- Ring tables (migration `2026-07-01-x402-ring-economy.sql`):
  `x402_self_facilitator_log` (every verify/settle op, tx signature, real fee),
  `x402_ring_ledger` (kinds `settle|sweep|fund`), `x402_ring_wallets`.
- Facilitator logs real fees from `getParsedTransaction().meta.fee`
  (`self-facilitator.js:441-450`).
- Task 06 provides `ringAllowedAddresses()` and the on-chain leak scanner —
  your job is the *ledger↔chain* direction; the scanner covers *chain→alert*.
  Don't duplicate its work; share the cursor/verdict conventions.

## Tasks

1. **Extend `revenue-reconciliation.js`** (or a sibling `ring-reconciliation.js`
   registered separately if mixing scopes would muddy the existing module —
   your call, justify it in the module docstring):
   - **Settle integrity:** every `x402_self_facilitator_log` settle row from
     the last 72h with a `tx_signature` → `getSignatureStatuses` batch check:
     missing or failed on chain → verdict (`x402_ring_settle_missing` /
     `x402_ring_settle_failed`).
   - **Amount fidelity:** for a sampled subset (≤ 50/run), parse the tx and
     verify the USDC amount and receiver match the log row → mismatch is a
     CRITICAL verdict (`x402_ring_amount_mismatch`).
   - **Sweep integrity:** every `x402_ring_ledger` `sweep` row → same
     signature + amount + direction (treasury→payer only) verification.
   - **Cross-log coherence:** ring-tick payments (task 04) land in BOTH
     `x402_autonomous_log` (buyer side) and `x402_self_facilitator_log`
     (settlement side). Join on signature over the window; orphans on either
     side → verdict (`x402_ring_log_orphan`) — a settlement with no buyer
     record is exactly the "leak through our own facilitator" case.
   - **Fee coherence:** daily sum of logged fees vs task 05's audit numbers;
     >20% divergence → WARN verdict.
2. **Verdict plumbing.** Reuse `upsertVerdict`/`payment_reconciliation` shapes;
   distinct `source` values so the ops board separates ring findings. Alerts
   via the existing `sendOpsAlert` path, CRITICAL only for
   missing/failed/mismatch — coherence WARNs are throttled daily.
3. **Zero-volume tripwire.** If the ring is enabled (`validateRingConfig()`
   clean) and `x402_self_facilitator_log` shows zero settles in a 30-minute
   window → WARN alert "ring enabled but silent". This is the alarm that was
   missing when "it was working but now it's not" happened silently.
4. **Tests.** Fixture-driven: each verdict class triggered by a crafted
   log/chain mismatch; the tripwire; batch-size bounds. No network.
5. **Docs + changelog.** Extend `docs/x402-ring-economy.md` (reconciliation
   section referencing the ops board) and `docs/financial-controls.md` if it
   indexes reconcilers. Changelog entry (tags: `security`, `infra`).

## Files you own

`api/_lib/x402/revenue-reconciliation.js` (or new sibling + registry entry),
tests, `docs/x402-ring-economy.md`, `docs/financial-controls.md`,
`data/changelog.json`.

## Constraints

- Read-only against chain; bounded RPC (batched `getSignatureStatuses`, ≤ 50
  parsed-tx fetches per run).
- Never mutate the logs being audited; verdicts are the only write.
- Keep the existing reconciler's behavior for non-ring scopes byte-identical.

## Acceptance criteria

- [ ] All five check classes implemented with fixture tests (green).
- [ ] A real run against the live DB+chain completes and reports coverage
      counts (rows checked per class) — paste the output.
- [ ] The zero-volume tripwire fires in a test where config is clean but the
      log is empty.
- [ ] Ops board (`payment_reconciliation`) shows ring sources distinctly.
- [ ] `npm test` green; docs + changelog landed.

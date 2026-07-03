# Task 11 — Activation, 60-Minute Acceptance Run, and the PASS/FAIL Verdict

## Mission

Everything is built; now prove it in production. Execute the go-live sequence,
run the ring for a supervised 60 minutes, measure it against the owner's
requirements verbatim — endpoints hit every minute, many times; tips, payments,
services bought and sold; agents and on-chain deployments utilized; zero
leakage; lowest fees — and deliver a PASS/FAIL report with real numbers. If any
gate fails, fix or roll back, and rerun until PASS. This task is the definition
of "it's working again".

## Context you must know

- Prior tasks landed: self-facilitator routing + `validateRingConfig()` (02),
  wallets provisioned/monitored/verified (03, incl. `scripts/x402-ring-verify.mjs`
  and `FUNDING.md`), per-minute tick with separate budget (04), self-pay fee
  floor + fee audit (05), runtime invariants + leak scanner (06), full
  reconciliation (07), 100% catalog coverage (08), agent buyers + on-chain
  cadence (09), `/admin/ring` dashboard (10).
- The env block required is documented in `.env.example` (per task 02) and
  `scripts/x402-ring-setup.mjs:79-92`. Funding amounts in
  `tasks/x402-ring/FUNDING.md`.
- Kill switches, in escalation order: `X402_RING_TICK_ENABLED=false` (tick
  only) → `X402_AUTONOMOUS_ENABLED=false` (all autonomous spend) →
  `X402_SELF_FACILITATOR_ENABLED=false` (nothing settles).

## Tasks

1. **Preflight (no funds yet).**
   - `node scripts/x402-ring-verify.mjs` → exit 0.
   - All env set in Vercel production; `validateRingConfig()` via
     `/api/x402-ring` shows zero `config_warnings`.
   - Migrations applied; `npm test` green on main; latest main deployed.
   - Leak scanner + reconciliation crons live in `vercel.json` and executing
     (check cron logs).
2. **Funding (owner-executed, you verify).** Present the owner the exact
   FUNDING.md transfers (payer USDC float, fee SOL), wait for confirmation,
   verify arrival on chain, and record funding signatures in the report. **Do
   not move funds yourself; do not proceed on partial funding.**
3. **Ignition.** Enable the tick. Watch `/admin/ring`: first settlement within
   2 minutes. If the first tick fails, halt via the tick kill switch, diagnose
   from the structured logs, fix, redeploy, restart the 60-minute clock.
4. **60-minute supervised acceptance run.** Gates, measured over the full hour
   (pull final numbers from `/api/x402-ring?period=24h`, the admin read model,
   and the DB):
   - **Cadence**: ≥ 55 of 60 minutes contain ≥ 1 settlement; mean paid
     calls/minute ≥ 3 ("every minute, many times").
   - **Breadth**: ≥ 8 distinct endpoint kinds settled, including ≥ 1 tip, ≥ 1
     commerce/marketplace purchase, ≥ 1 service/intel call, and ring-settle on
     its configured cadence ("tips, payments, services bought and sold").
   - **Agency**: ≥ 3 distinct agent personas attributed in the hour's log; ≥ 1
     on-chain program interaction within the last 24h linked (task 09 cadence).
   - **Closed loop**: leak scanner run during the window reports ZERO leaks;
     every settlement counterparty ∈ `ringAllowedAddresses()`; net USDC
     position change ≈ 0 minus nothing (principal conserved) — reconcile
     payer+treasury+agent floats before vs after: |Δ| < $0.05.
   - **Fees**: mean lamports/settlement ≤ 5,100 (1-sig floor + jitter); total
     hour burn within the tick's fee math from task 04's docs; zero
     sponsor-mode settlements unless deliberately configured.
   - **Integrity**: reconciliation run during/after the window produces zero
     CRITICAL verdicts; zero-volume tripwire silent; dashboard pulse green
     throughout (screenshot).
   - **Recirculation**: ≥ 1 treasury→payer sweep landed and ledgered.
5. **The report — `tasks/x402-ring/ACCEPTANCE.md`.** Every gate with its
   measured value, evidence (signatures, log counts, screenshots, query
   output), PASS/FAIL per gate, overall verdict. If FAIL: root cause, fix
   commit, and the rerun's numbers appended — the file is the history of runs
   until the first full PASS.
6. **Steady-state handoff.** On PASS: document the standing posture in
   `docs/x402-ring-economy.md` ("Operating the ring" section): daily budgets in
   force, alert channels, the kill-switch ladder, the weekly ledger-export
   habit (`scripts/economy-ledger-export.mjs` pattern), and what "healthy"
   looks like on `/admin/ring`. Update `STRUCTURE.md` ring row status to
   live/on. Changelog entry (tags: `feature`, `infra`) — holders read: "the
   agent-to-agent economy is live: platform agents continuously buying and
   selling services, settled on-chain by our own facilitator."
7. **Rollback discipline.** Any CRITICAL leak/reconcile alert during the run:
   kill-switch ladder immediately, snapshot state, report — never "watch it for
   a bit". Funds-at-risk beats uptime.

## Files you own

`tasks/x402-ring/ACCEPTANCE.md` (new), `docs/x402-ring-economy.md`,
`STRUCTURE.md` (ring row), `data/changelog.json`. Fix commits may touch prior
tasks' files — smallest possible diffs, respecting their structure.

## Constraints

- You verify funding; the owner sends it. Never initiate a transfer from any
  non-ring wallet.
- Production env changes are recorded in the report (name + old→new, values
  redacted for secrets).
- The 60-minute clock restarts after any fix that touches the money path.
- No gate is waived. A "close enough" FAIL is a FAIL with a rerun.

## Acceptance criteria

- [ ] ACCEPTANCE.md exists with all gates measured, evidenced, and an overall
      PASS.
- [ ] The dashboard screenshot shows a green hour.
- [ ] Steady-state docs + STRUCTURE.md + changelog landed.
- [ ] Kill-switch ladder tested once live (flip tick off → pulse amber →
      flip on → recovers) and documented.

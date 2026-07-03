# x402 Ring Economy — Repair & Production-Readiness Prompt Set

The closed-loop agent-to-agent economy (docs/x402-ring-economy.md) is fully
implemented but currently produces **zero volume**. Root-cause audit (2026-07-03):

1. `X402_FACILITATOR_URL_SOLANA` defaults to PayAI (`api/_lib/env.js:742-748`) —
   settlements never reach our self-hosted facilitator.
2. `X402_SELF_FACILITATOR_ENABLED` defaults false → `/api/x402-facilitator`
   returns 503 (`api/x402-facilitator/[action].js:89-96`).
3. `ring-settle` price ($1.00) exceeds the volume loop's per-run cap ($0.05) →
   skipped with `cap_would_exceed` on every cycle
   (`api/_lib/x402/pipelines/volume-bootstrap-loop.js:59-62`, `api/_lib/x402/pay.js:182-184`).
4. Rebalancer is a permanent no-op without `X402_TREASURY_SECRET_BASE58`
   (`api/_lib/x402/pipelines/ring-rebalance.js:71-72`) → the payer float drains once and halts.
5. The Solana accept is dropped from every 402 challenge when
   `X402_FEE_PAYER_SOLANA` is unset (`api/_lib/x402-paid-endpoint.js:175-179`).
6. Cadence is one 5-minute cron (`vercel.json:4872-4875`), not per-minute.
7. Reconciliation never reads `x402_self_facilitator_log` / `x402_ring_ledger`.
8. No dashboard; ring wallets are not balance-monitored.

Each prompt below is a self-contained task for one agent. **Run them in order** —
later prompts assume earlier ones landed. 01 is read-only diagnosis; 02–10 are
code; 11 is the live activation + acceptance gate.

| # | File | Task | Depends on |
|---|---|---|---|
| 01 | [01-audit-live-state.md](01-audit-live-state.md) | Read-only live-state audit → STATUS.md | — |
| 02 | [02-facilitator-routing.md](02-facilitator-routing.md) | Route settlement to the self-hosted facilitator; fix env defaults + docs lies | 01 |
| 03 | [03-wallets-provisioning.md](03-wallets-provisioning.md) | Provision/verify the 3 ring wallets; register, monitor, floor-guard them | 01 |
| 04 | [04-per-minute-cadence.md](04-per-minute-cadence.md) | Dedicated per-minute ring tick — many paid hits/minute, cap-coherent | 02, 03 |
| 05 | [05-fee-minimization.md](05-fee-minimization.md) | Self-pay 1-sig everywhere, fee audit, ATA rent reclaim, fee budget alarm | 04 |
| 06 | [06-leak-proofing.md](06-leak-proofing.md) | Runtime leak invariants + on-chain leak scanner over all ring wallets | 03 |
| 07 | [07-reconciliation.md](07-reconciliation.md) | Close the reconciliation blind spot (facilitator log + ring ledger vs chain) | 04 |
| 08 | [08-endpoint-coverage.md](08-endpoint-coverage.md) | Every paid endpoint (tips, services, intel) exercised and actually settling | 04 |
| 09 | [09-agents-onchain-activity.md](09-agents-onchain-activity.md) | Platform agents as real x402 buyers; on-chain deployments in the loop | 08 |
| 10 | [10-ring-dashboard.md](10-ring-dashboard.md) | Live ring dashboard: per-minute hits, fees, balances, leak status | 04 |
| 11 | [11-activation-acceptance.md](11-activation-acceptance.md) | Funding, go-live, 60-minute acceptance run, PASS/FAIL report, docs | all |

## Ground rules (every agent, every prompt)

- **CLAUDE.md governs.** No mocks, no placeholders, no TODOs, real APIs only.
- **Closed loop is sacred.** Money may only move between the three ring wallets
  (payer, treasury, sponsor) and platform-controlled wallets already in
  `api/_lib/solana-signers.js`. Never add a route that can send SOL or USDC to
  any other address. `X402_EXTERNAL_ENABLED=false` and `X402_CHARITY_AUDIT_BPS=0`
  are load-bearing.
- **Lowest fees always.** Self-pay (1 signature) is the default mode; priority
  fees stay at the ~5 µlamport floor; prefer fewer/larger settlements when a
  choice exists. Any change that adds a transaction must justify it.
- **Never weaken a guard.** The anti-drain gate, allowlists, SOL floors, spend
  caps, and kill switches in `api/_lib/x402/self-facilitator.js` and
  `api/_lib/x402/pay.js` may be extended, never relaxed.
- **Secrets never touch git.** Key material lives in Vercel env /
  `.x402-ring-secrets.json` (gitignored). Verify `git diff --staged` contains no
  base58 secrets before every commit.
- **Concurrent agents share this worktree.** Stage explicit paths only; re-check
  `git status` and `git diff --staged` immediately before committing. Respect the
  "Files you own" section of your prompt.
- **Env changes** go through `vercel env` (production) AND `.env.example`
  (documented, with the correct default described). Local `.env` for testing only.
- **Prove it.** Every prompt ends with acceptance criteria. Run the verification
  commands and paste real output in your report. "Should work" is a failed task.

# x402 Ring Economy — Activation & Acceptance Log

This file is the running history of go-live attempts for the closed-loop x402
ring, one run per attempt, until the first full **PASS**. Each run records the
preflight state, every acceptance gate with its measured value and evidence, a
PASS/FAIL per gate, and the overall verdict. FAIL runs carry a root cause and
the exact actions needed to unblock; the next run appends below.

Requirement being proven (owner's words, verbatim): *endpoints hit every minute,
many times; tips, payments, services bought and sold; agents and on-chain
deployments utilized; zero leakage; lowest fees.*

Ring wallets under test:

| Role | Address | Kill floor |
|------|---------|-----------|
| Payer | `X4o2UuVNMxnrgkzVy97kPF5gmS6CLRCVJGB48VastML` | USDC float |
| Treasury | `wwwwwDxFWRn7grgr3Esrsg5C6NvDoDHSA4gaCffccrU` | — |
| Sponsor (fee payer) | `2wKupLR9q6wXYppw8Gr2NvWxKBUqm4PPJKkQfoxHDBg4` | 0.02 SOL |

---

## Run #1 — 2026-07-03 — VERDICT: **FAIL (blocked at preflight; run did not start)**

The 60-minute acceptance clock **never started**. The ring is not activated in
production and cannot be activated from this environment. Preflight surfaced one
production-breaking defect (facilitator unreachable — root-caused and fixed in
the working tree) plus a set of activation prerequisites that are owner-gated
(production env, deploy, funding confirmation). Every acceptance gate is
therefore **BLOCKED — not measurable** until ignition.

No gate was waived. This is a documented FAIL with a concrete path to the rerun,
exactly as the task requires.

### Preflight results

| # | Check (task 11 step 1) | Result | Evidence |
|---|------------------------|--------|----------|
| P1 | `node scripts/x402-ring-verify.mjs` → exit 0 | **BLOCKED** | Could not complete in this environment: the shared worktree's `node_modules` is being continuously rewritten by concurrent agents' `npm install` runs (installs OOM-killed, exit 137; `@solana/web3.js` package tree left partial → `ERR_MODULE_NOT_FOUND`). Must be run in a clean/CI checkout. Not a defect in the ring code. |
| P2 | Env set in Vercel prod; `/api/x402-ring` shows zero `config_warnings` | **FAIL** | Live `/api/x402-ring` does **not emit a `config_warnings` field at all** — the deployed build predates task 02's `ring-config.js` integration. Production is running **pre-repair code**; none of tasks 02–10 are deployed. |
| P3 | Migrations applied; `npm test` green; latest main deployed | **FAIL** | Latest main is **not** deployed (see P2). `npm test` (`vitest run && playwright test`) could not be run here for the same `node_modules` reason as P1. |
| P4 | Leak scanner + reconciliation crons live in `vercel.json` and executing | **PARTIAL / not in prod** | `x402-ring-leak-scan` cron (`*/10`) and `economy-reconcile` (`*/30`) are present in the **working-tree** `vercel.json` (the leak-scan entry is being added by a concurrent agent right now), but not in the deployed build. No ring cron is executing in production. |
| P5 | Self-hosted facilitator reachable | **FAIL → FIX APPLIED (pending deploy)** | `/api/x402-facilitator/{supported,verify,settle}` all return **404** in production. Root-caused and fixed — see "Root cause A" below. |

### Live production state at run time (evidence)

`GET https://three.ws/api/x402-ring` (2026-07-03):

```json
{
  "self_hosted_facilitator": false,
  "internal": true,
  "settlements": { "count": 0, "gross_usdc": 0, "avg_call_usdc": null },
  "fees": { "tx_count": 0, "sol_burned_lamports": 0, "sol_burned": 0 },
  "sweeps": { "count": 0, "swept_usdc": 0 },
  "wallets": {
    "treasury": { "usdc": 7.817 },
    "payer":    { "usdc": 82.144 },
    "sponsor":  { "sol": 0.243249137, "floor_sol": 0.02, "below_floor": false }
  },
  "net": { "ring_float_usdc": 89.961, "gross_volume_usdc": 0, "real_cost_usdc": 0 }
}
```

- **Ring is OFF**: `self_hosted_facilitator: false`, **0 settlements / 0 fees / 0
  sweeps over the trailing 24h**.
- **Wallets are funded** and above floors: payer ≈ $82.14 USDC, treasury ≈ $7.82
  USDC, sponsor ≈ 0.243 SOL (floor 0.02, not below). Ring USDC float ≈ $89.96.
- **Observation to verify at ignition:** between two reads ~10 min apart the
  payer fell ≈ $0.115 while the treasury rose ≈ $0.115 and sponsor SOL dropped
  ≈ 0.0038 (~19k lamports). Small movement exists on the ring wallets while the
  self-facilitator reports **zero** settlements — consistent with residual
  volume settling through the **external** default facilitator (PayAI) rather
  than our own, i.e. the closed loop is not yet closed. Confirm during the run
  that every settlement routes through `/api/x402-facilitator` and appears in
  `x402_self_facilitator_log`.

### Root cause A — self-hosted facilitator returns 404 in production (FIXED in working tree)

The self-hosted facilitator lives at `api/x402-facilitator/[action].js` and the
x402 client calls it as sub-paths — `${url}/supported` (probe),
`${url}/verify`, `${url}/settle` (see `api/_lib/x402-spec.js:626` and the
`/settle` `/verify` POSTs). With `X402_FACILITATOR_URL_SOLANA=https://three.ws/api/x402-facilitator`
those resolve to:

```
/api/x402-facilitator/supported
/api/x402-facilitator/verify
/api/x402-facilitator/settle
```

`vercel.json` uses the **legacy `routes`** array (not `rewrites`). Under that
model, dynamic `[param]` API routes are **not** auto-resolved from the
filesystem — each pretty path needs an explicit route entry, exactly as the
working `/api/portfolio/summary → /api/portfolio/[action]?action=summary` and
`/api/agents/x402/invoke → …[action]?action=invoke` entries do. The facilitator
had **no such entry**, so all three sub-paths 404. Proof of the pattern:

```
/api/portfolio/summary   -> 401   (has a route entry; reaches the function)
/api/agents/x402/invoke  -> 200   (has a route entry)
/api/kol/leaderboard     -> 404   (dynamic [action], NO route entry — same failure)
/api/x402-facilitator/*  -> 404   (dynamic [action], NO route entry)
```

Consequence: even flipping `X402_SELF_FACILITATOR_ENABLED=true` would **not**
have produced a single self-facilitated settlement — the client cannot reach
`/settle`. This is the primary reason the ring could never have ignited.

**Fix (applied to the working tree, `vercel.json`):** add the missing dynamic
route entry, mirroring the established pattern:

```json
{
  "src": "/api/x402-facilitator/([^/]+)",
  "dest": "/api/x402-facilitator/[action]?action=$1"
}
```

Verified locally: the regex maps `/supported`, `/verify`, `/settle` to
`…/[action]?action=<seg>`, and `actionFrom()` in `[action].js` reads
`req.query.action` first, so all methods (GET probe, POST verify/settle) resolve
correctly. **This fix only takes effect after a production deploy.** Facilitator
routing is task 02's domain and `vercel.json` is being concurrently edited by
other task agents, so this edit is left in the working tree for whoever lands
the task-02/03 merge — it is not committed from this task to avoid clobbering
in-flight work in the same file.

### Root cause B — the repair chain (tasks 02–10) is not merged or deployed

The working tree shows tasks 02–10 **mid-flight**: `api/_lib/x402/pay.js`,
`pipelines/volume-bootstrap-loop.js`, `ring-config.js`,
`wallet-balance-monitor.js`, the `x402-ring-leak-scan` cron, and the
`/admin/ring` dashboard route are all uncommitted edits in the shared worktree,
and `admin/ring.html` (the task 10 page) does not exist yet. Production runs the
pre-repair build (confirmed by the absent `config_warnings` field, P2). The
acceptance run is only meaningful **after** the full chain is committed, `npm
test` is green on main, and main is deployed.

### Root cause C — activation is owner-gated (this environment cannot ignite)

Task 11 steps 2–3 (funding confirmation, enabling the tick) require production
control this environment does not have:

- **No Vercel production auth** here (`vercel whoami` hangs/terminates; no
  `VERCEL_TOKEN`). Cannot set/inspect production env, cannot flip
  `X402_SELF_FACILITATOR_ENABLED` or the volume tick, cannot deploy the routing
  fix. (Consistent with the recorded repo-access limits.)
- **Funding is owner-executed by rule** ("Do not move funds yourself"). Wallets
  already hold balances (above), but funding **signatures** must be recorded by
  the owner at ignition, and `tasks/x402-ring/FUNDING.md` (the task 03
  deliverable this task references) is **absent** — funding amounts are only in
  `scripts/x402-ring-setup.mjs`.

### Kill-switch ladder — note on naming

The task brief names `X402_RING_TICK_ENABLED` as the first-rung tick kill
switch. **That env var does not exist in the code.** The real switches, in
escalation order, are:

1. `X402_AUTONOMOUS_ENABLED=false` — halts all autonomous spend, including the
   volume tick that drives ring cadence (the volume loop runs as USE-026 inside
   the `x402-autonomous-loop` cron; there is no separate `X402_RING_TICK_ENABLED`
   gate). This is the correct first-rung "stop the tick" control.
2. `X402_SELF_FACILITATOR_ENABLED=false` — the facilitator stops settling
   (returns 503); nothing new settles through the ring.

The ladder-test acceptance item (flip tick off → pulse amber → flip on →
recovers) must be run against `X402_AUTONOMOUS_ENABLED` and documented at
ignition. Whoever finalizes task 04 should either add the `X402_RING_TICK_ENABLED`
switch the brief specifies or the steady-state docs should standardize on
`X402_AUTONOMOUS_ENABLED` as the tick control.

### Acceptance gates — all BLOCKED (run did not start)

| Gate | Target | Measured | Verdict |
|------|--------|----------|---------|
| Cadence | ≥55/60 min with ≥1 settlement; mean ≥3 paid calls/min | 0 settlements/24h | **BLOCKED** |
| Breadth | ≥8 endpoint kinds; ≥1 tip, ≥1 commerce, ≥1 service; ring-settle on cadence | 0 | **BLOCKED** |
| Agency | ≥3 agent personas; ≥1 on-chain program interaction /24h linked | 0 | **BLOCKED** |
| Closed loop | 0 leaks; every counterparty ∈ allowlist; principal \|Δ\| < $0.05 | not run | **BLOCKED** |
| Fees | mean ≤5,100 lamports/settlement; 0 sponsor-mode unless configured | 0 settlements | **BLOCKED** |
| Integrity | 0 CRITICAL reconcile verdicts; tripwire silent; dashboard green | dashboard page not deployed | **BLOCKED** |
| Recirculation | ≥1 treasury→payer sweep landed and ledgered | 0 sweeps/24h | **BLOCKED** |

### Runbook to the rerun (Run #2) — owner actions

1. **Land the repair chain.** Commit tasks 02–10 (including the `vercel.json`
   facilitator route entry from Root cause A and `admin/ring.html` for task 10),
   get `npm test` green on `main` in a clean checkout, deploy `main` to Vercel
   production.
2. **Set production env** (record name + old→new in Run #2; redact secret
   values). At minimum, per `scripts/x402-ring-setup.mjs`:
   - `X402_SELF_FACILITATOR_ENABLED=true`
   - `X402_FACILITATOR_URL_SOLANA=https://three.ws/api/x402-facilitator`
   - `X402_EXTERNAL_ENABLED=false`, `X402_CHARITY_AUDIT_BPS=0`
   - `X402_RING_SELF_PAY=true`
   - `X402_PRICE_RING_SETTLE`, `X402_AUTONOMOUS_DAILY_CAP_ATOMIC`,
     `X402_VOLUME_PER_RUN_CAP_ATOMIC`, `X402_SPONSOR_SOL_FLOOR_LAMPORTS=20000000`
   - the three ring secrets (`X402_FEE_PAYER_SECRET_BASE58`,
     `X402_TREASURY_SECRET_BASE58`, payer secret) — never in git.
3. **Verify reachability post-deploy** (should be 200, not 404):
   `curl https://three.ws/api/x402-facilitator/supported`
4. **Preflight green:** `node scripts/x402-ring-verify.mjs` → exit 0 in a clean
   checkout; `/api/x402-ring` returns `config_warnings: []`.
5. **Confirm funding** on chain and record the funding signatures here.
6. **Ignite:** enable the tick (`X402_AUTONOMOUS_ENABLED` on), watch
   `/admin/ring` for the first settlement within 2 minutes. If the first tick
   fails, halt, diagnose from structured logs, fix, redeploy, restart the clock.
7. **Run the 60-minute clock** and fill Run #2's gate table with real numbers,
   evidence (signatures, log counts, dashboard screenshot, query output), and an
   overall verdict.

### Steady-state handoff — intentionally NOT landed this run

Per task 11 step 6, the steady-state docs (`docs/x402-ring-economy.md`
"Operating the ring"), the `STRUCTURE.md` ring-row status flip to **live/on**,
and the holder-facing "the economy is live" changelog entry are **gated on
PASS**. This run is a FAIL, so landing any "it's live" claim would be false.
They are deferred to the run that achieves the first full PASS.

# Task 01 — Live-State Audit of the x402 Ring Economy

**Date:** 2026-07-03 (~04:40 UTC)
**Mode:** READ-ONLY. No env writes, no code changes, no funds moved, no DB writes.
**Auditor environment access:** codespace shell only. **No `vercel` CLI**, **no
`DATABASE_URL`**, **no `psql`/`pg`**, **no Helius/RPC key**, no `.env` (only
`.env.example`). Evidence therefore comes from: (a) **live HTTP probes** against
`https://three.ws`, and (b) **public Solana mainnet RPC**
(`https://api.mainnet-beta.solana.com`, no key needed). The env truth table below
is **inferred** from those two sources — it is not a `vercel env ls` dump, and
each row states the evidence and confidence. This limitation is called out
wherever it changes a verdict.

---

## ⚠️ Headline finding — the premise is inverted

**The ring is NOT producing zero volume. It is settling real USDC on-chain right
now — roughly one settlement per minute — and has been continuously since
2026-07-02.** The "zero" exists only inside the `/api/x402-ring` report, which
reads a table (`x402_self_facilitator_log`) that is empty because the self-hosted
facilitator is disabled. The actual settlements route through the sponsor-co-signed
path and never write that table, so **the scoreboard is blind to the volume the
chain proves is flowing.**

The most recent on-chain settlement observed during this audit was
**2026-07-03T04:38:25Z** — a $0.001 USDC transfer from the ring payer to the ring
treasury, co-signed by the sponsor (fee payer), landing while this report was
being written.

So the real problem is two-fold, and neither part is "the loop is dead":
1. **Accounting blind spot** — `/api/x402-ring` reports 0 settlements / $0 gross
   while ~1,500 real settlements have landed since 2026-07-02.
2. **Fee-inefficient mode** — the volume that *is* flowing is thousands of tiny
   $0.001 two-signature payments (10,001 lamports each), i.e. the exact
   fee-maximising mode `docs/x402-ring-economy.md` warns against. The fee-optimal
   `ring-settle` ($1.00, fewer/larger) path, the self-hosted facilitator, and the
   rebalancer are all disabled.

---

## Section 1 — Env truth table (inferred; no `vercel env ls` access)

`vercel` CLI is not installed and no token is present, so this table is
**reconstructed from live probes + chain**, not read from Vercel. Confidence and
evidence per row. "Present value" shows non-secret public values only; secrets are
recorded as presence, never printed.

| Var | Verdict | Evidence | Conf. |
|---|---|---|---|
| `X402_SELF_FACILITATOR_ENABLED` | **NOT `true` (disabled)** | `/api/x402-ring` → `self_hosted_facilitator:false`; `/api/x402-facilitator/*` unreachable (404 SPA). | High |
| `X402_FACILITATOR_URL_SOLANA` | **default (PayAI)** | `/api/x402-status` lists solana facilitator `https://facilitator.payai.network` `ok:true`. No override visible. | High |
| `X402_PAY_TO_SOLANA` | **SET** = `wwwwwDxFWRn7grgr3Esrsg5C6NvDoDHSA4gaCffccrU` | `/api/x402-status` `env` block + every 402 challenge `payTo`. | High |
| `X402_TREASURY_SECRET_BASE58` | **NOT SET** | `/api/x402-ring` `sweeps.count:0`; rebalancer no-ops without it (`ring-rebalance.js:71-72`); treasury is filling (7.7 USDC) and never swept. | High |
| `X402_FEE_PAYER_SOLANA` | **SET** = `2wKupLR9q6wXYppw8Gr2NvWxKBUqm4PPJKkQfoxHDBg4` | `/api/x402-status` `env.X402_FEE_PAYER_SOLANA`; advertised as `extra.feePayer` in every challenge. | High |
| `X402_FEE_PAYER_SECRET_BASE58` | **SET** | Sponsor `2wKup…` is a **co-signer on every settlement tx on chain** — the key is loaded somewhere and signing. | High |
| `X402_SEED_SOLANA_SECRET_BASE58` | **SET** | `x402-seed-cron` is actively producing settlements; payer `X4o2…` signs each. | High |
| `X402_AGENT_SOLANA_SECRET_BASE58` | undeterminable | Only a fallback for the seed key; seed key is set, so this is untested. | — |
| `X402_RING_SELF_PAY` | **NOT `true`** | Settlements are **2-signature, fee = 10,001 lamports** (buyer + sponsor). Self-pay would be 1 sig / ~5,000 lamports (`docs` Lever 2). | High |
| `X402_PRICE_RING_SETTLE` | **NOT SET (default $1.00)** | POST `/api/x402/ring-settle` 402 challenge advertises `amount:"1000000"` = default `1_000_000`. | High |
| `X402_VOLUME_PER_RUN_CAP_ATOMIC` | **NOT SET (default $0.05)** | Cannot read directly; `volume-bootstrap-loop.js:59-62` default `50_000`. Consistent with ring-settle being skipped. | Med |
| `X402_AUTONOMOUS_DAILY_CAP_ATOMIC` | undeterminable | No unauthenticated surface exposes it. | — |
| `X402_AUTONOMOUS_ENABLED` | undeterminable | Cron is `Bearer CRON_SECRET`-gated; cannot invoke. (Note: volume is driven by `x402-seed-cron`, a *separate* per-minute driver, which is clearly live.) | — |
| `X402_EXTERNAL_ENABLED` | undeterminable | No unauthenticated surface. | — |
| `X402_CHARITY_AUDIT_BPS` | undeterminable | No unauthenticated surface. | — |
| `X402_SPONSOR_SOL_FLOOR_LAMPORTS` | **NOT SET (default 0.02 SOL)** | `/api/x402-ring` → `sponsor.floor_sol:0.02` = default `20_000_000`. | High |
| `X402_SELF_FACILITATOR_PAYTO_ALLOWLIST` | undeterminable | Facilitator route is 404; cannot probe allowlist. | — |
| `SOLANA_RPC_URL` / `HELIUS_API_KEY` | **SET (working)** | `/api/x402-ring` returns live on-chain balances → server-side RPC is configured and healthy. | High |
| `DATABASE_URL` | **SET (working)** | `/api/x402-ring` → `db_available:true` and DB queries return rows (counts). | High |

---

## Section 2 — Live HTTP probes (real output)

### 2a. `GET /api/x402-facilitator/supported` — expected 503-if-off; **actually 404**
```
HTTP 404   (returns the SPA 404 HTML, not JSON)
```
Also tried `POST /api/x402-facilitator/verify` → **404 SPA**, and
`GET /api/x402-facilitator?action=supported` → **404 SPA**. The entire
`/api/x402-facilitator/*` route resolves to the site's 404 page — the function is
**not routed/reachable in production at all** (worse than the hypothesised 503).
The code path that *would* return 503 (`[action].js:89-96`) is never reached
because the request never lands on the function. Net effect is the same:
self-hosted facilitator does not settle anything.

### 2b. `GET /api/x402-ring?period=7d` — the report says zero
```json
{"ok":true,"self_hosted_facilitator":false,"internal":true,
 "period":"7d","db_available":true,
 "settlements":{"count":0,"gross_usdc":0,"avg_call_usdc":null},
 "fees":{"tx_count":0,"sol_burned_lamports":0,"sol_burned":0,...},
 "sweeps":{"count":0,"swept_usdc":0},
 "wallets":{
   "treasury":{"address":"wwwwwDxFWRn7grgr3Esrsg5C6NvDoDHSA4gaCffccrU","usdc":7.698},
   "payer":{"address":"X4o2UuVNMxnrgkzVy97kPF5gmS6CLRCVJGB48VastML","usdc":82.26289},
   "sponsor":{"address":"2wKupLR9q6wXYppw8Gr2NvWxKBUqm4PPJKkQfoxHDBg4","sol":0.247539808,"floor_sol":0.02,"below_floor":false}},
 "net":{"ring_float_usdc":89.96089,"gross_volume_usdc":0,"real_cost_usdc":0},
 "recent":[]}
```
`period=30d` returns the same `count:0`. **Root cause of the "0":** the report
queries `x402_self_facilitator_log WHERE action='settle' AND ok=true`
(`api/x402-ring.js:108-115`) and `x402_ring_ledger WHERE kind='sweep'`
(`:128-133`). The self-facilitator is disabled → the first table is empty; the
rebalancer is disabled → the second is empty. **The report has no visibility into
settlements that route through the sponsor-co-signed / PayAI path** (Section 4
proves those are happening). `db_available:true` and the queries returning `0`
(not erroring) confirm both tables **exist** — the migration was applied; they are
simply empty.

### 2c. `POST /api/x402/ring-settle` — 402 challenge, price = $1.00
```json
{"accepts":[
  {"scheme":"exact","amount":"1000000","network":"solana:5eykt4Us…",
   "payTo":"wwwwwDxFWRn7grgr3Esrsg5C6NvDoDHSA4gaCffccrU",
   "asset":"EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
   "extra":{"name":"USDC","decimals":6,"feePayer":"2wKupLR9q6wXYppw8Gr2NvWxKBUqm4PPJKkQfoxHDBg4"}},
  {"scheme":"exact","amount":"10000000","asset":"FeMbDoX7…pump","extra":{"name":"THREE",…}}]}
```
`amount:"1000000"` = **$1.00** (default `X402_PRICE_RING_SETTLE`). A Solana USDC
accept **is present**, `payTo`=treasury, `feePayer`=sponsor. `discoverable:false`
(correct — internal). (`GET` returns `405 use POST`, as designed.)

### 2d. `GET /api/x402-status` — facilitator health
```json
HTTP 503  {"ok":false,"x402Version":2,
 "facilitators":[
   {"network":"eip155:8453","url":"https://x402.sperax.io","ok":false,"reason":"/supported probe failed: status 404"},
   {"network":"solana:5eykt4Us…","url":"https://facilitator.payai.network","ok":true,
    "reason":"facilitator advertises exact/solana…"}],
 "env":{"X402_PAY_TO_SOLANA":"wwwwwDxFWRn7grgr3Esrsg5C6NvDoDHSA4gaCffccrU",
        "X402_FEE_PAYER_SOLANA":"2wKupLR9q6wXYppw8Gr2NvWxKBUqm4PPJKkQfoxHDBg4",
        "X402_ASSET_MINT_SOLANA":"EPjFWdd5…","X402_MAX_AMOUNT_REQUIRED":"1000"},
 "siwx":{"configured":true,"paymentsRowCount":22,"noncesRowCount":0}}
```
The `503`/`ok:false` is driven by the **Base** facilitator (`x402.sperax.io`)
failing its `/supported` probe (404). The **Solana** facilitator (PayAI) is
`ok:true`. Solana settlement rail is healthy; the status endpoint reports overall
`ok:false` because one configured facilitator (Base) is down. The advertised
Solana `feePayer` is our sponsor — **so `X402_FEE_PAYER_SOLANA` is set and the
Solana accept is live.**

### 2e. `GET /api/x402/dance-tip` — cheap catalog endpoint, 402 challenge
```json
HTTP 402  {"accepts":[
  {"scheme":"exact","amount":"1000","network":"solana:5eykt4Us…",
   "payTo":"wwwwwDxFWRn7grgr3Esrsg5C6NvDoDHSA4gaCffccrU",
   "asset":"EPjFWdd5…","extra":{"feePayer":"2wKupLR9q6wXYppw8Gr2NvWxKBUqm4PPJKkQfoxHDBg4"}},
  {"scheme":"exact","amount":"10000000","asset":"FeMbDoX7…pump","extra":{"name":"THREE"}}]}
```
`amount:"1000"` = **$0.001**. This is the endpoint the per-minute driver actually
pays (Section 4). Solana accept present, feePayer set.

---

## Section 3 — Database evidence (derived; no direct DB access)

No `DATABASE_URL`/`psql` locally, so table state is derived from the deployed
report's query behaviour plus on-chain ground truth:

- **`x402_self_facilitator_log` — EXISTS, effectively 0 settle rows.**
  `/api/x402-ring` queries it (`api/x402-ring.js:108-115`) and returns
  `settlements.count:0` with `db_available:true` and no error → the table exists
  (query planned/ran) but has **no `action='settle', ok=true` rows** in 7d or 30d.
  Expected: the self-facilitator is the only writer of this table
  (`x402-facilitator/[action].js:44-55 logOp`), and it is disabled.
- **`x402_ring_ledger` — EXISTS, 0 sweep rows.** Queried at
  `api/x402-ring.js:128-133`; `sweeps.count:0`. The only writer is the rebalancer
  (`ring-rebalance.js:170-174`), which no-ops without `X402_TREASURY_SECRET_BASE58`.
- **`x402_wallets` / `x402_ring_wallets`** — no unauthenticated surface exposes
  row counts; **undeterminable** from here. Evidence missing: DB read access.
- **`x402_autonomous_log`** (last-50 / group-by-status) and **`x402_volume_metrics`**
  (per-endpoint last-paid) — the task asks for these to date the stop/start of the
  loop. **No unauthenticated API surfaces them** (grep of `api/*.js` found no
  public reader of either table), and I have no DB access. **Undeterminable via
  the tools available.** *Evidence missing: `DATABASE_URL`.* This gap is fully
  compensated by Section 4 — the chain is the authoritative settlement ledger and
  gives an exact, second-resolution timeline that does not depend on any app table.

**Migration status:** `2026-07-01-x402-ring-economy.sql` was **applied** — both
ring tables answer queries without a "relation does not exist" error.

---

## Section 4 — On-chain wallet & settlement state (public RPC — ground truth)

Public mainnet RPC, no key. All three role wallets and the two USDC ATAs involved
in settlement:

| Role | Owner pubkey | SOL | USDC | USDC ATA |
|---|---|---|---|---|
| treasury | `wwwwwDxFWRn7grgr3Esrsg5C6NvDoDHSA4gaCffccrU` | 0.1022 | 7.70 | `HgwbNyweQUiV5diWJ1a7ocxgzf3AYSLhTpphEYRLujtN` |
| payer | `X4o2UuVNMxnrgkzVy97kPF5gmS6CLRCVJGB48VastML` | 0.3372 | 82.26 | `4eE8iCmTAdMpwLaqKvn2wj2g5v2TV31fRVoWbwyxrgFh` |
| sponsor | `2wKupLR9q6wXYppw8Gr2NvWxKBUqm4PPJKkQfoxHDBg4` | 0.2472 | — | (fee payer only) |

**Ring float = 89.96 USDC** (payer 82.26 + treasury 7.70), intact — **not
drained.** Sponsor 0.247 SOL, above the 0.02 floor.

### The settlements are real and continuous
Decoded newest payer settlement (`getTransaction`, jsonParsed):
```
tx JX4QAHT16Ljph…  blockTime 2026-07-03T04:33:25Z   fee 10001 lamports
signers: 2wKup… (sponsor / feePayer) , X4o2… (payer / authority)
ix[2] spl-token transferChecked  authority=X4o2…  mint=EPjFWdd5…(USDC)
      source=4eE8…(payer ATA)  destination=HgwbNy…(treasury ATA)  amount=1000  ($0.001)
preTokenBalances:  payer 82.26089 , treasury 7.700
postTokenBalances: payer 82.25989 , treasury 7.701     ← payer −0.001, treasury +0.001
```
Newest treasury settlement fee/signers (`2Q4bjj…`, 04:38:25Z):
`fee: 10001 lamports | signers: 2 | 2wKup…, X4o2…`.

### Cadence — one settlement per minute
Newest 15 treasury-ATA inbound settlements, all `ok`, spacing in seconds:
```
04:38:25, 04:37:25, 04:36:29, 04:35:25, 04:35:10, 04:34:25, 04:33:25,
04:32:25, 04:31:25, 04:30:25, 04:30:13, 04:30:10, 04:29:26, 04:28:25, 04:27:25
gaps(s): 60,56,64,15,45,60,60,60,60,12,3,44,61,60   → ~1 per minute
```
This matches the `x402-seed-cron` schedule `* * * * *` in `vercel.json:4869-4870`.
**Note (efficiency defect):** `x402-seed-cron.js` builds `X402_SEED_BATCH_SIZE`
(default **60**) transactions per tick, but `buildPaymentTx` (`:130-166`) produces
**byte-identical** txs (same amount, source, dest, single blockhash, single
signer) → identical signatures → **only one unique settlement lands per tick**;
the other 59 are duplicate-signature no-ops. So the effective rate is ~1/min, not
60/min — the intended "60 real micropayments per tick" is not being achieved on
chain.

### Last-signature timeline per ATA (paged, up to 6k sigs)
```
treasury USDC ATA (HgwbNy…):  1523 sigs, 0 errored
   2026-06-21: 32   2026-06-22: 10   2026-06-23: 4
   << largest gap ~8.5 days (12,291 min), ending ~2026-06-23T19:06Z >>
   2026-07-02: 1124  2026-07-03: 353   (newest 04:38:25Z, ongoing)
payer USDC ATA (4eE8…):  1471 sigs, 0 errored
   2026-06-27: 1     2026-07-02: 1117  2026-07-03: 353  (newest 04:38:25Z)
```
No errored settlement signatures on either ATA — every landed settlement succeeded.

---

## Section 5 — Chronology (stop/start date + mechanism)

The chain gives an unambiguous timeline (this supersedes the missing
`x402_autonomous_log` DB evidence):

- **2026-06-21 → 06-23:** sporadic settlements to treasury (32 / 10 / 4 per day) —
  early manual/low-rate activity.
- **2026-06-23T19:06Z → 2026-07-02:** an **~8.5-day dead gap**, zero settlements.
  This aligns with the known **June 2026 Vercel cron outage** (an account block
  killed all `vercel.json` crons; see `memory/economy-cron-outage-2026-06.md` and
  commit `b15f97b0c` "external cron failover heartbeat driving all vercel.json
  crons from GitHub Actions"). With no cron firing, `x402-seed-cron` did not run →
  no settlements.
- **2026-07-02:** settlements **resume hard — 1124 in the day** — coincident with
  the GitHub-Actions heartbeat failover restoring cron execution. This is the
  "restart," not a stop.
- **2026-07-03 (today):** **353 settlements so far and counting**, ~1/min, newest
  04:38:25Z during this audit.

**Mechanism of the reported "zero":** never a chain stoppage. The
`/api/x402-ring` report has *always* shown zero for this run because it reads
`x402_self_facilitator_log`, which the disabled self-hosted facilitator never
writes. The settlements route through the sponsor-co-signed path (advertised
feePayer = our sponsor; facilitator default = PayAI) and land on chain without
touching that table. **The loop's real stop was the 8.5-day cron outage
(2026-06-23 → 07-02); it restarted 2026-07-02 and is live now.** What is genuinely
"off" (and always was) is the *designed* fee-optimal closed loop: self-hosted
facilitator, `ring-settle` large payments, and the rebalancer.

---

## Section 6 — Hypothesis verdicts + task mapping

| # | Static hypothesis | Verdict | Evidence |
|---|---|---|---|
| 1 | `X402_FACILITATOR_URL_SOLANA` defaults to PayAI; settlement never reaches self-facilitator | **CONFIRMED** (but not fatal) | `/api/x402-status` solana facilitator = `facilitator.payai.network`, `ok:true`. Settlement *does* succeed on chain via the sponsor-co-signed path — routing default is true, but it is **not** what stops volume. |
| 2 | `X402_SELF_FACILITATOR_ENABLED` false → facilitator 503 | **CONFIRMED (disabled); PARTIAL on "503"** | Self-facilitator is off (`self_hosted_facilitator:false`). The route returns **404 (unrouted), not 503** — the function is unreachable in prod, so the 503 branch is never even hit. Consequence (empty `x402_self_facilitator_log`, blind report) confirmed. |
| 3 | `ring-settle` $1.00 > per-run cap $0.05 → `cap_would_exceed` every cycle | **CONFIRMED (for ring-settle only)** | Live 402: ring-settle `amount:1000000` ($1.00); `VOLUME_PER_RUN_CAP_ATOMIC` default `50000` ($0.05). ring-settle is skipped by the volume loop — but the cheap $0.001 endpoints settle fine, so this causes **fee-inefficiency**, not zero volume. |
| 4 | Rebalancer no-ops without `X402_TREASURY_SECRET_BASE58` | **CONFIRMED** | `sweeps.count:0`; `x402_ring_ledger` empty; treasury filling (7.70 USDC) with no sweep-back. Not yet fatal only because payments are $0.001. |
| 5 | Solana accept dropped when `X402_FEE_PAYER_SOLANA` unset | **REFUTED** | Fee payer **is set** (`2wKup…`); Solana accept present in every 402 challenge; sponsor co-signs on chain. |
| 6 | Only driver is `/api/cron/x402-autonomous-loop` @ `*/5`; `X402_AUTONOMOUS_ENABLED=false` kills it | **REFUTED** | There is a **second, separate driver** — `x402-seed-cron` @ `* * * * *` (`vercel.json:4869-4870`) — and it is the one producing the live per-minute volume. Whether the `*/5` autonomous loop is enabled is undeterminable from here, but it is not "the only driver." |

### Which downstream task each finding maps to
- **Blind report / `x402_self_facilitator_log` unwritten (Headline, §2b, §5)** →
  **07 (reconciliation)** + **10 (dashboard)**: the report must count real
  on-chain settlements (or the sponsor-co-signed path must log to the ledger), not
  only self-facilitator rows.
- **Facilitator route 404 + self-facilitator disabled (§2a, H2)** →
  **02 (facilitator-routing)**: deploy/route `/api/x402-facilitator`, enable it,
  and point `X402_FACILITATOR_URL_SOLANA` at it so settlement is in-house and
  logged.
- **PayAI still the active Solana facilitator (§2d, H1)** → **02**.
- **ring-settle $1 skipped by $0.05 cap; fee-inefficient $0.001 spam (H3, §4)** →
  **04 (per-minute cadence, cap-coherent)** + **05 (fee minimization)**: raise
  `X402_PRICE_RING_SETTLE` + caps together, enable self-pay (1-sig) — currently
  2-sig at 10,001 lamports.
- **60 identical txs/tick collapse to 1 settlement (§4)** → **04** + **08
  (endpoint coverage)**: `x402-seed-cron.buildPaymentTx` needs a per-tx
  differentiator (memo/nonce) or the batch is wasted.
- **Rebalancer disabled, treasury not swept (H4)** → **03 (wallets/provisioning:
  register `X402_TREASURY_SECRET_BASE58`)**.
- **2-sig sponsor mode, not self-pay (§4, env `X402_RING_SELF_PAY` not true)** →
  **05 (fee minimization)**.
- **8.5-day cron outage / GH-Actions failover dependency (§5)** → **04** +
  **11 (activation & acceptance: prove cron reliability under the failover)**.
- **`x402_autonomous_log` / `x402_volume_metrics` have no read surface (§3)** →
  **07** + **10**: expose them so the stop/start is observable without chain
  spelunking.

---

## Acceptance criteria

- [x] `STATUS.md` exists with all six sections and real command output.
- [x] Every hypothesis marked CONFIRMED / REFUTED / PARTIAL with evidence.
- [x] Stop/start date + mechanism identified: **stopped 2026-06-23T19:06Z (8.5-day
      Vercel cron outage), restarted 2026-07-02, live at ~1 settlement/min now.**
      The `/api/x402-ring` "zero" is an accounting artifact (empty
      `x402_self_facilitator_log`), not a settlement stoppage.
- [x] **Zero mutations performed.** No env writes, no code edits, no funds moved,
      no DB writes. Only read-only HTTP GET/POST-challenge probes and read-only
      Solana RPC queries were issued.

### Proof of no mutation (working tree)
**The only file this audit created is `tasks/x402-ring/STATUS.md`.** This worktree
is **shared with concurrent agents** running the downstream code tasks (02–11)
per `README.md`, so `git status` also shows *their* in-flight edits — none of
which this read-only audit touched. `git status --short` at completion:
```
 M api/_lib/x402/wallet-balance-monitor.js        (another agent — task 03/10)
 M tests/api/x402-spec.test.js                     (another agent)
 M tests/x402-ring-reconciliation.test.js          (another agent — task 07)
?? api/_lib/x402/pipelines/fee-audit.js            (another agent — task 05)
?? tasks/x402-ring/STATUS.md                        ← THIS report (my only write)
```
I issued only read-only HTTP GET/POST-challenge probes and read-only Solana RPC
queries, and wrote one file (this report) plus temp scripts in the session
scratchpad (outside the repo). No env writes, no funds moved, no DB writes, and no
edit to any `api/`, `src/`, `tests/`, or config file. The changes shown above
belong to the parallel task agents and were present-and-growing independently of
this audit.

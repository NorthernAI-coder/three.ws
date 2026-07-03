# Production log triage

Every recurring `error`/`warning` signature that shows up in a Vercel log
export, mapped to its **root cause**, the **exact resolution**, and **who** can
apply it. Built from the `three-ws-character-studio` export on 2026-07-03.

The headline finding, so nobody re-derives it: **none of these are code
defects.** Each line is the platform's own graceful-degradation or fail-closed
machinery working correctly — a fallback firing, a circuit breaker holding, a
guard refusing to spend. They are all resolved by an **environment / billing /
activation** action in the Vercel or upstream dashboards, not by a code change.
Silencing any of them in code would hide a real production signal, so don't.

Severity legend: 🔴 owner decision (money / security / billing) · 🟡 set an env
var or add quota · 🟢 self-healing, no action needed.

---

## 🔴 `[ring-invariants] SPEND PATH DISABLED in x402-autonomous-loop`

```
guard env violated:
• X402_CHARITY_AUDIT_BPS = <unset> (expected 0)
• X402_FACILITATOR_URL_SOLANA / X402_SELF_FACILITATOR_ENABLED = enabled=false url=…payai… (expected self)
```

- **Source:** [api/_lib/x402/ring-allowlist.js](../../api/_lib/x402/ring-allowlist.js) `assertRingSpendInvariants`, called each tick by [api/cron/x402-autonomous-loop.js](../../api/cron/x402-autonomous-loop.js).
- **What it means:** the autonomous spend loop is *enabled* but the closed-loop
  guard env is only **half-configured** — `X402_EXTERNAL_ENABLED=false` is set
  (good), but `X402_CHARITY_AUDIT_BPS` is unset and the Solana facilitator still
  points at an external host. The loop **fails CLOSED**: no money moves. It logs
  `error` and fires one throttled critical alert per hour because a partially-off
  guard on a money path is exactly what you want screamed at you.
- **This is not a false alarm** — it accurately reports an unfinished ring
  activation. Resolve it by finishing **or** pausing, not by muting.

**Resolve — pick one (owner):**

1. **Pause cleanly until you're ready to arm the ring** (recommended if you are
   not actively activating): set `X402_AUTONOMOUS_ENABLED=false`. The loop then
   returns `skipped` with **no error and no alert** (guard check never runs).
2. **Finish arming the ring** (moves real USDC — deliberate go-live): set the
   documented safe values from [.env.example](../../.env.example) §x402-ring —
   `X402_CHARITY_AUDIT_BPS=0`, `X402_SELF_FACILITATOR_ENABLED=true`, and either
   unset `X402_FACILITATOR_URL_SOLANA` or point it at
   `https://three.ws/api/x402-facilitator`. Acceptance steps live in
   [tasks/x402-ring/11-activation-acceptance.md](../../tasks/x402-ring/11-activation-acceptance.md).

---

## 🔴 `[world-health] world is UNPROTECTED — ADMIN_CODE is not set`

- **Source:** [api/cron/world-health.js](../../api/cron/world-health.js).
- **What it means:** the `world.three.ws` Cloud Run service is serving without
  `ADMIN_CODE`, so every visitor has build rights. Logged as `warning`.
- **Resolve (owner):** set `ADMIN_CODE` on the world service and re-run
  `deploy/world/apply-hardening.sh`. It's a security credential the owner must
  choose and store — not something to auto-generate here.

---

## 🔴 `[text-to-image] replicate billing/credit failure: insufficient credit`

- **Source:** the forge text→image lane.
- **What it means:** the Replicate account is out of credit. The forge already
  **degrades to the free NVIDIA NIM lane** (see the `[forge] paid … lane
  unavailable; degrading to free NVIDIA NIM` line), so image generation keeps
  working at lower fidelity.
- **Resolve (owner):** add credit at `replicate.com/account/billing`. No code
  change — the fallback is already correct.

---

## 🟡 `[x402-audit] insert failed … db query exceeded 3000ms deadline`

- **Source:** [api/_lib/x402/audit-log.js](../../api/_lib/x402/audit-log.js) `logPaymentEvent`.
- **What it means:** the Neon DB is saturated, so best-effort audit writes on the
  hot `/api/x402/dance-tip` route time out at their 3 s fast-fail budget. This is
  **fire-and-forget** — the payment was already decided and the response already
  sent (the accompanying `402` is the normal x402 challenge, not a failure). The
  write is retried, fast-failed, and the log is throttled to one line/minute with
  a suppressed-count digest by design.
- **Resolve (owner, capacity):** the fix is DB headroom, not code — scale the
  Neon compute or add a pooler so single-row inserts settle well under 3 s. For a
  deploy that wants more durability headroom on the write itself, raise
  `X402_AUDIT_WRITE_TIMEOUT_MS` (500–15000, default 3000). Losing these rows loses
  only telemetry, never a payment.

---

## 🟢 `[cache] redis SET failed / degraded / circuit opened … memory fallback`

- **Source:** [api/_lib/cache.js](../../api/_lib/cache.js).
- **What it means:** Upstash REST SETs are timing out (a store in a region far
  from the function region is the usual cause). The cache adapter already: fails
  fast at `CACHE_REDIS_CMD_TIMEOUT_MS`, opens a **circuit breaker** after 5
  consecutive failures, adds a **SET-suppression gate** so degraded writes skip
  Redis entirely, and **throttles** every warning to one line/minute. Reads keep
  being served; nothing is on the request critical path.
- **Resolve:** 🟢 nothing required — it self-heals when Upstash recovers (you'll
  see `redis SET recovered`). 🟡 optional: move the cache to a same-region store,
  or provision a dedicated `UPSTASH_CACHE_REST_URL/TOKEN` so best-effort cache
  writes don't contend with the fail-closed rate limiter, or bump
  `CACHE_REDIS_CMD_TIMEOUT_MS` for a distant store.

---

## 🟢 `[three-holders-snapshot] refresh deferred (transient upstream): Solana error #8100002`

- **Source:** [api/cron/three-holders-snapshot.js](../../api/cron/three-holders-snapshot.js).
- **What it means:** Helius DAS returned a 429 (rate limit). The cron classifies
  it as **transient** (via `isRpcRateLimited` on the structured status code),
  logs a `warning` not an `error`, leaves the prior good snapshot intact, and
  self-heals on the next 5-minute tick. Public reads are unaffected.
- **Resolve:** 🟢 nothing required. 🟡 if it's frequent, raise the Helius plan/quota.

---

## 🟢 `[balances] helius quota/rate-limited — skipping it … using public RPC`

- **Source:** [api/_lib/balances.js](../../api/_lib/balances.js) (and the token-market path).
- **What it means:** Helius hit `max usage reached`; the code backs off Helius for
  a few minutes and serves from the **public Solana RPC** in the meantime.
- **Resolve:** 🟢 nothing required — the public-RPC fallback is working. 🟡 raise
  the Helius quota to avoid the degraded window.

---

## 🟢 `[forge] paid TRELLIS lane unavailable (N); degrading text→3D to free NVIDIA NIM` / `nim flux failed, falling back: nim flux timed out`

- **Source:** the forge generation router.
- **What it means:** the paid TRELLIS lane returned a 402/timeout, so forge fell
  back to the free NVIDIA NIM lane, and when a specific NIM model timed out it
  fell back again. Layered fallbacks — generation keeps succeeding.
- **Resolve:** 🟢 nothing required. Tied to the same Replicate billing item above
  if you want the paid high-fidelity lane back.

---

## The 5-minute owner checklist

Everything red/yellow above, condensed to the actions only the owner can take:

1. **Ring:** set `X402_AUTONOMOUS_ENABLED=false` to pause quietly, **or** finish
   the guard env per [tasks/x402-ring/11-activation-acceptance.md](../../tasks/x402-ring/11-activation-acceptance.md) to go live.
2. **World:** set `ADMIN_CODE` on the world service + re-run `apply-hardening.sh`.
3. **Replicate:** add billing credit (restores the paid forge lanes).
4. **Neon:** add compute/pooler headroom so audit writes stop timing out.
5. **Upstash / Helius (optional):** same-region cache store; higher Helius quota.

Nothing on this list is a code change. The code paths behind every line are
already hardened and covered by tests
([tests/x402-ring-invariants.test.js](../../tests/x402-ring-invariants.test.js),
[tests/cache-circuit-breaker.test.js](../../tests/cache-circuit-breaker.test.js),
[tests/cache-store-routing.test.js](../../tests/cache-store-routing.test.js)).

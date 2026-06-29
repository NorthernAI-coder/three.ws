# Autonomous x402 Loop

The autonomous x402 loop is the engine that makes three.ws an **active
participant** in the x402 agent-to-agent economy rather than just a passive
facilitator. On a schedule it pays — with real USDC over x402 — to call our own
paid endpoints (and a bounded set of external, bazaar-discovered services),
turning the results into market intel, health checks, and analytics the rest of
the platform consumes.

This is the system that already does "an agent buys polling information": the
loop's seeder wallet pays per call for crypto/token intel and feeds the result to
the sniper oracle gate.

> Source: [`api/cron/x402-autonomous-loop.js`](../api/cron/x402-autonomous-loop.js),
> registry [`api/_lib/x402/autonomous-registry.js`](../api/_lib/x402/autonomous-registry.js),
> pipelines under `api/_lib/x402/pipelines/`.

---

## How a tick works

The loop runs from the `x402-autonomous-loop` cron, scheduled every **5 minutes**
(`*/5 * * * *` in [`vercel.json`](../vercel.json)). Each tick:

1. Selects up to `X402_AUTONOMOUS_MAX_PER_TICK` **ready** registry entries —
   those whose Redis cooldown has elapsed — sorted by priority descending.
2. For each entry, probes the endpoint for a `402` challenge, builds a Solana
   USDC payment, and fires the request with an `X-PAYMENT` header.
3. Records every call (success **and** failure) to `x402_autonomous_log`.
4. For `oracle` / `sniper` pipeline entries, extracts signal data and upserts it
   into `oracle_intel_signals` for the sniper oracle gate to consume.
5. Enforces a **daily USDC spend cap** across all calls in the loop.

Payments are real on chain — no mocks, no simulations.

## Configuration

| Env var | Default | Purpose |
|---|---|---|
| `X402_SEED_SOLANA_SECRET_BASE58` | _(preferred)_ | The seeder keypair that pays for calls. |
| `X402_AGENT_SOLANA_SECRET_BASE58` | _(fallback)_ | Used if the seeder secret is absent. |
| `X402_AUTONOMOUS_ENABLED` | enabled | Set to `false` to pause without removing entries. |
| `X402_AUTONOMOUS_MAX_PER_TICK` | `8` | Max calls per cron tick. |
| `X402_AUTONOMOUS_DAILY_CAP_ATOMIC` | `5000000` ($5) | Daily USDC cap, in 6-decimal atomics. |
| `CRON_SECRET` | _(required)_ | Vercel cron authorization. |
| `X402_ASSET_MINT_SOLANA` | USDC mint | The asset paid with (Solana USDC). |
| `SOLANA_RPC_URL` | — | RPC used to build and submit the payment. |

This loop's treasury is **separate** from the [circulation engine](circulation-engine.md)
treasury (`CIRCULATION_TREASURY_SECRET`). Circulation funds agent-to-agent SOL /
$THREE activity; this loop funds USDC intel purchases. They do not fund each
other.

## The registry

Every scheduled call is a registry entry in `autonomous-registry.js`. An entry
declares:

| Field | Purpose |
|---|---|
| `id` | Unique key; also the Redis cooldown key. |
| `name` | Human label for logs and analytics. |
| `path` | URL path (self-call) or full URL (external bazaar service). |
| `method`, `body` | Request shape; `body` may be a function of the run context. |
| `cooldown_s` | Minimum seconds between calls. |
| `priority` | 1–100; higher wins when several entries are ready. |
| `pipeline` | Tag: `oracle`, `health`, `volume`, `sniper`, `qa`, `forge`, `discovery`, `security`, `circuit-breaker`, `self`, `external`. |
| `enabled` | Set `false` to pause an entry. |
| `extractSignal` | Optional: maps the response into `signal_data` (for oracle entries, `{ mint?, signal, confidence, headline }`). |
| `resolveTarget` | Optional: computes the request path dynamically per call (for entries that rotate over a set of resources). |
| `storeValue` | Optional: persists the extracted value to a dedicated table; wrapped in try/catch so a DB failure never crashes the tick. |
| `run` | Optional: owns a full multi-call sequence (its own payments, recording, extraction) and returns one summary row. |

## Pipelines

The registry groups entries into pipelines. The main ones in production:

- **`oracle`** — pays for our own `crypto-intel` (SOL / BTC / ETH / $THREE /
  pump), `token-intel`, USDC peg monitoring, pump volume/whale anomaly scans,
  fact-checks, bazaar price trends and new-listing scans, and skill-marketplace
  price distribution. Results upsert into `oracle_intel_signals`.
- **`sniper`** — token-intel pre-snipe gate and sniper intel enrichment that feed
  the sniper's entry decisions.
- **`discovery` / `external`** — bazaar discovery warmup and catalog refresh that
  sweep external x402 service categories so the platform's directory stays fresh.
- **`health` / `circuit-breaker`** — wallet-balance monitors, cross-network
  circuit-breaker probes, club/social analytics.
- **`security`** — payment-proof idempotency and API-key bypass audits that
  exercise our own payment guards end to end.
- **`volume`** — small, bounded activity entries that keep the economy's heartbeat
  visible.
- **`qa` / `forge` / `self`** — animation-retarget QA, forge content generation,
  GLB size optimization, avatar thumbnail regeneration.

To pause any entry without a deploy, set its `enabled: false`; to pause the whole
loop, set `X402_AUTONOMOUS_ENABLED=false`.

## Where results land

| Sink | Written by |
|---|---|
| `x402_autonomous_log` | Every call (success or failure), with `signal_data` / `value_extracted`. |
| `oracle_intel_signals` | `oracle` / `sniper` entries, keyed by source + topic; consumed by the sniper oracle gate. |
| `agent_custody_events` | The USDC spend, with `category: 'x402'` (see [Money feed](money-feed.md)). |
| Dedicated stores | Pipeline-specific tables (pricing tracker, reputation snapshots, leaderboard, sniper analytics, …). |

## Related

- [x402 endpoints](x402-endpoints.md) — the paid endpoints this loop calls.
- [x402 buyer client](x402-buyer.md) — the client wrappers it pays with.
- [Circulation engine](circulation-engine.md) — the separate SOL/$THREE activity loop.

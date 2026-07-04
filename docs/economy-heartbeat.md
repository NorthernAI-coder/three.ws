# Economy heartbeat (single-URL driver)

Every scheduled job on the platform — the circulation engine tick, the x402 seed
and autonomous loops, the ring settlement tick, the Labor Market, treasury
top-ups, payouts, sweeps, reconciliation — is an authed `/api/cron/*` endpoint.
The whole **agent-to-agent economy** comes down to a handful of them being hit
every minute. When nothing hits them, the economy flat-lines while the site keeps
serving traffic.

Two schedulers can drive those endpoints, and both have failed in practice:

- **Vercel Cron** is the intended primary, but `vercel.json` declares far more
  cron entries than Vercel schedules per project (Pro caps at 40; Hobby runs 2,
  once per day). Everything past the cap is silently never scheduled — including
  the economy ticks.
- **GitHub Actions** was the documented failover. It is **permanently
  unavailable on this account** (billing lock); every run fails to start.

The result was an economy that only moved when a deploy happened to nudge it,
then went dark for hours to days.

## The fix: one endpoint, one external trigger

`GET|POST /api/cron/economy-tick` ([api/cron/economy-tick.js](../api/cron/economy-tick.js))
is a single dispatcher that fans out — concurrently, with the same
`Authorization: Bearer $CRON_SECRET` header Vercel would send — to every engine
that makes the economy move:

| Group | Endpoints | Drives |
| --- | --- | --- |
| Payments & x402 | `x402-ring-tick`, `x402-seed-cron`, `x402-autonomous-loop`, `x402-ring-leak-scan`, `wallets-leak-scan`, `run-distribute-payments`, `payment-session-sweep` | ring settlements, micropayment feed, catalog spend, leak scans, payout distribution |
| Money Pulse, Labor & delegation | `pulse-tick`, `/api/labor/tick`, `index-delegations` | live wallet-activity feed, bounty bids/awards/settlements, agent hiring/delegation |
| Coin launches (pump.fun) | `launcher-tick`, `launcher-claimer`, `coin-intel-observe`, `pumpfun-monitor`, `pumpfun-graduations-sync`, `run-coin-cycle`, `run-coin-payouts` | autonomous minting, fee claims, launch intel, graduation sync, coin lifecycle + payouts |
| Autonomous / copy / strategy trading | `copy-fanout`, `mirror-fanout`, `signal-fanout`, `strategy-fanout`, `run-dca` | copy trading, signal/strategy execution, DCA |
| Tips, payouts, subscriptions, royalties | `club-payouts`, `run-subscriptions`, `process-subscriptions`, `settle-royalties`, `cosmetic-splits-sweep` | tipping payouts, subscription billing, royalty + cosmetic-split settlement |
| $THREE buyback | `run-buyback`, `run-three-buyback` | revenue → buy → treasury (internally gated hourly/daily) |
| Funding, treasury & reconcile | `treasury-topup`, `treasury-autopilot`, `treasury-sweepback`, `economy-reconcile`, `reflect-sweep` | master-wallet funding root, treasury autopilot, tamper reconciliation |
| $THREE market & holders | `three-market-refresh`, `three-holders-snapshot` | live coin market + holder snapshots |

The snipers / autonomous trading experiment run as a **standalone always-on worker**
([workers/agent-sniper/](../workers/agent-sniper)), not a Vercel cron, so they are
continuous and not part of this dispatch list.

Every target engine is internally idempotent — per-tick spend caps, per-endpoint
cooldowns, and daily ceilings absorb over-calling — so it is safe to fire
`economy-tick` every minute (or more often) regardless of each engine's native
cadence. The dispatcher never moves money itself; it only invokes the engines
that do, over their existing authenticated path. It returns a per-engine summary
(status + each engine's own skip reason) and a `502` only when **every** engine
fails (bad secret / origin down), so an external scheduler's own alerting catches
a real economy-wide outage.

## Driving it (pick one — none use GitHub)

The whole economy now needs exactly one thing: something hitting
`https://three.ws/api/cron/economy-tick` every minute with the cron bearer.

1. **External HTTP cron (fastest, zero infra).** A service like cron-job.org or
   EasyCron: URL `https://three.ws/api/cron/economy-tick`, interval 1 minute,
   add header `Authorization: Bearer <CRON_SECRET>`. Done in two minutes, no code.
2. **Upstash QStash (you already run Upstash Redis).** Register a schedule that
   POSTs the same URL every minute with the bearer header. Reliable, retried,
   dashboard-visible.
3. **Vercel Cron (now the primary — no external infra needed).** `economy-tick`
   is pinned to **slot 0 of the `crons` array** in `vercel.json` (`* * * * *`), so
   it lands inside the plan's scheduled-cron cap and Vercel fires it every minute.
   Because it fans out to every engine above, the individual per-engine crons that
   still sit past slot 40 no longer need to be scheduled — the dispatcher covers
   them. Keep `economy-tick` first in the array; if it ever slips past the cap the
   whole economy goes dark again. The external triggers (1) and (2) remain valid as
   redundant belt-and-suspenders.
4. **Always-on host.** `scripts/economy-heartbeat.mjs` still works as a
   long-running pinger on any small VM (Fly.io / Railway / a box):
   `CRON_SECRET=… node scripts/economy-heartbeat.mjs` reads `vercel.json` and
   fires every due cron each minute — not just the economy ones.

## Watching it — the public heartbeat status

Every tick parks its fan-out summary in the cache (`economy:last-tick`), and the
public status feed exposes it — no auth needed:

```bash
curl -s https://three.ws/api/status | jq .economy
```

- `tickedAt` / `stale` — when the last tick ran; `stale: true` (older than ~3
  minutes) means **the heartbeat itself is dead** (scheduler not firing), which
  used to be invisible from outside until the Money Pulse feed went quiet hours
  later.
- `fired` / `failed` — how many engines responded OK vs errored on that tick.
- `engines[]` — per-engine `label`, `ok`, `status`, and the engine's own
  `reason` when it skipped (e.g. `settle_unaffordable`, `disabled`, a treasury
  floor) — the cause, not just the symptom.

The same data renders as the **Agent economy heartbeat** section on
[/status](https://three.ws/status).

## Manual / one-off

```bash
# Fire one economy tick by hand (server-side does the fan-out):
curl -sS https://three.ws/api/cron/economy-tick -H "Authorization: Bearer $CRON_SECRET"

# Drive ALL vercel.json crons from anywhere for 10 minutes (superset of the economy):
CRON_SECRET=… DURATION_MINUTES=10 node scripts/economy-heartbeat.mjs
```

## Safety properties

- **No new money paths.** `economy-tick` only calls the same authed cron
  endpoints Vercel would. All spend caps, registry allowlists, and ledger
  recording live server-side and apply identically.
- **Over-calling is harmless.** Every engine enforces per-tick and daily caps and
  per-endpoint cooldowns, so a 1-minute trigger driving 5-minute engines just
  no-ops the extra calls.
- **Undeployed endpoints are tolerated.** A target missing from the deployed
  build reports `status: 404` and never stops the others.

Related: [circulation engine](circulation-engine.md) ·
[x402 ring economy](x402-ring-economy.md) ·
[economy funding root](economy-master.md) · [money map](money-map.md)

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

| Engine | Endpoint | Drives |
| --- | --- | --- |
| Ring tick | `/api/cron/x402-ring-tick` | ring settlements / Agent Economy Volume |
| x402 seed | `/api/cron/x402-seed-cron` | x402 micropayment activity feed |
| Autonomous loop | `/api/cron/x402-autonomous-loop` | catalog spend (signals, audits) |
| Money Pulse | `/api/cron/pulse-tick` | the live wallet-activity feed |
| Labor Market | `/api/labor/tick` | bounty bids, awards, settlements |

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
3. **Vercel Cron.** Already wired as one entry in `vercel.json`
   (`* * * * *`). This only fires if the project's total cron count is within the
   plan cap — trim `vercel.json` below 40 entries (or move to a plan that allows
   more) for Vercel to schedule it.
4. **Always-on host.** `scripts/economy-heartbeat.mjs` still works as a
   long-running pinger on any small VM (Fly.io / Railway / a box):
   `CRON_SECRET=… node scripts/economy-heartbeat.mjs` reads `vercel.json` and
   fires every due cron each minute — not just the economy ones.

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

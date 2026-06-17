# Task: Deploy the agent-sniper worker to Cloud Run — simulate→live, with feed watchdog + alerting

## Context

The sniper engine (`workers/agent-sniper/`) is real and production-grade — it
subscribes to the live PumpPortal feed, scores launches, signs v0 transactions
from each agent's own wallet, enforces serious guardrails, and manages position
exits (see README and task 03). **It is not deployed.** It is a long-lived process
that holds a websocket feed open, so it cannot run on Vercel; a `Dockerfile`
exists but there is no deploy pipeline, no documented production env, no cron, and
no watchdog/alerting. Until this ships, **nothing snipes in production** — this is
the single biggest unlock for "snipe new pump.fun tokens."

Reference precedent: `world.three.ws` runs on Cloud Run (memory:
`world-three-ws-hyperfy`), so the platform already has a Cloud Run deploy pattern
to follow.

## Goal

The agent-sniper worker deployed and running on Cloud Run as a long-lived
background service: started in `simulate` mode and verified end-to-end against the
real feed, with `live` mode gated behind explicit config; documented env; a feed
watchdog that auto-reconnects; and ops alerting on disconnect/error.

## Files to Read First

- `workers/agent-sniper/README.md` — operating model, modes, known graduation gap
- `workers/agent-sniper/index.js:1-206` — entrypoint, feed hold-open (`:97`),
  position sweep loop (`:161`), watchdog hooks
- `workers/agent-sniper/config.js:28-92` — `loadConfig()` required env
  (`DATABASE_URL`, `JWT_SECRET`, RPC for live, `SNIPER_MODE`)
- `workers/agent-sniper/Dockerfile` — existing image (no HTTP port, background worker)
- `workers/agent-sniper/executor.js:51-85` — guardrails enforced before any signature
- `api/_lib/agent-pumpfun.js:26` — RPC selection (`SOLANA_RPC_URL`, Helius)
- Observability: `tasks/.../observability-stack` precedent, `TELEGRAM_ALERTS_CHAT_ID`,
  `/api/client-errors` log conventions, uptime cron + `/status` page
- `world.three.ws` Cloud Run deploy/repair notes for the house pattern

## What to Build / Do

1. **Deploy pipeline.** A documented, repeatable deploy of `workers/agent-sniper`
   to Cloud Run (build image → push → deploy) with `--no-cpu-throttling` (it must
   keep running between requests) and min-instances ≥ 1 so the feed stays open. Put
   the script under `scripts/` (e.g. `scripts/deploy-sniper.mjs` or a documented
   `gcloud`/`make` recipe), not in the repo root.
2. **Production env.** Document every required var (`DATABASE_URL`, `JWT_SECRET`,
   `SOLANA_RPC_URL`/`HELIUS_API_KEY`, `SNIPER_MODE`, budget/throttle knobs) and where
   it's set (Cloud Run secret/env). `loadConfig()` already throws loudly on missing
   vars — verify it fails closed. Never commit secrets.
3. **Simulate first.** Deploy with `SNIPER_MODE=simulate`, confirm it connects to
   the live PumpPortal feed, scores real launches, and records simulated positions —
   with no real spend. Capture evidence (logs showing scored mints + simulated buys).
4. **Gate live mode.** `SNIPER_MODE=live` must require deliberate config + a funded
   agent wallet; the existing guardrails (budget/per-trade/concurrency/price-impact/
   kill switch) must be confirmed active in the deployed env. Document the cutover.
5. **Feed watchdog + auto-reconnect.** Ensure the worker detects a dropped feed and
   reconnects with backoff (extend `index.js` if the watchdog is incomplete). A
   silent dead feed is the worst failure mode — it must self-heal and alert.
6. **Alerting + health.** On feed disconnect, repeated RPC failure, or executor
   error, emit an ops alert (Telegram via `TELEGRAM_ALERTS_CHAT_ID`, matching the
   existing observability stack). Add a lightweight health signal (heartbeat
   row/log) the uptime cron / `/status` page can read so "is the sniper alive?" is
   answerable without SSHing in.

## Constraints

- No secrets in the repo or image. Keypairs are never baked in — the worker decrypts
  per-agent keys at runtime via the existing key module.
- Fail closed: missing/invalid config must stop startup loudly, never silently run
  degraded or in the wrong mode.
- Live mode is opt-in and gated; the default deploy is `simulate`. Do not flip an
  agent to live without a funded wallet and explicit config.
- Don't weaken any guardrail to make deploy easier. The deployed worker enforces the
  same caps/breakers as code.
- This worker is a consumer of the feed, not the missing pump.fun bot (memory:
  `pumpfun-graduations-bot`) — don't reintroduce a non-existent upstream.

## Success Criteria

- The worker runs on Cloud Run, stays up (min-instances ≥ 1, no CPU throttling), and
  holds the PumpPortal feed open across requests.
- In `simulate`, logs show real new-mint scoring + simulated buys against the live
  feed, with zero real spend (evidence captured).
- `loadConfig()` fails closed on missing env (verified). Live mode is gated and
  documented; guardrails confirmed active in-env.
- Feed drop → auto-reconnect with backoff; disconnect/error → ops alert fires;
  a heartbeat is visible to `/status` / uptime cron.
- Deploy is a documented, re-runnable script under `scripts/` (no root clutter, no
  committed secrets).
- Changelog entry (tag: infra). Run the **completionist** subagent on changed files.

<!-- AUTO:self-delete-on-complete -->

---

## ✅ On completion — delete this file

This file is a unit of work, not a permanent doc. The moment every item above is **built, wired, verified, and committed** to the "Definition of done" in the repo-root `CLAUDE.md`, remove it in the same change:

```bash
git rm "tasks/agent-wallet-trading/05-deploy-sniper-worker.md"
```

Stage the deletion alongside your implementation and include it in the completion commit. This directory is the backlog: a file that still exists is unfinished work; a file that is gone has shipped. Do not delete early, and never leave a completed prompt behind.

# Memetic Launcher · the autonomous coin launcher

## North star
Make three.ws the **#1 deployer on pump.fun** — not a human clicking launch, but a pool
of 3D AI agents minting coins around the clock, each one riding a live cultural
narrative, each one capturing creator rewards. The economics are simple: pump.fun
creator fees are high; a steady stream of well-timed, on-narrative launches compounds
into real revenue. The hard part is **timing the zeitgeist** — and that data is all
available via public APIs and MCPs.

This works exactly like the **autonomous tips engine** (`api/_lib/circulation.js`): a
scheduled tick drives a pool of real agents through real on-chain actions via the same
code paths a human owner uses. The launcher is the minting sibling of that engine.

## The pieces (each has its own brief)
| # | File | What it owns |
|---|------|--------------|
| 01 | [narrative-intelligence.md](01-narrative-intelligence.md) | "What's hot right now" — the multi-source trend/narrative ranker (`launcher-trends.js`). |
| 02 | [coining-engine.md](02-coining-engine.md) | "What to launch" — the LLM that coins an original token riding a narrative (`launcher-sources.js`), incl. the literal prompts. |
| 03 | [launch-engine.md](03-launch-engine.md) | "Launch it autonomously" — the engine tick, caps, breaker, rotation, funding (`launcher-engine.js` + `launcher-tick` cron). |
| 04 | [creator-rewards.md](04-creator-rewards.md) | "Make it pay" — claim + reinvest creator rewards (the profit loop). |
| 05 | [admin-console.md](05-admin-console.md) | "Operate it safely" — arm/disarm, live runs, metrics, kill switch. |

## Data flow (one launch)
```
narrative-intelligence  →  coining-engine  →  launch-engine
  rank live currents        coin an original    pick agent → master funds it →
  (intel+oracle+X+           token riding the    agent signs its OWN pump.fun
   HN/Reddit/Wikipedia)      strongest wave      create → record run → claim fees
```

## Safety contract (non-negotiable)
- **Inert until armed.** Nothing fires unless a `launcher_config` row is `enabled`. The
  seeded global row ships `enabled=false, dry_run=true`.
- **dry_run** picks a coin + agent and records the run but moves zero SOL.
- **Hard caps**: per-launch SOL, daily SOL, hourly count, target cadence. Plus a circuit
  breaker that auto-pauses on consecutive failures.
- **$THREE is the only coin the platform promotes.** The launcher mints *new* coins for
  agents as a product feature; it mines **themes/culture, never other coins' tickers**,
  and routes `buyback_bps` of fees into $THREE buyback-and-burn. It must never hardcode,
  market, or recommend any specific non-$THREE mint.
- **No tragedies.** Brand-safety denylist keeps death/violence/disaster narratives out at
  the source AND in the LLM system prompt.

---
### Operating rules — read CLAUDE.md + STRUCTURE.md first. No mocks/fake data/stubs. Real APIs only. $THREE only (`FeMbDoX7R1Psc4GEcvJdsbNbZA3bfztcyDCatJVJpump`). Stage explicit paths; never `git add -A`. Don't commit `api/*.js` bundles. `vercel.json` changes are deploy-time. User-visible change → `data/changelog.json` + `npm run build:pages`. Push both remotes when asked; never pull from `threeD`. DoD = CLAUDE.md checklist.

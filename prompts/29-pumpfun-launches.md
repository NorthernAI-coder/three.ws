# 29 · Pump.fun Launches & Token Tooling

## Mission
The launch pipeline (create a coin via three.ws, optional atomic dev-buy/snipe, launch directory)
must be safe, accurate, and reliable — with the platform itself only ever promoting $THREE.

## Context
- Pump.fun feed + Solana RPC are real APIs (never mock). Launcher accepts an arbitrary mint at
  runtime (allowed plumbing). Launch directory renders user-launched coins from platform records
  (`/launches`, `/api/pump/launches`, `pump_agent_mints`) — allowed runtime data only.
- Tooling: `packages/pumpfun-mcp`, `npm run pump:smoke`, `npm run pump:refresh-idls`,
  workers `worker:sniper` / `deploy:sniper`. Atomic launch+first-buy in one Jito bundle (recent).

## Tasks
1. **Launch flow:** create-token works end-to-end with correct fees/rent, metadata, and confirmation;
   designed states; clear errors on RPC/congestion failure.
2. **Atomic dev-buy/snipe:** first-buy lands in the same tx/bundle as the mint; spend caps + slippage
   enforced; funder covers rent + buy; no path that overspends or double-submits.
3. **Launch directory:** renders real launch records; each entry links to agent profile/launch history;
   never hardcodes or recommends a specific non-$THREE mint anywhere in source or copy.
4. **Coin-policy guard:** audit the entire launch surface + copy + tests so the platform only ever
   *promotes* $THREE; arbitrary mints appear strictly as runtime user data.
5. **Resilience:** RPC failover/retry; IDL freshness (`pump:refresh-idls`); smoke test green
   (`npm run pump:smoke`).
6. **Sniper worker:** dry-run vs live clearly separated; caps enforced; deploy runbook documented.

## Acceptance
- Launch (+ optional atomic dev-buy) succeeds on a real path with caps/slippage enforced.
- Directory shows real records with correct links; coin-policy audit clean (only $THREE promoted).
- `npm run pump:smoke` green; sniper dry/live separated + documented; changelog for visible changes.

---
### Operating rules — read CLAUDE.md + STRUCTURE.md first. Never mock pump.fun/Solana RPC. $THREE is the only coin the platform promotes (`FeMbDoX7R1Psc4GEcvJdsbNbZA3bfztcyDCatJVJpump`); arbitrary mints only as runtime user input/launch records — never hardcode/recommend one. Stage explicit paths; never `git add -A`. Don't commit `api/*.js` bundles. User-visible change → `data/changelog.json` + `npm run build:pages`. Push both remotes when asked; never pull from `threeD`. DoD = CLAUDE.md checklist.

<!-- AUTO:self-delete-on-complete -->

---

## ✅ On completion — delete this file

This file is a unit of work, not a permanent doc. The moment every item above is **built, wired, verified, and committed** to the "Definition of done" in the repo-root `CLAUDE.md`, remove it in the same change:

```bash
git rm "prompts/29-pumpfun-launches.md"
```

Stage the deletion alongside your implementation and include it in the completion commit. This directory is the backlog: a file that still exists is unfinished work; a file that is gone has shipped. Do not delete early, and never leave a completed prompt behind.

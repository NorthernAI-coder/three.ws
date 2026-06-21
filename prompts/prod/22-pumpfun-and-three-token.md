# 22 — Pump.fun launch & $THREE surfaces

> Part of **Road to $1B** (`prompts/road-to-1b/`). Read `00-README.md` and `/CLAUDE.md` first.

**Phase:** 2 — Product surface completeness
**Owns:** `api/pump/*`, `pump-fun-skills/`, `packages/pumpfun-mcp/`, `packages/three-token-mcp/`, `pages/bulk-launch.html`, launch feeds, $THREE surfaces, sniper/oracle workers.
**Depends on:** `06`, `07`, `08`, `18`. Pairs with `16`, `17`.

## Why this matters for $1B
The launch + token economy is a major engagement and revenue surface, and $THREE is
the platform's only coin and a core narrative. These surfaces must be rock-solid,
honest, and strictly compliant with the one-coin rule.

## Map
- Launch backend: `api/pump/*`, `pump-fun-skills/`. Bulk: `pages/bulk-launch.html`.
  Launch feed: `/launches`, `/api/pump/launches` over `pump_agent_mints`. MCP:
  `packages/pumpfun-mcp/`, `packages/three-token-mcp/`. Snapshot: `pump_snapshot` tool.
- Workers: `worker:oracle`, `worker:sniper` (`workers/`), deploy via `deploy:sniper`.
- **$THREE only.** CA `FeMbDoX7R1Psc4GEcvJdsbNbZA3bfztcyDCatJVJpump`. Two
  runtime-data exceptions only: (1) generic launcher accepting a user-supplied mint at
  runtime; (2) platform launch directories rendering user-launched mints from our own
  records. Never hardcode/market/recommend any non-$THREE mint anywhere.

## Do this
1. **Coin-rule audit FIRST:** grep the whole surface (code, copy, tests, fixtures,
   metadata) for any coin reference that isn't $THREE or a clearly-synthetic
   placeholder. Remove every one — treat like a leaked secret. Confirm the two
   runtime exceptions are the *only* places non-$THREE mints appear, and only from
   live records / user input.
2. **Launch flow:** create/launch end-to-end with real pump.fun integration and real
   payment (prompt `18`); honest progress and confirmation; idempotent so a retry
   never double-launches. Designed states (prompt `12`).
3. **Bulk launch:** `bulk-launch.html` handles batches with per-item status, partial
   failure recovery, and clear accounting — no silent drops.
4. **Launch feed:** `/launches` + agent-profile launch history render real records
   from `pump_agent_mints`; link to agent profiles (prompt `17`); designed empty state.
5. **$THREE surfaces:** any $THREE price/holders/snapshot data is real (via
   `pump_snapshot`/RPC), resilient (prompt `06`), and never fabricated. Token-gating
   (if used) checks real balances.
6. **Workers:** oracle + sniper run reliably with the resilience patterns (timeouts,
   retries, circuit-breakers), proper logging/alerting (prompt `25`), and safe
   shutdown. Never blind-retry trades (idempotency, prompt `07`).
7. **MCP tools:** `pumpfun-mcp` + `three-token-mcp` build, are documented, return
   correct structured output, and are smoke-tested (`smoke:mcp`).
8. Tests: launch idempotency, feed rendering, coin-rule grep as a CI guard.

## Must-not
- Do not reference, hardcode, market, or recommend any coin other than $THREE
  anywhere outside the two runtime-data exceptions.
- Do not paste any real third-party mint/creator/holder address in tests/fixtures.
- Do not double-launch or blind-retry trades.

## Acceptance
- [ ] Coin-rule grep clean; non-$THREE mints appear only in the two runtime exceptions; CI guard added.
- [ ] Launch + bulk-launch end-to-end, idempotent, with honest states and partial-failure recovery.
- [ ] Launch feed renders real records and links to profiles; designed empty state.
- [ ] $THREE data real + resilient; token-gating checks real balances.
- [ ] Oracle + sniper workers resilient, logged/alerted, idempotent.
- [ ] pumpfun-mcp + three-token-mcp build + documented + smoke-tested; tests green.

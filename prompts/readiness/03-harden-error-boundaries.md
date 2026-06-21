# 03 — Harden every error boundary (kill the empty catches)

**Phase 1. Serial** after [02](02-eliminate-todos-and-stubs.md).

## Where you are

`/workspaces/three.ws` — three.ws, 3D AI-agent platform. Read
[CLAUDE.md](../../CLAUDE.md). Rules in play: **Errors handled at boundaries
(network, user input). No errors without solutions — there is always a correct
answer. Ship working fallbacks and failsafes. Lazy error propagation is not
engineering.** ~126 empty `catch {}` blocks exist. The only coin is **$THREE**.

## Objective

Eliminate silent failure. Every `catch` either (a) recovers with a real
fallback, (b) surfaces an actionable error to the user at a UI boundary, or (c)
reports to the error pipeline with enough context to debug — never swallows.

## Why it matters

An empty catch is a bug that will happen in production and that you have
pre-decided not to learn about. At scale these are the outages you can't explain
and the user reports you can't reproduce. Silent failure is the opposite of
institutional grade.

## Instructions

1. **Enumerate** empty/near-empty catches:
   ```bash
   grep -rIn "catch[^)]*) *{ *}" --include=*.js src/ public/ api/ workers/ | grep -v node_modules
   grep -rPzoIn "catch\s*\([^)]*\)\s*\{\s*(//[^\n]*)?\s*\}" --include=*.js src/ public/ api/ | grep -v node_modules
   ```
   Also review `catch` blocks whose body is only `return null` / `return` /
   `return []` where the caller can't distinguish "no data" from "it broke."
2. **Classify each external boundary** (fetch, RPC, pump.fun, LLM proxy, wallet,
   file/parse) vs **internal logic**. CLAUDE.md: internal code trusts itself;
   boundaries are where handling belongs.
3. **For each, pick the right resolution:**
   - **User-facing UI:** show a designed error state with a recovery action
     (retry, reconnect wallet, refresh). Never a blank void or a console-only
     log. Coordinate with [18 — state design](18-state-design-sweep.md).
   - **Background/worker:** log structured context + retry/backoff where
     transient (see [10 — resilience](10-resilience-external-calls.md)), then
     fail loudly to the error pipeline (see [11 — observability](11-observability.md)).
   - **Truly ignorable** (e.g. `localStorage` blocked in private mode, optional
     analytics): keep the catch but add a one-line comment stating *why* it is
     safe to ignore, and degrade gracefully. A justified silent catch is fine;
     an unexplained one is not.
4. **Add a shared helper** if a pattern repeats (e.g. `reportError(err, ctx)` and
   a `withFallback(fn, fallback)`), and route catches through it. Prefer the
   existing `public/error-reporter.js` if present — extend, don't duplicate.
5. **Verify behavior, not just code.** For at least the top 10 user-facing
   boundaries, force the failure (offline, bad input, rejected wallet) in
   `npm run dev` and confirm the user sees a recoverable state.

## Definition of done

- [ ] Zero unexplained empty `catch {}` in `src/ public/ api/ workers/`. Every
      remaining bare catch has a one-line justification comment.
- [ ] Every network/RPC/LLM/wallet boundary surfaces a recoverable UI state or
      reports to the error pipeline — none swallow silently.
- [ ] Forced-failure check done on the top 10 boundaries; each degrades
      gracefully (recorded in your report).
- [ ] `npm run lint`, `npm run typecheck`, `npm test` pass.
- [ ] `gap-inventory.json` `emptyCatches` updated.
- [ ] Changelog: `fix` entry in `data/changelog.json` if users will now see
      recoverable errors where things used to silently fail.

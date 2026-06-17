# Task 05 — Finish the `pumpfun-signals` cron

**Priority:** MEDIUM. **Type:** backend.

## Goal

Complete the `pumpfun-signals` cron, which the backend inventory flagged as a skeleton: it
ingests pump.fun events but its rule evaluation / signal-emission is unfinished. Bring it to the
same completeness as `pumpfun-monitor` and `pump-agent-stats`.

## Why this matters

Signals power agent reputation, the reactive avatar, and the channel feed. A half-finished signal
processor means agents react to a partial or empty event stream — the "live" feel of the
launchpad degrades to stale. Either finish it or, if it's fully superseded by `pumpfun-monitor`,
delete it and re-point consumers (CLAUDE.md: eliminate dead paths).

## Context — read first

- `api/cron/pumpfun-signals.js` (or wherever the signals cron lives — confirm path) and its
  registration in `vercel.json` crons.
- `pumpfun_signals` table — what rows it expects, who writes/reads them.
- `api/_lib/pumpfun-ws-feed.js` — `getMints()` / `getWhales()` / `getClaims()` sources.
- `api/pump/channel-feed.js` — a consumer of signals.
- `api/cron/pumpfun-monitor.js` — the reference for a complete cron (cursor, cooldown, delivery).
- `docs/solana-pumpfun.md` — documents the intended `pumpfun-signals` crawler design.

## Scope

1. **Determine the true state** — read the cron and decide: finish, or fold into `pumpfun-monitor`
   and delete. Document the decision in the PR/commit.
2. **If finishing:** complete rule evaluation (mints/whales/graduations → `pumpfun_signals`
   rows with `weight`/`payload`), maintain a cursor so it doesn't reprocess, respect rate limits
   and the Redis quota (see `tasks/redis-burn-rate-reduction.md` — minimize Redis writes).
3. **Wire consumers** — channel-feed, reputation signals, reactive avatar read real signal rows.
4. **Circuit-breaker / timeout** parity with the other crons (no runaway RPC under 429s).

## Definition of done

- [ ] Cron runs to completion within its time budget, emits real signal rows from live events.
- [ ] Consumers (channel-feed at minimum) display data sourced from those rows.
- [ ] No reprocessing of already-seen events (cursor verified).
- [ ] If deleted instead: all consumers re-pointed, cron removed from `vercel.json`, no dead refs.
- [ ] Redis write volume measured and within burn-rate budget.
- [ ] `npm test` passes.
- [ ] Changelog entry only if user-visible (e.g. channel feed gets livelier) — else internal-only.

<!-- AUTO:self-delete-on-complete -->

---

## ✅ On completion — delete this file

This file is a unit of work, not a permanent doc. The moment every item above is **built, wired, verified, and committed** to the "Definition of done" in the repo-root `CLAUDE.md`, remove it in the same change:

```bash
git rm "tasks/pumpfun-launchpad-100/05-pumpfun-signals-cron.md"
```

Stage the deletion alongside your implementation and include it in the completion commit. This directory is the backlog: a file that still exists is unfinished work; a file that is gone has shipped. Do not delete early, and never leave a completed prompt behind.

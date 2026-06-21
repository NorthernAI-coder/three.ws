# 06 · Eliminate silent failures (empty catch / fire-and-forget)

> **Phase 1 — Reliability** · **Depends on:** none (pairs with 26) · **Parallel-safe:** yes · **Effort:** M

## Mission
The audit found **138 files with empty catch blocks** and **70+ `.catch(() => {})` fire-and-forget**
chains across `api/`. Critical background work — receipt emails, payment cleanup, resource teardown,
cache invalidation — fails invisibly. CLAUDE.md forbids lazy error propagation. Replace silent
swallows with logged-and-alerted handling via a shared helper, so every failure is at least *seen*.

## Context (read first)
- `CLAUDE.md` hard rule #9 ("No errors without solutions"); errors handled at boundaries.
- Existing infra: `api/_lib/sentry.js` (`captureException`), `sendOpsAlert`, the `wrap()` boundary in `api/_lib/http.js` (used by ~512 handlers), `scripts/audit-empty-handlers.mjs` (`npm run audit:handlers`).
- Confirmed offenders: `api/agents.js:353,363` (`pingIndexNow().catch(()=>{})`), `api/forge.js:1315` (`releaseForgePayment().catch(()=>{})` — payment cleanup hidden), `api/payments/evm/[action].js:126` (receipt email loss), `api/pump-fun-mcp.js:518,577,606,612` (swallowed metadata/price/teardown), 16+ `Promise.all` that fail-whole on one rejection (`api/sitemap.js:57`).

## Build this
1. **A shared background-task helper** — e.g. `api/_lib/background.js` exporting `fireAndLog(promise, { op, context })` that awaits where appropriate or attaches a `.catch` that calls `captureException` + a debug log (and `sendOpsAlert` for the ones that matter: payments, emails, settlement cleanup). One canonical way to do "non-critical but observable."
2. **Sweep `api/`** replacing bare `catch {}` / `.catch(() => {})` with either: (a) real recovery, (b) `fireAndLog(...)`, or (c) a deliberate, commented `// best-effort: <why>` *only* where truly inconsequential. No silent swallow survives without justification.
3. **Fix fail-whole `Promise.all`** — convert to `Promise.allSettled` with sane per-item defaults where one failure shouldn't 500 the whole response (sitemap, home-stats, status, aggregations).
4. **Tighten `galaxy.js`-style `readJson().catch(() => ({}))`** that silently proceeds with empty input → validate or 400 (overlaps with prompt 07; do the obvious ones here).
5. **Extend `scripts/audit-empty-handlers.mjs`** to flag new bare empty catches / fire-and-forget without the helper, and add it to CI so the regression can't return.

## Files likely in play
`api/_lib/background.js` (new), the offender files above + the broader sweep across `api/`, `scripts/audit-empty-handlers.mjs`, `.github/workflows`.

## Definition of done
- [ ] `npm run audit:handlers` (extended) passes and is wired into CI.
- [ ] Every payment/email/settlement background task is observable (logged + alerted).
- [ ] No fail-whole `Promise.all` on multi-source read endpoints.
- [ ] Existing tests pass; add a small test for `fireAndLog` behavior.
- [ ] Changelog: mostly internal; if any user-visible reliability fix results (e.g. receipts that were silently dropping now send), add a **fix** entry.

## Guardrails
Follow CLAUDE.md. Don't introduce noisy logging in hot read paths — alert only on what matters. Stage explicit paths (large sweep across shared files; re-check `git status`). Push both remotes.

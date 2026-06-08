# A5 — Harden against Neon cold-start failures (auto-agent + seed)

**Track:** A — production fire · **Priority:** P2 · **Effort:** 2–4h · **Depends on:** none

## Context (evidence)

Production logs show intermittent database connection failures, not query bugs:

```
[avatars] auto-agent failed { avatarId: ..., userId: ..., error: 'Error connecting to database: fetch failed' }   (×several)
[seed-default-agent] first attempt failed, retrying { userId: ..., error: 'Error connecting to database: fetch failed' }
[seed-default-agent] failed { userId: ..., error: 'Error connecting to database: fetch failed' }
[audit] insert failed { action: 'logout', error: 'Error connecting to database: fetch failed' }
```

These are **Neon serverless cold-start / transient connection** failures (`fetch failed` from the
Neon HTTP driver), not SQL errors. `api/_lib/seed-default-agent.js` already has a 1s retry, but it
still ultimately fails sometimes, and the avatar **auto-agent** path appears to have weaker
resilience.

## What to do

1. **Locate the shared DB client** (`api/_lib/db.js`) and understand how connections are made
   (Neon HTTP driver vs pooled `Pool`). Determine whether these failing call sites use the
   pooled/cached client or create fresh connections per invocation.
2. **Add bounded retry-with-backoff for transient connection errors** at the right layer:
   - Prefer a single shared helper (e.g. a `withDbRetry(fn)` in `api/_lib/db.js`) that retries only
     on connection-class errors (`fetch failed`, connection reset, ECONNRESET, Neon
     `NeonDbError` with a connection cause) — **not** on query/constraint errors. 2–3 attempts with
     short exponential backoff (e.g. 150ms, 400ms, 900ms) + jitter.
   - Apply it to: the avatar **auto-agent** creation path (find it — search
     `rg -n "auto-agent failed" api`), `api/_lib/seed-default-agent.js` (upgrade its existing single
     retry to use the shared helper), and the audit-insert path (`rg -n "\\[audit\\] insert failed" api`).
3. **Make non-critical writes non-fatal.** `seed-default-agent` and audit-log inserts must never
   block the user-facing request: on final failure they should log and continue (seed already does
   this — confirm; audit insert should too). The avatar auto-agent failure should degrade
   gracefully — the avatar must still be created even if agent auto-provisioning fails; surface a
   retriable state rather than losing the avatar.
4. **Confirm the connection strategy is appropriate for Vercel serverless.** If the code opens a new
   un-pooled connection per request, switch to the Neon pooled connection string / cached client
   pattern already used elsewhere in `api/_lib/` (do not introduce a new dependency).

## Acceptance criteria

- [ ] Transient `fetch failed` connection errors are retried with backoff; query/constraint errors
      are **not** retried.
- [ ] The avatar auto-agent path no longer loses the avatar on a DB blip; it retries or degrades
      cleanly with a structured log.
- [ ] `seed-default-agent` and audit-insert failures never propagate to the user request.
- [ ] The retry logic is centralized (one helper), not copy-pasted per call site.
- [ ] No retry on success and no infinite loops; attempts are bounded.

## Verification

1. `npx vitest run` for any db/auth/avatar tests.
2. Add or extend a unit test that simulates a `fetch failed` on the first attempt and a success on
   the second, asserting the helper retries and resolves.
3. Manually trace each of the three failing call sites and confirm they route through the new helper.

## Rules

Obey [CLAUDE.md](../../CLAUDE.md). Real retries against the real driver — no fake delays to "look
busy," no swallowing of genuine query errors.

## Completion protocol

1. Re-read your diff (`git diff`) and confirm every line is justified.
2. Delete this file: `tasks/week-2026-06-08/A5-neon-coldstart-pooling.md`.
3. Commit your code change **and** this file's deletion together, e.g.:
   `git add -A && git commit -m "fix(db): bounded connection-error retry for auto-agent/seed/audit; close A5"`
4. Do **not** push — the human controls pushes.

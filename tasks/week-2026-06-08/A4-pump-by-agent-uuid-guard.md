# A4 — Guard `/api/pump/by-agent` (and audit siblings) against non-UUID input

**Track:** A — production fire · **Priority:** P1 · **Effort:** 1–2h · **Depends on:** none

## Context (evidence)

Production logs:

```
[api] unhandled NeonDbError: invalid input syntax for type uuid: "agent"
    at execute (file:///var/task/api/pump/[action].js:...)
```

`GET /api/pump/by-agent` (handled by `handleByAgent` in `api/pump/[action].js`, registered around
line 129 / defined around line 1915) passes a non-UUID value (the literal string `"agent"`) straight
into a `uuid`-typed SQL query, which throws `NeonDbError` and 500s. This is the same class of bug
the agents and bounties routes were already hardened against (see
`api/bounties/[id].js:14` — `if (!isUuid(id)) return error(res, 404, ...)`).

## What to do

1. In `handleByAgent` (`api/pump/[action].js`), validate the agent identifier **before** it reaches
   any `uuid`-typed query. Use the existing helper: `import { isUuid } from '../_lib/validate.js'`
   (confirm the relative path from this file). If the id is missing or not a UUID, return a clean
   `400 validation_error` (or `404 not_found` if that matches the endpoint's contract for "unknown
   agent") — **never** let it reach the DB.
   - Determine where the bad `"agent"` value originates: is it `req.query.agent` /
     `req.query.agent_id` defaulting to the literal `"agent"`, or a path segment being misparsed?
     Fix the source too, not just the guard, if it's a parsing bug.
2. **Audit the whole dispatcher** `api/pump/[action].js` for any other handler that interpolates a
   user-supplied value into a `uuid`/typed column without validation. Add the same guard wherever a
   raw id reaches SQL. (`handleByAgent` is the one in the logs, but harden siblings while you're
   here.)
3. Ensure errors in this dispatcher are caught at the boundary and logged with a structured prefix
   (e.g. `console.error('[pump/by-agent]', ...)`) rather than surfacing as `unhandled NeonDbError`.

## Acceptance criteria

- [ ] `GET /api/pump/by-agent` with a missing/non-UUID agent id returns a clean 400/404, **no**
      `NeonDbError`, **no** 500.
- [ ] A valid agent UUID still returns the correct mint + stats + burn history (no regression).
- [ ] Other id-consuming branches in `api/pump/[action].js` are guarded the same way.
- [ ] The dispatcher logs structured errors at the boundary.

## Verification

1. `npm run dev`, then:
   - `curl '/api/pump/by-agent'` → clean 400/404.
   - `curl '/api/pump/by-agent?agent_id=not-a-uuid'` → clean 400/404.
   - `curl '/api/pump/by-agent?agent_id=<real uuid>'` → 200 with data.
2. Run any existing pump API tests: `npx vitest run` (filter to pump if available).

## Rules

Obey [CLAUDE.md](../../CLAUDE.md). Errors handled at boundaries; internal code trusts itself.

## Completion protocol

1. Re-read your diff (`git diff`) and confirm every line is justified.
2. Delete this file: `tasks/week-2026-06-08/A4-pump-by-agent-uuid-guard.md`.
3. Commit your code change **and** this file's deletion together, e.g.:
   `git add -A && git commit -m "fix(pump): UUID-guard by-agent and sibling handlers to stop NeonDbError 500s; close A4"`
4. Do **not** push — the human controls pushes.

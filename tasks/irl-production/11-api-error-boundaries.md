# Task 11 — API error boundaries: zero 500s, graceful degradation

**Phase:** 3 (backend) · **Effort:** M · **Files:** `api/irl/*.js`

## Why
Every endpoint boundary must handle malformed input, missing rows, missing tables,
and unserializable payloads without throwing a 500 or leaking a stack trace. A
production API returns a clean status and a useful body on every path.

## Read first (verify before fixing — confirm each line still matches)
- `api/irl/pins.js` — `handleCalibrate` null-row (~346); nearby `radius` parse (~489)
- `api/irl/interactions.js` — fire-and-forget view_count `.catch(()=>{})` (~251);
  `JSON.stringify(payload)::jsonb` insert (~242); pay de-dupe (~216-221)
- `api/irl/interactions-stream.js` — `conn.send(...)` error swallow (~163)
- `api/irl/agent-card.js` — `fetchReputation` null/missing-table path (~86-110, ~149)
- `api/irl/agent-summary.js` — interaction_count / last_interaction_at + LEFT JOIN nulls (~48-78)

## Scope — confirm, then fix

1. **Null-row after mutation.** `handleCalibrate` (and any UPDATE…RETURNING path that
   can match zero rows) must return `404` when no row comes back, not `{ pin: null }`.

2. **JSON safety.** Wrap the interactions `JSON.stringify(payload)` insert so a
   circular/unserializable payload returns `400`, never an uncaught 500. Validate
   `clampPayload` output is always serializable.

3. **Graceful schema degrade.** Where a table may not exist yet (reputation,
   `irl_interactions`), the query must `.catch` into a safe default
   (`available:false` / `0` / `null`) so a fresh or mid-migration DB never 500s.
   Guard the downstream code against undefined rows (e.g. agent-card `buildCard`).

4. **Input validation at the boundary.** `radius` (reject non-finite), pin `id`
   format, and required body fields validated up front with a `400` + clear message.

5. **SSE send failures surface, not vanish.** `conn.send` failures must be logged
   (task 14 covers the logging contract) and the dead connection cleaned up, not
   silently dropped.

## Implementation guidance
- Keep the existing `json(res, status, body)` helper and response shapes.
- Internal code may trust itself; harden only the boundaries (network, DB, user input).
- Add/extend tests under `tests/api/irl-*.test.js` for each new failure path (malformed
  input → 400, missing row → 404, missing table → safe default). These tests run in
  Node and ARE verifiable here.
- **Do not edit `data/changelog.json`** — return your proposed changelog line in your
  summary; the orchestrator consolidates it.

## Definition of done
- [ ] No endpoint can 500 on malformed input, missing row, or missing table — covered
      by new/extended `tests/api/irl-*.test.js`.
- [ ] No stack trace or internal detail in any client response (coordinate with task 13).
- [ ] `npm test` green.

<!-- AUTO:self-delete-on-complete -->

---

## ✅ On completion — delete this file

This file is a unit of work, not a permanent doc. The moment every item above is **built, wired, verified, and committed** to the "Definition of done" in the repo-root `CLAUDE.md`, remove it in the same change:

```bash
git rm "tasks/irl-production/11-api-error-boundaries.md"
```

Stage the deletion alongside your implementation and include it in the completion commit. This directory is the backlog: a file that still exists is unfinished work; a file that is gone has shipped. Do not delete early, and never leave a completed prompt behind.

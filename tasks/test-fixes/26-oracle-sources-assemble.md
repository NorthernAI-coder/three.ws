# Fix failing tests — `tests/oracle/sources-assemble.test.js`

> 1 of 2 tests in this file are failing. Make it green without weakening coverage.

## Reproduce
```bash
npx vitest run tests/oracle/sources-assemble.test.js
```

## Failing tests (1)

### assembleIntel — outage vs unknown › throws when the primary lookup fails (DB outage) — never a silent null
```
Error: db query exceeded 15000ms deadline
    at /workspaces/three.ws/tests/oracle/sources-assemble.test.js:28:29
```

## What to do
1. Read the test and the module(s) it exercises. Decide whether the **source** is wrong (a real bug) or the **test** is stale (asserts old behavior). Fix the side that is actually wrong — do not loosen an assertion just to make it pass.
2. Fix the **root cause**, not the symptom. No `.skip`, no `it.todo`, no deleting tests, no widening matchers to swallow a real defect.
3. If the failure is from a missing live dependency (DB, Redis, network, an LLM/MCP endpoint), make the test **hermetic** at its boundary the same way sibling green tests in `tests/` do — never introduce mocks/fakes into product code, and never weaken a real integration.
4. Follow `CLAUDE.md`: no mocks/fake data in source, no TODOs/stubs, real implementations only. **$THREE is the only coin** that may be referenced anywhere.
5. Stage only the explicit paths you touch (never `git add -A`) — other agents are working in this same worktree.

## Done when
- [ ] `npx vitest run tests/oracle/sources-assemble.test.js` is fully green.
- [ ] You ran the broader suite and your change introduced **no new** failures elsewhere.
- [ ] `git diff` self-reviewed; every changed line justified.
- [ ] No console errors/warnings from your code; no coin other than $THREE referenced.

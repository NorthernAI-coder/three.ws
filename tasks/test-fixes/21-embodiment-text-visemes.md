# Fix failing tests — `tests/embodiment-text-visemes.test.js`

> This test file fails to load/run at all. Make it green without weakening coverage.

## Reproduce
```bash
npx vitest run tests/embodiment-text-visemes.test.js
```

## Load / parse error
The file produced no test results — it likely throws on import (bad import path, syntax error, or a module-level call that needs a dependency that isn't available under test).

```
Cannot find module '../src/embodiment/text-visemes.js' imported from /workspaces/three.ws/tests/embodiment-text-visemes.test.js
```
## What to do
1. Read the test and the module(s) it exercises. Decide whether the **source** is wrong (a real bug) or the **test** is stale (asserts old behavior). Fix the side that is actually wrong — do not loosen an assertion just to make it pass.
2. Fix the **root cause**, not the symptom. No `.skip`, no `it.todo`, no deleting tests, no widening matchers to swallow a real defect.
3. If the failure is from a missing live dependency (DB, Redis, network, an LLM/MCP endpoint), make the test **hermetic** at its boundary the same way sibling green tests in `tests/` do — never introduce mocks/fakes into product code, and never weaken a real integration.
4. Follow `CLAUDE.md`: no mocks/fake data in source, no TODOs/stubs, real implementations only. **$THREE is the only coin** that may be referenced anywhere.
5. Stage only the explicit paths you touch (never `git add -A`) — other agents are working in this same worktree.

## Done when
- [ ] `npx vitest run tests/embodiment-text-visemes.test.js` is fully green.
- [ ] You ran the broader suite and your change introduced **no new** failures elsewhere.
- [ ] `git diff` self-reviewed; every changed line justified.
- [ ] No console errors/warnings from your code; no coin other than $THREE referenced.

# Fix failing tests — `tests/api/mcp-3d-challenge.test.js`

> 7 of 15 tests in this file are failing. Make it green without weakening coverage.

## Reproduce
```bash
npx vitest run tests/api/mcp-3d-challenge.test.js
```

## Likely shared root cause
Several failures share the same first error line — fix the common cause once:

- `TypeError: Cannot read properties of undefined (reading 'url')` — 3 tests
- `TypeError: accepts is not iterable` — 3 tests
- `TypeError: Cannot read properties of undefined (reading 'bazaar')` — 1 test

## Failing tests (7)

### POST /api/mcp-3d — unauthenticated challenge identity › plain x402 clients get a 402 naming the 3D Studio resource
```
TypeError: Cannot read properties of undefined (reading 'url')
    at /workspaces/three.ws/tests/api/mcp-3d-challenge.test.js:96:29
    at processTicksAndRejections (node:internal/process/task_queues:104:5)
```

### POST /api/mcp-3d — unauthenticated challenge identity › bazaar discovery example calls text_to_3d, not a main-server tool
```
TypeError: Cannot read properties of undefined (reading 'bazaar')
    at /workspaces/three.ws/tests/api/mcp-3d-challenge.test.js:109:21
    at processTicksAndRejections (node:internal/process/task_queues:104:5)
```

### POST /api/mcp-3d — unauthenticated challenge identity › MCP protocol clients get a 401 with the same studio envelope
```
TypeError: Cannot read properties of undefined (reading 'url')
    at /workspaces/three.ws/tests/api/mcp-3d-challenge.test.js:126:29
    at processTicksAndRejections (node:internal/process/task_queues:104:5)
```

### POST /api/mcp-3d — unauthenticated challenge identity › GET (SSE probe) advertises the studio resource as well
```
TypeError: Cannot read properties of undefined (reading 'url')
    at /workspaces/three.ws/tests/api/mcp-3d-challenge.test.js:135:29
    at processTicksAndRejections (node:internal/process/task_queues:104:5)
```

### POST /api/mcp-3d — per-tool x402 pricing › quotes the standard tier price for a default text_to_3d call
```
TypeError: accepts is not iterable
    at /workspaces/three.ws/tests/api/mcp-3d-challenge.test.js:215:24
    at processTicksAndRejections (node:internal/process/task_queues:104:5)
```

### POST /api/mcp-3d — per-tool x402 pricing › quotes the high tier price when the caller asks for tier: high
```
TypeError: accepts is not iterable
    at /workspaces/three.ws/tests/api/mcp-3d-challenge.test.js:222:24
    at processTicksAndRejections (node:internal/process/task_queues:104:5)
```

### POST /api/mcp-3d — per-tool x402 pricing › sums a batch of priced calls into one charge
```
TypeError: accepts is not iterable
    at /workspaces/three.ws/tests/api/mcp-3d-challenge.test.js:242:24
    at processTicksAndRejections (node:internal/process/task_queues:104:5)
```

## What to do
1. Read the test and the module(s) it exercises. Decide whether the **source** is wrong (a real bug) or the **test** is stale (asserts old behavior). Fix the side that is actually wrong — do not loosen an assertion just to make it pass.
2. Fix the **root cause**, not the symptom. No `.skip`, no `it.todo`, no deleting tests, no widening matchers to swallow a real defect.
3. If the failure is from a missing live dependency (DB, Redis, network, an LLM/MCP endpoint), make the test **hermetic** at its boundary the same way sibling green tests in `tests/` do — never introduce mocks/fakes into product code, and never weaken a real integration.
4. Follow `CLAUDE.md`: no mocks/fake data in source, no TODOs/stubs, real implementations only. **$THREE is the only coin** that may be referenced anywhere.
5. Stage only the explicit paths you touch (never `git add -A`) — other agents are working in this same worktree.

## Done when
- [ ] `npx vitest run tests/api/mcp-3d-challenge.test.js` is fully green.
- [ ] You ran the broader suite and your change introduced **no new** failures elsewhere.
- [ ] `git diff` self-reviewed; every changed line justified.
- [ ] No console errors/warnings from your code; no coin other than $THREE referenced.

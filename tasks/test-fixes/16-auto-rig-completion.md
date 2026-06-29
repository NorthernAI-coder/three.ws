# Fix failing tests — `tests/auto-rig-completion.test.js`

> 3 of 5 tests in this file are failing. Make it green without weakening coverage.

## Reproduce
```bash
npx vitest run tests/auto-rig-completion.test.js
```

## Failing tests (3)

### 6a — cron recovers an open job from its stored result_glb_url › finalizes via the stored URL and never re-polls the provider
```
AssertionError: expected +0 to be 1 // Object.is equality
    at /workspaces/three.ws/tests/auto-rig-completion.test.js:206:26
    at processTicksAndRejections (node:internal/process/task_queues:104:5)
```

### 6c — finalizeAutoRigStage is concurrency-safe › lets exactly one of two concurrent finalizes materialize the avatar
```
TypeError: Invalid IP address: undefined
    at emitLookup (node:net:1503:17)
    at lookup (/workspaces/three.ws/api/_lib/ssrf-guard.js:172:5)
    at emitLookup (node:net:1454:5)
    at defaultTriggerAsyncIdScope (node:internal/async_hooks:472:18)
    at lookupAndConnectMultiple (node:net:1453:3)
    at node:net:1399:7
    at defaultTriggerAsyncIdScope (node:internal/async_hooks:472:18)
    at lookupAndConnect (node:net:1398:5)
    at TLSSocket.Socket.connect (node:net:1293:5)
    at Object.connect (node:internal/tls/wrap:1772:13)
```

### 6c — finalizeAutoRigStage is concurrency-safe › a thrown winner releases the claim to a cron-selectable status (not done, not wedged)
```
Error: expected [Function] to throw error including 'r2 down' but got 'Invalid IP address: undefined'
    at Reflect.get (<anonymous>)
    at /workspaces/three.ws/tests/auto-rig-completion.test.js:329:4
    at processTicksAndRejections (node:internal/process/task_queues:104:5)
```

## What to do
1. Read the test and the module(s) it exercises. Decide whether the **source** is wrong (a real bug) or the **test** is stale (asserts old behavior). Fix the side that is actually wrong — do not loosen an assertion just to make it pass.
2. Fix the **root cause**, not the symptom. No `.skip`, no `it.todo`, no deleting tests, no widening matchers to swallow a real defect.
3. If the failure is from a missing live dependency (DB, Redis, network, an LLM/MCP endpoint), make the test **hermetic** at its boundary the same way sibling green tests in `tests/` do — never introduce mocks/fakes into product code, and never weaken a real integration.
4. Follow `CLAUDE.md`: no mocks/fake data in source, no TODOs/stubs, real implementations only. **$THREE is the only coin** that may be referenced anywhere.
5. Stage only the explicit paths you touch (never `git add -A`) — other agents are working in this same worktree.

## Done when
- [ ] `npx vitest run tests/auto-rig-completion.test.js` is fully green.
- [ ] You ran the broader suite and your change introduced **no new** failures elsewhere.
- [ ] `git diff` self-reviewed; every changed line justified.
- [ ] No console errors/warnings from your code; no coin other than $THREE referenced.

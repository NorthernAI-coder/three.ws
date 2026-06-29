# Fix failing tests — `tests/api/all-modules-load.test.js`

> 19 of 841 tests in this file are failing. Make it green without weakening coverage.

## Reproduce
```bash
npx vitest run tests/api/all-modules-load.test.js
```

## Likely shared root cause
Several failures share the same first error line — fix the common cause once:

- `Error: Failed to resolve entry for package "@nirholas/pump-sdk". The package may have incorrect main/module/exports specified in its package.json.` — 13 tests
- `Error: Failed to resolve entry for package "@three-ws/solana-agent". The package may have incorrect main/module/exports specified in its package.json.` — 3 tests
- `Error: ENOENT: no such file or directory, open '/workspaces/three.ws/data/_generated/skill-metadata.json'` — 2 tests
- `Error: paidEndpoint: bazaar discovery extension is required` — 1 test

## Failing tests (19)

### every api/**/*.js handler loads › api/agenc/[action].js
```
Error: Failed to resolve entry for package "@three-ws/solana-agent". The package may have incorrect main/module/exports specified in its package.json.
    at async Promise.all (index 6)
```

### every api/**/*.js handler loads › api/agents/agent-mirror.js
```
Error: Failed to resolve entry for package "@nirholas/pump-sdk". The package may have incorrect main/module/exports specified in its package.json.
    at async Promise.all (index 1)
```

### every api/**/*.js handler loads › api/agents/agent-strategy-objects.js
```
Error: Failed to resolve entry for package "@nirholas/pump-sdk". The package may have incorrect main/module/exports specified in its package.json.
    at async Promise.all (index 1)
```

### every api/**/*.js handler loads › api/agents/alpha.js
```
Error: Failed to resolve entry for package "@nirholas/pump-sdk". The package may have incorrect main/module/exports specified in its package.json.
    at async Promise.all (index 1)
```

### every api/**/*.js handler loads › api/agents/copilot.js
```
Error: Failed to resolve entry for package "@nirholas/pump-sdk". The package may have incorrect main/module/exports specified in its package.json.
    at async Promise.all (index 1)
```

### every api/**/*.js handler loads › api/agents/solana-trade.js
```
Error: Failed to resolve entry for package "@nirholas/pump-sdk". The package may have incorrect main/module/exports specified in its package.json.
    at async Promise.all (index 1)
```

### every api/**/*.js handler loads › api/agora/[action].js
```
Error: Failed to resolve entry for package "@three-ws/solana-agent". The package may have incorrect main/module/exports specified in its package.json.
    at async Promise.all (index 6)
```

### every api/**/*.js handler loads › api/agora/act.js
```
Error: Failed to resolve entry for package "@three-ws/solana-agent". The package may have incorrect main/module/exports specified in its package.json.
    at async Promise.all (index 10)
```

### every api/**/*.js handler loads › api/chat-skills.js
```
Error: ENOENT: no such file or directory, open '/workspaces/three.ws/data/_generated/skill-metadata.json'
    at readFileSync (node:fs:440:20)
    at /workspaces/three.ws/api/chat-skills.js:22:14
    at processTicksAndRejections (node:internal/process/task_queues:104:5)
    at /workspaces/three.ws/tests/api/all-modules-load.test.js:72:17
```

### every api/**/*.js handler loads › api/cron/mirror-fanout.js
```
Error: Failed to resolve entry for package "@nirholas/pump-sdk". The package may have incorrect main/module/exports specified in its package.json.
    at async Promise.all (index 1)
```

### every api/**/*.js handler loads › api/cron/signal-fanout.js
```
Error: Failed to resolve entry for package "@nirholas/pump-sdk". The package may have incorrect main/module/exports specified in its package.json.
    at async Promise.all (index 1)
```

### every api/**/*.js handler loads › api/cron/strategy-fanout.js
```
Error: Failed to resolve entry for package "@nirholas/pump-sdk". The package may have incorrect main/module/exports specified in its package.json.
    at async Promise.all (index 1)
```

### every api/**/*.js handler loads › api/signals/feed.js
```
Error: Failed to resolve entry for package "@nirholas/pump-sdk". The package may have incorrect main/module/exports specified in its package.json.
    at async Promise.all (index 1)
```

### every api/**/*.js handler loads › api/signals/feeds.js
```
Error: Failed to resolve entry for package "@nirholas/pump-sdk". The package may have incorrect main/module/exports specified in its package.json.
    at async Promise.all (index 1)
```

### every api/**/*.js handler loads › api/signals/marketplace.js
```
Error: Failed to resolve entry for package "@nirholas/pump-sdk". The package may have incorrect main/module/exports specified in its package.json.
    at async Promise.all (index 1)
```

### every api/**/*.js handler loads › api/signals/subscribe.js
```
Error: Failed to resolve entry for package "@nirholas/pump-sdk". The package may have incorrect main/module/exports specified in its package.json.
    at async Promise.all (index 1)
```

### every api/**/*.js handler loads › api/skills-manifest.js
```
Error: ENOENT: no such file or directory, open '/workspaces/three.ws/data/_generated/skill-metadata.json'
    at readFileSync (node:fs:440:20)
    at /workspaces/three.ws/api/skills-manifest.js:15:14
    at processTicksAndRejections (node:internal/process/task_queues:104:5)
    at /workspaces/three.ws/tests/api/all-modules-load.test.js:72:17
```

### every api/**/*.js handler loads › api/trading/scan.js
```
Error: Failed to resolve entry for package "@nirholas/pump-sdk". The package may have incorrect main/module/exports specified in its package.json.
    at async Promise.all (index 1)
```

### every api/**/*.js handler loads › api/x402/skill-marketplace.js
```
Error: paidEndpoint: bazaar discovery extension is required
    at paidEndpoint (/workspaces/three.ws/api/_lib/x402-paid-endpoint.js:306:21)
    at /workspaces/three.ws/api/x402/skill-marketplace.js:315:34
    at processTicksAndRejections (node:internal/process/task_queues:104:5)
    at /workspaces/three.ws/tests/api/all-modules-load.test.js:72:17
```

## What to do
1. Read the test and the module(s) it exercises. Decide whether the **source** is wrong (a real bug) or the **test** is stale (asserts old behavior). Fix the side that is actually wrong — do not loosen an assertion just to make it pass.
2. Fix the **root cause**, not the symptom. No `.skip`, no `it.todo`, no deleting tests, no widening matchers to swallow a real defect.
3. If the failure is from a missing live dependency (DB, Redis, network, an LLM/MCP endpoint), make the test **hermetic** at its boundary the same way sibling green tests in `tests/` do — never introduce mocks/fakes into product code, and never weaken a real integration.
4. Follow `CLAUDE.md`: no mocks/fake data in source, no TODOs/stubs, real implementations only. **$THREE is the only coin** that may be referenced anywhere.
5. Stage only the explicit paths you touch (never `git add -A`) — other agents are working in this same worktree.

## Done when
- [ ] `npx vitest run tests/api/all-modules-load.test.js` is fully green.
- [ ] You ran the broader suite and your change introduced **no new** failures elsewhere.
- [ ] `git diff` self-reviewed; every changed line justified.
- [ ] No console errors/warnings from your code; no coin other than $THREE referenced.

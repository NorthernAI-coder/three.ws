# Fix failing tests — `tests/api/x402-discovery-parity.test.js`

> 1 of 4 tests in this file are failing. Make it green without weakening coverage.

## Reproduce
```bash
npx vitest run tests/api/x402-discovery-parity.test.js
```

## Failing tests (1)

### x402 discovery catalog parity › lists every paid /api/x402/* endpoint (no silent drift)
```
AssertionError: Paid x402 endpoints missing from /.well-known/x402-discovery: /api/x402/analytics, /api/x402/api-key-health, /api/x402/auth-health, /api/x402/avatar-optimize-batch, /api/x402/bazaar-feed, /api/x402/billboard, /api/x402/cross-chain, /api/x402/did, /api/x402/feed-health, /api/x402/llm-proxy, /api/x402/mcp-tool-catalog, /api/x402/model-validation-sweep, /api/x402/notify, /api/x402/pay-by-name, /api/x402/rate-limit-probe, /api/x402/schema-check, /api/x402/solana-register-health, /api/x402/spend-session, /api/x402/telegram-health, /api/x402/wallet-connect. Add a matching resources[] entry in api/wk.js handleX402Discovery, or document an exemption in EXCLUSIONS with a reason.: expected [ '/api/x402/analytics', …(19) ] to deeply equal []
    at /workspaces/three.ws/tests/api/x402-discovery-parity.test.js:99:5
    at processTicksAndRejections (node:internal/process/task_queues:104:5)
```

## What to do
1. Read the test and the module(s) it exercises. Decide whether the **source** is wrong (a real bug) or the **test** is stale (asserts old behavior). Fix the side that is actually wrong — do not loosen an assertion just to make it pass.
2. Fix the **root cause**, not the symptom. No `.skip`, no `it.todo`, no deleting tests, no widening matchers to swallow a real defect.
3. If the failure is from a missing live dependency (DB, Redis, network, an LLM/MCP endpoint), make the test **hermetic** at its boundary the same way sibling green tests in `tests/` do — never introduce mocks/fakes into product code, and never weaken a real integration.
4. Follow `CLAUDE.md`: no mocks/fake data in source, no TODOs/stubs, real implementations only. **$THREE is the only coin** that may be referenced anywhere.
5. Stage only the explicit paths you touch (never `git add -A`) — other agents are working in this same worktree.

## Done when
- [ ] `npx vitest run tests/api/x402-discovery-parity.test.js` is fully green.
- [ ] You ran the broader suite and your change introduced **no new** failures elsewhere.
- [ ] `git diff` self-reviewed; every changed line justified.
- [ ] No console errors/warnings from your code; no coin other than $THREE referenced.

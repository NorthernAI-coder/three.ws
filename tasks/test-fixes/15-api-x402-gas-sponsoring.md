# Fix failing tests — `tests/api/x402-gas-sponsoring.test.js`

> 3 of 5 tests in this file are failing. Make it green without weakening coverage.

## Reproduce
```bash
npx vitest run tests/api/x402-gas-sponsoring.test.js
```

## Likely shared root cause
Several failures share the same first error line — fix the common cause once:

- `TypeError: Cannot read properties of undefined (reading 'eip2612GasSponsoring')` — 3 tests

## Failing tests (3)

### build402Body — gas-sponsoring extension advertisement › advertises both eip2612 + erc20-approval when a Permit2 accept is present
```
TypeError: Cannot read properties of undefined (reading 'eip2612GasSponsoring')
    at /workspaces/three.ws/tests/api/x402-gas-sponsoring.test.js:49:25
```

### build402Body — gas-sponsoring extension advertisement › does NOT advertise either extension when only EIP-3009 accepts are offered
```
TypeError: Cannot read properties of undefined (reading 'eip2612GasSponsoring')
    at /workspaces/three.ws/tests/api/x402-gas-sponsoring.test.js:68:25
```

### build402Body — gas-sponsoring extension advertisement › permit2VariantOf returns an accept whose Permit2 hint triggers both extensions
```
TypeError: Cannot read properties of undefined (reading 'eip2612GasSponsoring')
    at /workspaces/three.ws/tests/api/x402-gas-sponsoring.test.js:91:25
```

## What to do
1. Read the test and the module(s) it exercises. Decide whether the **source** is wrong (a real bug) or the **test** is stale (asserts old behavior). Fix the side that is actually wrong — do not loosen an assertion just to make it pass.
2. Fix the **root cause**, not the symptom. No `.skip`, no `it.todo`, no deleting tests, no widening matchers to swallow a real defect.
3. If the failure is from a missing live dependency (DB, Redis, network, an LLM/MCP endpoint), make the test **hermetic** at its boundary the same way sibling green tests in `tests/` do — never introduce mocks/fakes into product code, and never weaken a real integration.
4. Follow `CLAUDE.md`: no mocks/fake data in source, no TODOs/stubs, real implementations only. **$THREE is the only coin** that may be referenced anywhere.
5. Stage only the explicit paths you touch (never `git add -A`) — other agents are working in this same worktree.

## Done when
- [ ] `npx vitest run tests/api/x402-gas-sponsoring.test.js` is fully green.
- [ ] You ran the broader suite and your change introduced **no new** failures elsewhere.
- [ ] `git diff` self-reviewed; every changed line justified.
- [ ] No console errors/warnings from your code; no coin other than $THREE referenced.

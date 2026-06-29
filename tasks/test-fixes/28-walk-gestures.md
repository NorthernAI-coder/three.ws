# Fix failing tests — `tests/walk-gestures.test.js`

> 3 of 5 tests in this file are failing. Make it green without weakening coverage.

## Reproduce
```bash
npx vitest run tests/walk-gestures.test.js
```

## Failing tests (3)

### walk-gestures — clip availability › loop gestures are the held ones (dance, sit, talking)
```
AssertionError: expected [ 'dance', 'jog', 'sit', 'talking' ] to deeply equal [ 'dance', 'sit', 'talking' ]
    at /workspaces/three.ws/tests/walk-gestures.test.js:31:26
```

### walk-gestures — clip availability › full-body gestures (sit, dance) take over the base layer; the rest overlay
```
AssertionError: expected [ 'celebrate', 'dance', 'jog', …(2) ] to deeply equal [ 'dance', 'sit' ]
    at /workspaces/three.ws/tests/walk-gestures.test.js:36:23
```

### walk-gestures — wheel order › GESTURE_ORDER lists all eight gestures exactly once
```
AssertionError: expected [ 'agree', 'cheer', 'dance', …(5) ] to deeply equal [ 'agree', 'celebrate', 'cheer', …(9) ]
    at /workspaces/three.ws/tests/walk-gestures.test.js:45:37
```

## What to do
1. Read the test and the module(s) it exercises. Decide whether the **source** is wrong (a real bug) or the **test** is stale (asserts old behavior). Fix the side that is actually wrong — do not loosen an assertion just to make it pass.
2. Fix the **root cause**, not the symptom. No `.skip`, no `it.todo`, no deleting tests, no widening matchers to swallow a real defect.
3. If the failure is from a missing live dependency (DB, Redis, network, an LLM/MCP endpoint), make the test **hermetic** at its boundary the same way sibling green tests in `tests/` do — never introduce mocks/fakes into product code, and never weaken a real integration.
4. Follow `CLAUDE.md`: no mocks/fake data in source, no TODOs/stubs, real implementations only. **$THREE is the only coin** that may be referenced anywhere.
5. Stage only the explicit paths you touch (never `git add -A`) — other agents are working in this same worktree.

## Done when
- [ ] `npx vitest run tests/walk-gestures.test.js` is fully green.
- [ ] You ran the broader suite and your change introduced **no new** failures elsewhere.
- [ ] `git diff` self-reviewed; every changed line justified.
- [ ] No console errors/warnings from your code; no coin other than $THREE referenced.

# Task 06 — Tests: prove every launch path produces a `3ws…` mint

## Goal

Lock the brand invariant with tests at three levels: the validator, the server handlers,
and an end-to-end launch. Guard against regression on every path tasks 01–04 touched.

## Context

- Existing vanity tests to keep green and extend: `tests/vanity-keygen.test.js`,
  `tests/vanity-wasm-grinder.test.js`, `tests/mcp-vanity-grinder.test.js`.
- The suite is run with `npm test`. Note (per the swarm memory) the full suite may be red
  from unrelated churn — your job is that **your** new tests pass and you don't add red;
  run the targeted files directly to confirm.
- Brand module: `src/solana/vanity/brand.js` (task 00).

## New / updated tests

### Unit — `tests/three-ws-mark.test.js` (new)
- `hasThreeWsMark`: true for `3ws…`, `3WS…`, `3wS…`; false for `x3ws…`, `''`, `null`, a 2-char string.
- `assertThreeWsMark`: throws `UnbrandedMintError` with `code === 'unbranded_mint'` on bad input; no throw on good.
- `THREE_WS_VANITY` is frozen, `prefix === '3ws'`, `ignoreCase === true`.
- `grindVanityNode({ ...THREE_WS_VANITY })` returns a `publicKey` satisfying `hasThreeWsMark` (this is a real grind — fast, but mark it as the one "slow-ish" unit if your harness separates them).

### Integration — `tests/launch-mark-enforcement.test.js` (new)
Drive `handleLaunchPrep` / `handleLaunchAgent` with mocked auth/db/connection (follow the
mocking pattern already used by the pump handler tests, if any; otherwise mock `sql`,
`getSessionUser`, `getPumpSdk`, and the Solana connection):
- **prep, no mint** → response `mint` passes `hasThreeWsMark`.
- **prep, unmarked mint supplied** → `400` with `error === 'unbranded_mint'`.
- **prep, marked mint supplied** → `200`, echoes that mint.
- **prep, `THREE_WS_MARK_ENFORCE=0`** → legacy path, mint not required to be marked.
- **launch-agent, no mint** → server-ground mint passes `hasThreeWsMark`, and is what
  `vtx.sign` receives (assert via the mocked sign call or the registered `pump_agent_mints` mint).
- **launch-agent, unmarked supplied pair** → `400 unbranded_mint`.

### E2E / smoke — extend `scripts/pumpfun-lifecycle-smoke.js`
- After a devnet launch, assert the resulting mint matches `/^3ws/i`; fail the smoke loudly otherwise.

### Regression guard
- Add a tiny test asserting the literal `'3ws'` appears in exactly one source file
  (`brand.js`) — a grep-based test — so a future contributor can't quietly hardcode the mark
  elsewhere and drift. (Scope the grep to `src/`, exclude `tests/` and `tasks/`.)

## Constraints

- No network calls in unit/integration tests except the local in-process grind (which is CPU-only).
- Don't weaken or delete existing vanity tests; extend them.
- Use `$THREE` / the canonical CA for any fixture that needs a coin; never another mint.

## Success criteria

- `node --test tests/three-ws-mark.test.js tests/launch-mark-enforcement.test.js` (or the
  repo's test runner) passes.
- Existing `tests/vanity-*.test.js` still pass.
- The smoke script asserts the mark on devnet.
- Removing the enforcement code makes the integration tests fail (verify by temporarily
  reverting — the tests must actually bite).

## Verification

```bash
npm test 2>&1 | tail -40          # confirm no NEW failures vs the known-red baseline
node --test tests/three-ws-mark.test.js tests/launch-mark-enforcement.test.js
```

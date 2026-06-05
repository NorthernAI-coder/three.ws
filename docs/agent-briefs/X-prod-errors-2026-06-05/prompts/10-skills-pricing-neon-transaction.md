# Fix 10 — `skills-pricing` Neon `transaction()` misuse (P1, 4 lines)

## The error (verbatim)

```
[api] unhandled Error: transaction() expects an array of queries,
  or a function returning an array of queries
  at Xs.X.transaction (api/agents/[id]/skills-pricing.js)
  at handlePut
```

`PUT /api/agents/[id]/skills-pricing` returns 500.

## Root cause

The Neon serverless driver's `sql.transaction()` has a specific contract: it takes **an
array of query promises** (or a function returning one), and runs them in a single
transaction — it is **not** the interactive `BEGIN…COMMIT` callback style of `node-postgres`.
`handlePut` is calling it the pg way (passing an `async (tx) => { ... }` that runs queries
imperatively), which the Neon driver rejects.

Ref: Neon serverless driver docs — `sql.transaction([sql\`...\`, sql\`...\`])`.

## Required fix

`api/agents/[id]/skills-pricing.js` — `handlePut`.

1. **Rewrite the transaction in the Neon contract.** Collect the parameterized queries into
   an array and pass it: `await sql.transaction([ sql\`update ...\`, sql\`insert ...\` ])`.
   If the logic needs values from one query to build the next (truly interactive), the Neon
   HTTP driver can't do that in one `transaction()` call — restructure so all statements are
   known up front, or use a single statement with CTEs (`WITH ... INSERT/UPDATE ... RETURNING`)
   to keep it atomic in one round-trip.
2. **Keep it atomic.** Pricing writes must be all-or-nothing — don't split into separate
   non-transactional calls just to dodge the API. Use the array form or a CTE so partial
   writes can't happen.
3. **Validate input at the boundary** (price values, skill ids) before the write so bad input
   returns a clean 400, not a 500.
4. **Check sibling handlers** in the same file (and other `*/skills-pricing.js`,
   `skills-pricing` callers) for the same misuse — fix all instances.

## Verification

- `PUT /api/agents/<real-id>/skills-pricing` with a valid pricing update → 200, prices
  persisted atomically; verify in DB.
- Send a malformed body → clean 400, no 500.
- Simulate a mid-transaction failure (e.g. constraint violation) → nothing partially
  written.
- Post-deploy logs: zero `transaction() expects an array of queries`.

## Definition of done

Skills-pricing writes use the Neon `transaction()` contract correctly, remain atomic,
validate input at the boundary, and every call site is fixed.

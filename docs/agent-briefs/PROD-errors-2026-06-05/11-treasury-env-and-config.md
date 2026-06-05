# Brief 11 — THREE_TREASURY_WALLET unset in production (34 errors)

## The error
```
[api] unhandled Error: [token] THREE_TREASURY_WALLET is required in production
— refusing to route treasury funds to an unset address.
```
Function: `/api/three-token/[action]` (and any token-routing path).

## Root cause
The token routing code correctly **fails closed** when `THREE_TREASURY_WALLET` is missing (good —
do not weaken this guard), but the env var is **not set in the production Vercel environment**, so
the feature is hard-down. This is a config gap, not a code bug.

## Required fix
1. Confirm the correct treasury wallet address with the user (the `$THREE` treasury). Set it:
   ```bash
   vercel env add THREE_TREASURY_WALLET production
   ```
   and redeploy. Verify `vercel env ls` shows it. Do **not** hardcode the address in source.
2. Keep the fail-closed guard. Additionally, make the **user-facing** response a clean typed 503
   ("treasury temporarily unavailable") rather than an unhandled 500, so a future misconfig
   degrades gracefully.
3. Audit sibling required-env guards for the same prod gap (`grep -rn "is required in production"
   api/`) and ensure each referenced var is actually set in prod. List any others you find for the
   user to populate.

## Done when
- `THREE_TREASURY_WALLET` is set in prod; the token route works end-to-end with the real treasury.
- Missing required envs return a typed 503, never an unhandled 500.
- No other `required in production` guard is silently tripping in the logs.

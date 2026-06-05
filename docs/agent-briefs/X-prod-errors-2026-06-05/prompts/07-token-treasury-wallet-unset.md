# Fix 07 — `THREE_TREASURY_WALLET` unset in production (P1, 18 lines)

## The error (verbatim)

```
[api] unhandled Error: [token] THREE_TREASURY_WALLET is required in production
  — refusing to route treasury funds to an unset address.
  at treasuryWallet (api/token/[action].js)
  at publicConfig → handleConfig
```

`/api/token/config` returns 500 on every call.

## Root cause

This is a **correct fail-closed guard** — the code rightly refuses to surface or route
treasury funds to an unset/zero address. The actual problem is **operational + a handler
design flaw**:

1. **Operational:** `THREE_TREASURY_WALLET` is not set in the production Vercel environment.
2. **Code:** `/api/token/config` is a *public config read* — it should not throw a 500 just
   because a *write/treasury-routing* env var is missing. A misconfigured treasury must not
   take down the public config endpoint. The guard belongs on the **fund-routing path**, not
   the read-only config path.

## Required fix

`api/token/[action].js` — see `treasuryWallet()`, `publicConfig()`, `handleConfig()`.

1. **Set the env var (ops).** Set `THREE_TREASURY_WALLET` to the real treasury address in
   Vercel prod (and preview if needed). Per `CLAUDE.md`, the only coin is `$THREE`
   (`FeMbDoX7R1Psc4GEcvJdsbNbZA3bfztcyDCatJVJpump`); the treasury must be the project's real
   `$THREE` treasury address — confirm the correct value with the user before setting it.
   **Do not invent an address.**
2. **Fix the handler boundary.** `handleConfig`/`publicConfig` must not 500 when the treasury
   is unset. Two clean options:
   - Keep `treasuryWallet()` strict for any path that *routes funds* (correct — leave it),
     but in `publicConfig` either omit the treasury field when unset, or return it as
     explicitly `null`/`unconfigured` so the read endpoint stays 200 and the client can show
     a "treasury not configured" state.
   - The hard `throw` should fire only when something actually tries to **move funds** to the
     treasury, not when reading config.
3. **No silent default.** Never fall back to a placeholder/zero address for fund routing —
   the existing fail-closed behavior on the *routing* path is correct and must stay.

## Verification

- With `THREE_TREASURY_WALLET` set: `/api/token/config` returns the real config incl. the
  treasury address.
- With it deliberately unset (local): `/api/token/config` returns 200 with treasury marked
  unconfigured — **not** 500 — while any fund-routing call still hard-refuses.
- Post-deploy logs: zero `THREE_TREASURY_WALLET is required` 500s on the config read.

## Definition of done

The treasury env var is set in prod to the real `$THREE` treasury, the public config read
never 500s on a missing treasury, and fund-routing remains fail-closed. The user confirmed
the address before it was set.

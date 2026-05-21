# SIWX — Sign-In-With-X build queue

Self-contained prompts to ship CAIP-122 wallet sign-in across every x402
paid endpoint on three.ws. Hand any one of them to a fresh Claude Code
session — each restates the context it needs.

**Start with [PLAN.md](PLAN.md)** for the architecture overview, schema,
and run order.

## Why we're doing this

Every paid endpoint in `api/x402/*.js` currently charges per call. That's
fine for one-shot APIs (validate this GLB, audit this agent) but **kills**
re-downloadable digital goods — GLBs, avatars, skills, agent definitions,
accessories. SIWX gives the buyer a wallet signature as a re-entry pass,
so the marketplace works the way creators and buyers expect: pay once,
re-access forever (or for the TTL the seller sets).

## The queue

| # | Prompt | Output | Depends on |
|---|---|---|---|
| 1 | [01-db-schema.md](01-db-schema.md) | `siwx_payments`, `siwx_nonces` tables + applier script | — |
| 2 | [02-storage-adapter.md](02-storage-adapter.md) | `api/_lib/siwx-storage.js` + tests | 1 |
| 3 | [03-paid-endpoint-integration.md](03-paid-endpoint-integration.md) | `siwx:` opt-in field on `paidEndpoint()` | 2 |
| 4 | [04-wire-endpoints.md](04-wire-endpoints.md) | skill-marketplace + dance-tip opt in, new `asset-download` endpoint, seeded GLBs | 3 |
| 5 | [05-browser-modal.md](05-browser-modal.md) | Two-button modal in `public/x402.js`, MetaMask + Phantom signing | 3 |
| 6 | [06-nonce-gc-cron.md](06-nonce-gc-cron.md) | Hourly Vercel cron pruning nonces + expired grants | 1 |
| 7 | [07-verify-end-to-end.md](07-verify-end-to-end.md) | Real-wallet end-to-end verification + artifact | 4, 5 |

Prompts 4, 5, 6 can run in parallel after 3 ships.

## Rails every prompt repeats (CLAUDE.md, non-negotiable)

- No mocks. No fake data. No placeholders. No TODOs. No stubs. No
  `throw new Error('not implemented')`. No commented-out code. No
  `setTimeout` fake-loading. No fallback sample arrays.
- Real Neon Postgres, real `@x402/extensions/sign-in-with-x` primitives,
  real wallets (MetaMask + Phantom), real R2.
- Errors at boundaries only (network, user input). Internal code trusts
  itself.
- Done = code wired into the existing path, dev server confirms feature
  in a real browser with no console errors, `npm test` green, `git diff`
  reviewed.
- Push to **both** `origin` (nirholas/3D-Agent) and `threews`
  (nirholas/three.ws) only when the user explicitly says push.

## What ships at the end of the queue

A buyer can pay $0.005 for a GLB on three.ws, close the tab, come back a
month later, click download again, sign with their wallet, and the file
streams without a second payment. Agents do the same thing through
`@x402/fetch` + `wrapFetchWithSIWx` without any extra integration. The
marketplace becomes economically coherent: creators sell access, buyers
own access, both sides verifiable on-chain.

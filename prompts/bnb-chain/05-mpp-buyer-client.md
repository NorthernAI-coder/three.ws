# 05 — MPP buyer client (our agents pay MPP endpoints)

Read `prompts/bnb-chain/00-CONTEXT.md` first, then `/workspaces/three.ws/CLAUDE.md`.
**Prereqs: 01** (`api/_lib/bnb/chains.js`). Run it first if missing.

## Why
The mirror of prompt 04. Our platform's agents should be able to PAY any MPP-protected
endpoint in the BNB ecosystem, the same way they already pay x402 endpoints via
`api/_lib/x402-buyer-fetch.js`. This unlocks the whole BNB agent economy as callable
services for our agents. Model on the existing x402 buyer so the ergonomics match.

## Build — `api/_lib/bnb/mpp-buyer.js`
- Read `api/_lib/x402-buyer-fetch.js` first — match its interface shape (a fetch-like wrapper
  that transparently handles the 402 → pay → retry loop).
- Export `mppFetch(url, opts, { account, maxSpend })` using `@bnb-chain/mpp` client:
  on a `402`, parse the MPP challenge, construct the appropriate credential
  (`authorization` EIP-3009 or `permit2`, per what the challenge accepts), attach it, retry.
  Enforce a **hard `maxSpend` cap** (atomic units) — never pay above it; return a typed
  "over budget" error instead. Caller injects the signing account; never read keys here.
- Support BSC testnet by default; parameterize network.

## States
Endpoint quotes above `maxSpend` → refuse, typed error, no payment sent. Challenge in an
unsupported credential type → clear error naming what's supported. Settlement broadcast fails
→ surface the on-chain reason, do not silently retry-forever (bounded retries).

## Tests (`tests/bnb-mpp-buyer.test.js`)
- Happy path: mock a server that 402s then 200s → `mppFetch` pays and returns the body.
- `maxSpend` enforcement: challenge above cap → refused, zero payment attempted.
- Unsupported credential type → typed error.
- Uses a synthetic testnet account.

## Definition of done
Inherit 00-CONTEXT DoD. Additionally:
- [ ] Real proof: point `mppFetch` at prompt 04's pilot endpoint (or the `@bnb-chain/mpp`
      example server) on testnet; paste the full round-trip — 402 challenge, the credential
      sent, and the 200 body with the settlement receipt.
- [ ] Wire it where our agents already select a payment method (grep for
      `x402-buyer-fetch` usages) so MPP endpoints become callable — at minimum expose it from
      the same module surface agents already import, with a short JSDoc example.
- [ ] Docs owned by prompt 06 (buyer side) — note readiness in PROGRESS.

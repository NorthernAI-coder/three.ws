# Task: x402 — default to the agent's own wallet + in-product pay affordance & activity

## Context

x402 payments are real: `api/x402-pay.js` negotiates payment requirements
(`api/_lib/x402-spec.js`), builds a Solana USDC payment payload
(`buildSolanaPaymentPayload`, `:320`), signs, and submits. There are two wallet
paths:

- **Per-agent** (`:179` `loadAgentKeypairForUser(agentId, userId)`,
  `:611` routing) — pays from `agent_identities.meta.encrypted_solana_secret` when
  an `agentId` is supplied + authenticated.
- **Platform fallback** (`:266` `loadAgentKeypair()` reading
  `X402_AGENT_SOLANA_SECRET_BASE58`, `:619`) — a **single shared platform wallet**
  used when no `agentId` is passed.

Asset is Solana USDC (`X402_ASSET_MINT_SOLANA`, `:263`). Two problems for the
"each avatar pays from its own wallet" vision: (1) anything that omits `agentId`
silently spends the shared platform wallet instead of the agent's; (2) there is no
in-product affordance for an agent to discover + pay an x402 service from its own
wallet, and no payment activity surfaced in the wallet hub.

Known trap (memory `in-app-x402-import-src-not-dist`): in-app imports of the local
x402-fetch package must use the committed `src/index.js`; `dist/` is gitignored and
404s in Vercel, silently breaking the pay flow.

## Goal

When an agent context is present, x402 payments default to **that agent's own
wallet** (the shared platform wallet becomes an explicit, narrow fallback only).
The wallet hub's **Pay** tab lets the owner find an x402 service (bazaar) and pay it
from the agent wallet, with the payment recorded and shown in activity.

## Files to Read First

- `api/x402-pay.js:179-192` (per-agent load), `:266-308` (platform load),
  `:609-623` (routing), `:320-371` (Solana payload), `:263` (asset mint)
- `api/_lib/x402-spec.js` — payment-requirements negotiation
- `api/_lib/agent-wallet.js:419` — `recoverSolanaAgentKeypair` (the only decrypt path)
- The x402-fetch package import sites — confirm they use `src/` not `dist/`
  (memory `in-app-x402-import-src-not-dist`); the `/irl` pay flow (`src/irl.js`) as a
  working in-app pay precedent
- `search-for-service` / `pay-for-service` / `x402` skills + bazaar search path — the
  discovery surface to reuse
- Task 01 hub shell (Pay tab), `…/solana/activity` for payment history

## What to Build / Do

1. **Default to per-agent.** In `api/x402-pay.js` routing (`:609`), when the request
   carries an agent context (authenticated owner + `agentId`, or the wallet hub
   context), pay from the agent's own wallet via `loadAgentKeypairForUser`. The
   shared `X402_AGENT_SOLANA_SECRET_BASE58` path becomes an explicit fallback used
   only for platform-level/demo calls with no agent — and that case is logged so a
   missing-agentId regression is visible, not silent. Don't break existing callers;
   make the agent path the default when context exists.
2. **Pay tab in the wallet hub** (shell from task 01):
   - Service discovery via the existing bazaar search (`search-for-service` path) —
     browse/search x402 endpoints.
   - A pay action that, for a chosen endpoint, fetches payment requirements
     (`x402-spec`), shows the price (USDC) + what's being bought, and on confirm pays
     **from the agent wallet** via `api/x402-pay.js`, streaming progress (the SSE
     path already exists).
   - Show the result + receipt (settlement/tx reference) and refresh balance.
3. **Payment activity.** Surface the agent's x402 payment history in the hub
   (extend `…/solana/activity` or add an x402 ledger read) so spend is auditable —
   what was paid, to whom, for what, when.
4. **Funding-aware.** USDC funding differs from SOL; if the agent lacks USDC for a
   payment, show a clear state and route to funding (deposit panel / fund skill).
   Don't attempt a payment that will fail for lack of balance.

## Constraints

- Agent keypair decrypted only via `recoverSolanaAgentKeypair`, server-side, after
  auth + ownership, audit-logged. No secret in responses/logs.
- Use the committed `src/` x402-fetch import, never `dist/` (it 404s in prod).
- Real x402 negotiation + settlement on Solana USDC. No simulated payments; the
  receipt reflects a real settlement.
- The shared platform wallet must not be spent on an agent's behalf when an agent
  context exists — verify the routing with a test.
- Errors at the boundary (no requirements, insufficient USDC, settlement failure)
  surface as designed, recoverable states. Owner-only pay controls.
- Coin/asset copy stays $THREE-only where the platform's own token is referenced;
  the x402 asset is USDC by protocol and is fine to name as the payment unit.

## Success Criteria

- With an agent context, an x402 payment is signed + settled from **that agent's**
  wallet (verified on devnet/testnet: the agent's balance decreases, not the
  platform wallet's).
- A missing-agentId platform fallback is logged, not silent.
- `npm run dev`: from the Pay tab, find a bazaar service, view its price, pay from
  the agent wallet, and see the receipt + updated balance + activity entry.
- Insufficient-USDC and settlement-error states render and route to funding.
- Import uses `src/` (grep confirms no `dist/` x402-fetch import). `npm run
  typecheck` + `npm test` clean.
- Changelog entry (tag: feature). Run the **completionist** subagent on changed files.

<!-- AUTO:self-delete-on-complete -->

---

## ✅ On completion — delete this file

This file is a unit of work, not a permanent doc. The moment every item above is **built, wired, verified, and committed** to the "Definition of done" in the repo-root `CLAUDE.md`, remove it in the same change:

```bash
git rm "tasks/agent-wallet-trading/08-x402-per-agent-pay.md"
```

Stage the deletion alongside your implementation and include it in the completion commit. This directory is the backlog: a file that still exists is unfinished work; a file that is gone has shipped. Do not delete early, and never leave a completed prompt behind.

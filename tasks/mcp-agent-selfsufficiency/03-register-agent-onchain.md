# Task 03 — Register an agent on-chain (`register_agent` / `identity_check`)

**Pillar:** Network / on-chain digital identity. **Server:** main `/api/mcp`
(agent-centric tools) — confirm placement; `/api/mcp-agent` is acceptable if it
fits the wallet/identity grouping better.
**Read first:** [`README.md`](README.md) and `/CLAUDE.md`.

## Goal

This is the "bootstrap problem." On-chain identity exists (Metaplex Agent
Registry on Solana, ERC-8004 on EVM, Solana memo attestations), but MCP can only
**read** reputation/passport — an agent cannot **register** itself. After this
task, an agent connected over MCP can mint its on-chain identity and screen for
impersonation, closing the "every digital identity needs a network" pillar.

## What already exists (wire to this — do not rebuild)

- **Metaplex Agent Registry (Solana), server-custodial:** `api/_lib/agent-registry.js`
    - `registerAgentIdentity(...)` — registers a Core asset into the Metaplex Agent
      Registry and mints an Agent Identity PDA. **Custody is held by the collection
      authority (three.ws), not the end user** — so this path can run **server-side
      without the user signing a wallet transaction**. This is the path to expose
      over MCP (headless agents cannot pop a browser wallet).
    - Related: `api/_lib/onchain-deploy.js` mints the Core asset (deploy step,
      separate from registry enrollment). Read both to understand the two-step flow
      and whether `registerAgentIdentity` handles or requires a prior deploy.
- **ERC-8004 (EVM):** `src/erc8004/agent-registry.js` — requires the **user's
  browser wallet** (ethers `BrowserProvider`) + IPFS upload + `register()` on the
  Identity Registry contract. **Not headless-signable**, so do NOT try to drive
  it from MCP. Instead, for the EVM path, `register_agent` should return a
  **prepared, designed "continue in browser" payload** (the registration JSON +
  the deep link to the web register flow) — never fabricate a transaction or
  claim success.
- **Identity integrity:** `api/agents/identity-check.js` (POST) — Granite
  embedding + cosine comparison against public agents (impersonation detection) +
  Granite Guardian content screening → `clear | review | block` verdict. REST
  only today.
- **Existing read tools** (`api/_mcp/tools/solana.js`): `solana_agent_passport`,
  `solana_agent_reputation`, `solana_agent_attestations` — match their style.

Read `api/_lib/agent-registry.js`, `api/_lib/onchain-deploy.js`,
`api/agents/identity-check.js`, and `api/agents.js` (how an agent row maps to an
owner + any existing registration metadata column) before writing.

## Build

### `register_agent` (scope: `agents:write` / `identity:write`)

Register one of the caller's agents on-chain.

- Inputs: `agent_id` (required, uuid), `chain` (enum `solana|base`, default
  `solana`), `force` (bool optional — re-register if already registered).
- Behavior: - Ownership check (`agent_identities.user_id === auth.userId`); reject the
  x402-payer/null path with a designed "sign in" error. - If already registered (check the agent's registration metadata) and not
  `force`: return the existing identity (idempotent), do not double-mint. - **`chain: solana`** → call the server-custodial `registerAgentIdentity(...)`
  path (deploy Core asset first if required). Persist the resulting Agent
  Identity PDA / registration URI back onto the agent record. Return
  `{ status: 'registered', chain, agent_pda, registration_uri, explorer_url }`. - **`chain: base`** (EVM/ERC-8004) → build the registration JSON via the
  existing ERC-8004 helper and return `{ status: 'needs_wallet_signature',
chain, registration_json, continue_url }` pointing at the web register flow.
  This is a **designed state**, not an error — the EVM path genuinely needs the
  user's wallet; surface that honestly with everything pre-filled. - If Solana registry env/keys are unconfigured → designed "registration not
  configured on this deployment" error (never a fake PDA).

### `identity_check` (scope: `agents:read`)

Screen an agent (or a proposed name/description) for impersonation + policy.

- Inputs: `agent_id` (optional) OR (`name` + `description`), to match what
  `api/agents/identity-check.js` accepts.
- Behavior: call the same logic as the identity-check endpoint (extract a shared
  helper if it isn't importable — no duplicated Granite calls). Return
  `{ verdict: 'clear'|'review'|'block', similar_agents: [...], reasons: [...] }`.

## Requirements & edge cases

- **Never fabricate an on-chain result.** Every returned PDA / tx / URI must come
  from a real call. Unconfigured or wallet-required → designed states.
- **Idempotent** registration (guard against double-mint with `force` opt-in).
- Persist the registration result onto the agent record so the existing read
  tools (`solana_agent_passport`, etc.) reflect it immediately.
- Reuse `api/agents/identity-check.js` logic for `identity_check`; do not
  re-implement embeddings/Guardian.
- Register the new scope(s) and gate writes; reject `auth.userId === null`.
- `$THREE` only — if any registration metadata references a token, it is `$THREE`.

## Definition of Done

All items in [`README.md`](README.md) → "Definition of Done", plus:

- [ ] Catalog lists `register_agent`, `identity_check` (assembly check).
- [ ] `tests/api/mcp-register-agent.test.js`: ownership rejection, idempotent
      re-register without `force`, the `base` chain `needs_wallet_signature`
      designed payload, the unconfigured-Solana designed error, and an
      `identity_check` verdict path (mock the registry + Granite layers). Green.
- [ ] `server.json` (and `server-agent.json` if placed there) description updated.
- [ ] Manually verified: `register_agent(chain:solana)` against a dev/devnet
      config returns a real PDA + explorer URL, and a second call is idempotent.

## Out of scope

- Driving the EVM wallet signature headlessly (return the prepared payload only).
- New on-chain contracts. SNS domain attachment (a separate, smaller follow-up).

<!-- AUTO:self-delete-on-complete -->

---

## ✅ On completion — delete this file

This file is a unit of work, not a permanent doc. The moment every item above is **built, wired, verified, and committed** to the "Definition of done" in the repo-root `CLAUDE.md`, remove it in the same change:

```bash
git rm "tasks/mcp-agent-selfsufficiency/03-register-agent-onchain.md"
```

Stage the deletion alongside your implementation and include it in the completion commit. This directory is the backlog: a file that still exists is unfinished work; a file that is gone has shipped. Do not delete early, and never leave a completed prompt behind.

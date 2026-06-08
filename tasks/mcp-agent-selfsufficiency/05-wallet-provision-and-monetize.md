# Task 05 — Provision & monetize a wallet (`provision_wallet` / `monetize_endpoint`)

**Pillar:** Wallet (jobs with x402). **Server:** agent wallet `/api/mcp-agent`.
**Read first:** [`README.md`](README.md) and `/CLAUDE.md`.

## Goal

The wallet pillar is currently **consumption-only** over MCP: an agent can check
status (`wallet_status`) and spend (`pay_and_call`), but it cannot **create/fund**
a wallet or **earn** — both require the web app. This task makes the wallet
two-sided: an agent can provision its own wallet and expose a paid x402 endpoint
to earn USDC, completing "a wallet (jobs with x402)."

## What already exists (wire to this — do not rebuild)

- **Agent wallet MCP tools** (`api/_mcpagent/tools.js`): `wallet_status`,
  `find_services`, `pay_and_call`. Match their style, auth, and spend-cap logic.
- **Solana wallet management (REST):** `api/agents/solana-wallet.js` —
  list address, check balance, **provision a wallet**, plus
  `api/agents/.../solana/activity` (recent signatures) and
  `api/agents/.../solana/airdrop` (devnet 1 SOL). Find the provisioning function
  (search `provision`, `getOrCreate`, `agent_wallets`/`solana_address`).
- **Wallet internals:** `api/_lib/agent-wallet.js` (provisioning/custody),
  `api/_lib/x402-user-payer.js` (the payer side). Read these to understand how a
  wallet is created and custodied per agent.
- **Monetization / earn:** there is an existing monetize path — the
  `monetize-service` skill and `api/_lib/x402-paid-endpoint.js` (paid-endpoint
  wrapper), plus the bazaar discovery (`api/mcp-bazaar.js`) where a service gets
  listed. Read `api/_lib/x402-paid-endpoint.js` and the monetize skill/flow, and
  any `agent_services` / paid-endpoint registry table, to see how an agent
  publishes a priced endpoint that others can `pay_and_call`.

Read `api/agents/solana-wallet.js`, `api/_lib/agent-wallet.js`, and the
monetize/paid-endpoint code fully before writing.

## Build

### `provision_wallet` (scope: `wallet:write`)

Create (or return the existing) custodial wallet for one of the caller's agents.

- Inputs: `agent_id` (required, uuid), `cluster` (enum `mainnet|devnet`, default
  `mainnet`), `airdrop` (bool, default false — devnet only).
- Behavior:
    - Ownership check (`agent_identities.user_id === auth.userId`); reject the null
      x402 path with a designed "sign in" error.
    - Idempotent: if the agent already has a wallet, return it (do not re-create).
    - Provision via the existing `api/agents/solana-wallet.js` / `agent-wallet.js`
      path. If `cluster:devnet` and `airdrop:true`, trigger the existing devnet
      airdrop. **Never** airdrop or fabricate balances on mainnet.
    - Return `{ agent_id, address, cluster, sol_balance, usdc_balance, created }`.

### `monetize_endpoint` (scope: `wallet:write` / `services:write`)

Publish a priced x402 endpoint so other agents can pay this agent to use it.

- Inputs: `agent_id` (required), `name` (required), `description` (required),
  `price_usdc` (required, number > 0), `target_url` (required, the upstream the
  agent already serves), `method` (enum GET|POST, default POST), `input_schema`
  (optional JSON Schema object), `network` (enum `base|solana`, default per the
  existing default).
- Behavior:
    - Ownership check. Validate `target_url` (public https, SSRF-guard).
    - Register the priced endpoint via the existing paid-endpoint / monetize
      mechanism (`api/_lib/x402-paid-endpoint.js` + whatever registry the
      `monetize-service` skill writes to) so it becomes discoverable by
      `find_services` / the bazaar and callable by `pay_and_call`.
    - Return `{ service_id, resource_url, price_usdc, network, bazaar_listed }`.
    - If the wallet/monetize prerequisites aren't met (no provisioned wallet, no
      payout address), return a designed error telling the caller to
      `provision_wallet` first — do not half-create a listing.

## Requirements & edge cases

- **Idempotency** on `provision_wallet`; **no mainnet airdrops/fabricated funds.**
- Ownership + scope on both tools; reject `auth.userId === null`.
- `monetize_endpoint` must produce a **real, discoverable** listing that
  `find_services`/bazaar surface and `pay_and_call` can hit — verify the loop
  closes (list → discover → pay). If the existing monetize flow needs a payout
  wallet, enforce that prerequisite (link to `provision_wallet`).
- Reuse spend-cap / rate-limit conventions from `api/_mcpagent/tools.js`.
- `$THREE` is the only coin; prices are in **USDC** (the x402 settlement asset) —
  do not introduce any other token.
- Register `wallet:write` (and `services:write` if used) scopes.

## Definition of Done

All items in [`README.md`](README.md) → "Definition of Done", plus:

- [ ] `/api/mcp-agent` catalog lists `provision_wallet`, `monetize_endpoint`
      (assembly check).
- [ ] `tests/api/mcp-wallet-provision.test.js`: provision happy-path + idempotent
      second call, ownership/null rejection, mainnet-airdrop refusal, a
      `monetize_endpoint` listing happy-path (mock the registry + wallet layers),
      SSRF rejection of a non-public `target_url`, and the "no wallet → provision
      first" designed error. Green.
- [ ] `server-agent.json` description updated to reflect provisioning + earning.
- [ ] Manually verified on **devnet**: `provision_wallet` → `monetize_endpoint`
      → the listing appears via `find_services` / bazaar `search_services`.

## Out of scope

- Token launch (pump.fun coin launch stays REST-only for now).
- Cross-chain bridging. Changing the custody model. Fiat on-ramp (the `fund`
  skill covers that).

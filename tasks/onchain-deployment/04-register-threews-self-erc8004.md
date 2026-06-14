# Task: Register three.ws Itself On-Chain (ERC-8004)

## Context

`public/.well-known/agent-registration.json` is three.ws's own ERC-8004 v1
registration record — the discovery document that other agents and indexers read to
verify three.ws is a real on-chain agent platform. It currently has
`registrations: []` (empty). The platform tells users to register their agents
on-chain but has not registered itself, which is the kind of detail a discerning
integrator notices immediately. Eating our own dog food here is both correct and a
credibility signal.

## Goal

three.ws registered as agent #N in the IdentityRegistry (Base mainnet, with a Base
Sepolia testnet record too), its `tokenURI` pointing at a real 3D Agent Card v1
manifest, and the `.well-known` document populated with the resulting registration(s).

## Files to Read First

- `public/.well-known/agent-registration.json` — the record to populate
- `public/.well-known/3d-agent-card.schema.json` — the Card v1 schema
- `specs/3D_AGENT_CARD.md` — required fields (type[], name, image, model{uri,sha256},
  registrations[], supportedTrust)
- `src/erc8004/agent-registry.js` — `registerAgent()` reference flow
- `src/erc8004/registration-json.js` — `buildRegistrationJSON()` (importable server-side)
- `src/erc8004/abi.js` — registry addresses

## What to Build / Do

1. **Pick three.ws's canonical avatar/GLB** for the platform agent (a real asset
   from `public/avatars/` — not a placeholder). Compute its sha256.

2. **Build the 3D Agent Card v1** for three.ws: name "three.ws", description, image
   (poster), `model.{uri,format,sha256,polygonCount,boundingBox,license}`, `type`
   array including both the ERC-8004 and `https://three.ws/specs/3d-agent-card-v1`
   URIs, `supportedTrust: ["reputation","validation"]`, and the platform's A2A/MCP
   service endpoints (mirror what's already in the `.well-known` record's services).

3. **Pin the GLB + card** to IPFS (or R2 via `/api/erc8004/pin`). Verify the bytes at
   `model.uri` hash to `model.sha256` (the spec's mandatory verification point 3).

4. **Mint** on Base Sepolia first (cheap dry-run of the whole flow), then Base
   mainnet: `register(seedURI)` → extract `agentId` from the `Registered` event →
   `setAgentURI(agentId, cardURL)`.

5. **Populate `agent-registration.json`** `registrations[]` with the real entries:
   `{ agentId, agentRegistry: "eip155:8453:0x8004A169…" }` for mainnet and the
   Sepolia equivalent. Keep the existing services/x402 fields.

6. **Confirm resolution** — `api/_lib/onchain.js` `tokenURI(agentId)` returns the card
   URL, and the card validates against the schema.

## Constraints

- Real asset, real IPFS/R2 pin, real mint. No placeholder CIDs.
- The signer is the platform deployer key — handle it via env, never commit it.
- `model.sha256` MUST match the pinned bytes or the card is "unverified" per spec.
- Only `$THREE` may be referenced if a token is mentioned anywhere in the card.

## Success Criteria

- three.ws appears as a registered agent in IdentityRegistry on Base (+ Sepolia).
- `public/.well-known/agent-registration.json` `registrations[]` is non-empty with
  real agentIds.
- The card at `tokenURI` validates against `3d-agent-card.schema.json` and its
  `model.sha256` matches the pinned GLB.
- Visiting the platform agent profile renders the on-chain badge.
- Changelog entry (tag: feature/infra).

# Task: "Bind Existing Agent → On-Chain" Flow + Auto-Populate Manifest

## Context

Today, on-chain registration (`src/erc8004/agent-registry.js` `registerAgent()`)
runs in isolation: it takes a GLB + metadata and mints fresh. There is **no product
path to take an agent that already exists in `agent_identities` and bind it to an
on-chain identity** — the user must re-enter everything. Two concrete gaps from the
audit:

1. No "Register this agent on-chain" action on an existing agent profile that reuses
   the agent's stored GLB/metadata and writes the result back to
   `agent_identities.meta.onchain`.
2. The 3D Agent Card v1 has an optional `manifest` field (pointer to the rich
   Claude-shaped agent-manifest bundle) that is **never auto-populated** during
   registration, so on-chain agents lose their instructions/skills/memory linkage.

## Goal

From an existing agent's profile, a user can bind it on-chain in one flow that reuses
stored assets, auto-builds + pins the agent-manifest, sets it as the card's
`manifest` field, and persists the on-chain identity back to the DB.

## Files to Read First

- `src/erc8004/agent-registry.js` — `registerAgent()`, `ensureWallet()`,
  `buildRegistrationJSON()`, pin helpers
- `src/erc8004/registration-json.js` — Card v1 builder (add `manifest` support if missing)
- `specs/AGENT_MANIFEST.md` — the manifest bundle shape (manifest.json + instructions
  + skills + memory + body.glb)
- `api/_lib/migrations/2026-04-29-onchain-unified.sql` — `agent_identities.meta.onchain` shape
- `api/erc8004/[action].js` + `api/erc8004/register-confirm.js` — pin + index endpoints
- `src/agent-home.js` (or wherever the agent profile/edit UI lives) — where the
  "Bind on-chain" entry point goes

## What to Build / Do

1. **Add a `buildAgentManifest(agent)` helper** that assembles the agent-manifest/0.2
   bundle from the agent's stored data: `manifest.json` (body, brain, voice, skills,
   memory mode, tools, permissions), `instructions.md`, the GLB, and any installed
   skills. Pin the bundle, return its URI.

2. **Add `bindExistingAgentOnchain(agentId, chainId)`** in `agent-registry.js` that:
   - Loads the agent's stored GLB + metadata (no re-entry).
   - Builds + pins the manifest (step 1), captures its URI.
   - Builds the Card v1 with `manifest` set to that URI.
   - Pins the card, mints `register(seedURI)`, sets `setAgentURI`.
   - POSTs to `register-confirm` so `meta.onchain` is written
     (chain, family:"evm", tx_hash, onchain_id, contract_or_mint, wallet,
     metadata_uri, confirmed_at).

3. **Surface a "Register on-chain" action** on the agent profile UI, with all designed
   states: not-registered (CTA), pending (tx in flight), registered (badge + chain +
   agentId + explorer link), error (actionable). Idempotent — if already bound on that
   chain, show the existing identity, don't double-mint.

4. **Make `registration-json.js` accept + emit the `manifest` field** if it doesn't
   already.

## Constraints

- Reuse the agent's existing pinned GLB if one exists — don't re-pin identical bytes.
- Last-write-wins is fine for re-binding metadata, but never mint a second token on a
  chain the agent is already registered on.
- Best-effort manifest: if a skill asset fails to pin, surface which one — don't
  silently ship a partial manifest.
- Wallet connect must reuse an existing authorized connection (no forced popup).

## Success Criteria

- From an existing agent profile, "Register on-chain" completes without re-entering
  GLB/metadata.
- The resulting Card v1 has a populated `manifest` URI that resolves to a valid
  agent-manifest/0.2 bundle.
- `agent_identities.meta.onchain` is written; the profile shows the on-chain badge +
  explorer link on reload.
- Re-running on the same chain is a no-op (idempotent), not a second mint.
- Every UI state (none/pending/done/error) is designed. No console errors.
- Changelog entry (tag: feature).

<!-- AUTO:self-delete-on-complete -->

---

## ✅ On completion — delete this file

This file is a unit of work, not a permanent doc. The moment every item above is **built, wired, verified, and committed** to the "Definition of done" in the repo-root `CLAUDE.md`, remove it in the same change:

```bash
git rm "tasks/onchain-deployment/06-bind-existing-agent-onchain.md"
```

Stage the deletion alongside your implementation and include it in the completion commit. This directory is the backlog: a file that still exists is unfinished work; a file that is gone has shipped. Do not delete early, and never leave a completed prompt behind.

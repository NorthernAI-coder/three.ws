# Task 05 — Vanity-as-a-skill: sovereign wallets for autonomous agents

> Read [00-README-orchestration.md](./00-README-orchestration.md) first.

## The wedge (why this is gamechanging)

three.ws gives AI a body. The missing piece of true agent autonomy is a **self-minted
identity + wallet** the agent provisions for itself — no human in the loop. Today an
AI agent (Claude, GPT, an autonomous worker) can't walk up and say "mint me a branded
wallet, pay for it yourself, and bind it to my identity." Make it able to.

Ship a first-class **MCP server + skill** that lets any AI agent:
1. grind a **branded vanity** wallet (e.g. ending in its handle),
2. **pay for it itself** over x402 from its own funds (no API key, no account),
3. receive the secret **sealed to a key the agent controls** (the MCP/host never sees
   plaintext),
4. **bind the address to its identity on-chain** (an attestation linking the vanity
   address ↔ the agent's DID / three.ws agent id), so the wallet is verifiably *that
   agent's*.

This is the agent-native, payment-native, identity-native wallet primitive. It's
exactly on-brand and nobody offers the full loop.

## What to build

### MCP server / tool
- Add to the MCP surface (a new tool in an existing package such as
  [packages/avatar-agent-mcp](../../packages/avatar-agent-mcp) and/or a dedicated
  `packages/threews-vanity-mcp`; follow the conventions of the existing MCP packages
  and `scripts/publish-mcp-servers.mjs`). Tool e.g. `vanity_wallet_provision`:
  - inputs: `prefix?`, `suffix?`, `ignoreCase?`, `format=keypair|mnemonic`,
    `sealTo?` (the agent's X25519 key — if omitted, the tool generates one and returns
    the private key **once** with a treat-like-cash warning), `bindToAgentId?`,
    `payment` context.
  - behavior: calls the real paid endpoint [api/x402/vanity.js](../../api/x402/vanity.js)
    over x402 (use `@x402/mcp` / `@x402/fetch`), opens the seal if it generated the
    key, optionally triggers the identity binding, and returns address + (sealed or
    one-time) secret + receipt + explorer link.
- Honor MCP `ToolAnnotations` (not read-only, not idempotent, openWorld as
  appropriate). Stream progress for long grinds where the protocol allows.

### x402 self-payment
- The agent pays with its own wallet via x402 (Base or Solana USDC). Wire the real
  payment loop — discovery 402 → pay → receive. If the calling agent has a three.ws
  custodial wallet, support paying from it through the proper gated path
  ([agent-wallet.js](../../api/_lib/agent-wallet.js), `recoverSolanaAgentKeypair` with
  an audited reason) — never bypass ownership/auth.

### On-chain identity binding
- Bind the vanity address to the agent's identity with a **real attestation**: EAS on
  Base ([@ethereum-attestation-service/eas-sdk](../../api/_lib)) and/or a Solana
  attestation / the agent registry ([@metaplex-foundation/mpl-agent-registry](../../api/_lib),
  `mpl-core`). Schema: `{ agentId/DID, vanityAddress, ts, proof }`. Make it verifiable:
  a resolver/endpoint that, given an address, returns the bound agent (and vice-versa),
  and a check the agent profile UI uses to show a verified "agent wallet" badge.
- Wire the binding into the existing agent identity surfaces so a provisioned wallet
  shows up on the agent's profile as verified.

### Docs + skill
- A Claude/host **skill** + usage docs (a `SKILL.md` or the repo's skill format) so an
  agent knows when/how to call it. A runnable example (`scripts/`) showing an agent
  provisioning + paying + binding end to end against the real endpoint.

## Hard requirements

- Real MCP (stdio + remote per the repo's pattern), real x402 payment, real on-chain
  attestation. No mocked payment, no fake attestation, no stub resolver.
- Plaintext secret never logged or persisted by the MCP/host; sealed delivery is the
  default. The one-time-key path warns and never re-shows the secret.
- Auth/ownership enforced for any custodial-funded payment; audited reason recorded.
- `$THREE` only as the coin; USDC is the x402 settlement asset (runtime).
- Publishable: the MCP package builds and is included by `audit:mcp` / `publish:mcp`
  tooling; manifest valid.

## Definition of done

- [ ] MCP tool provisions a vanity wallet, pays via real x402, returns it sealed (or a
      one-time key), and optionally binds it on-chain — end to end against the live
      endpoint.
- [ ] Real attestation written + a working bidirectional resolver; agent profile shows
      a verified wallet badge.
- [ ] Custodial-funded payment path is auth/ownership-gated + audited (no bypass).
- [ ] Skill/docs + a runnable example; MCP manifest valid (`npm run audit:mcp`).
- [ ] Tests (tool I/O, seal default, resolver, attestation encode/verify). Changelog +
      `npm run build:pages`. No mocks; `git diff` reviewed.

## Closeout

DoD + self-review, then **improve**: let an agent provision wallets for *sub-agents* it
spawns (delegated identity), add a revocation/rotation path for the binding, and expose
the provision flow as an x402-discoverable Bazaar skill so other agent frameworks find
it automatically. Summarize, then **delete this file**
(`prompts/vanity-x402/05-vanity-as-skill-mcp.md`).

<!-- AUTO:self-delete-on-complete -->

---

## ✅ On completion — delete this file

This file is a unit of work, not a permanent doc. The moment every item above is **built, wired, verified, and committed** to the "Definition of done" in the repo-root `CLAUDE.md`, remove it in the same change:

```bash
git rm "prompts/vanity-x402/05-vanity-as-skill-mcp.md"
```

Stage the deletion alongside your implementation and include it in the completion commit. This directory is the backlog: a file that still exists is unfinished work; a file that is gone has shipped. Do not delete early, and never leave a completed prompt behind.

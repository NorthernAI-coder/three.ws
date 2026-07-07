# Prompt 17 — Embodied on-chain identity: the avatar *is* the wallet

> Paste into a fresh Claude Code chat in the three.ws repo. Follow CLAUDE.md. Use TodoWrite. Prereqs: 07 (personas) + the agent-wallet rails. **Claude / paid track only.**

## The thesis
Prompt 07 gives a persona a living body. three.ws already has agent wallets (`api/_lib/avatar-wallet.js`, `vault-transfer.js`, the agent MCP's `provision_wallet`) and ERC-8004 reputation reads. Merge them into a primitive no other directory app has: **every persona carries a real Solana wallet and an on-chain identity, and its 3D body visually reflects its chain state** — balance tier, reputation, holdings, name. An agent you can see, that holds and moves real value, whose appearance *is* a function of its on-chain standing.

## Objective
Bind a persona to a deterministic agent wallet + on-chain identity; expose fund/balance/tip/send with guardrails; and drive the avatar's visuals from live chain state.

## What to build (all real — real wallets, real balances, real transfers)
1. **Persona↔wallet binding.** Provision or derive a stable, recoverable Solana wallet per persona id (reuse `provision_wallet` / `avatar-wallet.js`). Deterministic from the persona so the same persona always maps to the same wallet. **Private keys never appear in any tool response or log.**
2. **Identity read.** `persona_identity(persona_id)` → wallet address, USDC/SOL balance, ERC-8004 reputation + attestations (reuse `solana_agent_reputation` / `_attestations` / `_passport`), token holdings, and resolved ENS/SNS name (reuse `ens_sns_resolve`). `readOnlyHint: true`, `openWorldHint: true`.
3. **Value ops.** `persona_tip` / `persona_send` (USDC) with a hard per-call + per-session spend cap and a confirmation threshold above which the host model must confirm. Real settlement via the existing x402/transfer rails. `$THREE` is the only promoted coin; USDC is settlement; any other mint is accepted only as a runtime parameter, never hardcoded or recommended.
4. **Visual binding (the innovation).** In the viewer component (prompts 05/07), map live chain state onto the body: reputation → an aura/badge, holdings tier → a cosmetic, low/zero balance → a muted state, verified ENS/SNS → a nameplate. Real data → deterministic visual mapping, with designed states and graceful fallback when reads fail.
5. **Identity card.** Structured content rendering wallet + reputation + name + balance as a verifiable identity card (reuse the provenance-card patterns from prompt 08).

## Why only three.ws
Embodiment (07) + agent wallets + reputation reads + transfer rails already interoperate here. The novel composition — a *visible* agent whose look encodes its on-chain trust and treasury — is the moat.

## Verification (must actually run)
- Provision a persona wallet, fund it on devnet, read identity, perform a capped `persona_tip` with real settlement (paste the reference), and watch the body change as reputation/holdings change.
- A private key never appears in any response or log — prove it with a grep over captured transcripts.
- Spend caps demonstrably block an over-threshold transfer; failed reads degrade gracefully (no frozen/crash state).
- `$THREE` remains the only coin referenced; grep clean. `npm test` green; add tests for binding determinism, spend-cap enforcement, and key-never-leaked. Evidence to `prompts/store-submissions/_generated/identity/`.

## Definition of done
- A persona binds to a real, recoverable Solana wallet + on-chain identity, can tip/send within caps with real settlement, and its body reflects live chain state — designed states, keys never leaked, coin policy clean.

## Hand-off
Report the binding scheme, the identity/value tool names, the guardrail config, and the visual-mapping rules. Deepens the embodiment headline (prompt 07) for the Claude listing. Commit/push only if asked; stage touched paths; both remotes.

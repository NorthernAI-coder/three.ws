# Prompt 18 — Token-gated 3D: holder-only interactive scenes

> Paste into a fresh Claude Code chat in the three.ws repo. Follow CLAUDE.md. Use TodoWrite. Prereqs: the embed stack (`src/avatar-embed.js`, `api/embed`, `specs/EMBED_SPEC.md`, `specs/EMBED_HOST_PROTOCOL.md`) + SIWS auth (`api/_lib/siwx-*`). **Claude / paid track for creation;** the embed runtime does a public on-chain check.

## The thesis
Communities want exclusivity, and three.ws is the only platform that pairs generation with first-class embeddable 3D. Merge that with web3 access control: generate a 3D scene or avatar that **only renders for a wallet holding ≥ N of a given SPL token** — gating the live *experience*, not just a download, with the balance verified on-chain at view time. The canonical use is $THREE-holder-only avatars and rooms; the gate primitive also accepts a runtime mint (the coin-agnostic plumbing exception in CLAUDE.md) so any community can gate with their own token. three.ws never hardcodes, markets, or recommends a non-`$THREE` mint.

## Objective
`create_gated_embed(asset_id, gate)` where `gate = { mint, min_amount, chain }` → a shareable embed URL whose viewer verifies the visitor's holdings before rendering premium content, with a designed locked state otherwise.

## What to build (all real — server-verified on-chain balances, no client trust)
1. **Gate config + record.** Persist the gate terms alongside the embed (reuse the existing embed/launch records). The `mint` defaults to the `$THREE` CA but is a runtime parameter; never hardcode any mint beyond that default.
2. **Runtime verification.** The embed host (`EMBED_HOST_PROTOCOL`) connects the visitor's wallet and signs a lightweight ownership proof (reuse the SIWS path in `api/_lib/siwx-*`). The **server** verifies the live SPL balance via Solana RPC and decides access — never trust a client-reported balance. Real RPC read.
3. **Locked / unlocked states.** Designed: locked shows a teaser + "Hold {min_amount} {symbol} to unlock" + a connect-wallet CTA; unlocked renders the full interactive 3D scene. Smooth transition, keyboard-accessible, no console errors.
4. **Anti-abuse.** Issue a short-lived signed access token after a successful check; re-verify on expiry; rate-limit verification attempts per wallet/IP.
5. **Coin policy.** `$THREE` is the only promoted coin and the example default; the gate's arbitrary-mint support is runtime plumbing only. `grep` the feature to prove no other mint is hardcoded, marketed, or recommended.
6. **Changelog** entry + `npm run build:pages`.

## Why only three.ws
Generation + embeds + SIWS + Solana RPC already coexist here. Token-gating an *interactive 3D experience* (vs. a static link) is a community primitive no directory competitor can offer.

## Verification (must actually run)
- Create a gated embed (e.g. `min_amount: 1`, `mint: $THREE`). Visit with a wallet **below** threshold → locked state. Visit with a wallet **at/above** threshold → full scene renders.
- Demonstrate the balance check is **server-verified** and cannot be spoofed by a client-edited balance.
- Access token expires and re-verifies; rate limiting triggers on abuse.
- Coin policy grep clean. `npm test` green; add tests for gate pass/fail by balance and access-token expiry. Evidence to `docs/store-submissions/_generated/gated/`.

## Definition of done
- A creator can mint a holder-only 3D embed; visitors are gated by a real, server-verified on-chain balance; locked/unlocked states are designed; abuse is bounded; coin policy clean.

## Hand-off
Report the gate tool, the verification flow, the anti-abuse config, and the evidence path. A community/web3 differentiator for the Claude listing and a driver of $THREE utility. Commit/push only if asked; stage touched paths; both remotes.

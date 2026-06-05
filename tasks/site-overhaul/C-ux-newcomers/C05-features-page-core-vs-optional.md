# C05 — Rewrite `/features`: Core vs Optional, use-case-driven

**Track:** UX for Newcomers · **Size:** M · **Priority:** P1 · **Depends on:** C04

## Goal
Restructure the features page into two clear sections — **Core (works today, no crypto)** and
**Optional (on-chain, payments, tokens)** — with use-case-driven, plain descriptions.

## Why it matters
The audit scored `/features` **1/10** for newcomers: "Very High" jargon density, no plain
explanations, crypto presented as the headline. It's the page that most alienates normal users.

## Context
- [pages/features.html](pages/features.html). Current copy: "x402 Paid Skills — Charge per call in USDC over the x402 protocol… signed and on-chain auditable" (four jargon sentences, no plain meaning).
- Glossary/tooltips from C04 handle the unavoidable terms inline.

## Scope
- Reorganize into **Core** (create avatars, 70+ animations, AI brain/chat, embed anywhere, dashboard) and **Optional / Advanced** (on-chain identity, x402 payments, token launch). Lead each feature with what it does for the user, then how.
- Rewrite every jargon-heavy blurb into plain language; wrap residual terms with C04 tooltips.
- Add a "no crypto needed for Core" banner.
- Use Track B components.

## Definition of done
- `/features` clearly separates free-core from optional-crypto; every feature blurb is comprehensible to a non-crypto reader; residual jargon is tooltip-explained.

## Verify
- Non-crypto read-through: reader can identify which features need crypto and which don't, and what each does.

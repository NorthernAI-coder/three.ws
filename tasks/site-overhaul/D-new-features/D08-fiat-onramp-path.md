# D08 — Fiat-friendly on-ramp for non-crypto users

**Track:** New Features · **Size:** L · **Priority:** P2 · **Depends on:** C07

## Goal
Give non-crypto users a path to participate in the optional paid/monetization features without
already understanding wallets — e.g. card-funded USDC via the existing fund flow, with crypto
abstracted as far as possible.

## Why it matters
The audit's deepest barrier: monetization assumes a funded Solana wallet. For the platform to
serve "anyone," there must be a fiat-to-usable path. This is what lets a normal creator actually
earn or pay without a crypto crash-course.

## Context
- A `fund` skill/flow exists (onramp/buy USDC). Wallet auth exists. This task wires a **guided, plain-language** funding path into the product UX and abstracts the mechanics.
- Verify what onramp providers/keys are configured (`.env`, `vercel env`) before designing — use the real one. No mocks.
- Coordinate with C07 (wallet explainer) so the education and the on-ramp are one coherent flow.

## Scope
- A funding entry point at the moment a user needs balance (pay/tip/launch), using the real configured on-ramp; show fees/amounts honestly; confirm balance on completion.
- Abstract jargon: present it as "add funds," with the crypto detail available but not required reading.
- Handle the unfunded/failed/pending states with designed UI.
- If a provider isn't configured, surface a clear path (and flag to the founder which env/keys are needed) rather than faking it.

## Definition of done
- A non-crypto user can go from "I want to tip/launch/pay" to a funded balance through a guided, real on-ramp, with honest fees and designed states.

## Verify
- Run the funding flow end-to-end against the real provider (test mode if available); confirm balance updates and the gated action then succeeds.

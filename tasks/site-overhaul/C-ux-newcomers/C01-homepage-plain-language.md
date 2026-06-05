# C01 — Rewrite the homepage for a non-crypto first-timer

**Track:** UX for Newcomers · **Size:** M · **Priority:** P0 · **Depends on:** A06 (one canonical home)

## Goal
Rewrite the canonical homepage so a person who has never touched crypto immediately understands
what three.ws is, what they can make, and why they'd want to — with crypto demoted to an
optional, clearly-labeled layer.

## Why it matters
The UX audit scored the homepage 3/10 for newcomers: the hero leads with "Mint it on Solana,"
lists `Metaplex Core / MCP / A2A` as features with no explanation, and the "crypto is optional"
truth is buried in the pricing FAQ. The creation tools themselves are great (8/10) — the problem
is the front door turns normal people away before they reach them.

## Context
- Canonical home: [pages/home-v4.html](pages/home-v4.html) (hero "Give your AI a body").
- The real, plain value: *make a 3D avatar from a selfie, give it an AI brain, embed it anywhere.* Crypto (ownership, payments) is an optional add-on.
- Honesty rule (memory): marketing visuals must be honest examples, no fake live data.

## Scope
- Rewrite the hero + the 4-step flow in plain language. Lead with the outcome a normal person wants. Move "mint/Solana/on-chain" into an explicitly **optional** section ("Want to own it on-chain or get paid? That's optional — here's how").
- Replace bare jargon tokens (`Metaplex Core`, `MCP`, `A2A`) with plain descriptions; link them to the glossary (C04).
- Add a one-line, prominent "**No crypto needed to start.**" reassurance (promotes the buried FAQ — see C08).
- Keep it honest: any numbers/visuals must be real (tie to the activity feed if showing live data).
- Use the unified design system (Track B) — don't reintroduce the home-only orange (B08).

## Definition of done
- A non-crypto reader can state, after 10 seconds, what three.ws lets them make and that crypto is optional. No unexplained jargon above the fold. Clear primary CTA into `/create`.

## Verify
- Read it cold as a non-crypto user; confirm comprehension. `npm run dev`, check responsive 320/768/1440, working CTAs, no console errors.

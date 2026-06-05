# C04 — Plain-language glossary + hover-tooltip system

**Track:** UX for Newcomers · **Size:** M · **Priority:** P1

## Goal
A reusable "explain this term" tooltip component plus a `/glossary` page, so every unavoidable
piece of jargon has a one-line plain-language definition on hover/tap and a deeper link.

## Why it matters
The audit catalogued jargon appearing in user-facing copy with zero explanation: **x402, USDC,
Solana, Metaplex Core, on-chain, ERC-8004, mint, bonding curve, graduation, MCP, A2A, skills,
brain, rig**. A glossary + inline tooltips lets you keep necessary terms without losing newcomers.

## Context
- Terms and their locations are enumerated in the UX audit; they appear across `/features`, `/home-v4`, `/pricing`, dashboard, `/club`, agent edit.
- Build the tooltip as a shared component (Track B styling) so any page can wrap a term: e.g. `<span data-term="x402">x402</span>` auto-enhanced.

## Scope
- Shared tooltip module (`src/shared/term-tooltip.js` + styles) reading definitions from one `src/shared/glossary.js` map (term → {short, long, link}). Accessible: keyboard-focusable, `aria-describedby`, dismissible, mobile tap support.
- `/glossary` page rendering the full map (also serves SEO).
- Wrap the jargon on the highest-traffic surfaces (home, features, dashboard, agent edit). Definitions must be **plain** ("x402 = a way to charge a tiny payment when someone uses your agent — like a paywall for APIs"), not circular.

## Definition of done
- Hovering/focusing any wrapped term shows a plain definition; `/glossary` lists them; the top surfaces have their jargon wrapped.

## Verify
- Keyboard-tab to a term, confirm the tooltip opens and is screen-reader labeled. Non-crypto reader understands each definition.

# 22 — x402scan Profile & Resource-Description Overhaul

Read `prompts/x402-overhaul/00-CONTEXT.md` first, then `/workspaces/three.ws/CLAUDE.md`.
Independent work order — completes fully on its own.

## Why
Our x402scan server profile is the storefront window. Today it's a generic blurb over a flat
list of 17 mixed-quality resources. Rewrite the top-level pitch and curate/retag the resource
descriptions so a browsing agent (or its developer) instantly gets what three.ws offers and
why to use it.

## Build
- **Server-level profile** — find where the top-level x402 server metadata is served (the
  `.well-known/x402.json` root fields in `api/wk.js`: name, description, tags, categories).
  Rewrite the description to the real positioning: "three.ws — 3D generation + crypto data +
  launch/trust tools for AI agents. Free Crypto Data API and free text→3D; pay-per-call for
  Forge Pro, rigged avatars, vanity addresses, token launches, and cross-chain trust checks."
  Set accurate top-level tags/categories (3D, AI, Crypto, Data, Utility).
- **Resource descriptions** — for every resource that REMAINS in the catalog (post prompt-20
  spirit; if 20 hasn't run, still curate), ensure each description leads with the agent
  use-case, states price + networks, and reads as a product, not a demo. Fix any that are
  empty (e.g. `skill-marketplace` had no description) or jargon-y.
- **Categorize/tag** each resource so x402scan's category filters surface us well.
- Keep the discovery doc valid: `node scripts/verify-x402-discovery.mjs` green.

## Correctness
The live `.well-known/x402.json` must render with the new profile + curated resources and pass
the verify script. Fetch it locally (`curl` the dev route) and confirm the JSON is well-formed
and the descriptions are the new ones. If prompt 21's unified catalog exists, source
descriptions from it (don't re-author drift); otherwise edit the per-resource metadata
directly and note the follow-up.

## Tests
Discovery doc validity + verify script; presence of top-level description/tags; no empty
resource descriptions remain.

## Definition of done
Inherit 00-CONTEXT DoD + gates (skip new-endpoint parts). Plus:
- [ ] New server profile + curated resource descriptions live; `.well-known/x402.json` capture
      in PROGRESS.md; verify script green (paste output).
- [ ] No resource with an empty/placeholder description remains.
- [ ] `data/changelog.json` (tags: `improvement`) — "Refreshed our agent-marketplace profile and
      product descriptions".

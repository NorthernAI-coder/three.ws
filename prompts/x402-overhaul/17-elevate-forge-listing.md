# 17 — Elevate the Forge Listing (Forge Pro tiers + discovery)

Read `prompts/x402-overhaul/00-CONTEXT.md` first, then `/workspaces/three.ws/CLAUDE.md`.
Independent work order — completes fully on its own.

## Scope guard (important)
The OKX.AI work stream (`prompts/okx-ai/`) owns the forge **payment integration** and
`api/mcp-3d.js`. This prompt is ONLY about the **x402scan listing quality** of the existing
`api/x402/forge.js`: its description, quality tiers, tags, response polish, and discovery
metadata. **Do NOT modify the payment/settlement handler logic or `api/mcp-3d.js`.** If a
change would touch those, stop at the metadata boundary and note it for the OKX stream.

## Why
Forge (text→3D / image→3D) is our crown jewel and the only real 3D generation on any agent
marketplace — but on x402scan it's buried in the same flat list as `dance-tip`, so it reads
as trivial. Make the listing sell.

## Build
- Rewrite the `BAZAAR` description on `api/x402/forge.js` to lead with the agent use-case
  (game assets, NFTs, scenes, product viz), the quality tiers and prices ($0.05 draft / $0.15
  standard / $0.50 high — confirm against `_lib/x402-prices.js` and the real handler), the
  keyless/no-account pledge, and the free draft lane (`/api/3d/generate`) as the on-ramp.
- Ensure input/output schemas in the discovery metadata are accurate and complete (prompt,
  reference-image mode, job-token poll, GLB output). An agent should understand how to call it
  from the schema alone.
- Verify the tiers in `_lib/x402-prices.js` are coherent and documented; adjust only pricing
  metadata (not settlement) if needed.
- Update the `api/wk.js` discovery mirror for `/api/x402/forge`; run
  `node scripts/verify-x402-discovery.mjs` until clean.
- Tags: ensure it's tagged so it surfaces under 3D / AI / Utility on x402scan.

## States / correctness
The live 402 and the discovery doc must match exactly (the verify script enforces this).
Don't change runtime behavior; if the description promises a field, the handler must already
return it — verify by calling the endpoint, don't assume.

## Tests
Discovery/live-402 parity (verify script); schema completeness assertion. No settlement tests
here (owned by OKX stream).

## Definition of done
Inherit 00-CONTEXT DoD + gates (skip the parts about new endpoints). Plus:
- [ ] New `BAZAAR` description + accurate schemas shipped; `scripts/verify-x402-discovery.mjs`
      passes (paste output).
- [ ] Live 402 captured + confirmed matching the discovery doc, in PROGRESS.md.
- [ ] `docs/3d-api.md` (or Forge doc) updated to describe the paid tiers + free on-ramp.
- [ ] `data/changelog.json` (tags: `improvement`) — "Forge listing sharpened: clear 3D
      generation tiers for agents".

# Prompt 09 — Conversational, remixable 3D with provenance + royalties (10x differentiator)

> Paste into a fresh Claude Code chat in the three.ws repo. Follow CLAUDE.md. Use TodoWrite. Prereqs: 04 + 05 (and 07 if personas are in play).

## The thesis
Today's in-chat generators are one-shot: prompt in, asset out, dead end. The frontier nobody has nailed is **conversational, iterative 3D** ("make the helmet bigger" → regenerate the diff, live) plus **composability**: every asset has provenance and a remixable license, and when someone builds on yours, value routes back to you. This turns three.ws from a generator into a *creative economy* — Sketchfab/Figma for the agent era.

## Objective
Two linked capabilities:
- **(A) Conversational iteration** on a generated model within the conversation.
- **(B) Remixable assets** with provenance and automatic creator royalties (Claude/paid track only — keep royalty/payment surface OUT of the OpenAI free app).

## What to build
### A. Conversational iteration (works in BOTH free + paid tracks; no payment surface needed)
1. A tool `refine_model(persona_or_asset_id, instruction)` that takes a prior asset + a natural-language change ("bigger helmet", "make it metallic", "add wings") and produces a new version, **anchored to the previous result** (re-use seed/reference image / mesh where the provider supports it; otherwise a guided re-generation that carries forward the prior prompt + adjustments). Real generation — no faked diffing.
2. **Version lineage:** each refinement records parent → child so the user can branch/revert. Return the lineage so the component can show a version strip.
3. **Live/progressive render** in the component if the provider exposes intermediates (TRELLIS/diffusion staged output); otherwise a designed "regenerating" state that swaps in the new GLB smoothly (cross-fade, not a pop). No fake progress bars — real async only.

### B. Remixable assets + provenance + royalties (PAID/Claude track only)
4. **Provenance record** per asset: creator (account/wallet), parent lineage, prompt, license terms. Store it with the existing asset/launch records — reuse, don't invent a parallel store.
5. **Remix economics:** when an asset is generated *from* another creator's published asset, x402 routes a royalty split to the original creator via the existing facilitator. Real settlement, real split logic, hard caps. Keep $THREE the only coin referenced; USDC for settlement only.
6. **A composable feed/tool:** browse published, remixable assets (reuse the `/launches`-style platform-records pattern) and remix one. Provenance and royalty terms visible before remixing.

## Why only three.ws
Generation + asset storage + Solana x402 rails already coexist here. Conversational iteration leverages the generation pipeline; royalties leverage the payment rails; provenance leverages the existing platform launch-records pattern. The composition is the moat.

## Verification (must actually run)
- Generate a model, issue 2 refinements; each is a real, visibly-different model anchored to the prior; version lineage is correct and revertable. Evidence to `prompts/store-submissions/_generated/iteration/`.
- Remix a published asset from a *different* test creator; confirm a real royalty settlement to the original creator (paste the settlement reference) and that the split math + caps are correct.
- The free-app path (`/api/mcp-studio`) exposes refinement but **zero** payment/royalty/token surface — grep to prove it.
- No console errors. `npm test` green; add tests for lineage integrity and royalty-split math.

## Definition of done
- Conversational refinement with correct version lineage and smooth re-render, available in the free app (no payment surface) and the paid server.
- Provenance + automatic creator royalties working with real settlement on the paid track, with caps. Coin policy clean.
- Evidence saved.

## Hand-off
Report the refine tool, lineage model, the royalty-split logic + caps, and evidence paths. Conversational iteration is a strong OpenAI listing differentiator; royalties are a Claude/agent-economy differentiator. Commit/push only if asked; stage touched paths; both remotes.

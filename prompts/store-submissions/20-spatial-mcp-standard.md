# Prompt 20 — Spatial MCP: make 3D a native conversational response type (own the category)

> Paste into a fresh Claude Code chat in the three.ws repo. Follow CLAUDE.md. Use TodoWrite. Prereqs: 05 (viewer component). **Infrastructure — benefits both store listings. No crypto in the spec or renderer.**

## The thesis
This is the README's 100x meta-move made concrete. MCP tool results are text/JSON today. three.ws can define and own the standard for **spatial MCP responses**: tool results that carry a live, interactive 3D scene as a first-class artifact, with a reference renderer other apps adopt. Be the infrastructure the ecosystem builds on, not just another listing.

## Objective
Publish an open spec + a reference renderer + a conformance validator, and make every three.ws 3D tool emit conformant artifacts — so three.ws is the reference implementation of 3D-native MCP.

## What to build (all real — a working spec, renderer, and validator)
1. **Spec.** `specs/SPATIAL_MCP.md`: a documented structured-content shape for a 3D artifact — scene/GLB URL, camera, environment/lighting, animation + persona hooks, AR handoff (ties to prompt 21), and interaction affordances. Aligned with the MCP-Apps / Apps SDK component-embedding model so a host can render it. Versioned and open-licensed.
2. **Reference renderer.** A small, standalone-embeddable component (extend the prompt 05 viewer) that renders any spec-conformant artifact: orbit/zoom, animation playback, AR button, and graceful fallback for missing fields. Publishable independent of three.ws's product UI.
3. **Validator tool.** `validate_spatial_response(payload)` that checks conformance and returns actionable errors (not just a boolean). Use it as the gate that all three.ws 3D tools pass their artifacts through.
4. **Adoption.** Emit the spec artifact from the existing 3D tools (`render_avatar`, `preview_3d`, `text_to_3d`, etc.). Write `docs/spatial-mcp.md` showing how a *third-party* MCP server adopts the shape, with a worked example transforming a foreign tool result into a conformant artifact.
5. **Changelog** + `npm run build:pages`.

## Why only three.ws
You already have the renderer, the universal rig pipeline, and a fleet of 3D tools to make the spec real on day one. A standard with a live reference implementation and real adopters beats a paper spec — and three.ws is the only one positioned to ship all three at once.

## Verification (must actually run)
- Every three.ws 3D tool result validates against the spec (run the validator over real outputs).
- The reference renderer renders a conformant payload derived from a *different* (mock foreign) tool shape transformed through the spec — proving portability.
- The validator rejects malformed payloads with actionable messages.
- The spec and renderer contain **no** crypto/coin surface — grep clean (so the renderer is reusable in the OpenAI free app).
- `npm test` green; add validator accept/reject cases and an "all 3D tools emit conformant artifacts" invariant. Evidence to `prompts/store-submissions/_generated/spatial-mcp/`.

## Definition of done
- An open spatial-MCP spec, a reusable reference renderer, a conformance validator, and three.ws tools emitting conformant artifacts — the category's reference implementation, crypto-clean and reusable across both stores.

## Hand-off
Report the spec path, the renderer/validator names, the list of tools now emitting conformant artifacts, and the adoption-doc path. This is the positioning play behind both listings (prompts 03 + 06). Commit/push only if asked; stage touched paths; both remotes.

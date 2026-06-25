# Prompt 05 — OpenAI Apps SDK embedded GLB-viewer component

> Paste into a fresh Claude Code chat in the three.ws repo. Follow CLAUDE.md. Use TodoWrite. Prereq: prompt 04 (the `/api/mcp-studio` endpoint exists and returns a GLB URL in structured content).

## Context
ChatGPT apps render an **interactive component** inline in the conversation via the Apps SDK. A text-only tool result is weaker and reads as "static frame with no meaningful interaction" — an explicit rejection reason. For a 3D-generation app the component is the product: the user types a prompt and **sees their generated 3D model render and orbit** right in ChatGPT.

Read the Apps SDK component/UI docs before building: https://developers.openai.com/apps-sdk (custom UX / components, `window.openai` host API, how a tool result references an HTML/JS component template).

We already have a Three.js GLB viewer in this repo — reuse it, don't rebuild. Find the existing viewer (`src/` — glTF/GLB loader, the avatar/model render path) and adapt it for the embedded, sandboxed component context.

## Objective
Build the Apps SDK component that renders the GLB returned by the `/api/mcp-studio` tools, wired so each generation tool result displays an interactive 3D preview in ChatGPT.

## Tasks
1. **Component bundle.** Create an Apps SDK component (HTML+JS, e.g. under `apps-sdk/studio-viewer/` or wherever the SDK expects the served template) that:
   - Reads the GLB URL from the tool result's structured content (the key defined in prompt 04) via the Apps SDK host API.
   - Loads it with Three.js + GLTFLoader, renders with orbit controls, sensible lighting/environment, auto-frames the model.
   - Plays an idle animation if the GLB is rigged (reuse the existing animation/retarget pipeline where feasible — see `src/animation-retarget.js`, `src/glb-canonicalize.js`), else shows the static mesh cleanly.
   - Has designed loading, empty, and error states (per CLAUDE.md): skeleton/spinner while the GLB loads, a clear message if the URL fails, never a blank canvas.
   - Includes a "Download GLB" / "Open in three.ws" action linking to the viewer URL.
2. **Wire tool results to the component.** Update the `/api/mcp-studio` tool responses (coordinate with prompt 04's output) to reference the component template per the Apps SDK contract, so ChatGPT knows to render it.
3. **Sandbox-safe.** No external network calls except fetching the GLB asset and Three.js (bundle Three.js or load from an allowed CDN per SDK rules). No analytics, no token/crypto anything, no leaking internal IDs.
4. **Responsive + accessible.** Works at narrow ChatGPT panel widths; keyboard-operable controls; respects reduced-motion. Performance: dispose geometries/materials on unmount, cap pixel ratio, no jank.
5. **Build integration.** Ensure the component is built/served (Vite or a dedicated build step) and routed so the Apps SDK can fetch the template in production. Add to `vercel.json` if needed.

## Verification (must actually run)
- Run the app locally and load the component against a **real GLB URL** produced by `/api/mcp-studio` (from prompt 04). The model renders, orbits, and (if rigged) animates. Screenshot it.
- Trigger the error state with a bad URL — it shows the designed error, not a blank/crash.
- No console errors or warnings. Confirm in the browser devtools.
- `grep` the component for coin/token/wallet/x402 strings — clean.

## Definition of done
- A real, interactive GLB viewer renders generated models inline, with loading/empty/error states, download action, accessibility, and zero crypto surface.
- Wired to the `/api/mcp-studio` tool results per the Apps SDK contract. Screenshot saved to `docs/store-submissions/_generated/`.

## Hand-off
Report the component path, the served template URL, the screenshot path, and confirmation it renders a real generated GLB. Feeds prompt 06 (screenshots for the listing). Commit/push only if asked; stage touched paths; both remotes.

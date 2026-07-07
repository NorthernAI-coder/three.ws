# Prompt 05 — Text → world: compositional scene & environment generation (new)

> Paste into a fresh Claude Code chat. Follow CLAUDE.md + `prompts/roadmap/00-README.md`. Run `npm run gate` before and after.

## Context
`packages/scene-mcp/` already does text→3D dioramas; `src/scene-studio/` is a full 3D scene editor; Forge generates individual GLBs. The gap: **composing multiple objects into coherent, editable scenes/worlds** from natural language, then handing off to the editor.

## Objective
A new creation capability: describe a scene ("a neon alley with a food cart and two streetlights") → get a composed, navigable 3D scene with placed objects, environment, and lighting — exportable and editable in Scene Studio.

## Tasks (new surface; reuse generation primitives)
1. **Scene-graph planner.** An AI step that decomposes a scene prompt into objects + spatial layout + environment + lighting (a structured scene graph). Reuse the Granite/brain router for planning.
2. **Object sourcing.** For each object, generate via Forge (or reuse cached/library assets) and place per the layout. Real generation; dedupe identical objects via the prompt-02 cache.
3. **Environment + lighting.** Add ground/sky/HDRI and a lighting rig matching the described mood. Reuse any existing HDRI/venue build assets (`build:club-hdri`, environment builders) where sensible.
4. **Export + editability.** Output a single GLB/scene that imports cleanly into Scene Studio (`/scene`) with objects as named, selectable nodes. Add an MCP tool (extend `scene-mcp`) and a web entry so both agents and humans can use it.
5. **Designed states.** Loading shows real progress per object; partial failures degrade gracefully (place what succeeded, report what didn't); empty/error states designed.

## Non-negotiables
- New tool/route; do not change `scene-mcp`'s existing tool contracts (snapshot tests from prompt 01 stay green).
- Real assets only — no placeholder primitives standing in for "generation."

## Verification
- Generate 3 distinct scene prompts; each yields a coherent multi-object scene that opens in Scene Studio with selectable named nodes. Screenshots + GLB URLs to `prompts/roadmap/_generated/05/`.
- A forced single-object failure still returns a usable scene with a clear report.
- `npm run gate` green. Changelog + `npm run build:pages`.

## Definition of done
- Natural-language → composed, editable, exportable 3D scenes, usable from both an MCP tool and the web, with graceful partial-failure handling.

## Hand-off
Report the scene-graph format, the new tool/route, and example outputs. Pairs well with marketplace (09) and agent-native (10). Commit/push only if asked; both remotes.

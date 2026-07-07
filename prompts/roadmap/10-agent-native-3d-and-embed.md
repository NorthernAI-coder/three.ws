# Prompt 10 — Agent-native 3D + embeddable distribution (new)

> Paste into a fresh Claude Code chat. Follow CLAUDE.md + `prompts/roadmap/00-README.md`. Run `npm run gate` before and after.

## Context
three.ws's edge is generation + agent rails + embodiment in one place. Agents should be able to **create and use 3D autonomously**, and any creation should be trivially **embeddable** anywhere — so the platform spreads. Surfaces: the MCP servers, `src/agent-avatar.js` / `attach-avatar-to-agent.js`, `page-agent-sdk/`, `walk-sdk/`, `src/avatar-embed.js`, `examples/`.

## Objective
Two linked capabilities: (A) agents that autonomously create + use 3D via MCP, and (B) one-line embeds that put any creation on any site/app/agent.

## Tasks (additive)
### A. Agent-native 3D
1. **Composable MCP tools.** Ensure the generation/scene/restyle/embodiment capabilities (prompts 02/05/06/03) are exposed as clean MCP tools an agent can chain: "design a character → rig it → give it an idle → place it in a scene." Verify the chain works tool-to-tool with correct titles/annotations (golden tests from prompt 01).
2. **Give an agent a body.** A one-call flow that attaches a generated, rigged, animated avatar to a registered agent (`attach-avatar-to-agent.js`), so the agent has a persistent visual identity tied to its on-chain identity (ERC-8004) and provenance (prompt 08).
3. **Autonomous create-and-use demo.** A real example (in `examples/`) where an agent, given a goal, generates the 3D assets it needs and uses them (e.g. builds a scene, embodies itself). No mocks — real tool calls end to end.

### B. Embeddable distribution
4. **One-line embed.** Extend `src/avatar-embed.js` so any creation yields a copy-paste `<agent-3d>` snippet + hosted share URL + oEmbed support, working on any site. Lazy-loads, sandbox-safe.
5. **Social + AR share.** Share cards (OG image of the 3D model) and "View in AR" (reuse prompt 04 USDZ/WebXR) from any share URL.
6. **"Add to your agent/site."** A small flow that takes a creation and produces drop-in snippets for the web component, the page-agent, and the walk companion — turning a creation into distribution.

## Non-negotiables
- Reuse existing SDKs/components; keep their public APIs stable (snapshot tests green). New behavior is additive/opt-in.
- Embeds must be sandbox-safe and performant (lazy-load, dispose, capped DPR). $THREE-only for any coin reference.

## Verification
- Run the autonomous agent example end-to-end; it generates and uses real 3D. Transcript + assets to `prompts/roadmap/_generated/10/`.
- Paste an embed snippet into a blank HTML page (`examples/`) and confirm it renders + AR-launches. Screenshot.
- An agent gets a persistent body tied to its identity; reload shows the same body. `npm run gate` green. Changelog + `npm run build:pages`.

## Definition of done
- Agents autonomously create + use 3D via chained MCP tools and can wear a persistent embodied identity; any creation embeds anywhere in one line with social/AR share.

## Hand-off
Report the composable tool chain, the agent-body flow, and the embed/share surfaces. This closes the loop: create (02/05/06/07) → own (08) → discover/remix (09) → use everywhere (10). Commit/push only if asked; both remotes.

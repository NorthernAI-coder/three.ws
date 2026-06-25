# Prompt 10 — Claude Code plugin marketplace (publish & make installable)

> Paste into a fresh Claude Code chat in the three.ws repo. Follow CLAUDE.md. Use TodoWrite. No prereqs, but 01 (tool annotations) makes the bundled MCP servers cleaner.

## Context
This is a different surface from the Connectors Directory (01–03). Claude Code has its own **plugin** system: a marketplace is a repo containing `.claude-plugin/marketplace.json` that lists installable plugins, each of which can bundle **skills, slash commands, subagents, hooks, and MCP servers**. Users install with:

```
/plugin marketplace add nirholas/three.ws
/plugin install three-ws-core@three-ws
```

We already have a marketplace manifest at `.claude-plugin/marketplace.json` with three plugins:
- `three-ws-core` → `./.agents` (wallet + x402 skills: authenticate, fund, send, trade, bazaar, pay, monetize, query-onchain)
- `three-ws-developer` → `./marketplace/plugins/three-ws-developer` (scaffold agents, configure MCP, code examples)
- `three-ws-pump-fun` → `./pump-fun-skills` (create coins, swap, creator fees, tokenize agents, live avatar reactions)

The work is to **finish, validate, and make these genuinely installable**, then add the one plugin that's missing: a **3D / forge** plugin (the platform's most distinctive capability).

Re-fetch the live plugin + marketplace schema before editing — the spec evolves:
- Claude Code plugins: https://docs.claude.com/en/docs/claude-code/plugins
- Plugin marketplaces: https://docs.claude.com/en/docs/claude-code/plugin-marketplaces

## Objective
A validated, installable three.ws plugin marketplace with **four** polished plugins, each with a complete `plugin.json`, real bundled components (no empty skills), and a verified install from a clean checkout.

## Tasks
1. **Audit the three existing plugins.** For each `source` dir, open the `.claude-plugin/plugin.json` and confirm:
   - Every declared skill/command/agent path actually exists and is non-empty.
   - `name`, `version`, `description`, `author`, `homepage`, `repository`, `license`, `keywords`, `category` are all present and accurate.
   - No dead component references. No `// TODO`, no stub skills. Each skill has a real `SKILL.md` with a precise `description` trigger line.
2. **Add the missing `three-ws-3d` plugin.** This is the platform's signature surface and currently has no plugin. Create `marketplace/plugins/three-ws-3d/` with:
   - A `.claude-plugin/plugin.json` (category `3d` or `creative`).
   - Skills wrapping the real generation flow: text→3D (`forge_free`, free lane), text→avatar, mesh forge, auto-rig. Each skill's `SKILL.md` documents the real endpoint/MCP tool, inputs, outputs (GLB URL + viewer link), and the free vs paid lanes. No fake data.
   - The `@three-ws/scene-mcp` / `@three-ws/avatar-mcp` MCP server(s) wired in the plugin's MCP config so installing the plugin makes the 3D tools available.
   - Register it in `.claude-plugin/marketplace.json`.
3. **Bundle MCP servers correctly.** For plugins that expose MCP tools, ensure the plugin ships an MCP server reference (npx `@three-ws/*` or a hosted URL) per the plugin MCP spec, so install wires the tools with zero extra config. Verify the referenced npm packages are published and the hosted URLs resolve.
4. **Validate the marketplace.** Confirm `marketplace.json` parses, every `source` resolves, and there are no duplicate plugin names. If a validator/CLI exists (`claude plugin validate` or equivalent), run it and paste output.
5. **Real install test.** From a clean clone or a fresh Claude Code session, run `/plugin marketplace add` against this repo and `/plugin install` each plugin. Confirm skills appear, commands register, and at least one bundled MCP tool lists. Capture the result.
6. **README + discovery.** Add a "Install in Claude Code" section to the repo `README.md` (the two install commands per plugin). Ensure the marketplace is discoverable: the repo root marketplace manifest is the canonical entry.
7. **Changelog.** Add a `data/changelog.json` entry ("three.ws Claude Code plugin marketplace — install agents, wallet, 3D, and pump.fun tools in one command", tag `feature`/`sdk`) and run `npm run build:pages`.

## Verification (must actually run)
- `marketplace.json` and every `plugin.json` parse as valid JSON and validate against the live schema.
- A real `/plugin install` of each of the four plugins succeeds; skills and MCP tools show up.
- Every skill `SKILL.md` has a real description trigger and real content — grep for `TODO`/`placeholder`/`not implemented` returns nothing.
- `$THREE` is the only coin referenced anywhere in plugin copy and skills.
- `npm run build:pages` passes.

## Definition of done
- Four installable plugins (core, developer, pump-fun, 3d), each validated and install-tested from a clean state.
- README documents install. Marketplace manifest is canonical and clean. Changelog validated.

## Hand-off
Report the four plugin names + install commands, the validator output, and the install-test result. Note any npm package that still needs publishing. Commit/push only if asked; stage touched paths; both remotes.

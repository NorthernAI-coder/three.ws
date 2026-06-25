# Prompt 11 — Anthropic Agent Skills pack (distributable & registry-ready)

> Paste into a fresh Claude Code chat in the three.ws repo. Follow CLAUDE.md. Use TodoWrite. Pairs with 10 (the plugin marketplace bundles these skills).

## Context
Agent Skills are portable folders (`SKILL.md` + optional scripts/assets) that any Claude surface — Claude Code, the Claude apps, the Agent SDK — can load. They are the most reusable unit we publish: the same skill works in a plugin, in a `.claude/skills` dir, and uploaded to a Claude project. We already have real skills under `.agents/skills/` (authenticate-wallet, fund, send-usdc, trade, search-for-service, pay-for-service, monetize-service, query-onchain-data, x402, metamask-agent-*). This chat **hardens them into a distributable pack** and adds the 3D-creation skills that don't exist yet.

Re-fetch the live skill authoring spec first — frontmatter fields and limits change:
- Agent Skills: https://docs.claude.com/en/docs/claude-code/skills
- Skill authoring best practices: https://docs.claude.com/en/docs/agents-and-tools/agent-skills

## Objective
A clean, versioned **three.ws Skills pack**: every skill has a precise trigger description, real runnable content (no stubs), progressive-disclosure structure, and a manifest so the pack is installable as a unit and listable wherever skills are indexed.

## Tasks
1. **Inventory + audit existing skills.** List every skill under `.agents/skills/`. For each, open `SKILL.md` and verify:
   - Frontmatter `name` + `description` per spec. The `description` is the *only* thing the model sees when deciding to load the skill — make it a crisp trigger ("Use when the user wants to …"), not a summary.
   - Body uses progressive disclosure: short overview, then steps; heavy reference/scripts split into linked files loaded on demand, not inlined.
   - Any referenced script actually exists and runs. No `not implemented`, no fake output.
2. **Add the 3D-creation skills** (the platform's signature, currently absent from the skill set): `generate-3d-model` (text→GLB via the free `forge_free` lane), `create-3d-avatar` (text→rigged avatar), `rig-a-model` (auto-rig a GLB). Each `SKILL.md` documents the real endpoint/MCP tool, the free vs paid lane, inputs, and the GLB URL + viewer-link output. Use real API shapes from `api/forge*.js` / `mcp-server/src/tools/`. No mock responses.
3. **Normalize structure.** Ensure every skill folder is self-contained and portable (no import from app internals it can't reach when copied out). Shared helper text → a linked reference file, not duplicated.
4. **Pack manifest + versioning.** Create a pack-level index (`.agents/skills/SKILLS.md` or `skills-pack.json`) listing every skill with its trigger and a pack `version`. This is what a registry or a teammate reads to understand the set.
5. **Categorize for two audiences.** Tag each skill: `wallet/payments` (the x402 economy set) vs `3d/creative` (generation set) vs `intel/trading`. The OpenAI track must never bundle the crypto set; the 3d/creative set is the cross-platform-safe subset — mark it explicitly so prompt 12/04 can reuse it.
6. **Install paths documented.** Document the three ways to use the pack: (a) via the Claude Code plugin (prompt 10), (b) dropped into a project `.claude/skills/`, (c) uploaded to a Claude project/app. One short section each in a `docs/skills.md` (create it).
7. **Changelog.** Add a `data/changelog.json` entry ("three.ws Agent Skills pack — wallet, x402, and 3D-creation skills for any Claude surface", tag `sdk`/`feature`) and run `npm run build:pages`.

## Verification (must actually run)
- Every `SKILL.md` parses (valid frontmatter) and has a trigger-style `description`.
- Each referenced script runs without error; no stub/placeholder strings anywhere in the pack.
- The 3d/creative subset contains **zero** coin/token/wallet/x402 strings (so it's reusable on the OpenAI track) — paste the grep.
- Loading a skill in a fresh Claude Code session triggers on its description and produces real output (test `generate-3d-model` end to end against the free lane).
- `npm run build:pages` passes.

## Definition of done
- All existing skills hardened; three real 3D-creation skills added; pack manifest + `docs/skills.md` written.
- Crypto vs creative subsets clearly tagged. Changelog validated.

## Hand-off
Report the full skill list with triggers and category tags, the pack manifest path, and the `generate-3d-model` end-to-end test result. Name the exact creative-subset skills the OpenAI track can reuse. Commit/push only if asked; stage touched paths; both remotes.

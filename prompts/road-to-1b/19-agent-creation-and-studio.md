# 19 — Agent creation & Agent Studio

> Part of **Road to $1B** (`prompts/road-to-1b/`). Read `00-README.md` and `/CLAUDE.md` first.

**Phase:** 4 — Surface completeness
**Owns:** the agent-creation wizard + Agent Studio pages, `src/brain.js`, `api/avatars/`, `api/_mcp3d/tools/studio.js`, auto-rig path in `api/forge.js`.
**Depends on:** Phase 0–1, 18.  ·  **Parallel-safe with:** 20–24.

## Why this matters for $1B
"Create an agent" is the platform's core conversion event — a user turns an idea into a
living, embodied, money-capable agent. If the wizard or Studio drops a step, the whole
value proposition leaks. Related feature specs live in `prompts/agent-studio/`.

## Mission
Make the end-to-end "name → 3D body → brain/persona → memory → money → skills → ship"
flow complete, real, and reachable, with the live avatar reflecting every choice.

## Do this
1. Walk the guided creation wizard step by step; confirm each step persists and the
   resulting agent is registered and viewable (no orphaned drafts).
2. **Body:** auto-rig on create (the rerig path in `api/forge.js`) produces a rigged,
   animated avatar; failures fall back to the default rig, never a T-pose.
3. **Brain/persona:** `src/brain.js` persona + multi-LLM wiring is real (via worker
   proxies), with designed states when a provider is degraded (see prompt 10).
4. **Memory:** persistent memory reads/writes work and surface in the UI.
5. **Money:** the agent's wallet is created and linked (hand off detail to prompt 24).
6. **Skills:** attaching skills from the marketplace works (hand off to prompt 20).
7. Every state designed; the live 3D avatar updates as the user authors; mobile usable.

## Must-not
- No stubbed wizard steps, no "coming soon" tab inside the core flow.
- Do not fabricate memory/brain responses — wire real backends.

## Acceptance
- [ ] A new user creates, ships, and reopens a fully-embodied agent end to end.
- [ ] Body/brain/memory/money/skills steps all persist and reflect in the avatar.
- [ ] `npm test` green; changelog `feature`/`improvement` entry.

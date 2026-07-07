# Prompt 01 — Regression & architecture safety net (do this first)

> Paste into a fresh Claude Code chat in the three.ws repo. Follow CLAUDE.md and `prompts/roadmap/00-README.md`. Use TodoWrite. This prompt is **purely additive test/infrastructure** — it must not change any product behavior.

## Why
Every later roadmap prompt promises "don't break the current architecture." That promise is only real if we can *detect* breakage. This prompt hardens the regression gate so subsequent work has a trustworthy green baseline to protect.

## Objective
Extend the existing test/audit suite with **golden, fast, deterministic** checks across the highest-risk shared surfaces, and wire them into one `npm run gate` command.

## Tasks (additive only)
1. **Inventory the current gate.** Run each script in the 00-README gate; record which exist, pass, or are missing. Document in `prompts/roadmap/_generated/01/gate-inventory.md`.
2. **MCP `tools/list` golden snapshots.** For every hosted MCP endpoint (`api/_mcp/`, `api/_mcp3d/`, `api/_mcpagent/`, `api/_mcpbazaar/`, `api/_mcpibm/`) and the key `packages/*-mcp`, snapshot the `tools/list` output (names, titles, annotations, input schemas) into committed fixtures, and add a test that fails if a tool's public contract changes unexpectedly. This is the tripwire that catches accidental tool-contract breakage.
3. **Route + handler audit coverage.** Ensure `audit:routes` / `audit:handlers` / `audit:pages` actually cover all live `api/` and `pages/` entries; extend if gaps exist. A new endpoint added later with no handler/route should fail the audit.
4. **Headless viewer render smoke.** Add a deterministic headless check that loads the `@three-ws/avatar` viewer / `<agent-3d>` with a known GLB and asserts it renders without throwing (no WebGL context errors, model bounds non-empty). Use the existing test harness/runtime; keep it fast and CI-safe. If full WebGL isn't available in CI, assert the loader + scene-graph path up to the draw call.
5. **`glb-canonicalize` + `animation-retarget` contract tests.** These are universal shared cores. Add/strengthen tests asserting every supported rig convention still maps to the canonical skeleton and that the canonical-clip fallback gate behaves. (Extend `tests/glb-canonicalize.test.js`.)
6. **One command.** Add `npm run gate` to `package.json` that runs the full sequence, and document it in `prompts/roadmap/00-README.md` (replace the inline list with `npm run gate` if cleaner).

## Non-negotiables
- Zero product behavior changes. Only tests, fixtures, audit coverage, and a script alias.
- Tests must be deterministic and fast (no live-network flakiness; stub at the network boundary only, never fake product logic).

## Verification
- `npm run gate` runs green on a clean tree.
- Deliberately introduce a temporary breaking change to one tool's title, confirm the snapshot test catches it, then revert. Document that the tripwire works.

## Definition of done
- `npm run gate` exists and green; new golden snapshots + viewer smoke + canonicalize contract tests committed.
- Inventory + tripwire-proof documented in `_generated/01/`.

## Hand-off
Report what the gate now covers and any pre-existing red checks you found (do not fix product code here — just report). Every later prompt will run `npm run gate`. Commit/push only if asked.

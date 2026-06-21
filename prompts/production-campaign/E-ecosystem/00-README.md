# Track E — Developer Ecosystem & SDKs

**Goal: others build on us.** A platform is worth $1B when third parties depend on it.
This track turns three.ws's published SDKs, MCP servers, docs, and examples into a surface
an *outside* developer can take from zero to a working integration in **under 10 minutes** —
without reading our source, without a support thread, without a single broken link. That is
the network-effects pillar of the $1B thesis (`00-README-orchestration.md` §4): the product
others build on is the one that compounds.

Read `CLAUDE.md`, `STRUCTURE.md`, and `00b-the-bar.md` (the **Ecosystem bars**, §6) before
picking up any prompt here. STRUCTURE.md is the map of every SDK/MCP package and is the
source of truth for which package name maps to which directory.

## The 4 prompts

| # | File | Mission | Run order |
|---|---|---|---|
| **E1** | [`E1-sdk-production-polish.md`](E1-sdk-production-polish.md) | Bring the 5 published SDKs (`avatar-sdk`, `walk-sdk`, `page-agent-sdk`, `tour-sdk`, `agent-payments-sdk`) to production DX: copy-paste README quickstart, typed surfaces, a runnable example, semver + per-package `CHANGELOG.md`, and a CI smoke test. | Anytime (foundation for E3/E4) |
| **E2** | [`E2-mcp-servers-production.md`](E2-mcp-servers-production.md) | Bring every MCP server (`mcp-server`, `mcp-bridge`, and the 6 `packages/*` MCP servers) to production: enforce `audit:mcp` / `smoke:mcp` / `test:mcp` in CI, document every tool with example calls, validate all `server*.json` manifests. | Anytime (parallel to E1) |
| **E3** | [`E3-docs-api-reference.md`](E3-docs-api-reference.md) | Complete the docs site + API reference: every public endpoint and SDK surface documented, quickstarts that actually run, a live status link, real `llms.txt` / `llms-full.txt` (today both are empty placeholders), working search. | After E1 + E2 land (consumes their surfaces); can start early on layout/search |
| **E4** | [`E4-examples-templates-starters.md`](E4-examples-templates-starters.md) | A copy-paste library of runnable examples, embeds, and starter templates: `examples/*`, `coach-leo`, `multiplayer`, framework starters (React/Next/vanilla — none exist yet), and the `<agent-3d>` / `<page-agent>` / `<agent-presence>` web components. | After E1 (links the SDKs); parallel-safe with E3 |

**Recommended order:** E1 ∥ E2 first (independent, each owns its package dirs), then E3 and E4
in parallel (both consume E1/E2 outputs but own disjoint trees). None block the others hard —
the table's "run order" is for maximum link-integrity, not a strict gate.

## File-ownership map (disjoint — parallel-safe)

| Prompt | Owns (edit freely) | Must not touch |
|---|---|---|
| **E1** | `avatar-sdk/`, `walk-sdk/`, `page-agent-sdk/`, `tour-sdk/`, `agent-payments-sdk/` (READMEs, `types/`, `examples/`, `package.json`, new `CHANGELOG.md`), `scripts/publish-packages.mjs` (read-only ref) | `packages/*-mcp/`, `mcp-server/`, `mcp-bridge/`, `docs/`, `examples/` (top-level) |
| **E2** | `mcp-server/`, `mcp-bridge/`, `packages/avatar-agent-mcp/`, `packages/pumpfun-mcp/`, `packages/ibm-watsonx-mcp/`, `packages/ibm-x402-mcp/`, `packages/three-token-mcp/`, `packages/threews-avatar-mcp/`, root `server*.json`, `scripts/audit-mcp-manifests.mjs` / `smoke-mcp-remotes.mjs` / `test-mcp-all.mjs` | SDK dirs, `docs/`, `examples/` |
| **E3** | `docs/` (`api-reference.md`, `index.html`, `quick-start.md`, `llms.txt`, `llms-full.txt`, `api/`, search assets) | SDK source, MCP source, `examples/` |
| **E4** | `examples/`, `examples/coach-leo/`, `multiplayer/`, new framework-starter dirs under `examples/`, web-component embed pages | SDK/MCP `src/`, `docs/` |

**Shared, append-only (any prompt):** `.github/workflows/ci.yml` (E1 + E2 both add jobs —
add a *new named job*, never rewrite existing ones), `data/changelog.json` (append one entry,
never reformat), `package.json` root `scripts` (add, never remove). Coordinate via distinct
job/script names. Stage explicit paths only — never `git add -A`.

When this directory contains only this `00-README.md`, Track E is done.

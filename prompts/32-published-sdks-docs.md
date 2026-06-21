# 32 · Published SDKs — Quality, Types & Docs

## Mission
Every published package is something an external developer can adopt in minutes: clean API, correct
types, accurate README, working examples, and a verified build/publish path.

## Context
- Published: `@three-ws/avatar` (avatar-sdk), `@three-ws/walk` (walk-sdk), `@three-ws/page-agent`
  (page-agent-sdk), `@three-ws/agent-payments`, `@three-ws/agent-protocol-sdk`, `@three-ws/sdk`,
  `@three-ws/solana-agent`, plus `packages/*` (avatar-schema, avatar-cli, viewer-presets) and MCP servers.
- Tooling: `npm run publish:packages(:dry)`, `publish:lib`, `build:lib`; web component `<agent-3d>`.

## Tasks
1. **API surface review:** each SDK has a coherent, documented public API; no leaking internals; stable
   exports; semver-appropriate versions.
2. **Types:** TypeScript types/`.d.ts` correct and shipped; `npm run typecheck` clean for consumers;
   subpath exports (e.g. avatar `/react`, `/creator`, `/viewer`) resolve.
3. **READMEs + examples:** install → minimal working example → API reference for each package. Verify
   the example actually runs (embed `<agent-3d>` and `@three-ws/walk` on a bare HTML page).
4. **Build/publish dry-run:** `npm run publish:packages:dry` and `publish:mcp:dry` clean; no missing
   files, no accidental private code shipped, correct `files`/`exports`/`main`/`module`/`types`.
5. **Examples dir:** `examples/` demos load and work (`embed-test`, `web-component`, `two-agents`,
   `minimal`).
6. **Versioning + changelog:** per-package changelogs/versions consistent; breaking changes called out.

## Acceptance
- Each published package: correct types, accurate README, a verified working example.
- `publish:packages:dry` + `publish:mcp:dry` clean; subpath exports resolve; `examples/` all work.
- No private/internal code leaks into published artifacts.

---
### Operating rules — read CLAUDE.md + STRUCTURE.md first. No mocks/fake data/stubs in examples — real, runnable. $THREE only (`FeMbDoX7R1Psc4GEcvJdsbNbZA3bfztcyDCatJVJpump`). Stage explicit paths; never `git add -A`. Don't commit `api/*.js` bundles. Keep forks (character-studio, agent-payments-sdk) cleanly attributed. Push both remotes when asked; never pull from `threeD`. DoD = CLAUDE.md checklist.

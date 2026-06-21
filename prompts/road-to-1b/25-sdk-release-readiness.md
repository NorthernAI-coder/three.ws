# 25 — SDK release-readiness

> Part of **Road to $1B** (`prompts/road-to-1b/`). Read `00-README.md` and `/CLAUDE.md` first.

**Phase:** 5 — Developer platform
**Owns:** `avatar-sdk/`, `walk-sdk/`, `page-agent-sdk/`, `agent-payments-sdk/`, `solana-agent-sdk/`, `agent-protocol-sdk/`, `tour-sdk/`, `agent-ui-sdk/`, `packages/*`.
**Depends on:** the surfaces each SDK wraps (18–24).  ·  **Parallel-safe with:** 26–28.

## Why this matters for $1B
Developers building on three.ws is how a product becomes a platform — and platforms get
the $1B multiple. Each `@three-ws/*` package must install clean, be documented, have
runnable examples, and match the live API.

## Mission
Make every published SDK release-ready: versioned, documented, exemplified, typed, and
verified to work against the real backend.

## Map
- Workspaces + their published names in `STRUCTURE.md` / `package.json`.
- Publish tooling: `npm run publish:packages` (+ `:dry`), `publish:lib`, `release:lib`,
  the build-cache in `scripts/build-cache.mjs`, per-package `PUBLISHING.md`.

## Do this
1. For each SDK: `README` with install + quickstart + API reference; a runnable example
   (under `examples/` where applicable); correct `package.json` (exports, types, files,
   semver, repository, license).
2. Verify each builds in isolation and a fresh `npm install` of the published artifact
   works (use `publish:packages:dry`); no reliance on the monorepo at runtime for
   `packages/*` (per STRUCTURE.md they must be dependency-free for consumers).
3. Confirm the public API matches live endpoints (esp. `agent-payments-sdk/` vs
   prompt 24's payment paths; `avatar-sdk/` `<agent-3d>` web component vs the viewer).
4. Ship TypeScript types or JSDoc; ensure `npm run typecheck` passes.
5. Add a smoke test per SDK that exercises its primary path against a real/staging API.
6. Document the version + changelog for each; align with `data/changelog.json` `sdk` tag.

## Must-not
- Do not publish a package that imports app internals or has a broken `exports` map.
- Do not ship an example that uses mock data.

## Acceptance
- [ ] Each SDK: README + example + correct package.json + types; dry-run publish clean.
- [ ] Public APIs verified against live endpoints; per-SDK smoke test passes.
- [ ] `npm test` + `typecheck` green; changelog `sdk` entry per release.

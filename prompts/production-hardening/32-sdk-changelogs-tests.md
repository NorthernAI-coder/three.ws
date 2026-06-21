# 32 · Per-package CHANGELOGs + SDK unit tests

> **Phase 6 — Developer ecosystem** · **Depends on:** none · **Parallel-safe:** yes · **Effort:** M

## Mission
External devs are how a platform compounds to $1B, but the published SDKs are inconsistent: only ~2 of
13 packages have a CHANGELOG, and several (`avatar-sdk`, `walk-sdk`, `mcp-server`) have **no unit
tests**. Treat the SDKs as a product family: every published package gets release history and a test
suite so external developers can trust and verify it.

## Context (read first)
- `CLAUDE.md`; `STRUCTURE.md` (surface→package map).
- Published packages: `@three-ws/{avatar,walk,page-agent,sdk,solana-agent,agent-payments,agent-protocol-sdk,mcp-server,mcp-bridge,agent-ui,x402-modal-sdk}` + `packages/*` + `tour-sdk`.
- Test-script precedents: `page-agent-sdk` (`npm test`), `solana-agent-sdk` (jest), `agent-protocol-sdk` (`node --test`). Missing: `avatar-sdk`, `walk-sdk`, `mcp-server`.
- Monorepo `CHANGELOG.md` is rich, but per-package history is absent.

## Build this
1. **Per-package CHANGELOG** — add `CHANGELOG.md` to every published package (Keep a Changelog format), seeded with current version + recent notable changes. Add a `prepublishOnly`/release step that requires the CHANGELOG be updated for a version bump.
2. **SDK unit tests** — add a real `test` script + meaningful tests to the packages that lack them (start with `avatar-sdk`, `walk-sdk`, `mcp-server`): public API surface, error paths, type-level smoke (import + invoke). No trivial assert-true tests.
3. **Consistent package metadata** — verify each `package.json`: `types`, `exports`/subpaths, `files` allowlist, `repository`, `license`, `engines`, and `sideEffects` where relevant. Fix divergence.
4. **Test the published shape** — a check that imports each package via its public entry (as an external consumer would) and exercises a basic call, catching broken `exports` maps.
5. **CI** — run all SDK test suites in CI; block publish if a package's tests fail or its CHANGELOG wasn't updated for a version change.

## Files likely in play
`CHANGELOG.md` in each published package, `package.json` (`test`, metadata) per package, new test files in `avatar-sdk`/`walk-sdk`/`mcp-server` (and any other gap), `.github/workflows`, the publish scripts.

## Definition of done
- [ ] Every published package has a CHANGELOG + a passing test suite.
- [ ] Package metadata consistent + correct (types/exports/files/repository/license).
- [ ] Published-shape import test passes for each package.
- [ ] CI runs SDK tests + enforces CHANGELOG-on-bump.
- [ ] Changelog (platform): **sdk** entry ("SDKs now ship tests + per-package release notes").

## Guardrails
Follow CLAUDE.md. $THREE only in any SDK example/fixture. Don't publish from this prompt — just make them publish-ready (publishing is prompt 33). Push both remotes.

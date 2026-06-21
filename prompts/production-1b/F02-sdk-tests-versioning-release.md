# F02 — SDK tests + versioning + release automation + changelogs

> Phase F · Depends on: E10 (CI) · Parallel-safe: yes
> Run in a fresh chat in `/workspaces/three.ws`. Read [CLAUDE.md](../../CLAUDE.md) first.

## Mission
Published SDKs are a promise to other developers. Today test coverage is uneven, there's no
semver policy, no release automation, and no per-package changelog — so consumers can't trust
upgrades. Make the `@three-ws/*` packages dependable to build on.

## Where this lives (real files)
- `sdk/`, `solana-agent-sdk/`, `agent-payments-sdk/` (fork, v3.x, has `FORK_NOTES.md`), `agent-protocol-sdk/`, `avatar-sdk/`, `walk-sdk/`, `page-agent-sdk/`, `tour-sdk/`, `mcp-server/`, `packages/*`.
- Root `package.json` workspaces; `scripts/` build helpers.

## Build this
1. **Test every SDK:** each package gets meaningful unit tests (mock RPC/EVM at the boundary) + at least one integration test; add a `test:all` script that runs every workspace's tests. Prioritize the money + identity SDKs (`agent-payments-sdk`, `solana-agent-sdk`, `sdk`, `mcp-server`).
2. **Semver policy:** `VERSIONING.md` at root defining semver rules + a Node `engines` field per package; a `MIGRATION.md` template for major bumps. Document the `agent-payments-sdk` fork's relationship to upstream + how to rebase.
3. **Changelogs:** a `CHANGELOG.md` per published package (Conventional Commits / changesets if feasible), so every version explains what changed.
4. **Release automation:** tag-triggered build+test+publish (wire into E10), with npm provenance; a `release` helper script; verify each package's `package.json` (name, version, files, exports, types) is publish-correct.
5. **pump-fun migration guide:** `docs/MIGRATION_FROM_PUMPFUN.md` for users moving off `@pump-fun/agent-payments-sdk`.

## Out of scope
- Writing the developer guide/examples (**F01**) and MCP reconciliation (**F03**).

## Definition of done
- [ ] Every published SDK has unit + ≥1 integration test; `test:all` runs them green.
- [ ] `VERSIONING.md` + per-package `engines`; per-package `CHANGELOG.md`; pump-fun migration guide written.
- [ ] Tag-triggered publish works (provenance) for the priority packages; package.json metadata verified.
- [ ] `npx vitest run` green; changelog entry (sdk); committed + pushed to both remotes.

## Verify
- `npm run test:all` green; cut a patch release of one SDK via tag → it publishes with a changelog.

# E10 — CI/CD: test gate, e2e on money paths, publish automation

> Phase E · Depends on: E06 (migrations in deploy), E08 (secret scan) · Parallel-safe: yes
> Run in a fresh chat in `/workspaces/three.ws`. Read [CLAUDE.md](../../CLAUDE.md) first.

## Mission
A platform that ships continuously needs a gate that makes "main is always deployable" true.
Today tests exist (463) but the gate, e2e coverage of money paths, preview verification, and
package publish automation need to be locked in so quality scales with velocity.

## Where this lives (real files)
- `package.json` scripts: `test` (vitest + playwright), `test:core`, `test:gate`, `test:e2e`, `verify`, `build`, `build:vercel`.
- `tests/` (vitest) + Playwright e2e; `scripts/test-gate.mjs`, `scripts/audit-*.mjs`.
- Workspaces in `package.json` (SDKs/MCP packages to publish).

## Build this
1. **PR gate:** a CI workflow that runs `vitest run`, the relevant Playwright e2e, `prettier --check`, page-index/empty-handler audits, and a build — failing the PR on any break. Make it fast (shard/parallelize) so it doesn't slow the team.
2. **Money-path e2e:** Playwright flows for the critical journeys — buy $THREE (swap), pay for a skill (402 modal), forge → result, sign-in, deploy an agent. These must pass on every PR (mock external chains where needed, but exercise the real UI wiring).
3. **Secret scan + dep audit:** wire E08's secret scanner and an `npm audit`/dependency check into CI.
4. **Preview verification:** on each PR, deploy a Vercel preview and smoke-test key endpoints (health, token stats, a paid 402 challenge) against it.
5. **Publish automation:** a tag-triggered workflow that builds + tests + publishes the `@three-ws/*` packages (ties to F02), with provenance and changelogs.
6. **Branch protection:** require the gate green before merge to `main`; keep pushes mirrored to both remotes per CLAUDE.md.

## Out of scope
- Writing the SDK tests themselves (**F02**) — this runs them.

## Definition of done
- [ ] PR gate runs tests + lint + audits + build and blocks on failure; it's fast enough to not bottleneck.
- [ ] Money-path Playwright e2e run in CI and pass; preview smoke-tests run per PR.
- [ ] Secret scan + dep audit in CI; tag-triggered publish workflow works for at least one package.
- [ ] `npx vitest run` green locally; changelog entry (infra); committed + pushed to both remotes.

## Verify
- Open a PR with a deliberately failing test → gate blocks; tag a package release → it publishes via CI.

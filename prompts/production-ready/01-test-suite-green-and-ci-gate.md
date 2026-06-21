# 01 — Test suite green + CI gate

> Part of **Production-Ready** (`prompts/production-ready/`). Read `00-README.md` and `/CLAUDE.md` first.

**Phase:** 0 — Foundation
**Owns:** `tests/`, `package.json` scripts, CI config (`.github/workflows/` if present), `vitest`/`playwright` config.
**Depends on:** nothing — this runs first.

## Why this matters for $1B
A platform you can't trust to be green is a platform you can't ship to fast. Every
later prompt assumes a green baseline so regressions are visible. Investors and
enterprise customers read CI status as a proxy for engineering discipline.

## Mission
Get the entire test suite passing reliably, eliminate flakes, and enforce green on
every push so the bar can never silently drop.

## Map
- `npm test` → `vitest run && playwright test`
- `npm run test:all` → `npm run test && npm run test:pages`
- `npm run test:core`, `test:gate`, `test:e2e`, `test:pages`
- `npm run lint` (eslint `.`), `npm run typecheck` (`tsc -p jsconfig.json`)
- 237 files under `tests/`. Smoke suites: `smoke:onchain`, `smoke:mcp`, `smoke:agent-wallet`.
- CI: check `.github/workflows/` — wire the gate there.

## Do this
1. Run `npm run lint`, `npm run typecheck`, `npm test`, `npm run test:pages` and
   capture the full failure list. Triage into: real bugs, stale tests, flakes,
   environment/credential gaps.
2. Fix **real bugs in the code**, not the tests, wherever a test correctly catches a
   defect. Where a test is genuinely stale (asserts removed behavior), update it and
   note why in the commit.
3. For tests that need credentials/network: gate them on env presence so they skip
   cleanly (not fail) when creds are absent locally, but **run** in CI where creds
   exist. Never delete coverage to make green.
4. Hunt flakes: anything timing-dependent, animation-dependent, or ordering-dependent
   in Playwright. Add deterministic waits (`expect(...).toPass`, role/text locators),
   remove arbitrary sleeps. Re-run the suspect specs 5× to confirm stability.
5. Ensure `npm run typecheck` and `npm run lint` are clean. Fix the code; only
   disable a rule inline with a justifying comment when the rule is genuinely wrong
   for that line.
6. Wire/confirm a CI workflow that runs lint + typecheck + `test:all` on every push
   and PR to `main`, and **blocks merge on failure**. If `.github/workflows/` is
   absent, create one. Cache `node_modules` and the Playwright browser install.
7. Add a short `tests/README.md` (or update it) explaining how to run each suite and
   which need credentials.

## Must-not
- Do not weaken assertions, `.skip` real tests, or set `--passWithNoTests` to fake green.
- Do not commit credentials to make CI pass — use CI secrets.
- Do not introduce `setTimeout`-based waits in Playwright.

## Acceptance
- [ ] `npm run lint` — clean.
- [ ] `npm run typecheck` — clean.
- [ ] `npm test` and `npm run test:pages` — green locally (creds-gated suites skip cleanly with a logged reason).
- [ ] Suspect flaky specs pass 5/5 reruns.
- [ ] CI workflow runs lint + typecheck + test:all on push/PR and blocks on red.
- [ ] `git diff` reviewed; every changed test justified.

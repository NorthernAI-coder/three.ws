# 01 — Test suite green + CI gate

> Part of the three.ws "Production → $1B" program. Run in a fresh chat. Read
> `/CLAUDE.md` first (its rules override everything) and `prompts/production-1b/00-README.md`
> for shared context.

## Why this matters for $1B

CI is the only thing standing between a green checkmark and a money-path
regression reaching production. Right now the suite is large (458 vitest files +
a Playwright e2e set) but the gate is soft: lint allows the warning backlog and
typecheck is advisory (`continue-on-error: true`). A platform that ships real
USDC payments cannot tolerate "passing" CI that lets type errors and lint
warnings through. Make the suite genuinely green and reliable, then ratchet the
gate so "green" actually means "safe to merge."

## Mission

Get `npm test` (`vitest run && playwright test`) fully green and non-flaky, then
deliver a concrete, staged plan (and the first ratchet step) to flip the advisory
typecheck job to a hard gate and tighten eslint to `--max-warnings 0`.

## Map (trust but verify — files move)

- **CI definition** — [.github/workflows/ci.yml](../../.github/workflows/ci.yml).
  Jobs: `lint` (`npx eslint .`), `test` (`npx vitest run`), `guards`
  (`check-api-not-bundled` + `check:images` + `build:pages`), `typecheck`
  (advisory, `continue-on-error: true`).
- **Vitest config** — [vitest.config.js](../../vitest.config.js). Note the
  120s test/hook timeouts and `MAX_FORKS` cap for small CI/Codespace hosts.
- **Playwright config** — [playwright.config.js](../../playwright.config.js).
  `testDir: tests/e2e`, `retries: 1`, `fullyParallel: false`, dev-server cold
  budget 180s. Specs in [tests/e2e/](../../tests/e2e).
- **Scripts** — [package.json](../../package.json): `test`, `test:core`
  (`--maxWorkers=1`), `test:gate` ([scripts/test-gate.mjs](../../scripts/test-gate.mjs),
  the curated deploy-critical subset), `lint`, `lint:fix`, `typecheck`
  (`tsc -p jsconfig.json`).
- **Typecheck scope** — [jsconfig.json](../../jsconfig.json): `checkJs: false`,
  opt-in via `// @ts-check` pragma; `include` is the ratchet allowlist.
- **Lint config** — [eslint.config.js](../../eslint.config.js).
- **Source guards** — [scripts/check-api-not-bundled.mjs](../../scripts/check-api-not-bundled.mjs),
  [scripts/audit-image-loading.mjs](../../scripts/audit-image-loading.mjs) (`check:images`).

## Do this

1. Run `npx vitest run` and capture every failure. Fix each at the root — never
   `.skip` a real test to go green. If a test depends on live credentials that
   are absent locally, confirm it is already guarded; if not, gate it cleanly on
   env presence rather than deleting it.
2. Re-run failing files in isolation (`npx vitest run path/to/file.test.js`) and
   3x in a row to separate true failures from flakes. For flakes, find the cause
   (shared global state, real timers, unmocked I/O, fork contention) and fix it —
   do not just bump a timeout. `vitest.config.js` already sets generous ceilings.
3. Start the dev server (`npm run dev`, port 3000) and run `npx playwright test`.
   Fix e2e failures at the source. Honor `fullyParallel: false` and the cold-start
   budget; do not lower assertions to pass.
4. Confirm the guards job is green: `node scripts/check-api-not-bundled.mjs`,
   `npm run check:images`, `npm run build:pages`.
5. Run `npm run lint` and count warnings. Burn the backlog down with `npm run
   lint:fix` for auto-fixables, then hand-fix the rest — no blanket
   `eslint-disable` of whole files. Track the count before and after.
6. Run `npm run typecheck`. Catalog the errors by file. Fix the cheap ones now
   and add `// @ts-check` + the file to `jsconfig.json` `include` as you bring each
   clean (the ratchet rule the jsconfig comment describes).
7. Write the staged ratchet plan into this task's report: (a) flip eslint to
   `--max-warnings 0` in `ci.yml` once the count hits 0; (b) flip typecheck's
   `continue-on-error` to `false` once `npm run typecheck` is clean. Land whichever
   ratchet is already achievable (likely eslint) in `ci.yml` now.
8. Re-run the full `npm test` once more end-to-end to confirm a clean, repeatable
   green before claiming done.

## Must-not

- Do not skip, delete, or weaken a test to make CI green — fix the code or the test.
- Do not flip typecheck/eslint to a hard gate while errors/warnings remain; that
  breaks every other agent's PR. Ratchet only when the count is actually zero.
- Do not commit a `vercel build`-bundled `api/*.js` (check `head -1` for `__defProp`).
- Do not reference any coin other than `$THREE` in any test or fixture.
- Do not mask flakiness with retries or longer timeouts in place of a real fix.

## Acceptance (all true before claiming done)

- [ ] `npx vitest run` passes locally with zero failures, repeatable across 3 runs.
- [ ] `npx playwright test` passes against `npm run dev` with no skipped real specs.
- [ ] `guards` job commands all pass (`check-api-not-bundled`, `check:images`, `build:pages`).
- [ ] Current eslint warning count is recorded and reduced (target 0); any
      achievable ratchet (`--max-warnings 0`) is landed in `ci.yml`.
- [ ] A concrete, staged plan to flip the typecheck gate is documented, with the
      first ratchet step applied or explicitly blocked-and-explained.
- [ ] No coin other than `$THREE` introduced; no new mocks/stubs/TODOs.
- [ ] If a step could not be verified locally (e.g. live-cred e2e), it is called
      out explicitly rather than claimed.

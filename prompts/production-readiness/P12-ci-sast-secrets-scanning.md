# P12 · CI SAST + secret scanning + pre-commit secret hook

> **Workstream:** Security & compliance · **Priority:** P0 · **Effort:** M · **Depends on:** none

## Before you start
1. Read `CLAUDE.md` (rules that override defaults) and `STRUCTURE.md` (surface map).
2. three.ws monorepo: vanilla JS + Vite frontend, Vercel functions in `api/`, Cloudflare workers in `workers/`, tests via `vitest` + Playwright (`npm test`), CI in `.github/workflows/`.
3. **$THREE is the only coin** — CA `FeMbDoX7R1Psc4GEcvJdsbNbZA3bfztcyDCatJVJpump`. Never reference any other coin.

## Context
- CI is one file, `.github/workflows/ci.yml`, with jobs `lint`, `test`, `guards`, `typecheck`, `pages`, `e2e`. The `lint` job runs `npx eslint .` only. There is **no** SAST (no CodeQL, no `eslint-plugin-security`) and **no** secret scanning (no gitleaks/trufflehog) anywhere.
- ESLint is flat-config (`eslint.config.js`, ESLint 10). It scopes first-party root JS and ignores vendored/generated trees (`character-studio/**`, `**/vendor/**`, `chat/**`, `agent-payments-sdk/**`, build output, minified bundles). Rules are mostly `warn` (the file documents a "warn-baseline, ratchet to error" strategy); high-value structural rules (`no-dupe-keys`, `no-func-assign`) are `error`. No security plugin is loaded.
- `.githooks/pre-push` already exists (runs `npm run typecheck`; wired via `git config core.hooksPath .githooks`, set by `npm run setup`). There is no `pre-commit` hook. The hook respects `SKIP_HOOKS=1` and `--no-verify`.
- This repo handles real secrets at runtime (`HELIUS_API_KEY`, `TELEGRAM_BOT_TOKEN`, `THREEWS_SOL_PARENT_SECRET_BASE58`, Privy/JWT signing keys, R2 creds). `api/_lib/http.js` already goes to lengths to keep keyed RPC URLs and device tokens out of logs — but nothing stops a key from being committed in source.

## Problem / opportunity
A committed secret or an injectable code pattern (e.g. unsanitized `child_process`, `eval`, prototype pollution, ReDoS) would ship undetected. SAST + secret scanning are table stakes for a platform moving real money. We add both to CI plus a local pre-commit secret hook so leaks are caught before they ever reach a remote.

## Mission
Add a SAST gate (GitHub CodeQL for JS/TS, plus `eslint-plugin-security` rules in the existing eslint flat config) and a secret-scanning gate (gitleaks) to CI, and add a `.githooks/pre-commit` hook that runs gitleaks on staged changes before commit.

## Scope
**In scope:** new CodeQL workflow; secret-scan job (gitleaks) in CI; `eslint-plugin-security` wired into `eslint.config.js` at warn-then-targeted-error; `gitleaks.toml` config; `.githooks/pre-commit`; updating `npm run setup` docs so the hook is active.
**Out of scope:** rewriting flagged code en masse (fix only true positives you surface; allowlist documented false positives), rotating real secrets (separate ops task), container scanning.

## Implementation guide
1. **CodeQL workflow — `.github/workflows/codeql.yml`.** Use `github/codeql-action` (`init` → `autobuild`/manual → `analyze`) with `languages: javascript-typescript`. Trigger on `pull_request`, `push: branches: [main]`, and a weekly `schedule`. Permissions: `security-events: write`, `contents: read`, `actions: read`. Exclude vendored/generated paths via a `paths-ignore` in a `.github/codeql/codeql-config.yml` that mirrors the `ignores` list in `eslint.config.js` (`character-studio/**`, `**/vendor/**`, `**/dist/**`, `public/scene-studio/libs/**`, `**/*.min.js`, `data/_generated/**`, `src/solana/vanity/wasm/**`). Keep it a separate workflow file (CodeQL conventionally lives apart from `ci.yml`).
2. **`eslint-plugin-security` in `eslint.config.js`.** Add the plugin to the existing flat-config array (it ships a flat preset: `pluginSecurity.configs.recommended`). Install it as a devDependency. Because the repo runs a warn-baseline, land its rules at `warn` first so the gate stays green, then promote the unambiguous, currently-clean ones to `error` (`security/detect-child-process` is high-signal given `audit-deploy-artifacts.mjs`/`check-api-not-bundled.mjs` shell out; `security/detect-non-literal-fs-filename` will be noisy — keep warn). Do not change the existing ignore globs.
3. **Secret-scan job in `.github/workflows/ci.yml`.** Add a `secrets` job: checkout@v4 with `fetch-depth: 0` (gitleaks needs history for `--log-opts`), then `gitleaks/gitleaks-action@v2` (or pin a release and run the binary) over the full repo and the PR diff. Config in `.gitleaks.toml` at repo root: extend the default ruleset, add an `[allowlist]` for known-safe synthetic placeholders this repo uses on purpose — the `$THREE` CA (`FeMbDoX7R1Psc4GEcvJdsbNbZA3bfztcyDCatJVJpump`) and clearly-synthetic test fixtures like `THREEsynthetic1111…` are public/non-secret and must not trip the scan; allowlist by path for fixture/test dirs and by regex for these tokens. Fail the job on any real finding.
4. **`.githooks/pre-commit`.** Mirror the style of `.githooks/pre-push` (POSIX `sh`, `SKIP_HOOKS=1` + `--no-verify` bypass, clear failure message pointing at the fix). It should run `gitleaks protect --staged --config .gitleaks.toml` (scans only staged changes — fast, pre-commit-appropriate). If the `gitleaks` binary is absent locally, print a one-line install hint and exit 0 (don't block contributors who haven't installed it; CI is the hard gate). Ensure `npm run setup` / `scripts/setup-dev.mjs` still points `core.hooksPath` at `.githooks` (it already does for pre-push — confirm the new hook is picked up automatically since it's the same dir).
5. **Triage.** Run all three locally first. For each true positive, fix it (move a key to env, sanitize a `child_process` arg). For each documented false positive, allowlist it narrowly with a `// eslint-disable-next-line security/... -- reason` or a scoped `.gitleaks.toml` allowlist entry — never blanket-disable.

## Definition of done
- [ ] `codeql.yml` runs CodeQL JS/TS on PR + push + weekly, scoped by `codeql-config.yml`.
- [ ] `ci.yml` has a `secrets` job (gitleaks) that fails on real findings; `$THREE` CA + synthetic fixtures allowlisted.
- [ ] `eslint-plugin-security` wired into `eslint.config.js`; gate stays green; `detect-child-process` at error and clean.
- [ ] `.githooks/pre-commit` runs gitleaks on staged files, bypassable, degrades gracefully when binary missing.
- [ ] Existing tests pass (`npm test`); any code fixed for true positives has/keeps tests.
- [ ] User-visible change → entry in `data/changelog.json`, then `npm run build:pages` (security work counts — tag `security`).
- [ ] `git diff` self-reviewed.

## Verification
- `npx eslint .` → no new errors (security plugin loaded; check with a deliberate `child_process` test snippet that it flags, then remove it).
- `gitleaks detect --config .gitleaks.toml --no-banner` → no findings; then add a fake `AKIA...` string to a scratch file and confirm it's caught, and confirm the `$THREE` CA does NOT trip it.
- `gitleaks protect --staged` via the pre-commit hook: stage a fake secret → commit blocked; `SKIP_HOOKS=1 git commit` → bypasses.
- Paste `codeql.yml` and the edited `ci.yml` through `actionlint` (or GitHub's editor) — valid.

## Guardrails
- No mocks, fake data, stubs, `TODO`s, or commented-out code. Real APIs; handle errors at boundaries with working fallbacks.
- Stage explicit paths only; concurrent agents share this worktree — re-check `git status` before committing.
- Push only when asked, to BOTH remotes: `git push threeD main` && `git push threews main`. Never pull/fetch from `threeD`.
- Never commit secrets. Watch the `npx vercel build` trap: never commit esbuild-bundled `api/*.js` (check `head -1` for `__defProp`).

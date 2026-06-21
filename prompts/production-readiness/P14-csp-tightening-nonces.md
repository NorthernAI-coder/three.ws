# P14 · Tighten CSP to nonce/hash-based, kill unsafe-inline/unsafe-eval

> **Workstream:** Security & compliance · **Priority:** P1 · **Effort:** L · **Depends on:** none

## Before you start
1. Read `CLAUDE.md` (rules that override defaults) and `STRUCTURE.md` (surface map).
2. three.ws monorepo: vanilla JS + Vite frontend, Vercel functions in `api/`, Cloudflare workers in `workers/`, tests via `vitest` + Playwright (`npm test`), CI in `.github/workflows/`.
3. **$THREE is the only coin** — CA `FeMbDoX7R1Psc4GEcvJdsbNbZA3bfztcyDCatJVJpump`. Never reference any other coin.

## Context
- CSP is set as response headers in `vercel.json` (the `headers` array). The main app policy (around line 207 and 221) is:
  `script-src 'self' 'unsafe-inline' 'unsafe-eval' blob: https://cdn.jsdelivr.net https://cdnjs.cloudflare.com https://unpkg.com https://esm.sh https://ajax.googleapis.com https://s3.tradingview.com https://platform.twitter.com https://3d-agent.vercel.app https://three.ws; worker-src 'self' blob:; ... ; report-uri /api/client-errors`. Both `'unsafe-inline'` and `'unsafe-eval'` are present.
- There are inline `<script>` tags in pages — notably the theme-boot no-flash snippet injected by `scripts/inject-theme-boot.mjs` (marker string `three.ws theme boot`, injected into `pages/*.html` during `prebuild`/`seo:meta`). Inline scripts are why `'unsafe-inline'` is currently required.
- CSP violation reports already flow to `report-uri /api/client-errors`. `api/client-errors.js` already accepts a `csp` event type (`EVENT_TYPES` includes `'csp'`), validates/truncates the attacker-controllable payload, logs a structured `[client-error]` line, and forwards to Sentry. So the reporting pipeline for a report-only rollout exists.
- Some routes already ship a tighter policy with no `script-src` at all (embed/iframe routes around lines 844+ use `frame-ancestors *; base-uri 'self'; object-src 'none'; report-uri /api/client-errors`).
- `npm run test:pages` (`scripts/test-pages.mjs`) drives Chromium over every public route and fails on real console errors — a too-tight CSP that blocks a legit script will surface here.

## Problem / opportunity
`'unsafe-inline'` and `'unsafe-eval'` neutralize most of CSP's XSS protection: any injected `<script>` or `eval`'d string runs. Moving to a nonce/hash-based policy restores the protection. The blocker is inline scripts (theme-boot) and any `eval`-dependent third-party libs. We roll out safely: enumerate inline scripts and eval usage, switch to nonces/hashes, ship Report-Only first using the existing `/api/client-errors` pipeline, then enforce.

## Mission
Eliminate `'unsafe-inline'` (and, where feasible, `'unsafe-eval'`) from the main `script-src` by converting inline scripts to nonce- or hash-based, rolling out Report-Only first via `report-to`/`report-uri /api/client-errors`, then flipping to enforcing CSP once reports are clean.

## Scope
**In scope:** auditing every inline `<script>` and `eval`/`new Function` usage in shipped HTML/JS; nonce-or-hash strategy for the theme-boot and any other first-party inline scripts; a `Content-Security-Policy-Report-Only` rollout; tightening `vercel.json` script-src; verifying `/api/client-errors` ingests CSP reports.
**Out of scope:** the relaxed embed/iframe route policies (they already omit script-src), rewriting third-party CDN libs, removing `'unsafe-eval'` if a load-bearing dependency genuinely needs it (document it instead and keep `'unsafe-eval'` scoped only where required).

## Implementation guide
1. **Audit inline scripts + eval.** `grep -rn "<script>" pages/ public/ | grep -v "src="` to list every inline script (theme-boot is the known one). `grep -rn "eval(\|new Function(" public/ src/ pages/` and check CDN libs (tradingview/twitter widgets are common `eval` users) to see whether `'unsafe-eval'` can be dropped or must stay scoped. Write the inventory into the PR description.
2. **Pick the directive strategy.** Vercel static headers are per-route strings and can't inject a per-request nonce, so prefer **hashes** for the small, stable set of first-party inline scripts (the theme-boot snippet is deterministic — `inject-theme-boot.mjs` writes a fixed marker + body, so its SHA-256 is computable and stable). For routes served by an `api/` function that emits HTML, a per-request **nonce** is viable — but the theme-boot path is static, so hash is the right tool. Add `'sha256-<base64>'` entries to `script-src`. Have `scripts/inject-theme-boot.mjs` (or a new `scripts/compute-csp-hashes.mjs` run in `prebuild`) compute the hash of the exact inline body it injects and emit it where the CSP is assembled, so the hash never drifts from the script. Do NOT hand-maintain a hash that can silently go stale.
3. **CSP assembly without drift.** `vercel.json` CSP strings are duplicated across routes. Rather than hand-edit each, consider generating the relevant `vercel.json` header blocks (or a shared CSP constant injected at build) so the script-src is defined once. If a generator is too invasive, at minimum centralize the allowed-origins + hash list in one place and document it. Keep the existing trusted CDN origins; only remove `'unsafe-inline'` and (if proven unused) `'unsafe-eval'`.
4. **Report-Only rollout first.** Ship `Content-Security-Policy-Report-Only` with the *new tight* policy alongside the existing enforcing (looser) `Content-Security-Policy`. Point reports at the existing pipeline: add `report-to csp-endpoint` + a `Report-To` (or `Reporting-Endpoints`) header to `/api/client-errors`, keeping the legacy `report-uri /api/client-errors` for older browsers. Confirm `api/client-errors.js` accepts the `application/csp-report` / `application/reports+json` content types its `csp` event type implies — if it only parses `application/json`, extend `readBody`/`readJson` handling so real browser CSP reports aren't dropped at the boundary.
5. **Observe, then enforce.** After the Report-Only policy is live and `[client-error]` CSP logs are clean for the public routes (verify via `npm run test:pages` driving Chromium + a manual sweep of high-traffic pages), flip the tight policy to the enforcing `Content-Security-Policy` and remove the now-redundant Report-Only (or keep Report-Only for the next tightening step). Never enforce a policy that hasn't first run clean in Report-Only.
6. **Frame/object hardening pass (cheap win).** While in `vercel.json`, confirm the main policy keeps `object-src 'none'`, `base-uri 'self'`, and a sensible `frame-ancestors` — don't loosen these.

## Definition of done
- [ ] Inventory of inline scripts + eval usage documented; theme-boot converted to a build-computed hash (or nonce) — no `'unsafe-inline'` in the main `script-src`.
- [ ] `'unsafe-eval'` removed from the main policy, OR retained only on the specific route(s) a documented dependency requires.
- [ ] Report-Only rollout shipped first; CSP reports reach `/api/client-errors`; reports clean before enforcement flips.
- [ ] Hash is generated from the actual injected script body (cannot drift); CSP defined in one place where practical.
- [ ] Existing tests pass (`npm test`); `npm run test:pages` is green with the new policy (no blocked legit scripts).
- [ ] User-visible change → entry in `data/changelog.json`, then `npm run build:pages` (security work counts — tag `security`).
- [ ] `git diff` self-reviewed.

## Verification
- `npm run dev`, open the app, DevTools console shows **no** CSP violation errors on home/dashboard/pricing/legal routes.
- Inject a test inline `<script>alert(1)</script>` into a page locally → blocked by enforced CSP (proves `'unsafe-inline'` is gone); remove it.
- Trigger a real CSP violation (e.g. add a disallowed `<img src=evil>` script) and confirm a `csp` event lands as a `[client-error]` line via `/api/client-errors`.
- `npm run test:pages` passes (Chromium over every public route, no new console errors).
- `npm run build` / `prebuild` runs the theme-boot hash computation and the emitted hash matches the injected snippet (re-run twice → identical hash).

## Guardrails
- No mocks, fake data, stubs, `TODO`s, or commented-out code. Real APIs; handle errors at boundaries with working fallbacks.
- Stage explicit paths only; concurrent agents share this worktree — re-check `git status` before committing.
- Push only when asked, to BOTH remotes: `git push threeD main` && `git push threews main`. Never pull/fetch from `threeD`.
- Never commit secrets. Watch the `npx vercel build` trap: never commit esbuild-bundled `api/*.js` (check `head -1` for `__defProp`).

# 03 — Zero console errors & warnings

> Part of **Production-Ready** (`prompts/production-ready/`). Read `00-README.md` and `/CLAUDE.md` first.

**Phase:** 0 — Foundation
**Owns:** all `pages/`, `src/`, `public/` runtime JS; `public/error-reporter.js`.
**Depends on:** `02` (dead paths) helps; not strictly required.

## Why this matters for $1B
`/CLAUDE.md` Definition of done: "No console errors. No console warnings from your
code." Console noise hides real failures and signals sloppiness to any engineer who
opens devtools — including the ones doing technical diligence.

## Mission
Drive the browser console to zero errors and zero own-code warnings on every page,
in both themes, desktop and mobile viewports.

## Map
- 125 pages in `pages/`. Shared scripts in `public/` (`nav.js`, `x402.js`,
  `x402-pay-core.js`, etc.) and modules in `src/`.
- `public/error-reporter.js` already captures runtime errors — use it as a signal
  source, and make sure it itself is silent on the happy path. It pairs with the
  server-side `api/_lib/sentry.js` sink (prompt `25`).
- `npm run dev` serves on port 3000.

## Do this
1. Start `npm run dev`. Write/extend a Playwright sweep (in `scripts/` or
   `tests/`) that visits every page, in light and dark theme, at 390px and 1440px,
   and records every `console.{error,warning}` and every failed network request.
2. Categorize: own-code bugs, third-party library noise, missing assets (404s),
   uncaught promise rejections, hydration/order issues, CSP violations.
3. Fix own-code errors and warnings at the root cause. Common culprits: accessing
   DOM before load, missing null guards, deprecated APIs, passing wrong types,
   unhandled rejections from `fetch`. Wire proper guards and error boundaries at the
   network/user-input edges.
4. Fix every 404 asset (images, fonts, modules, source maps). Cross-check with
   `npm run check:images`.
5. For unavoidable third-party warnings, document them in a short allowlist the
   sweep can ignore — but justify each entry; do not use the allowlist to bury your
   own noise.
6. Confirm `error-reporter.js` reports real errors to its backend and produces no
   output on clean pages.

## Must-not
- Do not silence errors by wrapping in empty `try/catch`. Handle or surface them.
- Do not suppress warnings by monkey-patching `console`.

## Acceptance
- [ ] Playwright console sweep: 0 errors, 0 own-code warnings across all pages × 2 themes × 2 viewports.
- [ ] 0 failed network requests for first-party assets.
- [ ] 0 uncaught promise rejections.
- [ ] Third-party allowlist (if any) is documented and justified.
- [ ] Sweep wired as a repeatable script and runs in CI.

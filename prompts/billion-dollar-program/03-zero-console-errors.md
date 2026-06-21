# 03 — Zero console errors & warnings

> Part of the three.ws "Production → $1B" program. Run in a fresh chat. Read
> `/CLAUDE.md` first (its rules override everything) and `prompts/billion-dollar-program/00-README.md`
> for shared context.

## Why this matters for $1B

A console full of red is a tell that the team doesn't sweat the details — and
the warnings are often real bugs wearing a yellow coat (a 404'd asset, a failed
fetch with a swallowed error, a React/Three.js misuse that leaks memory). Across
~125 pages, every console error is a paper cut on the perceived quality of the
platform and a hint to a savvy user that something is broken under the hood.
`/CLAUDE.md`'s definition of done requires "No console errors. No console
warnings from your code."

## Mission

Load every page, capture all console errors and warnings (plus uncaught
exceptions and failed requests), and fix each at the source — no suppression,
no `console.warn` muting, no try/catch that just swallows.

## Map (trust but verify — files move)

- **Full-site console audit** — [scripts/page-audit.mjs](../../scripts/page-audit.mjs)
  (`npm run audit:web`). Drives real Chromium over every page (desktop + mobile)
  and records `console.error`/`console.warn`, `pageerror` (uncaught exceptions),
  `requestfailed`, and HTTP >= 400. Output: `reports/page-audit-<ts>.{json,md}`.
  Targets via `BASE_URL` (default `https://three.ws`; use `http://localhost:3000`).
- **Visual snapshot harness** — [scripts/page-snapshot.mjs](../../scripts/page-snapshot.mjs)
  (`npm run snapshot`). Full-page Chromium screenshots of every page — useful to
  confirm a console fix didn't break the render.
- **Page manifest (the page list both harnesses crawl)** — [data/pages.json](../../data/pages.json).
- **e2e specs** — [tests/e2e/](../../tests/e2e) (Playwright). Existing specs like
  `club.spec.js`, `nav-auth.spec.js` already assert no page errors on key flows.
- **Surfaces** — [pages/](../../pages) (~125 `*.html`), [src/](../../src) (~810
  modules), [public/](../../public). Shared boot/nav: [public/nav.js](../../public/nav.js).

## Do this

1. Start `npm run dev` (port 3000) and run `BASE_URL=http://localhost:3000 npm run
   audit:web`. Read `reports/page-audit-*.md` and build a per-page list of every
   console error, warning, uncaught exception, and failed request.
2. Triage by root cause, not by page. The same offender (a missing favicon, a bad
   import, a deprecated Three.js API, an unguarded `null` access) usually fires on
   many pages — fix it once at the source.
3. For each finding, fix the cause: 404'd asset → correct the path or ship the
   asset; failed fetch → handle the error at the boundary with a designed error
   state (per `/CLAUDE.md`), never an empty catch; deprecation warning → migrate to
   the current API; `null`/`undefined` access → guard the real data flow.
4. Never silence. Do not delete `console.warn` calls, wrap noise in
   `try{}catch{}`, or filter the audit's output to hide a finding. The bar is no
   warnings *from our code*; legitimate third-party noise must be understood and
   documented, not blanket-suppressed.
5. Pay special attention to the heavy 3D pages (Forge, Scene Studio, Club, Walk):
   WebGL context warnings, texture/format issues, and animation-retarget warnings
   are real signals. Cross-check against the avatar rule in `/CLAUDE.md`.
6. Re-run `npm run audit:web` after each batch of fixes and confirm the count
   drops toward zero. Spot-check fixed pages live with the browser console open.
7. Run `npm run snapshot` on the pages you changed and eyeball the screenshots to
   confirm no fix introduced a visual regression.
8. Run the e2e specs that assert clean console (`npx playwright test`) and the unit
   suite (`npx vitest run`). Add a `data/changelog.json` entry if any fix is
   user-visible (e.g. a previously-broken feature now works), then `npm run build:pages`.

## Must-not

- Do not suppress, filter, or delete console output to make the count drop — fix
  the cause.
- Do not wrap errors in empty `try/catch` or swallow rejected promises.
- Do not introduce mocks, stubs, fake data, or TODOs while fixing.
- Do not reference any coin other than `$THREE` in any copy or asset you touch.
- Do not refactor working modules beyond what the fix requires — additive, surgical.

## Acceptance (all true before claiming done)

- [ ] `npm run audit:web` reports zero `console.error`, zero `console.warn` from
      our code, zero `pageerror`, and no unexplained failed requests across pages.
- [ ] Every fix addresses a root cause; no suppression, output filtering, or empty
      catch was used to hide a finding.
- [ ] Heavy 3D pages (Forge, Scene Studio, Club, Walk) load clean in a real browser
      with the console open.
- [ ] `npm run snapshot` of changed pages shows no visual regression.
- [ ] `npx vitest run` and `npx playwright test` pass.
- [ ] Changelog updated for any user-visible fix and `npm run build:pages` is clean.

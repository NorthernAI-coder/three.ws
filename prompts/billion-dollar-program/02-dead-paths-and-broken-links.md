# 02 — Dead paths & broken links

> Part of the three.ws "Production → $1B" program. Run in a fresh chat. Read
> `/CLAUDE.md` first (its rules override everything) and `prompts/billion-dollar-program/00-README.md`
> for shared context.

## Why this matters for $1B

Nothing kills trust faster than a button that does nothing or a link that 404s.
With ~125 pages, ~810 src modules, and ~961 api handlers, dead-ends accumulate
silently — a nav entry to a page that no longer exists, an `<a href="#">` that
was never wired, a CTA whose handler was deleted. Every dead path is a leak in
the conversion funnel and a screenshot of brokenness. `/CLAUDE.md` is explicit:
"If a button exists, it must work. If a link exists, it must go somewhere."

## Mission

Audit every interactive element and route so that every button does something,
every `<a href>`/route resolves to a live destination, and every nav entry goes
somewhere real — then fix or remove every dead-end found.

## Map (trust but verify — files move)

- **Full-site audit harness** — [scripts/page-audit.mjs](../../scripts/page-audit.mjs)
  (`npm run audit:web`). Drives real Chromium over every page in desktop + mobile,
  records failed network requests, HTTP >= 400, missing `<title>`, and **empty
  links/buttons**. Writes `reports/page-audit-<ts>.{json,md}`.
- **Route-documentation guard** — [scripts/audit-page-index.mjs](../../scripts/audit-page-index.mjs)
  (`npm run audit:pages`). Cross-checks `vercel.json` routes against
  [data/pages.json](../../data/pages.json); flags pages with no manifest entry.
- **Empty-handler guard** — [scripts/audit-empty-handlers.mjs](../../scripts/audit-empty-handlers.mjs)
  (`npm run audit:handlers`). Fails on any `api/*.js` that is empty or exports
  nothing (Vercel routes to it but it can never respond).
- **Routing & headers** — [vercel.json](../../vercel.json) (rewrites/routes for
  pretty paths and dynamic routes).
- **Navigation source of truth** — [public/nav-data.js](../../public/nav-data.js)
  (`NAV_GROUPS`, every menu item's `href`), rendered by
  [public/nav.js](../../public/nav.js), styled by [public/nav.css](../../public/nav.css).
- **Surfaces to crawl** — [pages/](../../pages) (~125 `*.html`), [src/](../../src)
  (~810 modules), [public/](../../public).

## Do this

1. Start `npm run dev` (port 3000) and run `BASE_URL=http://localhost:3000 npm run
   audit:web`. Open the generated `reports/page-audit-*.md` and triage every
   empty-link/empty-button finding and every HTTP >= 400 / requestfailed entry.
2. Run `npm run audit:pages --strict` and `npm run audit:handlers`. Fix every gap:
   a flagged empty handler is either implemented (real response) or deleted with
   its route; a route missing from `data/pages.json` gets a manifest entry.
3. Walk every `href` in [public/nav-data.js](../../public/nav-data.js) `NAV_GROUPS`
   and the top-level links. For each, confirm the destination resolves to a live
   page (in the browser, not just file existence). Fix or remove dead entries —
   nav is the single source of truth, so a broken entry breaks it everywhere.
4. Grep the codebase for placeholder links and no-op handlers and resolve each:
   `href="#"`, `href="javascript:void(0)"`, `onclick=""`, `<a>` with no href,
   `<button>` with no listener. Wire the real action or remove the element.
5. Cross-check dynamic routes (agent profiles, dashboards, `/launches`, marketplace
   detail pages) — click through from a list view into a detail view and back.
   The "list links to detail" connection in `/CLAUDE.md` must hold.
6. For any page that legitimately can't resolve yet (e.g. a feature behind auth or
   a not-yet-built surface), make the entry point honest: gate it, label it, or
   remove it — never leave a live link to a dead place.
7. Exercise the primary CTAs in a real browser (Forge "Generate", marketplace
   "Buy", wallet "Connect", launch flow): every one performs a real action, not a
   silent failure. Watch the Network tab to confirm real calls fire.
8. Re-run `npm run audit:web`, `npm run audit:pages --strict`, and `npm run
   audit:handlers`; confirm the dead-path findings are cleared. Add a
   `data/changelog.json` entry for any user-visible fix, then `npm run build:pages`.

## Must-not

- Do not "fix" a broken link by pointing it at the homepage — route it to the
  correct destination or remove the element.
- Do not delete a working feature to silence an audit finding; understand first.
- Do not introduce mocks, stubs, TODOs, or `href="#"` placeholders.
- Do not reference any coin other than `$THREE` in nav, copy, or links.
- Do not edit working code paths you didn't need to touch — additive fixes only.

## Acceptance (all true before claiming done)

- [ ] `npm run audit:web` reports zero empty-link / empty-button findings and no
      unexplained HTTP >= 400 across the crawled pages.
- [ ] `npm run audit:pages --strict` and `npm run audit:handlers` both exit clean.
- [ ] Every `href` in `public/nav-data.js` resolves to a live page in the browser.
- [ ] No `href="#"`, `javascript:void(0)`, or no-op handler remains on a shipped
      interactive element.
- [ ] Primary CTAs (Forge, marketplace, wallet, launch) perform real actions with
      real network calls, verified in a real browser.
- [ ] Existing tests still pass (`npm test`); changelog updated for visible fixes
      and `npm run build:pages` is clean.

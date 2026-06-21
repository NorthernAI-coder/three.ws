# 02 — Dead paths & broken links

> Part of **Road to $1B** (`prompts/road-to-1b/`). Read `00-README.md` and `/CLAUDE.md` first.

**Phase:** 0 — Foundation
**Owns:** `pages/*.html` (125 pages), `public/`, `src/`, nav (`public/nav.js`, `public/nav.css`), routing in `vercel.json`.
**Depends on:** none.

## Why this matters for $1B
Nothing destroys trust faster than a button that does nothing or a link that 404s.
`/CLAUDE.md`: "If a button exists, it must work. If a link exists, it must go
somewhere. If a state exists, there must be a way to reach it." This is table stakes.

## Mission
Audit every interactive element and link across the whole site. Every one resolves
to a working destination or a real action. Zero dead ends.

## Map
- 125 pages in `pages/`. Shared nav in `public/nav.js` / `public/nav.css`.
- Route map in `vercel.json` (`routes`). Page index in `data/pages.json`.
- Existing helpers: `npm run audit:pages`, `npm run audit:web`, `npm run check:images`.

## Do this
1. Build a link/route inventory: every `href`, `<a>`, `onclick`, `data-href`,
   `<button>` handler, and `fetch()` target across `pages/`, `src/`, `public/`. A
   script in `scripts/` (kept, not throwaway, or deleted after) that crawls the built
   site is acceptable — wire it as `npm run audit:links` if useful.
2. For every internal link/route: confirm the target exists in `pages/`/`public/`
   and is reachable via `vercel.json` routes. Fix broken targets — create the page,
   fix the path, or remove the link if the destination was never meant to exist.
3. For every external link: confirm it resolves (200/redirect, not 404/dead domain).
   Replace or remove dead ones. External links open with `rel="noopener"`.
4. For every button/interactive control: confirm it has a real handler that does
   real work. Any control wired to nothing, to a `// TODO`, to an `alert()`, or to a
   no-op gets implemented or removed. No decorative buttons.
5. Confirm every nav entry (desktop + mobile menu) points somewhere live and is
   reachable on small screens (cross-check with prompt `11`).
6. Confirm 404 handling: a real, branded 404 page that helps the user recover
   (search, links home, top destinations) — not a blank or default.
7. Re-run `audit:pages` / `audit:web` and resolve every finding.

## Must-not
- Do not "fix" a broken link by pointing it at the homepage as a catch-all. Find the
  intended destination or remove the link.
- Do not leave any `href="#"`, `href="javascript:void(0)"`, or empty handler in place.

## Acceptance
- [ ] Zero broken internal links/routes (audit script clean).
- [ ] Zero dead external links.
- [ ] Every button/control performs real work or is removed.
- [ ] Branded, helpful 404 page exists and is wired in `vercel.json`.
- [ ] `npm run audit:pages` and `audit:web` pass.
- [ ] Spot-checked in a real browser across 8–10 representative pages incl. mobile nav.

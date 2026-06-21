# 02 — Dead paths & broken links

> **Road to $1B · Production-Readiness track.** Paste this whole file into a fresh chat at `/workspaces/three.ws`. Read `CLAUDE.md` + `STRUCTURE.md` first — they override defaults.

**Phase:** 1 · Audit & baseline
**Owns:** navigation, `<a href>`/`<link>`, in-app router targets, CTA buttons across `pages/` + `src/`.
**Depends on:** `01` (audit). **Pairs with:** `04` (routing/404).

## Why this matters for $1B
Every dead link is a visitor hitting a wall — and a signal to investors that nobody is
minding the store. CLAUDE.md is explicit: "If a button exists, it must work. If a link
exists, it must go somewhere." A platform that wants a $1B valuation cannot have a single
404 reachable from its own UI.

## Mission
Find every broken/dead navigation path and **fix it** — either wire it to the real
destination or remove the element. Zero dead ends reachable from the UI.

## Map — real anchors
- Nav/header/footer components in `src/` (search for the shared nav module and `public/style.css` nav classes).
- `data/pages.json` — the canonical list of real routes; any link not resolving to one of these (or a real API/asset) is suspect.
- `vercel.json` routes — source→dest mappings and redirects.
- `scripts/page-audit.mjs` / `npm run audit:web` — existing link/route checks.

## Do this
1. Extract every internal `href`, `window.location` assignment, router `navigate()` target, and CTA click handler destination across `pages/` and `src/`.
2. Cross-check each against `data/pages.json` + `vercel.json` routes + real assets. Anything resolving to a missing page, a `#` placeholder, or `javascript:void(0)` with no handler is a finding.
3. **Fix each:** wire the link to the correct real destination, OR remove the element if the destination genuinely doesn't exist yet (don't leave a dead button). Prefer wiring — most "dead" links point at surfaces that DO exist under a different path.
4. Check the inverse: real, valuable pages in `data/pages.json` that **nothing links to** (orphans). Add navigation to reach them (CLAUDE.md: "If a state exists, there must be a way to reach it").
5. Verify external links open correctly and use `rel="noopener"` where `target="_blank"`.
6. Run the app (`npm run dev`) and click through the primary nav + footer + top 10 surfaces to confirm no console 404s on navigation.

## Must-not
- Do not "fix" a dead link by pointing it at the homepage as a catch-all. Find the real target or remove it.
- Do not add a link to a page that isn't production-ready just to clear an orphan — harden the page first or leave it unlinked with a note.

## Definition of done
- [ ] Every internal link/CTA resolves to a real, working destination (verified in browser).
- [ ] No orphan production pages reachable only by typing the URL — each has a nav path.
- [ ] `target="_blank"` links carry `rel="noopener"`.
- [ ] `npm run audit:web` passes; no navigation 404s in console during a click-through.
- [ ] `npm test` green; `git diff` reviewed.

---
**Non-negotiables (CLAUDE.md):** No mocks / fake data / TODOs / stubs — real APIs only. **`$THREE` is the only coin** (CA `FeMbDoX7R1Psc4GEcvJdsbNbZA3bfztcyDCatJVJpump`) — never reference any other token anywhere. Concurrent agents share this worktree → **stage explicit paths** (never `git add -A`); re-check `git status`/`git diff --staged` before commit. Never commit `api/*.js` starting with `__defProp`/`createRequire` (esbuild trap → `git restore -- api/ public/`). User-visible change → `data/changelog.json` + `npm run build:pages`. Push to BOTH remotes (`threeD`, `threews`) when asked; never pull/fetch from `threeD`.

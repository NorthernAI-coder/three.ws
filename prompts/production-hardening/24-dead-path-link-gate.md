# 24 · Dead-path & broken-link CI gate

> **Phase 4 — Frontend excellence** · **Depends on:** none · **Parallel-safe:** yes · **Effort:** M

## Mission
CLAUDE.md: "If a button exists, it must work. If a link exists, it must go somewhere." Audit tooling
exists (`page-audit.mjs`, a link auditor, `audit-empty-handlers.mjs`) but isn't gating CI. Find and
fix every dead link, no-op button, and unreachable state across 125 pages, then lock it with a CI gate
so dead paths can't ship again.

## Context (read first)
- `CLAUDE.md` ("Eliminate dead paths").
- `npm run audit:web` (`scripts/page-audit.mjs`), the link auditor (`scripts/audit-links.mjs` if present), `npm run audit:handlers` (`scripts/audit-empty-handlers.mjs`), `npm run audit:pages` (`scripts/audit-page-index.mjs`).
- 125 pages in `pages/`, nav config, and `data/pages.json`.

## Build this
1. **Run the auditors** and produce a consolidated report of: 404-ing internal links, external links that are dead, buttons/`data-action`s with no handler, modals that can't close, routes referenced but missing, nav entries pointing nowhere.
2. **Fix every finding** — wire the handler, fix the href, add the missing page, or remove the dead affordance. No "exists but does nothing" survives.
3. **Handler-binding check** — extend `audit-empty-handlers.mjs` (or add a check) so every `data-action="X"` has a bound listener and every declared route resolves.
4. **CI gate** — add `audit:web` + link audit + handler audit to CI (strict), so a new dead path fails the build. Archive the report as a CI artifact.
5. **Verify** — spot-check the highest-traffic pages in a real browser; click everything.

## Files likely in play
`scripts/page-audit.mjs`, `scripts/audit-links.mjs`, `scripts/audit-empty-handlers.mjs` (extend), nav/route config, the offending `pages/*` + `src/*`, `.github/workflows`.

## Definition of done
- [ ] Zero dead internal links, dead external links, or no-op buttons across the site.
- [ ] Every `data-action` has a handler; every referenced route resolves.
- [ ] `audit:web` + link + handler audits gate CI (strict); report archived.
- [ ] Top pages clicked-through in a browser — everything works.
- [ ] Changelog: **fix** entry if user-visible broken links were repaired.

## Guardrails
Follow CLAUDE.md. Removing an affordance is a last resort — prefer wiring it to where it should go. Push both remotes.

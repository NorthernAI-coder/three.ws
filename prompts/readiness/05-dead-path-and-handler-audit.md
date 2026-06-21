# 05 — Dead-path & handler audit (every button works, every link goes somewhere)

**Phase 1. Serial** after [04](04-purge-mock-and-fake-data.md).

## Where you are

`/workspaces/three.ws` — three.ws, 3D AI-agent platform (125 pages, 118 public
JS, 810 src JS). Read [CLAUDE.md](../../CLAUDE.md). Rules in play: **Eliminate
dead paths. If a button exists it must work. If a link exists it must go
somewhere. If a state exists there must be a way to reach it.** There is a repo
auditor for this: `npm run audit:handlers`. The only coin is **$THREE**.

## Objective

Zero dead interactive elements across the whole app. Every button has a working
handler, every link resolves to a real route (no 404), every nav item leads
somewhere real, every reachable state has a path in and a path out.

## Why it matters

Nothing tanks trust faster than a button that does nothing. At a billion-dollar
bar, the product must feel like everything is wired — because it is. Dead paths
are the tells of an unfinished product.

## Instructions

1. **Run the auditors and fix to green:**
   ```bash
   npm run audit:handlers   # empty/no-op handlers
   npm run audit:pages      # page index ↔ files integrity
   npm run audit:web        # broader web audit
   npm run check:images     # broken/lazy images
   ```
2. **Find no-op handlers manually too:**
   ```bash
   grep -rIn "onclick=\"\"\|onClick={() => {}}\|href=\"#\"\|href=\"javascript:\|addEventListener([^,]*, *function *() *{ *})" --include=*.html --include=*.js public/ pages/ src/ | grep -v node_modules
   ```
3. **Crawl the real app** (`npm run dev`, port 3000). For each top surface
   (home, forge, marketplace, trending, studio, walk, club, reputation,
   launches, chat, x402 checkout, settings, login): click every button, follow
   every link, open every menu. Log each dead end.
4. **Fix each dead path properly:**
   - Button with no handler → implement the real action it implies.
   - Link to a missing route → build the route, or repoint to the correct
     existing one. Never leave `href="#"`.
   - Unreachable state → add navigation to it, or remove the state if it's
     vestigial (CLAUDE.md: delete aggressively).
   - Disabled-forever control → enable it with real behavior or remove it.
5. **Check cross-surface wiring** (CLAUDE.md "think in systems"): does the
   marketplace link to agent profiles? Does an agent profile link to its
   launches, reputation, and chat? Wire the connections that should exist.
6. **404 + error routes:** confirm a designed 404 page exists and that unknown
   routes hit it, not a blank screen.

## Definition of done

- [ ] `npm run audit:handlers`, `audit:pages`, `audit:web`, `check:images` all
      pass.
- [ ] Manual crawl complete; every button/link on every top surface does
      something real. The dead-end log is fully resolved (attach it to your
      report with each item's resolution).
- [ ] No `href="#"` / `href="javascript:void"` / empty handler remains in
      shipped HTML/JS.
- [ ] Cross-surface links that *should* exist now exist (named in your report).
- [ ] Designed 404/unknown-route handling verified.
- [ ] `gap-inventory.json` `deadPaths` updated; `npm test` passes.
- [ ] Changelog: `improvement`/`fix` entry for any user-facing wiring that now
      works.

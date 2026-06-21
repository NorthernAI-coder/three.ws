# 03 — Console errors & warnings sweep

> **Road to $1B · Production-Readiness track.** Paste this whole file into a fresh chat at `/workspaces/three.ws`. Read `CLAUDE.md` + `STRUCTURE.md` first — they override defaults.

**Phase:** 1 · Audit & baseline
**Owns:** runtime console output across all surfaces; the client error reporter.
**Depends on:** `01`. **Pairs with:** `10` (observability).

## Why this matters for $1B
The browser console is the platform's pulse. CLAUDE.md's definition of done requires
"no console errors, no console warnings from your code." Every uncaught error is a
visitor-facing bug waiting to happen and a degraded Core Web Vitals / reliability story.
Clean consoles are table stakes for a serious product.

## Map — real anchors
- `public/error-reporter.js` — first-party reporter, `POST /api/client-errors`; already filters extension noise + ResizeObserver. Use it to find what's actually firing.
- `api/client-errors.js` (or the handler behind `/api/client-errors`) — where client errors land.
- `npm run dev` (port 3000) — exercise surfaces here.

## Do this
1. Start `npm run dev`. Open each of the top ~20 surfaces (home, forge, gallery, marketplace, dashboard, create flow, scene, club, city, walk, agent-studio, brain, etc. — see `STRUCTURE.md`).
2. For each, capture **all** console errors/warnings and failed network requests. Categorize: real bug vs. third-party noise vs. expected-in-dev.
3. **Fix every error and every warning originating from our code:** unhandled promise rejections, `404`/`500` on real assets/APIs, missing keys, deprecated API usage, hydration/render warnings, Three.js warnings (missing textures, NaN transforms, disposed-object access).
4. For genuinely external noise (extensions, blocked trackers), confirm `public/error-reporter.js` already filters it; extend the filter only if a real new source appears.
5. **Failed network requests:** every `4xx`/`5xx` on a request our code initiates is a finding — fix the call or the endpoint. No swallowed failures.
6. Re-run the click-through; confirm zero of our errors/warnings remain.

## Must-not
- Do not silence errors with empty `catch {}` or by disabling logging — fix the root cause (CLAUDE.md: "No errors without solutions").
- Do not suppress a warning you don't understand. Understand it, then fix it.

## Definition of done
- [ ] Top ~20 surfaces produce **zero** errors/warnings from our code in the console.
- [ ] No failed network requests for assets/APIs our code initiates.
- [ ] Any remaining console output is provably third-party and filtered by the reporter.
- [ ] `npm test` green; `git diff` reviewed.

---
**Non-negotiables (CLAUDE.md):** No mocks / fake data / TODOs / stubs — real APIs only. **`$THREE` is the only coin** (CA `FeMbDoX7R1Psc4GEcvJdsbNbZA3bfztcyDCatJVJpump`) — never reference any other token anywhere. Concurrent agents share this worktree → **stage explicit paths** (never `git add -A`); re-check `git status`/`git diff --staged` before commit. Never commit `api/*.js` starting with `__defProp`/`createRequire` (esbuild trap → `git restore -- api/ public/`). User-visible change → `data/changelog.json` + `npm run build:pages`. Push to BOTH remotes (`threeD`, `threews`) when asked; never pull/fetch from `threeD`.

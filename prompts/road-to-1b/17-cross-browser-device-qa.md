# 17 — Cross-browser & device QA

> Part of **Road to $1B** (`prompts/road-to-1b/`). Read `00-README.md` and `/CLAUDE.md` first.

**Phase:** 3 — Experience quality
**Owns:** `tests/e2e/`, `playwright.config.js`, browser-specific shims, WebGL/3D fallbacks.
**Depends on:** 09 (CI gate).  ·  **Parallel-safe with:** 12, 13, 14, 15, 16.

## Why this matters for $1B
A 3D platform must work on Chrome, Safari (incl. iOS), Firefox, and Edge — across
desktop and mobile — or it silently loses whole user segments. WebGL quirks and Safari
edge cases are where "works on my machine" demos die in front of investors.

## Mission
Verify and fix every core flow across the major browsers and devices, with graceful
degradation where hardware/WebGL is limited.

## Map
- Playwright projects in `playwright.config.js` (`testDir: tests/e2e`).
- 3D engine (Three.js) and GLB loading paths in `src/`; the avatar viewer
  (`avatar-sdk/`), Forge, and Studios are the highest-risk surfaces.

## Do this
1. Expand Playwright projects to cover Chromium, WebKit (Safari), and Firefox; run the
   core flows (load home, forge a model, view an agent, marketplace purchase path,
   wallet/x402 path) on each.
2. Manually verify on real iOS Safari and Android Chrome: 3D orbit/zoom, file upload,
   clipboard paste, wallet deep-links, on-screen keyboard behavior.
3. Detect WebGL/hardware capability and degrade gracefully (static poster or reduced
   quality) instead of a black canvas or crash; surface a clear message.
4. Fix Safari-specific issues (date/intl, flexbox/grid gaps, `100vh`, backdrop-filter,
   audio autoplay) and any Firefox WebGL differences found.
5. Add the cross-browser E2E run to CI (or a scheduled job) so regressions are caught.

## Must-not
- Do not assume Chromium-only behavior; do not ship a black canvas on unsupported WebGL.

## Acceptance
- [ ] Core flows pass on Chromium, WebKit, Firefox in Playwright.
- [ ] Real iOS Safari + Android Chrome manually verified for 3D, upload, wallet.
- [ ] Graceful WebGL/hardware degradation in place; `npm test` green; changelog `fix`/`improvement` entry.

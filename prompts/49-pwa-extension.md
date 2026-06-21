# 49 · PWA, Service Worker & Browser Extension

## Mission
Polish the installable PWA and the Chrome extension so the "your avatar walks anywhere on the web"
promise is real, reliable, and store-ready — without the service worker ever breaking embeds.

## Context
- PWA: service worker + `npm run generate-icons` (`scripts/generate-pwa-icons.mjs`); embeds must NOT
  register the SW (`scripts/strip-sw-from-embeds.mjs`). Extension: `npm run build:extension(:prod)`
  (`scripts/build-extension.mjs`, `build-extension-icons.mjs`).

## Tasks
1. **PWA correctness:** valid manifest, icons (all sizes), installability, offline shell where
   sensible; SW caching strategy doesn't serve stale HTML/bundles (sync prompt 40); update flow
   prompts users to refresh.
2. **Embed safety:** verify embeds never register the SW (the strip step works) — an embed on a
   third-party site must not hijack their SW scope.
3. **Extension:** the Walk extension builds (`build:extension:prod`), loads the companion on arbitrary
   sites, respects the user's chosen avatar, and degrades gracefully on hostile/CSP-strict pages.
4. **Permissions:** request the minimum extension permissions; document why each is needed for store review.
5. **Store readiness:** listing assets, privacy disclosures, and a tested packaged build; versioning.
6. **Cross-browser:** verify the extension on Chrome (+ Edge); note Firefox/Safari status.

## Acceptance
- PWA installs + updates cleanly; SW never serves stale HTML; embeds provably don't register the SW.
- Extension builds + loads the companion on real sites with the chosen avatar; minimal permissions.
- Store-listing assets + privacy disclosures ready; packaged build tested; changelog for visible changes.

---
### Operating rules — read CLAUDE.md + STRUCTURE.md first. No mocks/fake data/stubs. $THREE only (`FeMbDoX7R1Psc4GEcvJdsbNbZA3bfztcyDCatJVJpump`). Stage explicit paths; never `git add -A`. Don't commit `api/*.js` bundles. User-visible change → `data/changelog.json` + `npm run build:pages`. Push both remotes when asked; never pull from `threeD`. DoD = CLAUDE.md checklist.

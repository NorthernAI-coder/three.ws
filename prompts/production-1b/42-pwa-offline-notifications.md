# 42 — PWA, offline & notifications

> Part of the three.ws "Production → $1B" program. Run in a fresh chat. Read
> `/CLAUDE.md` first (its rules override everything) and `prompts/production-1b/00-README.md`
> for shared context.

## Why this matters for $1B

Installable, offline-capable, re-engageable web apps retain users like native apps at
a fraction of the cost — and three.ws is exactly the kind of "open it daily" product
(your agent did something, a launch moved, a trade filled) that web push was built for.
But a misconfigured service worker is a footgun: it can poison caches across the origin,
break embeds in third-party iframes, or serve stale JS that makes the app look broken.
This prompt makes the PWA correct, installable, gracefully offline, and able to bring
users back — without any caching bugs.

## Mission

Verify service-worker correctness (including the embed-strip behavior), polish the
install experience and manifest, ship a real offline fallback, and add web push for
agent activity — with zero SW caching bugs.

## Map (trust but verify — files move)

- **PWA / SW config** — [vite.config.js](../../vite.config.js) (`VitePWA({ … })` ~line
  1856: `registerType: 'autoUpdate'`, `workbox.globPatterns: ['**/*.{js,css,ico,woff2}']`
  — HTML deliberately excluded — `navigateFallback: null`,
  `maximumFileSizeToCacheInBytes: 5MB`).
- **Embed SW strip** — [scripts/strip-sw-from-embeds.mjs](../../scripts/strip-sw-from-embeds.mjs)
  (post-build; removes the `vite-plugin-pwa:register-sw` `<script>` from embed-surface
  HTML — `widget.html`, `embed.html`, `agent-embed`, `a-embed`, `avatar-embed`). Vite
  also strips it via a `transformIndexHtml` hook (`vite.config.js` ~line 515).
- **Web manifest** — [public/site.webmanifest](../../public/site.webmanifest) (name,
  icons `pwa-192`/`pwa-512` any+maskable, `display: standalone`, theme `#050505`).
- **Offline fallback** — existing example at [public/cz/offline/index.html](../../public/cz/offline)
  (pattern to generalize for the main app).
- **Embed surfaces** — [public/embed.js](../../public/embed.js),
  [public/embed/v1.js](../../public/embed/v1.js); the `<agent-3d>` element in
  [src/element.js](../../src/element.js).
- **Agent-activity sources for push** — agent/wallet/launch events in [api/](../../api)
  (find the activity/feed handlers under `api/_lib/feed.js` and friends).

## Do this

1. **Verify SW correctness with a real build.** `npm run build`, serve `dist/`, and in
   DevTools → Application confirm the SW registers on the main app, `autoUpdate` activates
   the new SW, and there's no stale-asset trap (cached JS/CSS update on deploy). HTML must
   not be precached (it's intentionally excluded) — pages always come from network.
2. **Confirm embeds never register a SW.** Inspect built embed HTML (`widget.html`,
   `embed.html`, `*-embed`) for the absence of the `vite-plugin-pwa:register-sw` script;
   load an embed inside a third-party iframe and confirm no SW is installed for the origin.
   This is a hard correctness/privacy requirement — keep the strip step working.
3. **Install experience.** Validate `site.webmanifest` against Lighthouse PWA criteria:
   icons resolve (192/512, any + maskable), `start_url`, scope, `display`. Add a tasteful,
   dismissible "Install three.ws" prompt using the `beforeinstallprompt` event (no nag
   loop; respect dismissal). Test install on desktop Chrome and Android.
4. **Real offline fallback.** Generalize the `public/cz/offline` pattern into an offline
   page for the main app: when navigation fails offline, show a branded offline screen with
   what's cached/available, not a browser error. Wire it correctly given `navigateFallback`
   is currently `null` — choose the right workbox strategy without breaking the network-first
   HTML rule.
5. **Web push for agent activity.** Implement push end-to-end: VAPID keys from env, a
   real subscribe flow (permission prompt only on user intent, never on load), a
   `PushSubscription` persisted to a real table, and an `api/` send path that fires on real
   agent-activity events (e.g. agent acted, launch update, trade filled). No fake/test pushes
   shipped.
6. **Notification UX + controls.** Notifications deep-link to the relevant surface, are
   throttled/de-duped, and the user can manage/disable them in settings. Respect denied
   permission gracefully.
7. **Audit cache scope.** Confirm runtime caching (if any) is scoped so it can't serve a
   user another user's data, and that signed-in/API responses aren't cached as static.
8. Run `npm run build`, the SW/embed checks above, relevant tests, add a
   `data/changelog.json` entry (tag `feature`/`improvement`) for install + notifications,
   and `npm run build:pages`.

## Must-not

- Do not register a service worker from any embed surface — the strip step must keep working.
- Do not precache HTML or cache authenticated/API responses as static assets.
- Do not request notification permission on page load — only on explicit user intent.
- Do not ship fake/test push notifications or a stubbed subscribe endpoint.
- Do not reference any coin other than `$THREE` in notification or offline copy.

## Acceptance (all true before claiming done)

- [ ] Built SW registers + auto-updates on the main app with no stale-asset trap; HTML
      stays network-first.
- [ ] Embed surfaces register no SW; verified inside a third-party iframe; strip step intact.
- [ ] Manifest passes Lighthouse PWA install criteria; dismissible install prompt works on
      desktop + Android without nagging.
- [ ] Offline navigation shows a branded offline fallback, not a browser error.
- [ ] Web push works end-to-end (VAPID, user-intent subscribe, persisted subscription, real
      agent-activity trigger); notifications deep-link and are manageable.
- [ ] No cross-user or stale API data served from cache.
- [ ] `npm run build` clean; tests pass; changelog updated; `npm run build:pages` clean.

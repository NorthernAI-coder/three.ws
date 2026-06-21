# 11 — Mobile responsiveness (320 / 768 / 1440)

> Part of the three.ws "Production → $1B" program. Run in a fresh chat. Read
> `/CLAUDE.md` first (its rules override everything) and `prompts/billion-dollar-program/00-README.md`
> for shared context.

## Why this matters for $1B

Most first touches arrive on a phone. If the home hero overflows at 320px, the forge
canvas tanks a mid-range mobile GPU, or a primary CTA sits under the keyboard, the
funnel dies before the user understands the product. A $1B platform is flawless from a
cheap Android in portrait up to a 1440px desktop — the same flows, no horizontal
scroll, no dead zones, touch targets you can actually hit.

## Mission

Make every key flow (home, forge, marketplace, wallet, agent profiles, create) correct
and comfortable at 320px, 768px, and 1440px: proper viewport meta, fluid flex/grid
layouts, ≥44px touch targets, a working mobile nav, and a 3D canvas that stays smooth on
mobile GPUs.

## Map (trust but verify — files move)

- **Pages** — [pages/](../../pages) (~125 `*.html`). Both [pages/home.html](../../pages/home.html)
  and [pages/forge.html](../../pages/forge.html) already declare `viewport` — verify all
  primary pages do.
- **Mobile nav** — [public/nav.js](../../public/nav.js) (`renderDrawer`, `initDrawer`,
  the mobile drawer + walk toggle), [public/nav.css](../../public/nav.css),
  [public/nav.html](../../public/nav.html).
- **Layout CSS** — [public/](../../public) `*.css`. Several use fixed `width: NNNpx`
  (e.g. [public/app-next.css](../../public/app-next.css), [public/auth.css](../../public/auth.css)) —
  candidates to convert to fluid flex/grid. Grep `width: *[0-9]{3,}px`.
- **Design tokens** — [public/tokens.css](../../public/tokens.css) (spacing scale, type
  ladder) so breakpoints reflow against shared tokens, not magic numbers.
- **3D on mobile** — `src/` modules mounting Three.js/GLTFLoader (grep `GLTFLoader`).
  Set device pixel ratio caps and quality fallbacks here.
- **Visual check tooling** — `npm run snapshot` ([scripts/page-snapshot.mjs](../../scripts/page-snapshot.mjs)),
  Playwright ([playwright.config.js](../../playwright.config.js)) for scripted viewports.

## Do this

1. **Drive real viewports.** `npm run dev`, open the core flows in browser devtools at
   **320×568**, **768×1024**, and **1440×900** (and one landscape phone). Walk home →
   forge → result, marketplace → detail, wallet, and a create flow at each width.
2. **Viewport meta.** Confirm every primary page has
   `<meta name="viewport" content="width=device-width, initial-scale=1">` with no
   `maximum-scale`/`user-scalable=no` (pinch-zoom must stay enabled for a11y).
3. **Kill horizontal scroll.** At 320px nothing overflows: no fixed pixel widths wider
   than the viewport, long words/URLs wrap (`overflow-wrap`), tables/grids scroll inside
   a contained region, images are `max-width: 100%`. Convert offending fixed-width blocks
   to fluid flex/grid using token spacing.
4. **Touch targets.** Every tappable control is ≥44×44px with adequate spacing so
   neighbors aren't mis-tapped. Audit nav links, icon buttons, chips, and close buttons.
5. **Mobile nav.** The drawer in `nav.js` opens/closes cleanly, the body locks scroll
   while open, the walk toggle works, and it dismisses on link tap and on backdrop tap.
   Verify it doesn't cover content or trap the user.
6. **Forms & keyboard.** On mobile, primary CTAs aren't hidden behind the on-screen
   keyboard; inputs use correct `inputmode`/`type` (email, numeric, search); focused
   fields scroll into view.
7. **3D on mobile GPUs.** In the Three.js mounts, cap `renderer.setPixelRatio` (e.g.
   `Math.min(devicePixelRatio, 2)`), provide a lighter quality path or a tap-to-load
   poster on small/low-power devices, and ensure the canvas resizes correctly on
   rotation. Confirm acceptable frame rate on a throttled mobile profile.
8. **Snapshot & verify.** Run `npm run snapshot` and review the captures across widths;
   run the Playwright suite (extend with a mobile viewport project for home + forge if
   absent). `npm test`. Add a changelog entry; `npm run build:pages`.

## Must-not

- Do not disable pinch-zoom (`user-scalable=no` / `maximum-scale=1`) — it breaks a11y.
- Do not hide core functionality on mobile; reflow it, don't remove it.
- Do not ship fixed pixel widths that overflow 320px — use fluid flex/grid + tokens.
- Do not render full-resolution 3D at uncapped DPR on mobile; cap quality and frame cost.
- Do not reference any coin other than `$THREE` in any responsive copy or fallback.

## Acceptance (all true before claiming done)

- [ ] Home, forge, marketplace, wallet, and a create flow work at 320 / 768 / 1440 with
      no horizontal scroll and no clipped content.
- [ ] Every primary page has correct, zoom-enabled viewport meta.
- [ ] All touch targets are ≥44px with safe spacing; nav drawer opens/closes/locks scroll.
- [ ] Mobile CTAs stay reachable above the keyboard; inputs use correct `inputmode`/`type`.
- [ ] 3D canvases cap DPR and run smoothly on a throttled mobile profile; resize on rotate.
- [ ] `npm run snapshot` captures look correct across widths; `npm test` passes.
- [ ] Changelog updated and `npm run build:pages` is clean.

# Audit 02 — Build / Create surfaces

Senior-engineer code + UX audit. Routes resolved via `vite.config.js` `fileMap` (~L633-889) and `vercel.json` `routes`. Severity: **P0** broken/hard-rule · **P1** reachable-but-incomplete · **P2** mediocre · **P3** opportunity.

Coin-rule note: USDC / SOL / x402 are payment plumbing and are explicitly allowed. The only flaggable case is a *named foreign token/coin/mint*. None were found on any page in this group — the platform passes the coin rule across all 29 pages.

---

## /start — pages/start.html
Multi-step agent-creation wizard. Loads `/src/start.js`, real localStorage state + template engine. No hard-rule violations.

- [P2] `src/start.js` (loadState/saveState, ~L65,70,147) — `catch {}` blocks swallow localStorage failures silently. A corrupted/quota-full store leaves the wizard in a broken state with no signal. Fix: log + surface a one-line "couldn't restore your draft" notice.
- [P2] start.html:1276-1317 — the "earn" step (`#earn-wallet`, `#earn-price`) has inputs but no explicit save affordance/confirmation; users can't tell the values persisted. Fix: add an inline "saved" tick or a Save button wired to the wizard state.
- [P3] start.html:1069-1086 (`.wz-avatar-card`) — hover state defined (~L182) but no `:focus-visible`; keyboard users can't see the selected method. Fix: add a `:focus-visible` outline using the focus-ring tokens.
- [P3] start.html — wizard never cross-links to `/forge` (generate-from-text) or `/scan` as alternative avatar sources it actually supports elsewhere. Opportunity to surface them in the avatar-method step.

## /create — pages/create.html
Creation-method chooser. Loads `/src/create.js`; auth hint via `/api/auth/me`. Links to `/studio`, `/dashboard` verified valid.

- [P2] create.html (inline auth fetch ~L1028-1042) — `/api/auth/me` has no `.catch`; a network failure leaves `window.__authed` undefined and can mis-render the auth hint. Fix: `.catch(() => { window.__authed = false; })`.
- [P3] create.html:1093+ method cards — clicking a card before `src/create.js` finishes loading is a silent no-op (no loading/disabled affordance during module load). Fix: show a brief disabled/loading state until wired.

## /create-agent — pages/create-agent.html
Stepper-based agent builder. Loads `/src/create-agent.js`; auth-gated. No coin/data violations.

- [P1] create-agent.html:1542 — module is the only thing that removes `#page-loading`; if `/src/create-agent.js` fails to parse, the loading veil stays forever (dead page, no error). Fix: HTML-side fallback timeout that reveals an error/retry if the veil persists past ~3s.
- [P2] create-agent.html:1036-1070 step pips — `cursor:pointer` + `data-clickable` but no `role="button"`/`tabindex`/key handler; keyboard users can't step backward. Fix: make pips real `<button>`s or add role+tabindex+Enter/Space.
- [P2] create-agent.html:1274-1291 — "Add later" avatar-skip toggle gives no confirmation/auto-advance; users may not realize it advances the flow. Fix: add a Continue button or auto-advance with a visible note.

## /create/prompt — pages/create-prompt.html
Text→avatar prompt entry. Generate button disabled until ≥3 chars; real compose endpoint. Back button has correct `/create` fallback.

- [P2] create-prompt.html:589 — disabled `#generate-btn` only drops to opacity 0.4 on a white button; on light surfaces the disabled state is nearly imperceptible. Fix: add `cursor:not-allowed` + a stronger disabled treatment.
- [P3] create-prompt.html:610 `#compose-error` — empty `role="alert"` box with no `aria-live` and no resting hint; first error may not be announced. Fix: add `aria-live="polite"`.

## /create/selfie — pages/create-selfie.html
Selfie→avatar capture/build pipeline (also the target of the `/scan` redirect). Camera + provider BYOK + real build pipeline.

- [P1] create-selfie.html (~L2077-2078, 2208, 2233) — `catch (_) {}` swallows avatar-fetch and name/visibility PATCH failures. A failed save leaves the viewer stuck "loading" or silently discards the user's edit. Fix: log + show a recoverable toast ("Couldn't save — try again").
- [P2] create-selfie.html:1322-1325 — `.unsupported` (no-camera) message only appears after the module evaluates; if the module fails to load the user sees a blank stage. Fix: a `<noscript>`/inline pre-module camera-capability check.
- [P3] create-selfie.html (BYOK reconstruct path ~L1973-1982) — BYOK selfie form shows without an explicit signed-in check even though selfies count against quota. Fix: gate behind auth like `/create/prompt` does.

## /forge — pages/forge.html
Text/image→3D generator. Loads `/src/forge.js` + prompt-studio/enhance/refine modules. **Progress bar verified honest** — `honestFill()` uses a real elapsed-time asymptotic curve (the L1326 "never faked" comment is accurate). `$THREE`-holder high-quality tier is correctly gated. No violations.

- [P1] forge.html:851-868 — per-view (multi-image) upload slots have a `vs-retry` button but minimal feedback on a failed view upload; error recovery is thin. Fix: explicit per-slot error text + clear retry affordance.
- [P3] forge.html — no nav shortcuts to sibling tools `/pose`, `/scan`, `/compose` from the forge surface; forge output is a natural feeder into all three. Add post-generate "next step" links.
- [P3] forge.html:787 `.sketch-grid` `minmax(140px,240px)` — can crowd on sub-300px viewports. Minor; cap columns at 1 below ~320px.

## /scene — pages/scene.html
Three.js r184 scene editor (vendored CodeMirror/tern/draco toolchain). Loads `/src/scene-studio/main.js` (verified present). Dark-locked editor, real application. Clean.

- [P3] scene.html — `#studio-app` is an empty mount with no inline fallback; if `main.js` 404s the user gets a blank `role="application"` void with no message. Fix: a noscript/skeleton placeholder inside the mount.

## /compose — pages/compose.html
Scene/outfit composer. Loads `/src/scene-compose.js`; real save/export/load handlers, loader overlay, help panel with keyboard shortcuts. Links to `/` and `/forge` valid. Responsive media queries present.

- [P3] compose.html — no cross-links to `/pose`, `/scan`, or `/dashboard`; composer output (a dressed avatar) is a natural hand-off to the animation studio. Add a "send to Pose" affordance.

## /pose — pages/pose.html
Animation/IK studio. Loads `/src/pose-studio.js`; FK/IK mode group uses `aria-pressed`, searchable joint picker, `:focus-visible` outlines present. Responsive grid (900/1100px breakpoints). Clean build.

- [P3] pose.html — header has no discovery links to `/forge`, `/scan`, `/compose`; the studio is a silo. Add sibling-tool links.

## /app — pages/app.html
Main 3D viewer / agent home. Loads `/src/app.js`. Exemplary accessibility: skip-link, scoped `:focus-visible` rings, `prefers-reduced-motion` handling, full ARIA on nav/menus/dock. All nav routes (`/chat`, `/profile`, `/settings`, `/register`, `/dashboard`, `/deploy`) verified valid. Reference quality for this group.

- [P3] app.html:220-227 (`open-in-composer-btn`) / 228-236 (`view-public-profile-btn`) — these `<a>` have no `href` in markup (set at runtime by app.js, hidden by default). Correct, but if app.js fails they'd be inert anchors. Acceptable; note only.

## /validation — public/validation/index.html
glTF Khronos validator + performance inspector. Loads `ValidationPage`/`ValidationDashboard`. Loading/error/empty states present; ARIA tablist; sample models from Khronos CDN (real, not mock fixtures). Links `/gallery`, `/marketplace` valid. Clean.

- (no P0/P1/P2 found)

## /studio — public/studio/index.html
Widget builder. Loads `studio.js`; `#generate-btn`/`#save-draft-btn` wired to real `save()`. `DEMO_WIDGET_IDS` map (studio.js ~L79-89) is **not fake data** — it points the demo avatar at real baked fixtures served by `/api/widgets/_demo-fixtures.js`, so the demo emits a genuinely embeddable URL without a DB row. Loading/error(retry)/empty states present; responsive (1280/1100/640/400px); ARIA throughout. Clean.

- (no P0/P1/P2 found)

## /hydrate — public/hydrate/index.html
On-chain agent importer (ERC-8004 / Solana → attach 3D body). Inline module hits real `/api/erc8004/hydrate` and `/api/erc8004/import`; auth, loading, empty, and error (`showAlert`) states all designed. Links `/dashboard`, `/marketplace`, `/deploy` valid.

- [P2] hydrate/index.html:315 — `#loadingState` has no `role="status"`/`aria-live`; the "Fetching your agents…" transition is silent to screen readers. Fix: add `role="status" aria-live="polite"`.
- [P2] hydrate/index.html:304 — `#alert` container lacks `role="alert"`; import errors aren't announced. Fix: add `role="alert"`.

## /threews/claim — pages/threews-claim.html
`.threews.sol` SNS subdomain claim + pay-by-name enable. Routed `vercel.json:2465` → `/threews-claim.html` (built from `pages/threews-claim.html`). Real availability check + CSRF-protected POST to `/api/threews/subdomain` + on-chain tx link. Error handling present. (.threews.sol is a name service, not a coin — no violation.)

- [P2] threews-claim.html:193 — `#tw-status` (availability/result) has no `aria-live`; results are invisible to screen readers. Fix: `role="status" aria-live="polite"`.
- [P2] threews-claim.html:190 — label/help text not associated via `aria-describedby`. Fix: add `aria-describedby` on the input pointing at the hint.

## /agent/new — pages/agent-edit.html
Full agent editor (persona / outfit / voice / skills / monetization / publish). Routed `vite.config.js:876`. Loads `/src/agent-edit.js`; tab persona/publish saves wired; auth-redirect on 401; draft auto-creation; `#loading` (`aria-live`) + `#error` (`role="alert"`) states; skip-link; tablist ARIA; responsive at 800px. USDC = price plumbing only. Clean.

- [P3] agent-edit.html — strong page; consider a confirm-before-leave guard on unsaved persona/skill edits (multi-tab form, easy to lose work). Opportunity only.

## /artifact — public/artifact/index.html
Claude.ai artifact bundler (inlines GLB + three.js into a self-contained HTML). Inline module → real `/api/artifact`; loading/error/empty/success states; size-budget + CSP-compliance validation; copy-url/html/open handlers all wired; responsive at 880px.

- [P2] artifact/index.html:532 — `#previewOverlay` (status/error host) has no `role="status"`/`aria-live`; generation progress/errors aren't announced. Fix: add `role="status" aria-live="polite"`.

## /widgets — public/widgets-gallery/index.html
Embeddable-widget showcase. Loads `/widgets-gallery/gallery.js`, which fetches real `/widgets-gallery/showcase.json` with skeleton loaders + an error card on failure. Posters from real `/api/widgets/<id>/og`. CTAs to `/studio`, `/docs/widgets` valid. Clean build.

- [P3] widgets-gallery/index.html (`#widget-count`) — hero hardcodes "8 widget types" while the grid count comes from `showcase.json`; the two can drift. Fix: set `#widget-count` from `showcase.widgets.length` after fetch.

---

# Marketing pages (/features/*)

These are static marketing pages. Audited for dead CTAs, broken links, and over-claiming. **Route-verification note:** several link-related P0s reported during sweep were *false positives* — `/embed.html`, `/community`, `/legal/privacy`, `/legal/tos` all resolve (built from `pages/embed.html`, `pages/community.html`, and `vercel.json:3338/3343`). They are NOT broken. Verified genuine breaks below.

## /features — pages/features.html
Feature index. Coin rule passes (only `$THREE` named, L966). FAQ/accordions use `aria-expanded`.

- [P1] features.html:1058 **and** 1266 — `href="/ibm/galaxy"` ("Explore the IBM suite" / footer "IBM · watsonx.ai"). **No route in vercel.json or vite.config and no file on disk** (only `/galaxy`, `/ibm/x402-demo` exist). Dead link. Fix: point at `/galaxy` or the real IBM landing, or remove.
- [P2] features.html:1313-1398 — animation-showcase `.feat-anim-pill` buttons toggle an active class but have no `aria-label` and no Enter/Space key handler; keyboard/SR users can't operate or perceive the selection. Fix: add `aria-label` + keydown handling (or rely on native button activation).
- [P3] features.html:460/473 — card titled "Widget Studio" but its CTA reads "Open Embed Editor" (links to `/embed.html`, which is valid). Naming mismatch. Fix: unify to "Open Studio".

## /features/ar — pages/features/ar.html
- [P2] ar.html:334 and 451 — `href="/docs/ar"` ("AR docs"). `/docs/<slug>` routes to the docs SPA (`vercel.json:2638`) but there is no `ar` doc id, so this lands on a soft-404 inside docs. Fix: link to an existing doc (e.g. `/docs/tutorials/view-in-ar`, which exists) or the docs index.
- [P3] ar.html:335-336 — `/docs/tutorials/view-in-ar` and `/docs/web-component`: the tutorial markdown exists (`docs/tutorials/view-in-ar.md`); confirm the docs SPA renders that slug. Low risk; verify in browser.

## /features/forge — pages/features/forge.html
Cross-link to `/features/scan` valid; describes the real `/forge` tool accurately. Clean.
- (no P0/P1 found)

## /features/scan — pages/features/scan.html
Describes the selfie→3D scan flow (`/scan` → `/create/selfie`). Accurate. Clean.
- (no P0/P1 found)

## /features/play — pages/features/play.html
Market-tied 3D worlds. Copy references pump.fun communities (the platform's launch context, runtime data — allowed). Accurate to `/play`. Clean.
- (no P0/P1 found)

## /features/walk — pages/features/walk.html
Avatar walk/embed feature. Maps to real `/walk` + embed. Clean.
- (no P0/P1 found)

## /features/studio — pages/features/studio.html
- [P2] studio.html:243 — FAQ copy says "use the **/agent-embed** route with ?id=your-agent-id". Bare `/agent-embed` is **not** routed (only `/agent/:id/embed` → `agent-embed.html`); the instruction sends users to a path that won't resolve. Fix: correct the copy to the real embed pattern (`/agent/<id>/embed` or the `<script>`+`<agent-3d>` snippet).
- [P3] studio.html — paid-skill/x402 USDC copy is accurate; fine.

## /features/marketplace — pages/features/marketplace.html
Accurate description of paid-skill marketplace; USDC = plumbing. Clean.
- [P3] marketplace.html:232-249 — the "what the marketplace contains" cards all reuse the same `◰` glyph; visually undifferentiated. Fix: distinct glyph per card.

## /features/agent-exchange — pages/features/agent-exchange.html
Two agents trading intel for real USDC via x402. Strong, accurate copy; FAQ regions wired. USDC = plumbing. Clean.
- (no P0/P1 found)

## /features/deploy — pages/features/deploy.html
On-chain agent-identity deploy. `/discover` link valid.
- [P2] deploy.html (L115/163/234/252) — repeatedly brands the schema "ERC-8004" while the implementation is Solana/Metaplex Core; ERC-8004 is an Ethereum standard name. Misleading terminology. Fix: say "ERC-8004-style identity schema on Solana (Metaplex Core)".

---

## Group summary

**Tally:** P0 = 0 · P1 = 5 · P2 = 13 · P3 = 14. Coin rule passes on all 29 pages; no mocks/fake-loaders/stubs/TODOs shipped; forge progress bar verified honest.

Top **P1** (reachable but incomplete) — fix first:
1. **features.html:1058 & 1266** — `/ibm/galaxy` is a dead link (no route, no file). User-facing 404 from the homepage feature grid.
2. **create-agent.html:1542** — `#page-loading` veil never clears if the module fails to parse → permanently dead page with no error path.
3. **create-selfie.html:~2077/2208/2233** — silent `catch {}` on avatar fetch + name/visibility saves → stuck viewer / lost edits with no recovery.
4. **forge.html:851-868** — multi-view upload slots have thin/unclear error recovery on a failed view.
5. **create.html ~L1028** — uncaught `/api/auth/me` failure can mis-render the auth hint.

Most impactful **P2** themes: missing `aria-live`/`role=status` on async status regions (hydrate, threews-claim, artifact, features anim pills); misleading marketing copy (deploy "ERC-8004" on Solana; studio `/agent-embed` route that doesn't resolve; ar `/docs/ar` soft-404). No hard-rule (P0) issues anywhere in the group.

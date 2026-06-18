# Audit 01 — Main pages

Group: `/`, `/discover`, `/gallery`, `/animations`, `/walk`, `/irl`, `/irl-privacy`, `/marketplace`, `/marketplace/analytics`, `/collection`, `/skills`, `/community`, `/characters`, `/what-is`, `/sitemap`

Reviewer notes: coin-rule clarification applied throughout — `$THREE` (CA `FeMbDoX7R1Psc4GEcvJdsbNbZA3bfztcyDCatJVJpump`) is the platform token; **USDC is the x402/payment dollar (a runtime payment rail), not a competing coin**, so USDC references in pay flows are NOT coin-rule violations. `marketplace-analytics.js` proves this distinction is already modeled (`THREE_MINT` vs `USDC_MINT`). No genuine non-`$THREE` coin promotion was found in this group.

---

## / — pages/home.html

Verdict: Needs work (large, mostly solid; two shipped-fallback-array rule violations).

- [P1] `pages/home.html:5562-5567` — `const FALLBACK_AGENTS = [...]` is a hardcoded 4-item demo avatar array (CZ / Ansem / Saga / Boss Vernington) rendered into the showcase grid when `/api/explore` fails. CLAUDE.md hard rule: "No fallback sample arrays shipped to production." Fix: on fetch failure render a designed empty/error state (e.g. "Live showcase unavailable — retry") instead of fabricated cards. (Names are personas, not coin tickers — not a coin-rule issue.)
- [P1] `pages/home.html:4882-4891` — `var POOL_FALLBACKS = [...]` ships a duplicated list of 4 GLB paths to pad the avatar pool when `/api/explore` returns nothing. Same rule. Fix: degrade to skeletons/empty rather than repeating placeholder bodies.
- [P2] `pages/home.html:~4940` — hero-avatar failure shows a bare "Retry" button with no message explaining what failed. Fix: add "3D preview unavailable" copy beside the retry.
- [P2] `pages/home.html` showcase cards (`makeAgentCard`, ~5577) — `.showcase-agent-card` is an `<a>` with hover styling but no explicit `:focus-visible` outline for keyboard nav. Add one.
- [P3] The pump.fun live card / oracle mini-feed have skeletons but no long-hang timeout; if `/api/pump/*` stalls the skeleton persists. Consider a timeout → "still loading / retry".

Note: subagent-flagged "broken routes" `/forge`, `/radar`, `/pose`, `/marketplace` are all valid (present in `vite.config.js` fileMap / `vercel.json`). Not findings. Footer correctly shows only `$THREE` + CA; Jupiter-swap demo mints (USDC/WSOL) are generic runtime mints — compliant.

## /discover — public/discover/index.html (+ public/discover/discover.js)

Verdict: Solid.

- Real data via `/api/explore`; cursor pagination + IntersectionObserver infinite scroll with manual `Load more` fallback; skeleton loading, distinct filtered-empty vs cold-empty states (both actionable), and a recoverable error state with Retry (`discover.js:347-366`). All user strings escaped (`escapeHtml`/`escapeAttr`). Cards cross-wire to `/discover/a/:chain/:id`, `/avatars/:id`, Solscan, embed modal (web-component/iframe/link/markdown/farcaster), and copy-URI. Embed modal is keyboard-closable (Esc) and ARIA-dialog. No issues worth flagging.
- [P3] `discover.js:482` detail URL is `/discover/a/:chainId/:agentId` while the embed modal advertises `/a/:chainId/:agentId` (line 638) as the standalone page — confirm both resolve; if `/discover/a/...` is canonical, align the modal's "Open standalone page" link to it for consistency.

## /gallery — public/gallery/index.html (+ public/gallery/gallery.js)

Verdict: Solid.

- Real data via `/api/avatars/public`; URL-synced filters (q/category/tag/sort), cursor pagination, skeleton + filtered-empty + cold-empty + error(with message) states (`gallery.js:272-292`), full escaping on all interpolated values. Hero CTAs and "From the Forge" section wire to `/create/*`, `/forge`, `/dashboard/avatars`. Card thumb has `aria-label`. Good.
- [P3] "Create from template" button depends on `/src/shared/template-picker.js` loading; fine, just ensure that module degrades if the template API is empty (no template = button should explain, not no-op).

## /animations — pages/animations.html (+ src/animations-gallery.js)

Verdict: Solid.

- Every state is designed in markup: skeleton grid, populated grid, cold-empty ("No animations yet" → Open Studio), search-empty (clearable), and error (Retry) — `animations.html:460-491`. Toolbar is a labeled `role="toolbar"`; filter chips use `role="tab"`/`aria-selected`; buttons have `:hover/:active/:focus-visible`; responsive `@media` at 600px. Hero CTAs point to `/pose` (Animation Studio) and `/gallery` — both valid.
- [P3] Hero CTA label is "Open Animation Studio" but routes to `/pose`; the studio is reachable, just verify `/pose` is the intended canonical studio (vs `/mocap-studio`) so the label matches the destination.

## /walk — pages/walk.html

Verdict: Needs work (functional; accessibility gaps on icon controls).

- [P2] `pages/walk.html:1077,1086,1090,1099,1108,1112,1121` — toolbar controls (avatar, camera-mode, env, screenshot, minimap, zen, help) are icon-only and use `title=` (+ CSS-hidden `data-label`) instead of `aria-label`. `title` is not reliably exposed to screen readers. Fix: add `aria-label` to each ("Change avatar", "Switch camera", "Change scene", "Take screenshot", "Toggle minimap", "Hide UI", "Show help").
- [P2] `pages/walk.html:~947-957` — `:focus-visible` styling is present for `.walk-btn` but secondary controls (emote buttons, avatar picker entries) lack a clearly visible focus ring, especially in dark mode. Extend focus-visible coverage.

## /irl — pages/irl.html

Verdict: Needs work (states for denied permissions / empty area need to be airtight).

- [P1] `pages/irl.html:1949` — `<img id="irl-sheet-thumb" ... alt="" hidden />` ships an empty `alt`. When JS populates the agent card thumbnail this remains uninformative to screen readers / when the image 404s. Fix: set `alt` from the agent name when the sheet hydrates ("Agent <name> avatar").
- [P1] Permission-denied / empty-area states: there is an `#irl-error-sheet` (lines ~1062-1095), a radar `is-empty` class (~646), and a motion `#irl-cal-denied` toast (~2088), but the geolocation-denied and camera-revoked-mid-session paths must render a designed, recoverable card ("IRL needs location/camera — enable in settings, then retry") rather than a blank canvas. Verify `src/irl/onboarding.js` drives `#irl-error-sheet` for all denial branches; flag any silent blank-canvas fallthrough.
- [P1] `pages/irl.html:~646,1753` — empty-nearby is communicated by a CSS color swap on `#irl-nearby-badge` only; the badge text isn't updated, so a screen reader (and a glancing user) can't tell "empty" from "error". Fix: set `textContent` to "No agents nearby" on empty (the `aria-live="polite"` is already there).
- [P2] `pages/irl.html:1858-1878` — object-picker buttons (Orb/Crate/Crystal/Ring/Pillar) carry color only via inline-styled swatch with no `aria-label`; color-blind and SR users get no distinction. Add `aria-label` per object.
- [P2] `pages/irl.html:2068-2087` — calibrate panel: ensure the Cancel affordance stays reachable (keyboard/touch) when DeviceOrientation is denied, so users aren't trapped behind a modal panel.

Coin-rule note: the subagent flagged the report-reason button "Scam or off-brand coin" (`pages/irl.html:~1997`) as a coin-rule issue. It is NOT a promotion of another coin — it is a user-report category. It is, however, weak/confusing copy. [P2] Reword to "Scam or fraudulent content" and let backend policy (not user wording) handle coin-policy on paid pins.

## /irl-privacy — pages/irl-privacy.html

Verdict: Solid.

- Static explainer, fully self-contained styling, semantic sections with `aria-labelledby`, designed cards/compare/sensor blocks, `prefers-reduced-motion` handling, focus-visible on links/buttons. CTAs go to `/irl` and `/legal/privacy` (route confirmed in `vercel.json:3338`). No data fetching, so no loading/empty/error surface needed. No issues.

## /marketplace — pages/marketplace.html (+ src/marketplace.js)

Verdict: Solid.

- Real data via `/api/marketplace/*`; serves list + all detail variants (agents/avatars/tools/skills/animations/onchain) from URL hydration. Skeletons, empty, and error(retry) states present; cards link to detail pages and detail pages "View agent" to `/marketplace/agents/:id`; purchase success path returns an actionable next step; ARIA live regions and 60+ hover/focus/active rules. No mocks, no stub throws, no fake setTimeout loaders.
- USDC pricing copy (`:3751,:4140,:4335`) and `USDC_MAINNET_MINT` in `src/marketplace.js` are the **x402 payment currency**, not a competing coin — NOT a coin-rule violation (consistent with home + analytics). No action required for the coin rule.
- [P3] Confirm post-purchase cross-wire to `/collection` (the collection page is the receipt home) — surfacing a "View in your collection" link on success would close the loop.

## /marketplace/analytics — pages/marketplace-analytics.html (+ src/marketplace-analytics.js)

Verdict: Needs work (one rendering bug, one unguarded fetch).

- [P1] `pages/marketplace-analytics.html:137,143` — the skeleton placeholders use a literal `${Array.from({length:5}, ...)}` template-literal **inside static HTML**, which is not a JS context. It renders the raw text `${Array.from(...)}` to the user instead of skeleton rows. Fix: replace with five literal `<div class="skeleton-rank skeleton">` elements (as the stat-grid above already does), or inject the skeletons from JS.
- [P1] `src/marketplace-analytics.js:110-118` — `load()` does `await fetch(...)` then checks `res.ok`, but the call is **not wrapped in try/catch**. A network-layer throw (offline, DNS, CORS) rejects unhandled and leaves the skeletons spinning forever with no error shown. Fix: wrap in try/catch and surface the existing `#an-error` element on throw.
- Coin handling is correct: `THREE_MINT`/`USDC_MINT` distinguished in `fmtVolume` — good model for the rest of the codebase.
- [P2] Volume chart `<canvas>` has an `aria-label` but no text/data-table fallback for SR users; consider a visually-hidden summary of the 30-day total.

## /collection — pages/collection.html (+ src/collection.js)

Verdict: Solid (one escaping gap).

- Auth-wall (signed-out), skeleton, per-tab empty states, and error state all designed; tabs are ARIA `tablist`/`tab`/`tabpanel`; cards cross-wire to `/marketplace/agents/:id` and NFT receipts to the chain explorer. `noindex` correct for a private page.
- [P2] `src/collection.js:28-90` — card HTML interpolates `p.skill`, `p.agent_name`, `p.agent_thumbnail`, `s.agent_id` raw into `innerHTML` with no escaping. Skill/agent names originate from other creators, so a crafted name is a stored-XSS vector when it lands in a buyer's collection. Fix: add an `escapeHtml` helper (as `discover.js`/`gallery.js` have) and wrap all interpolated values.

## /skills — pages/skills.html

Verdict: Solid (intentional redirect).

- This is a thin client redirect: it `location.replace`s to `/marketplace?tab=skills`, preserving `q`/`category`. `noindex`, canonical points at the marketplace. Works as intended. No issues.
- [P3] Redirect is JS-only (no `<noscript>`/meta-refresh fallback); fine for an authenticated app, but a `<link rel="canonical">` + a one-line "Redirecting…" body would be cleaner for no-JS/bots.

## /community — pages/community.html

Verdict: Solid.

- Static, self-styled, responsive (`@media 640px`), cards with hover, external links carry `rel="noopener noreferrer"`. Links to X, GitHub, `/docs`, `/tutorials`, `/create`, `/bounties`-adjacent involvement — all valid routes. Newsletter handled by `/footer-newsletter.js`.
- [P2] The "Newsletter" section (`:161-164`) is copy-only with no visible signup form in the section body — the actual input lives in the global footer. A reader who scrolls to the section sees a description and nowhere to act. Fix: either embed the signup field in-section or link/scroll to the footer form.
- [P2] Card links use `.card-link` with `:hover` underline but no `:focus-visible` style; add a focus ring for keyboard users.

## /characters — public/characters.html (+ src/characters.js)

Verdict: Needs work (stored-XSS risk).

- [P1] `src/characters.js:30-82` — `cardHtml()` interpolates `ch.name`, `ch.description`, `ch.author_name`, `ch.token.symbol`, and `ch.image_url` directly into `innerHTML` with **no escaping**. Character names/descriptions are user-authored, so this is a stored-XSS sink (e.g. a `name` of `<img src=x onerror=...>`). Note `discover.js` and `gallery.js` already escape — this file regressed. Fix: add `escapeHtml`/`escapeAttr` and wrap every interpolated value (including the `image_url` `src` and `alt`).
- [P2] `src/characters.js:94,109,118` — states are functional but minimal: the empty/error states are a single line of text inside the grid ("No characters found." / "Failed to load characters."). The error has no Retry affordance (unlike discover/gallery). Fix: add a Retry button to the error state and an actionable CTA ("Create a character →") to the cold-empty state.
- Cards correctly link to `/character/:id` (route confirmed `vercel.json:2421`). `$<symbol>` token chips render runtime token data from the characters feed — runtime-supplied, not hardcoded promotion; acceptable.

## /what-is — pages/what-is.html

Verdict: Solid.

- Strong explainer: semantic sections w/ `aria-labelledby`, FAQ accordion wired with `aria-expanded`/`aria-controls` toggling `.open`, model-viewer hero (`/animations/soldier.glb` — file confirmed present), FAQPage JSON-LD. Every CTA routes to a real page (`/create`, `/brain`, `/overlay-control`, `/studio`, `/play`, `/pay`, `/scan`, `/forge`, `/chat`, `/docs`, `/features`). No mocks, no dead links.
- [P3] FAQ chevron rotation relies on the `.open` class defined in `what-is.css`; verify that rule exists so the chevron actually animates on expand (cosmetic only).

## /sitemap — public/sitemap/index.html

Verdict: Solid (with a maintenance caveat).

- Hand-curated, sectioned index of every product surface with in-page anchor nav and machine-readable links (`sitemap.xml`, `llms.txt`, `features.json`, `openapi.json`, `changelog`). Good front-door.
- [P2] The link list is static/hand-maintained, so it will drift from `vite.config.js`/`vercel.json` as routes are added or removed (dead or missing entries over time). Fix/opportunity: generate this list (or a validation test) from `data/pages.json` so the sitemap can't silently go stale. [P3] Spot-check that every listed href still resolves.

---

## Group summary

Top P0/P1 items (no true P0s found in this group):

1. [P1] `src/characters.js:30-82` — unescaped user-authored `name`/`description`/`symbol`/`image_url` interpolated into `innerHTML` = stored-XSS sink. Add escaping (discover/gallery already do).
2. [P1] `pages/marketplace-analytics.html:137,143` — literal `${Array.from(...)}` template string in static HTML renders as raw text instead of skeleton rows. Replace with literal skeleton divs.
3. [P1] `src/marketplace-analytics.js:110` — `load()`'s fetch is not in try/catch; a network throw leaves skeletons spinning with no error shown. Wrap and surface `#an-error`.
4. [P1] `pages/home.html:5562-5567` (`FALLBACK_AGENTS`) and `:4882-4891` (`POOL_FALLBACKS`) — hardcoded fallback avatar arrays shipped to prod; violates the no-fallback-sample-arrays rule. Replace with designed empty/error states.
5. [P1] `pages/irl.html` — empty `alt` on the agent thumbnail (`:1949`), empty-nearby state communicated by color only (`:1753`), and geolocation/camera-denied paths must render a recoverable card rather than a blank canvas. Harden these states.

Coin rule: clean. No competing-coin promotion in this group; all `USDC` usage is the x402 payment dollar (a runtime rail), and `marketplace-analytics.js` already distinguishes `$THREE` from `USDC` correctly.

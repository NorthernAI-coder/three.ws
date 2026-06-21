# 33 — Onboarding & activation funnel

> Part of the three.ws "Production → $1B" program. Run in a fresh chat. Read
> `/CLAUDE.md` first (its rules override everything) and `prompts/billion-dollar-program/00-README.md`
> for shared context.

## Why this matters for $1B

Activation — a new visitor reaching their first "aha" — is the single biggest lever
on growth. Every dollar of acquisition is wasted if a first-timer can't make
something real in the first minute. three.ws already has the pieces (welcome modal,
"Getting started 0/3" checklist, a "What is three.ws" page, an 88-stop guided 3D
tour), but they must compose into one coherent path with a clear, fast first win and
honest measurement, or the funnel leaks at the top.

## Mission

Turn the first-run experience into a single, polished path that gets a brand-new
visitor from "what is this?" to "I made a 3D thing" in about 60 seconds, with every
step instrumented so activation is measurable.

## Map (trust but verify — files move)

- **Getting-started checklist + welcome modal** — [public/getting-started.js](../../public/getting-started.js)
  (the `STEPS` array: core `create → brain → embed`, optional `onchain → monetize`;
  renders the bottom-right "Getting started N/3" pill), [public/getting-started.css](../../public/getting-started.css).
- **In-product feature discovery** — [public/feature-discovery.js](../../public/feature-discovery.js)
  ("Have you tried…", `tws:feature-done` "what's next" cards), [public/feature-discovery.css](../../public/feature-discovery.css).
- **Intro / explainer pages** — [pages/what-is.html](../../pages/what-is.html) (`/what-is`),
  [pages/start.html](../../pages/start.html) (`/start`).
- **Guided 3D tour** — [src/feature-tour/director.js](../../src/feature-tour/director.js),
  [src/feature-tour/curriculum.js](../../src/feature-tour/curriculum.js),
  [public/tour/curriculum.json](../../public/tour/curriculum.json) (built by
  `scripts/build-tour.mjs`); tour page is `/tour`.
- **First "aha" surfaces** — [pages/forge.html](../../pages/forge.html) +
  [src/forge.js](../../src/forge.js) (free NVIDIA NIM text→3D), `/create` and
  [src/create-prompt.js](../../src/create-prompt.js) (text→avatar). The free lanes
  need no wallet.
- **Analytics taxonomy** — [src/analytics.js](../../src/analytics.js)
  (`FUNNELS.activation`: `landing_viewed → wallet_connect_started →
  wallet_connect_succeeded → agent_created`), [src/acquisition-analytics.js](../../src/acquisition-analytics.js).

## Do this

1. **Walk the real funnel in a browser** (`npm run dev`): open `/` in a fresh
   incognito profile (clear `localStorage`), follow the welcome modal → `/create` →
   finish a free generation. Time it. Note every dead-end, dead click, or moment of
   confusion. The free core path must never demand a wallet.
2. **Make the first win the default.** The fastest aha is the free NIM text→3D /
   text→avatar lane — ensure the welcome modal and `/start` route there first, with a
   one-line prompt suggestion so a blank composer never stalls a first-timer.
3. **Unify the three entry points** so they tell one story: the welcome modal
   (`getting-started.js`), `/what-is`, and `/tour`. Cross-link them; remove
   contradictory copy; ensure the "Getting started N/3" pill resumes correctly across
   pages and reflects real milestones (verify the `done()` route matchers in `STEPS`
   still point at live routes via `vercel.json`).
4. **Instrument activation honestly.** Confirm `AGENT_CREATED` / first-generation and
   each checklist `complete()` fire `track()` events through `src/analytics.js`
   (extend `FUNNELS.activation` or `ANALYTICS_EVENTS` if a step in the real path isn't
   covered — keep names in the existing taxonomy, never invent ad-hoc strings). No raw
   wallet addresses or PII as props (use `shortWallet()`).
5. **Design every onboarding state:** welcome modal has focus trap + Escape + "Maybe
   later" (verify), the checklist has an empty/first-run state and a celebratory
   complete state, and `tws:feature-done` "what's next" cards point only at confirmed
   live routes.
6. **Reduce time-to-value.** Cut any step that isn't required for the first win;
   defer wallet/on-chain prompts until after the user has made something. Lazy-load
   the heavy tour director so it never delays the homepage LCP.
7. **Verify resume + opt-out.** `data-getting-started="off"`, "Hide this", and the
   immersive-route exclusions must all work; progress persists across reloads and
   pages; the tour rehydrates from `sessionStorage` mid-flow.
8. **Run tests + changelog.** `npx vitest run` for any touched module and the tour
   build (`node scripts/build-tour.mjs` stays clean). Add a `data/changelog.json`
   entry for the user-visible onboarding improvement and run `npm run build:pages`.

## Must-not

- Do not gate the free core path behind a wallet, sign-up, or payment — the first aha
  must be free.
- Do not ship a fake progress bar or `setTimeout` "loading"; generation progress comes
  from real API responses only.
- Do not send PII (raw wallets, emails) to analytics; route through the taxonomy in
  `src/analytics.js` and truncate with `shortWallet()`.
- Do not reference any coin other than `$THREE`; the optional "monetize" step settles
  in `$THREE` only.
- Do not break the existing resume/opt-out behavior or double-mount the guide
  (`window.__twsGuide` idempotency).

## Acceptance (all true before claiming done)

- [ ] A fresh incognito visitor reaches a finished free 3D creation in ≤60s with no
      wallet and no console errors/warnings.
- [ ] Welcome modal, `/what-is`, and `/tour` tell one consistent story and cross-link;
      every CTA target is a live route.
- [ ] "Getting started N/3" pill resumes across pages, reflects real milestones, and
      has designed first-run + complete states.
- [ ] Each activation step fires a taxonomy event via `src/analytics.js` with no PII;
      `FUNNELS.activation` reflects the real path.
- [ ] Opt-out (`data-getting-started="off"`, "Hide this", immersive exclusions) and
      tour mid-flow rehydration all work.
- [ ] Touched tests pass, `scripts/build-tour.mjs` is clean, and the changelog entry
      is added with `npm run build:pages` clean.

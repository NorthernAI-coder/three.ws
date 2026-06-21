# B1 — Onboarding & Activation: real value in under 60 seconds

You are a senior engineer + product thinker building **three.ws**. Read `CLAUDE.md`,
`STRUCTURE.md`, and `prompts/production-campaign/00b-the-bar.md` first. **Prerequisites:** none.

## Why this matters for $1B
Activation is the hinge of the entire valuation. A visitor who reaches a "wow" in their first
minute — a textured 3D model they typed into existence, a walk companion strolling their
screen, an agent that talks back — becomes a user; one who hits a signup wall first becomes a
bounce. The bar (`00b-the-bar.md` §5) is explicit: **first-run path to value in under 60
seconds with no signup wall before the first wow.** Every other growth surface — SEO, share
loops, lifecycle email — is wasted spend if the moment a visitor arrives is a dead end. This
prompt makes the front door convert.

## Current state (read before you write)
- `src/feature-tour/` is a complete guided-tour engine: `index.js` (`createFeatureTour()`),
  `director.js`, `narrator.js`, `guide-avatar.js`, `controls.js`, `free-roam.js`,
  `chapters.js`, `curriculum.js`, `spotlight.js`. It exists but is not wired as a first-run
  activation flow — it's a tour, not an onboarding funnel with a measured outcome.
- `pages/start.html` + `src/start.js` are the intended entry surface. Read them: see what they
  currently render and whether they route a brand-new visitor to a value moment.
- `docs/onboarding/ONBOARDING-PLAN-2026-06-19.md` is the product plan — read it and honor the
  intent; do not contradict it without reason.
- Free value lanes that need NO signup: the **Forge free lane** (NVIDIA NIM / TRELLIS
  text→3D — grep for the free engine path; the MCP `forge_free` tool proves it's free), the
  **walk companion** (`walk-sdk/`, `src/walk-companion.js`), and a **sample agent** profile.
- The gap: no single, deliberate, measured first-run that picks one of these, gets a true
  first-time visitor to the "wow" with zero auth, then *earns* the signup ask afterward.

## Your mission
### 1. Design the <60s first-run path on `pages/start.html` / `src/start.js`
Detect a first-time visitor (no session, no `localStorage` activation flag). Present one
crisp choice or a smart default that leads to the fastest real wow: **a Forge free-lane
prompt box** ("Type anything → get a 3D model") is the strongest default. Pre-fill an
example prompt so a click — not typing — can trigger it. The path must hit real value (a
real GLB from the free engine, a real companion on screen) **before any auth**. No mock, no
canned asset — the actual free pipeline.

### 2. Drive it with the existing feature-tour, don't rebuild it
Use `createFeatureTour()` / `director.js` / `narrator.js` / `spotlight.js` to choreograph the
moment — spotlight the prompt box, narrate the one instruction, celebrate the result. Extend
the tour engine where it lacks an "activation outcome" concept; do not fork it. The guide
avatar (`guide-avatar.js`) should feel alive, not scripted. Respect `prefers-reduced-motion`.

### 3. Hold the signup wall until after the wow
No login, wallet-connect, or email gate before the first delivered value. After the wow,
present the upgrade ask in context ("Save this model / Forge in high quality with $THREE /
Create an account to keep your gallery") — the ask is *earned*, tied to a concrete next
benefit, and dismissible. Never a modal that blocks the value the user just saw.

### 4. Make it resumable and honest about failure
Persist activation progress so a refresh or a return visit doesn't restart the wow. If the
free engine is busy (the real "free engines all busy" state from `00b-the-bar.md` §1), the
flow degrades to a real alternative — switch to the walk companion wow, queue, or notify-me —
never a dead end or a fake spinner.

### 5. Measure activation
Emit real funnel events at each step (first-run shown → wow attempted → wow delivered →
signup ask shown → converted) via `src/acquisition-analytics.js` (it already exports
`trackLandingView`, `wireCtaTracking`, and routes through `src/analytics.js`'s
`trackFunnelStep('activation', …)`). Use the existing `ANALYTICS_EVENTS`/`FUNNELS` taxonomy;
add the few activation steps it's missing. This is the data B3 reads — wire it cleanly, don't
invent a parallel system.

### 6. Wire the entry points
The first-run path must be reachable: a new visitor landing on `pages/home.html` or
`pages/start.html` enters it without hunting. Add only the minimal first-run trigger to
`home.html` (B6 owns its full layout — coordinate, append a hook, don't restyle it).

## Definition of done
Maps to `00b-the-bar.md` §5 (activation measured, <60s to value, no pre-wow signup wall) and
§3 (every state designed). Specifically: a real first-time visitor reaches genuine value
(real GLB or real companion) in **under 60 seconds, no auth**, verified with a stopwatch in a
fresh incognito session; the busy/error path offers a real way forward; activation funnel
events fire into the existing taxonomy and are visible in the network tab; resumable across
refresh; loading/empty/error/celebrate states all designed and on-token; keyboard- and
screen-reader-navigable. **Also inherits the global definition of done in
`00-README-orchestration.md`.**

## Operating rules (override defaults)
No mocks/fake data/placeholders/TODOs/stubs. No `setTimeout` fake-loading — the free engine is
real async. `$THREE` is the only coin. Design tokens only. Stage explicit paths only (never
`git add -A`); re-check `git diff --staged` before commit. Own the onboarding/feature-tour
lane; extend the existing tour engine and analytics module, don't rewrite them.

## When finished
Run the five self-review checks (lazy / user / integration / edge-case / pride). Ship one
improvement — e.g. a second example prompt that showcases a different model type, or a
"share your first model" hook that hands off cleanly to B4. Append a `data/changelog.json`
entry (user-visible: tag `feature`). Then delete this prompt file
(`prompts/production-campaign/B-growth/B1-onboarding-activation.md`) and report what you
shipped, the measured time-to-wow, and the activation events you emitted (the seam B3 builds on).

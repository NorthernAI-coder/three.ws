# C1 — Creation-tool surfaces to the bar (Forge, studios, create flows)

You are a senior engineer + product thinker building **three.ws**. Read `CLAUDE.md`,
`STRUCTURE.md`, and `prompts/production-campaign/00b-the-bar.md` first. **Prerequisites:** none
(Track A reliability should be green so the degradation states you render are real).

## Why this matters for $1B

Creation is the **first "wow"** — the 60-second activation moment in the $1B thesis. A
first-time visitor's entire impression of three.ws is formed at the Forge prompt box and the
avatar studio. If generation hangs on a spinner, dead-ends on "all engines busy," or shows a
blank canvas with no guidance, we lose the activation before value is ever reached. Every
creation surface must turn waiting into anticipation and failure into a path forward.

## Surfaces in scope (the real pages)

- **Forge (text→3D):** `pages/forge.html` → `src/forge.js` (+ `forge-prompt-studio.js`,
  `forge-reveal.js`, `forge-refine.js`, `forge-pay.js`, `forge-dropzone.js`) →
  `api/forge.js`, `api/forge-creation.js`, `api/forge-gallery.js`
- **Avatar Studio:** `pages/avatar-studio.html` → `src/avatar-studio.js` (+ `-colorpicker`,
  `-optimize`, `-utils`); demo: `pages/avatar-studio-demo.html` → `src/avatar-studio-demo.js`
- **Agent Studio:** `pages/agent-studio.html`
- **Create Agent / Character / Selfie:** `pages/create-agent.html` → `src/create-agent.js`;
  `pages/create-character.html`; `pages/create-selfie.html`; the create flow
  `pages/create.html` → `src/create.js` (+ `create-prompt.js`, `create-review.js`)
- **Animation tooling:** `pages/animations.html` → `src/animations-gallery.js`,
  `src/animation-library.js`; mocap: `pages/mocap-studio.html`
- Data/MCP: `api/forge.js` (free NVIDIA NIM / TRELLIS lane + paid engines), the free
  `forge_free` MCP tool, `api/forge-gameready.js`, `api/forge-optimize.js`,
  `api/forge-stylize.js`.

## Current state (read before you write)

The Forge backend already returns a **designed degradation** when the free Spaces are
saturated — `api/forge.js:1042` returns *"The free 3D Spaces are all busy or warming up
right now. Try again in a moment, or pick another engine."* and `:1285` returns a retry hint.
Sub-tools throw busy errors with a seconds estimate (`forge-gameready.js:394`,
`forge-optimize.js:294`, `forge-stylize.js:129`). **The gap is the front end:** verify the UI
turns that JSON into a *real* designed state — a retry-with-countdown, an engine switcher, and
a "notify me / queue" path — not a thrown error string in a toast or, worse, a spinner that
never resolves. Audit each studio for: undesigned empty canvas, generation progress that is
honest (real queue/inference status, never `setTimeout` fake bars), and mobile usability of
the prompt box and 3D viewport.

## Your mission

### 1. Audit every surface for the five states (loading / empty / error / overflow / populated)
For each page: **loading** uses a skeleton or honest queued/running status from the real API
(no fake progress); **empty** (no prompt yet / empty gallery) names the tool and offers a
starter prompt, an example, or a "surprise me"; **error** speaks plainly with a real action;
**overflow** handles a 500-char prompt, a 0-item gallery, a 1000-model gallery, a giant GLB.

### 2. Fix the Forge "free engines all busy" dead-end into a designed degradation
This is the named failure in `00b-the-bar.md` §1. When `api/forge.js` returns the busy/down
payload, the page must render a **path forward**, not a dead end:
- a **retry with a live countdown** (use the seconds the API supplies, not a guess),
- an **engine switcher** (the paid lanes exist — surface them with their $THREE/x402 cost),
- a **"notify me / queue"** affordance so the user isn't forced to babysit the page.
Wire it to the real response shape; no mocked queue. Carry the same treatment to the
gameready/optimize/stylize busy errors so a sub-step never throws a raw string.

### 3. Mobile, a11y, and microinteractions
Make the prompt box, controls, and 3D viewport usable at **320 / 768 / 1440px** (no overflow,
tappable targets ≥ 44px). The viewport canvas gets an ARIA label and a keyboard-reachable
control set; generation status is announced via `aria-live`. Honor `prefers-reduced-motion`
on the reveal animation. Every button/slider gets hover, active, and focus states.

### 4. Dead-path elimination + design tokens
Every CTA on these pages must do something real (generate, export, pay, share, open in
studio). Replace any hardcoded color/spacing/font with a `public/tokens.css` token. If a
control looks live but isn't wired, wire it or remove it.

### 5. Honest 3D loading
The viewport must not block on a multi-MB GLB: lazy-load Three.js, show a real loading
skeleton, dispose GPU resources on unmount/regeneration. No jank, no FOUC.

## Definition of done

Clears `00b-the-bar.md` §3 (all five states designed + reachable, responsive, a11y) and §1
(graceful degradation with a real path forward on Forge). Inherits the **global definition of
done** in `00-README-orchestration.md`: real APIs only, `$THREE` the only coin, tokens only,
verified in a browser at `npm run dev` with zero console errors from your code and real
network calls, existing tests pass. State which bars you cleared and how you verified each.

## Operating rules (override defaults)

No mocks / fake data / placeholders / TODOs / stubs / sample arrays / `setTimeout` fake
progress. `$THREE` (`FeMbDoX7R1Psc4GEcvJdsbNbZA3bfztcyDCatJVJpump`) is the only coin —
generic runtime-supplied mints excepted per `CLAUDE.md`. Design tokens only
(`public/tokens.css`) — no hardcoded colors/spacing/fonts. Stage explicit paths only (never
`git add -A`); re-check `git diff --staged` and `head -1` of any `api/*.js` you touch for the
`__defProp` bundle trap. Own **only the pages listed here**; extend the shared nav/tokens,
never rewrite them.

## When finished

Run `CLAUDE.md`'s five self-review checks (lazy / user / integration / edge-case / pride).
Ship one improvement beyond the checklist (e.g. a starter-prompt gallery on the empty Forge
canvas, or a "remix this model" path from the gallery into the studio). Append a
holder-readable `data/changelog.json` entry if the change is user-visible
(`npm run build:pages` to validate). Then delete this prompt file
(`prompts/production-campaign/C-surfaces/C1-create-forge-surfaces.md`) and report what you
shipped, which bars you cleared and how you verified them, and any seam for the next agent.

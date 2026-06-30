# Site UI — foundation: the shared game-feel library

You are working in `/workspaces/three.ws`. We're bringing **game-feel** to every
front-end surface (~31 paired `src/<name>.js` + `.css` modules). Before touching those
pages, extract the interaction primitives — proven on the `/swarms` page — into **one
reusable, token-driven, reduced-motion-safe module** so every surface adopts the same
vocabulary instead of reinventing it. This module is the keystone the cluster prompts
depend on.

## Ground truth (read these first)

- `public/tokens.css` already defines the motion ladder: `--duration-instant|fast|base|slow`, `--ease-standard|emphasized|out`, blur vars — **and a global `@media (prefers-reduced-motion: reduce)` block that zeroes every `--duration-*`.** This means: if your animations are driven by these tokens, reduced-motion safety is automatic. Build on them; do not introduce raw millisecond literals.
- `src/swarms.js` is the reference implementation. Relevant proven primitives: `flash(el)` (background-sweep on update, ~line 568), the SSE-driven live tile updates (`#sw-bal`/`#sw-pnl`/`#sw-open`, ~line 555), the consensus meter fill+threshold (`src/swarms.css:192`), and the share bars (`.sw-bar`).
- Vanilla JS ES modules + Vite. No framework. Keep the library dependency-free (RAF math, no charting lib) unless a tiny, well-maintained dep is clearly justified per CLAUDE.md's open-source-first rule — check `package.json` first.

## Build `src/ui-juice.js` (exported, documented, tested)

A small, framework-free module exporting these primitives. Each must be token-driven and
respect reduced motion (read the computed `--duration-*`; if 0, jump to final state):

1. `countUp(el, from, to, { format, duration })` — animate a number between two **real** values via `requestAnimationFrame`, preserving caller formatting (sign, units, `%`). Cancels any in-flight count-up on the same element. Reduced motion → set final value instantly.
2. `flashValue(el, direction)` — directional tint pulse (`up` → success, `down` → danger, `neutral`), then settle. Generalizes the swarms `flash()`.
3. `enterRow(el)` — slide+fade a newly inserted row/item in from the top (for live logs/feeds).
4. `sparkline(values, { width, height, fill })` — return an inline SVG string for a real numeric series; supports an animated draw (stroke-dashoffset) and a final-point dot. Net-positive vs net-negative coloring via tokens.
5. `ring(pct, { size, label })` — an SVG arc gauge filling to a real percentage with centered label.
6. `flipReorder(container, keyFn)` — FLIP-animate children to new positions after a re-sort/re-render, so standings reorder smoothly instead of snapping.
7. `liveDot(state)` / a small helper mirroring the swarms `.sw-live` connecting/live vocabulary for SSE-backed surfaces.
8. `rippleOnce(el)` — a single accent ripple along an element's edge for "something happened" beats (restrained; no confetti).

Pair with `src/ui-juice.css` for any shared classes (or fold minimal styles in). All
classes token-driven; document each export with a one-line JSDoc and a usage example.

## Required: a runnable demo + tests + docs

- Add a `tests/ui-juice.test.js` (Vitest, match the existing `tests/swarms.test.js` style) covering the pure logic: count-up interpolation/formatting, sparkline path generation for a known series, ring arc math, FLIP key diffing. DOM-light where possible.
- Write `src/ui-juice.README.md` (or a `docs/ui-juice.md` linked from `docs/start-here.md`) — what it is, every export's signature, and one runnable example each. This is a new developer-facing capability; CLAUDE.md requires the doc.
- **Retrofit `/swarms` to use the library** as the first consumer (replace the inline `flash`/tile updates with the shared primitives) — proves the API and removes duplication. Verify `/swarms` still behaves identically.

## Rails (non-negotiable)

- Tokens only from `public/tokens.css`. No raw colors or `Xms` literals.
- Reduced motion: rely on the token override + an explicit final-state path in JS. Verify with DevTools emulation — every primitive lands on the correct static end state with no motion.
- No fake data: these are transition helpers over real values; never fabricate inputs.
- Concurrent agents edit `main`: stage explicit paths only, re-check `git status`, never `git add -A`.

## Definition of done

- `npm run dev`, exercise the demo and the retrofitted `/swarms` — identical behavior, now via the shared library, no console errors.
- `npm test` passes including the new `tests/ui-juice.test.js`.
- Reduced-motion verified across all primitives.
- Docs written and linked; `data/changelog.json` entry (tag: `improvement` or `sdk`): a shared motion/interaction library now powers live UI across the platform.
- Review your `git diff`. Don't commit unless asked.

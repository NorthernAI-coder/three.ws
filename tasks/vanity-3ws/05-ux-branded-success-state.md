# Task 05 — UX: stamp progress + a success state that celebrates the mark

## Goal

Turn the mark from an invisible backend detail into a *visible product moment*. The user
should understand, at launch time, that their coin is being stamped with the three.ws
brand — and see the marked address called out when it lands. Every state designed:
idle → stamping → stamped → error.

## Context

- Surfaces from task 03: `src/agent-home-pumpfun.js`, `src/pump/pump-modals.js`, `public/studio/launch-panel.js`.
- Existing progress hooks: `grindVanity({ onProgress })` yields `{ attempts, rate, eta }`. Reusable classes exist: `.pumpfun-vanity-progress` (agent-home), `.lp-ok-mint` / `.lp-ex-mint` (studio launch panel).
- `formatTimeEstimate` / `estimateAttempts` in `src/solana/vanity/validation.js` for honest ETAs.
- Monochrome design tokens (see the dashboard token memory) — no new colors.

## Changes

### Stamping (loading) state
- While grinding, show: **"Stamping the three.ws mark `3ws…`"** with the real rate/eta
  from `onProgress`. Because the grind is ~sub-second, also keep the copy graceful if it
  finishes instantly (don't flash). A subtle shimmer on the mint placeholder is enough.
- The launch button reflects the phase: `Stamping 3ws…` → `Launching…`. No fake timing.

### Stamped (success) state
- Render the resulting mint with the `3ws` prefix **visually emphasized** (e.g. the first
  three glyphs in the accent/foreground weight, the remainder muted, then `…tail`).
  Reuse the existing truncation component; just weight the leading mark.
- Microcopy: "Stamped on-chain — every three.ws coin starts with `3ws`." Include the
  copy-address and explorer/pump links that the success state already shows.
- A small "verified three.ws coin" pill is appropriate here — but reuse the existing
  on-chain badge module (`src/shared/onchain-badge.js`, per memory) rather than inventing a
  second badge. If the badge can take a "branded mint" hint, pass it; otherwise leave the
  badge as-is and only weight the mark glyphs.

### Error state
- If the grind is aborted (user cancels) → return to idle cleanly, button re-enabled.
- If `launch-prep`/`launch-agent` returns `400 unbranded_mint` (shouldn't happen from our
  own client, but a defensive surface) → show "Could not stamp the brand — retry," with a
  retry affordance. Actionable, not a dead toast.

### Accessibility / polish (`CLAUDE.md` UI standards)
- The stamping indicator is an `aria-live="polite"` region.
- The emphasized mark must not rely on color alone (use font-weight + an `aria-label` like
  "three.ws mark") for contrast/colorblind safety.
- Hover/focus states on the copy button and links.

## Constraints

- Real async only — the progress reflects actual `onProgress` events.
- No new color tokens; monochrome system + existing accent.
- Don't duplicate the on-chain badge; reuse the shared module.
- Keep all three surfaces visually consistent — same copy, same emphasis treatment.

## Success criteria

- A launch from each surface shows a real stamping indicator, then a success state with the
  `3ws` prefix visually emphasized and an honest "every three.ws coin starts with 3ws" line.
- Cancel during stamping returns to a clean idle state.
- The `unbranded_mint` error path renders an actionable retry, not a blank failure.
- Screenshot-worthy: the marked address is the hero of the success card.

## Verification

- `npm run dev`; launch from each surface in a real browser. Confirm no console errors/warnings.
- Verify the live region announces and the emphasized mark has an `aria-label`.
- Per the headless-WebGL memory, assert via DOM text + the network payload, not pixel reads.

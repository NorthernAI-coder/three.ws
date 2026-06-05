# A02 — Fix dead links & unhandled promise rejections

**Track:** Health · **Size:** M · **Priority:** P0/P1

## Goal
Eliminate dead interactive elements and unhandled async failures. Every button works, every
link goes somewhere, every promise has a boundary (`CLAUDE.md`: "If a button exists, it must work").

## Why it matters
Dead paths and silent crashes read as "this product is half-built." They're cheap to fix and
high-signal for quality.

## Context (known instances — fix these, then sweep)
- [src/marketplace.js](src/marketplace.js#L4384) — `#rel-more` "View More ›" link with `href="#"` and **no handler**. Wire it to actually expand/paginate the Related Agents list (reuse the list's existing data source).
- [src/avatar-drop.js](src/avatar-drop.js#L365) — `Promise.all([...])` loading animation clips with **no `.catch()`**; the inner `fetchClip` (line ~364) also lacks error handling. Add a boundary; on failure, skip the interactive animation gracefully (don't crash init).

## Scope
1. Fix the two known issues above with real behavior (not just a swallow — the "View More" must do something useful).
2. Sweep `src/` and `pages/` for: `href="#"` with no click handler, `onclick`/listeners that are empty, and `<button>`s with no bound action. For each, either wire it or remove it.
3. Sweep for `Promise.all(`, `.then(` chains, and `await fetch(` in event handlers/init paths that lack a `.catch`/`try`. Add boundaries at network/user-input edges (internal code may trust itself, per `CLAUDE.md`).

## Out of scope
- Console-log triage (that's `A05`). Test failures (that's `A03`).

## Definition of done
- "View More" expands the related list; no dead `href="#"` remains without intent.
- No unhandled rejection appears in the console while exercising the home page, marketplace, and create flow.

## Verify
- `npm run dev`; click every CTA on the home page, `/marketplace`, and an agent detail page. Console shows zero unhandled rejections.

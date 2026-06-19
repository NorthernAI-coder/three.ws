# 02 — Discovery onboarding + the designed empty state

> Size **M** · `src/irl.js` (`updateNearbyBadge`, first-run flow), `src/irl/onboarding.js`,
> `pages/irl.html`, `src/irl.css`. The single biggest UX task in the epic.

## Goal

Teach the "stumble upon" mental model so a first-time visitor in an empty area
understands the world is *working*, not broken. With a tight 40 m radius and no
list/map, "nothing on screen" is the **common** first experience — it must read as
"keep exploring," never as a dead feature.

## Why it matters

We deliberately removed the radar/roster. That is the safety win — and the UX
risk. Top location apps that hide a map (by choice or by privacy) live or die on
how well they set the expectation: *you find things by being somewhere, not by
browsing.* If the empty state is a bare badge, users bounce and conclude /irl is
empty everywhere. The onboarding is the product.

## Current state (real lines)

- `src/irl.js` `updateNearbyBadge()` writes `#irl-nearby-badge`: populated →
  `"N nearby"`; GPS-ready + none → `"No agents nearby — be the first to pin here"`;
  no fix → hidden. That badge is the *entire* current empty-state story.
- `src/irl/onboarding.js` owns the sensor-permission prompts (camera / motion /
  location) and the retry copy.
- First fix triggers `startPinSync()` → `startPinPolling()`.

## What to build

1. **A first-run explainer** (once per device; store a flag in `localStorage`,
   same pattern as `SHARE_GHOST_KEY`). A short, beautiful card shown after
   permissions are granted and before/over the empty scene:
   - One line on the model: *"Agents are hidden in the world around you. Walk
     around and look through your camera — when you're near one, it appears."*
   - One line that it's mutual: *"Drop your own agent anywhere; someone who comes
     to that spot will find it."*
   - Reassure on privacy (this builds trust, see task 08): *"We never show a list
     of where agents are — not even to you."*
   - A single primary action ("Start exploring") and a "Place an agent here" CTA.
2. **Upgrade the empty state** from a badge string to a *designed* state: a
   centered, low-contrast prompt in the AR view with a gentle looping hint
   ("Look around 👀 • or be the first to pin here") and the Place CTA. Distinct
   visual from the error state (task 06 owns error/permission copy).
3. **Populated affordance.** When ≥1 agent is in range, retire the empty prompt
   and keep the count subtle — never a list. (The count is fine; a roster is not.)
4. Respect `prefers-reduced-motion` for any looping hint. Keyboard + screen-reader
   accessible (aria-live polite on the state, not spammy — only on transition).

## Acceptance checklist

- [ ] First-run explainer shows once per device, dismissible, re-openable from a
      small "?" affordance; never blocks the camera permanently.
- [ ] Empty state is a designed component (not just badge text) that communicates
      "keep exploring" + offers "Place an agent here."
- [ ] Transitions empty ⇆ populated are smooth (opacity/transform), no pop.
- [ ] Copy never implies a browsable list/map of agents exists.
- [ ] `prefers-reduced-motion` honored; aria-live announces state changes once.
- [ ] Clean at 320 / 768 / 1440; no console errors/warnings.
- [ ] Holder-readable `data/changelog.json` entry (tag: improvement) + `build:pages`.

## Out of scope

Permission-flow polish and error states (task 06), the arrival cue (task 03).

## Verify

`npm run dev` → /irl on a fresh profile (clear `localStorage`): grant permissions,
see the explainer once, see the designed empty state with no agents, then seed one
in range (`__irlSeedPins(1)` per [memory: irl-perf-e2]) and confirm the empty
prompt retires cleanly.

<!-- AUTO:self-delete-on-complete -->

---

## ✅ On completion — delete this file

This file is a unit of work, not a permanent doc. The moment every item above is **built, wired, verified, and committed** to the "Definition of done" in the repo-root `CLAUDE.md`, remove it in the same change:

```bash
git rm "tasks/irl-privacy/02-discovery-onboarding-empty-state.md"
```

Stage the deletion alongside your implementation and include it in the completion commit. This directory is the backlog: a file that still exists is unfinished work; a file that is gone has shipped. Do not delete early, and never leave a completed prompt behind.

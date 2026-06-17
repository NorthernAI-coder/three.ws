# Task 5 — The embed & home-page avatar UX

> Read [00-README.md](./00-README.md) first. Can run in **parallel** with Tasks 1/3. Follow
> [CLAUDE.md](../../CLAUDE.md) — every state designed, accessibility, verify in a real browser.

This is the "best possible UX" mandate, on the exact surface the bug appeared. The home page
renders live `<agent-3d>` mini-avatars in the door cards / bento / hero
(`initLiveFeatures()` in [pages/home.html](../../pages/home.html), ~line 6004+). Today they pop in
without a loading state, can be mis-framed, and force a one-shot clip to loop. Make every embedded
avatar feel intentional and polished — the thing someone screenshots and shares.

## What to build

### 1. Designed states for every embedded avatar
- **Loading:** a skeleton/shimmer in the card frame while the GLB streams (skeleton preferred over
  a spinner, per CLAUDE.md). The `.door-screenshot` frame already exists — fill it.
- **Error:** if the GLB or rig fails, show a tasteful static fallback (e.g. a poster/silhouette or
  a calm message), never an empty void or a broken canvas. Wire to the `agent-3d` error events
  from [src/element.js](../../src/element.js).
- **Reduced motion:** honor `prefers-reduced-motion` — hold a clean idle/static pose instead of
  looping motion. (The earn-viz count-up already checks this; mirror it.)

### 2. Correct, seamless playback
- Honor the clip's `loop` field from
  [public/animations/manifest.json](../../public/animations/manifest.json). `celebrate` is
  `loop:false` (one-shot) — the door card currently forces `loop:true`, which **hard-snaps** at
  the loop boundary. Either pick clips meant to loop, or play the one-shot then settle into idle
  (crossfade via `AnimationManager.crossfadeTo`). No visible snap, ever.
- Pick per-card clips that read well as a small, silent, looping thumbnail (idle/breath/wave/
  subtle gesture) — review the `LIVE_SPOTS` choices and upgrade any that read awkwardly at
  thumbnail size.

### 3. Framing & composition
- Frame each avatar so it sits centered and correctly scaled in its card (head-to-mid-thigh or
  full-body as appropriate), not tiny-and-low or cropped. Use the viewer's camera-fit/framing API
  (read [src/viewer.js](../../src/viewer.js)); if a per-embed frame hint is needed, add it through
  the existing `agent-3d` attributes rather than hard-coding magic numbers in `home.html`.
- Responsive: verify framing holds at 320px, 768px, 1440px.

### 4. Performance
- The `IntersectionObserver` already lazy-spawns on scroll-in. Extend it to **pause** rendering
  when a card scrolls out of view and **resume** on re-entry, so multiple live avatars don't burn
  GPU/CPU off-screen. Confirm the shared-context/perf budgets from the existing avatar perf work
  aren't regressed.

### 5. Make it reusable, not a one-off
- These behaviors (loading skeleton, error fallback, reduced-motion, loop-honoring, framing,
  offscreen-pause) belong to the **embed component**, not to `home.html`. Push them into
  `agent-3d` / the viewer as opt-in attributes/defaults so every embed across the site (and
  third-party embeds) benefits. `home.html` should consume the polished defaults, not reimplement
  them.

## Definition of done
- Every home-page embedded avatar enters with a skeleton, animates seamlessly (no loop snap),
  honors `prefers-reduced-motion`, is correctly framed at 320/768/1440, and pauses when offscreen.
- Error state is designed and reachable (force a bad GLB to confirm).
- The improvements live in the reusable component/viewer with sensible defaults; `home.html` just
  uses them. No magic numbers scattered in the page.
- Zero console errors/warnings; real GLB network calls succeed (Network tab checked). State the
  breakpoints and scenarios you exercised.
- `npm test` green; `npm run typecheck` green. Changelog entry (improvement: embedded avatars get
  polished loading/looping/framing). `completionist` run; findings fixed.
- Handoff note for Task 6 listing the surfaces touched.

Do not push unless the user approves (then both remotes).

<!-- AUTO:self-delete-on-complete -->

---

## ✅ On completion — delete this file

The moment every item above is **built, wired, verified, and committed**, remove it in the same
change:

```bash
git rm "prompts/avatar-animation-hardening/05-embed-and-home-avatar-ux.md"
```

Stage the deletion in the completion commit. A file that still exists is unfinished work.

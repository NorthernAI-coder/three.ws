# C5 — Worlds, clash & social surfaces to the bar

You are a senior engineer + product thinker building **three.ws**. Read `CLAUDE.md`,
`STRUCTURE.md`, and `prompts/production-campaign/00b-the-bar.md` first. **Prerequisites:** none
(Track A reliability green so live/multiplayer error states render real).

## Why this matters for $1B

Worlds, clash, the club, and communities are the **come-back-tomorrow** surfaces — the social
and real-time layer that turns a one-time generation into a habit. These are the most
heavily-3D, most live pages on the platform, so they carry both the **retention** pillar and
the hardest **performance** bars: a world that drops frames, a club that loads on a multi-MB
GLB with no skeleton, or a clash with no "waiting for players" state reads as broken, and a
broken social surface kills the network effect a $1B platform compounds on. These are also the
most shareable moments — every one must screenshot well and unfurl with an OG card.

## Surfaces in scope (the real pages)

- **Coin clash:** `pages/clash.html` → `src/clash.js`, `src/clash.css` → `api/clash/*`
- **Worlds:** `pages/worlds.html` → `src/worlds*`
- **City:** `pages/city.html` → `src/city/`
- **Club (3D venue):** `pages/club.html` → `src/club.js`, `src/club-venue.js`,
  `club-crowd.js`, `club-camera.js`, `club-audio.js`, `club-entrance.js`, `club-gate.js`,
  `club-sequence.js`, `club-perf.js` → `api/club/*`
- **Community / communities:** `pages/community.html`, `pages/communities.html` →
  `src/community/` → `api/community/*`
- **Bounties:** `pages/bounties.html` → `src/bounties.js`; detail `pages/bounty.html`
- Data sources: `api/clash/*`, `api/club/*`, `api/community/*`, and the live/multiplayer
  signaling these surfaces use.

## Current state (read before you write)

These are real-time 3D surfaces backed by `api/clash/*`, `api/club/*`, `api/community/*`.
The gaps to find: **3D scenes that block on asset load** with no progressive skeleton; **live
states** (waiting for opponents, empty club, lobby filling) that show nothing instead of a
designed "waiting" state; **error/disconnect** handling when signaling or an upstream drops;
**empty communities/bounties** lists with no "start one / be the first" path. The club's perf
module (`src/club-perf.js`) exists — confirm it actually holds frame rate and degrades quality
gracefully on weak devices rather than janking. Audit **overflow**: a clash with 0 vs many
entrants, a bounty list of 1000, a 200-char community name, a packed vs empty venue.

## Your mission

### 1. Audit every surface for the five states — real-time aware
**Loading** = progressive 3D load with a real skeleton/loading scene, never a frozen black
canvas. **Empty** = designed "waiting for players / empty venue / no bounties yet" states that
explain what happens next and offer an action (invite, start a bounty, enter the club).
**Error** = names a disconnect/upstream failure and offers reconnect/retry. **Populated** =
token-consistent HUD/overlays with microinteractions. **Overflow** = 0/1/1000 entrants,
bounties, community members; long names; full vs empty venue.

### 2. Make the 3D load honestly and hold frame rate
Lazy-load Three.js and scene assets, show a real loading skeleton/scene, draco/meshopt where
applicable, and **dispose GPU resources on exit/scene-change**. Verify `club-perf.js` actually
degrades quality on weak hardware to hold ~60fps; no jank on the avatar/crowd presence.

### 3. Real-time connection states
Clash and club show connecting → connected → reconnecting from the **real** signaling status,
with a visible reconnect path on drop. No frozen lobby that looks live. No `setTimeout`-faked
"finding opponent" — wire it to the real matchmaking/feed.

### 4. Mobile, a11y, microinteractions
2D overlays/HUD/lists usable at **320 / 768 / 1440px**; the 3D canvas degrades gracefully or
offers a 2D fallback on low-power mobile. Overlays are keyboard-reachable and
screen-reader-labelled; the 3D canvas has an ARIA label and a non-3D way to read state. Honor
`prefers-reduced-motion` (calm the camera/crowd motion). Hover/active/focus on every control.

### 5. Dead-path elimination + design tokens + shareability
Every CTA (enter clash, join club, claim bounty, open community) does something real. Replace
hardcoded colors/spacing/fonts with `public/tokens.css` tokens. Ensure each shareable moment
(a clash result, a bounty, a community) has a working share action / OG card and links to its
detail. Wire cross-links: a community → its members' agent profiles; a bounty → the agent
that can fulfill it.

## Definition of done

Clears `00b-the-bar.md` §3 (five states, responsive, a11y), §2 (progressive 3D, 60fps, GPU
disposal, no FOUC). Inherits the **global definition of done** in
`00-README-orchestration.md`: real APIs only, `$THREE` the only coin, tokens only, verified in
a browser at `npm run dev` with zero console errors from your code and real network calls,
existing tests pass. State which bars you cleared and how you verified each (the frame rate,
the disconnect recovery, the empty-venue screenshot).

## Operating rules (override defaults)

No mocks / fake data / placeholders / TODOs / stubs / sample arrays / faked matchmaking.
`$THREE` (`FeMbDoX7R1Psc4GEcvJdsbNbZA3bfztcyDCatJVJpump`) is the only coin — clash/community
surfaces that render user-launched coins use the runtime user-launch exception per `CLAUDE.md`;
never hardcode or recommend a non-`$THREE` mint. Design tokens only (`public/tokens.css`).
Stage explicit paths only (never `git add -A`); check `head -1` of any `api/*.js` you touch
for the `__defProp` bundle trap. Own **only the pages listed here**; extend, don't rewrite,
the shared nav/tokens.

## When finished

Run `CLAUDE.md`'s five self-review checks. Ship one improvement (e.g. a shared 3D-scene
loading skeleton, a low-power 2D fallback for the club, or a "be the first" empty state on
communities/bounties). Append a holder-readable `data/changelog.json` entry if user-visible
(`npm run build:pages` to validate). Then delete this prompt file
(`prompts/production-campaign/C-surfaces/C5-worlds-clash-social-surfaces.md`) and report what
you shipped, which bars you cleared and how you verified them, and any seam for the next agent.

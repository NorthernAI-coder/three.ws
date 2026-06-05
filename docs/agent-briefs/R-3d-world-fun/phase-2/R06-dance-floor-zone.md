# R06 — Dance floor zone

**Phase 2 (Social playground) · Depends on: nothing (uses existing emote/anim path) · Touches WalkRoom for the beat tick**

> Read [`../R00-program-overview.md`](../R00-program-overview.md) and [`CLAUDE.md`](../../../../CLAUDE.md)
> first. Reuse the existing emote broadcast path and the animation manifest — no new anim system.

## Goal

A circular "dance floor" pad near (but not on) the totem in `/play`: emissive animated tiles +
pulsing lights. Standing on it suggests dance emotes; a "🪩 Dance" button triggers a **synchronized**
dance where everyone on the floor crossfades to the same clip on a shared beat.

## Files

- `src/game/coincommunities.js` — the dance floor mesh/pad, lights, on-floor detection, and
  beat-synced crossfade using the existing animation manager.
- `src/game/coincommunities-ui.js` — the "🪩 Dance" button (shown/enabled when on the floor).
- `src/game/coincommunities.css` — pad/light styling tokens if any DOM overlay is used.
- `multiplayer/src/rooms/WalkRoom.js` — broadcast a `floor:beat` tick every N seconds so all
  clients line up.

## Spec

1. **The pad** — a circular emissive floor with animated tiles and pulsing lights, placed near but
   not overlapping the totem. Lights react/pulse on the beat.
2. **On-floor detection** — when a player stands inside the pad radius, surface dance suggestions
   and enable the "🪩 Dance" button. Leaving returns the avatar to idle.
3. **Synchronized dance** — pressing Dance plays a dance clip; everyone on the floor crossfades to
   the **same** clip aligned to the server `floor:beat` tick so movements line up. Use clips already
   in `public/animations/manifest.json`: `av-dance-shuffle`, `av-rap-dance`, `av-headbang`, `dance`.
4. **Beat tick** — `WalkRoom.js` broadcasts `floor:beat` every N seconds; clients schedule
   crossfades to the beat rather than to local time.
5. **States** — button has hover/active/focus; clear on/off-floor affordance; no jank when several
   players join/leave the floor.

## Definition of done

- Standing on the floor + pressing Dance syncs your avatar with others on the floor on a shared
  beat; lights react; leaving returns you to idle.
- Reuses the existing emote/anim path — no second animation system. Clips lazy-load on first use.
- No console errors/warnings, no leaks. Verified with two clients. Diff self-reviewed per DoD.

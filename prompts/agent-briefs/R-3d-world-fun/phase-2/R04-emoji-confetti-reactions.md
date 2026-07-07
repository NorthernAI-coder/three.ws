# R04 — Emoji & confetti reactions

**Phase 2 (Social playground) · Depends on: nothing (broadcast-only) · Pairs with: R07 (reuses confetti)**

> Read [`../R00-program-overview.md`](../R00-program-overview.md) and [`CLAUDE.md`](../../../../CLAUDE.md)
> first. This is a pure broadcast feature — no object persistence, no schema changes.

## Goal

Add lightweight, snappy broadcast reactions to `/play`: a reaction bar of ~6 emoji, and on use a
floating-rising-fading emoji sprite above the sender's avatar, plus a confetti burst for 🎉.

## Files

- `src/game/coincommunities-ui.js` — extend the emote tray with a reaction bar.
- `src/game/coincommunities.js` — spawn/animate the floating sprite + confetti above an avatar
  (reuse the screen-projection logic in `_updateLabels`).
- `src/game/community-net.js` — add a `sendReaction(emoji)` method.
- `multiplayer/src/rooms/WalkRoom.js` — add a `reaction` broadcast handler with a 500ms cooldown.

## Spec

1. **Reaction bar** — ~6 emoji (🎉😂🔥❤️👏🤔) added to the emote tray in `coincommunities-ui.js`.
   Each button has hover/active/focus states; keyboard and touch reachable; ARIA labels.
2. **Net** — clicking sends a `reaction` over `community-net`. Server `WalkRoom.js` rebroadcasts to
   the room with a **500ms per-client cooldown** (drop, don't queue, over-rate sends).
3. **On receipt** — spawn a floating emoji sprite above the **sender's** avatar that rises and
   fades over ~1.2s, projected to the correct screen position using the same logic as
   `_updateLabels`. For 🎉, also fire a small confetti particle burst.
4. **Performance** — must stay smooth with 10+ simultaneous reactions: pool/dispose sprites and
   particles, no per-frame allocations, no leaks.
5. **States** — designed empty/active states for the bar; disabled/cooldown affordance so users
   aren't confused when a rapid second tap is dropped.

## Definition of done

- Reactions pop above the **right** avatar for everyone, feel instant, and clean up.
- No jank with 10+ at once; no console errors/warnings; no leaks.
- Buttons fully accessible (keyboard + screen-reader labels). Diff self-reviewed per DoD.

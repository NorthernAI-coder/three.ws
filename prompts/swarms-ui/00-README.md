# Swarms UI — game-feel prompt set

Five self-contained prompts that add **game-feel** to the `/swarms` page without
changing the economics. Each file is a complete brief — open it in a **fresh chat**
and run it on its own. They don't depend on each other, but this is a sensible order
(cheapest/highest-impact first):

1. [`01-firing-moment.md`](01-firing-moment.md) — the consensus meter as a tension bar; a real "FIRE" moment when a vote clears threshold.
2. [`02-counting-tiles.md`](02-counting-tiles.md) — count-up + value-change flash on the treasury tiles when ticks/payouts land.
3. [`03-member-standings.md`](03-member-standings.md) — members panel becomes a live scoreboard; winning voters light up.
4. [`04-equity-curve.md`](04-equity-curve.md) — a real equity-curve sparkline + win-rate ring above the tiles.
5. [`05-directory-ladder.md`](05-directory-ladder.md) — the directory becomes a ranked ladder with sort + "hot" markers.

## The shared rails (every prompt restates these — they are non-negotiable)

- **Design tokens only.** All color/space/type come from `/tokens.css` CSS variables. Never hardcode a hex or px where a token exists. Match the existing restrained, Linear/Stripe-grade aesthetic in `src/swarms.css`.
- **Motion signals, never decorates.** No confetti, no sound, no gratuitous shimmer. A single accent ripple, a count-up, a snap — that's the vocabulary. Gate **every** new animation behind `@media (prefers-reduced-motion: reduce)` (the file already does this at `src/swarms.css:234`).
- **No fake data.** Animating a transition between two *real* values (count-up between two real numbers) is fine. Inventing data, fake progress bars, or `setTimeout` fake-loading is forbidden (CLAUDE.md hard rule). Every pixel must trace to a real SSE event or API field.
- **Concurrent agents share this worktree.** Stage explicit paths only, re-check `git status` before committing, never `git add -A`. Don't commit unless the user asks.

## Phase 2 (not in this set)

After these land, the same treatment goes **site-wide** — auditing UX/UI across every
surface (`STRUCTURE.md` maps them) and bringing each to this bar. That's a separate
effort; these five prove the pattern on one page first.

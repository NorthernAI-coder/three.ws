# Swarms UI — members become a live scoreboard

You are working in `/workspaces/three.ws`. On the `/swarms` dashboard, the "Members &
shares" panel lists each member with a share bar, share %, contribution, and a `rep`
number. It reads like a table. But a swarm is a *competition between members* —
reputation is literal vote weight, and on every fired trade some members were on the
winning side of the consensus and some weren't. Turn the list into a standings board
where being a strong, correct member is **visible**.

## What exists today (read these first)

- `src/swarms.js` — `membersHTML(members)` (~line 240) renders each `.sw-row` with `.sw-bar` (share progress) and `rep <n>`. Member fields: `name`, `is_creator`, `share_bps`, `contribution_sol`, `reputation` (0..100), `agent_id`, `status`.
- `src/swarms.css` — `.sw-row`, `.sw-bar` / `.sw-bar > span` (the fill), `.sw-pill` (used for the `creator` tag), `.pos`/`.neg`.
- The SSE `vote` event (in `api/swarms/[id].js` → `streamSwarm`) is **missing the per-member breakdown** today. The DB column `swarm_votes.breakdown` exists as `[{agent_id, name, reputation, long, weight}]` but the stream's SELECT omits it. To light up winning voters you must add `breakdown` to the vote SELECT and the `send('vote', …)` payload.

## Build this

1. **Rank ordinals.** Order members by share (or reputation — pick the one that reads as "standing" and is consistent) and show `#1 / #2 / #3 …`. The top member gets a subtle marker (a small crown/flame glyph or accent ring) — restrained, token-colored, not a trophy emoji dump.
2. **Reputation as a weight badge.** Render `reputation` as a visible vote-weight chip, not a trailing `rep 42`. Make its prominence scale with the value (a stronger member visibly carries more weight). This is the in-product expression of "your track record is your power."
3. **Light up the winning side on a fire.** When a `vote` with `decision === 'fire'` arrives, briefly highlight the member rows whose `breakdown` entry had `long === true` (they were right to push the trade) — a green edge pulse that fades. Requires extending the SSE payload (above). Members who voted against / abstained stay neutral.
4. **Animate share changes.** When a contribution/exit shifts `share_bps`, animate `.sw-bar` width transitions and re-sort with a smooth reorder (FLIP or a simple transform) rather than a hard re-render snap.

## Rails (non-negotiable)

- Tokens only from `/tokens.css`. No hardcoded colors.
- **Gate every animation** behind `@media (prefers-reduced-motion: reduce)` → static final state, correct order, no pulses.
- No fake data: the breakdown highlight must come from the **real** `swarm_votes.breakdown`. Don't guess who voted long. If `breakdown` is empty for a row, light up nothing.
- Keep it legible at 0, 1, and 20+ members — the empty state already exists (`emptyRow`); don't regress it.
- Concurrent agents edit `main`: stage explicit paths only (you'll touch `src/swarms.js`, `src/swarms.css`, and `api/swarms/[id].js`), re-check `git status`, never `git add -A`.

## Definition of done

- `npm run dev`, open a multi-member swarm, watch a real fire — confirm the long-voters light up and the breakdown is real (cross-check against the vote log).
- Contribute/exit (or simulate) and confirm shares animate + reorder without a snap.
- No console errors/warnings. `npm test` passes. If you changed the `/api/swarms/:id` or stream shape, confirm nothing else consuming it broke.
- `data/changelog.json` entry (tag: `improvement`): the members panel is now a live standings board that shows who carried each trade.
- Review your `git diff`. Don't commit unless asked.

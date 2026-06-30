# Swarms UI — the firing moment

You are working in `/workspaces/three.ws`. The `/swarms` page renders a live trading
swarm: a pooled treasury that fires buys when reputation-weighted member consensus
clears a threshold. Today, a consensus vote arrives over SSE and is rendered as a
**quiet new row in a log**. That's the gap. A swarm clearing consensus and firing a
real trade is the single most dramatic event on the page — and the UI lets it pass
silently. Make it land.

## What exists today (read these first)

- `src/swarms.js` — `voteRowHTML(v)` builds each vote row; `subscribeStream(id)` (~line 528) wires the SSE `vote` event: it parses the row, inserts it `afterbegin` into `#sw-votes`, calls `flash()`, and toasts only on `decision === 'fire'`. `flash(el)` (~line 568) is a 1.2s background sweep — the only existing juice.
- `src/swarms.css` — the vote meter is already built: `.sw-meter-track`, `.sw-meter-fill` (gradient bar), `.sw-meter-thresh` (the goal-line tick) at lines ~192–194. `.sw-vote .verdict.fire` is the green "fire" badge.
- The SSE `vote` payload (sent from `api/swarms/[id].js`, `streamSwarm`) carries: `decision` (`'fire'|'skip'`), `mint`, `consensus` (0..1), `min_consensus` (0..1), `conviction`, `members_long`, `members_total`, `smart_money_score`, `size_sol`, `reason`.

## Build this

1. **The meter fills, it doesn't just appear.** When a `vote` row enters, animate `.sw-meter-fill` from 0 → `consensus%` (CSS transition on width). When `consensus >= min_consensus` (a **fire**), the fill should visibly *cross* the `.sw-meter-thresh` line and snap/pulse at it — a brief glow on the threshold tick, the fill shifting to a "hot" success-tinted gradient. A skip fills toward the line and stops short, muted.
2. **The row enters with intent.** Slide + fade the new vote row in from the top (not an instant insert). On a fire, stamp it clearly — the `✓ fire` verdict badge should pulse once.
3. **A restrained whole-card signal on fire only.** When the treasury actually fires, a single accent ripple along the top edge of the dashboard (or the votes panel header) — one pass, then gone. No confetti. This is the "something happened" beat. Skips get nothing beyond the meter.
4. **Keep the toast**, but make it feel connected to the visual (same timing).

## Rails (non-negotiable)

- Tokens only from `/tokens.css` (`--success`, `--wallet-accent`, `--wallet-accent-strong`, spacing/radius vars). No hardcoded colors.
- **Gate every animation** behind `@media (prefers-reduced-motion: reduce)` → reduced-motion users get the final state with no transition (mirror the existing block at `src/swarms.css:234`).
- No fake data: the meter animates to the *real* `consensus` value from the event. Don't invent intermediate numbers.
- Match the existing aesthetic — subtle, fast (`--duration-fast`/`--duration-base`, `--ease-emphasized`). If it looks like a slot machine, you've overshot.
- Concurrent agents edit `main` here: stage explicit paths only, re-check `git status` before any commit, never `git add -A`.

## Definition of done

- `npm run dev` (port 3000), open `/swarms`, open a swarm with live votes (or trigger one), watch a real fire and a real skip. Confirm the meter crosses the line on fire and the row animates in.
- No console errors/warnings. `npm test` still passes (`tests/swarms.test.js`).
- `prefers-reduced-motion` verified (DevTools emulation) — no motion, correct end state.
- Add a `data/changelog.json` entry (tag: `improvement`), holder-readable: the swarm dashboard now shows consensus building and firing live.
- Review your `git diff`. Don't commit unless asked.

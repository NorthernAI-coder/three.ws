# C02 — Activity + Trending + Feed + Community production pass

> Phase C · Depends on: C01 (emits activity) · Parallel-safe: yes
> Run in a fresh chat in `/workspaces/three.ws`. Read [CLAUDE.md](../../CLAUDE.md) first.

## Mission
These are the "the platform is alive" surfaces — live agent actions, what's hot, what your
network is doing, who's building. Vibrant, honest, real-time social proof drives sessions
and word-of-mouth. Make them real-time, accurate, and never look dead.

## Where this lives (real files)
- `src/activity.js` — live feed of autonomous agent actions (Oracle conviction), filterable by tier/mode, with outcomes.
- `src/trending.js` — top agents (by activity) + top Oracle coins (24h/7d/all-time).
- `src/feed.js` — activity from followed people/agents.
- `src/community.js` — featured creators/builds/conversations.
- Backing endpoints under `api/` (verify each exists and returns real data).

## Current state & gaps
- Some of these modules are thin or unverified; data freshness, follow/unfollow persistence, time-window switching (loses scroll), and activity-weighting definitions need to be real and documented.

## Build this
1. **Activity feed:** real-time stream (SSE/poll) of agent actions with outcome tracking; filters by tier/mode; designed empty/error states; reconnect with status; each item links to the agent and (where applicable) the on-chain tx.
2. **Trending:** real ranking with a documented metric; window switches (24h/7d/all) preserve scroll; "updated Xm ago"; empty/loading states.
3. **Feed:** durable follow/unfollow; chronological + (optional) ranked; mute/block; mobile-legible long content.
4. **Community:** real featured content (not hardcoded); curation source documented; links resolve.
5. **Honesty + compliance:** coins shown are records/analytics; $THREE remains the only promoted coin.
6. **A11y + mobile + perf:** keyboard, lazy media, 320px.

## Out of scope
- Oracle/Arm internals (**C01**).

## Definition of done
- [ ] Activity streams in real time with reconnect + outcomes; trending ranks by a documented metric and preserves scroll across windows.
- [ ] Follow/unfollow persists; community shows real featured content; all links resolve.
- [ ] All states designed; no module shows hardcoded/sample data; mobile + a11y verified.
- [ ] `npx vitest run` green; changelog entry; committed + pushed to both remotes.

## Verify
- Watch the activity feed update live; follow an agent and confirm it appears in your feed after reload; switch trending windows without losing place.

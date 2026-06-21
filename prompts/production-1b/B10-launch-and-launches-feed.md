# B10 — Launch-a-coin + launches feed production pass

> Phase B · Depends on: none · Parallel-safe: yes
> Run in a fresh chat in `/workspaces/three.ws`. Read [CLAUDE.md](../../CLAUDE.md) first.

## Mission
Agents launching coins through three.ws — and the public feed of those launches — is both
a revenue surface and a core product loop. The feed is the proof that the platform is alive.
Make launching reliable and the feed beautiful, accurate, and never empty-looking.

## Where this lives (real files)
- `src/launches.js` (~907 lines) — live feed of agent-launched coins; `/api/pump/launches` over `pump_agent_mints`.
- Launch flow: `api/pump/*`, vanity mint (`scripts/pump-vanity-grind.mjs`, vanity grinder), `api/x402/pump-launch.js`.
- `src/pump/three-token-data.js` for shared market data.

## Current state & gaps
- Launches feed has **no empty state**; market data streams after registry rows so cards layout-shift; identicon fallback unclear; marquee built from page 1 (breaks if empty); cursor-light effect won't work on mobile; 60s refresh may prepend stale items.
- The launch flow (vanity mint, deploy, redirect) needs a confirmed-success path with no race.

## Build this
1. **Feed states:** designed empty state ("no launches yet — be the first") and error/loading skeletons; reserve card sizes so streaming market data never shifts layout.
2. **Launch flow:** progress through vanity-mint → deploy → confirm; guarantee the success state links to the live coin (and the in-platform coin world if applicable) with no redirect race; handle failure with a clear retry.
3. **Compliance:** these are platform launch records (allowed per CLAUDE.md's launch-directory exception) — render them as records, never hardcode/recommend any non-$THREE mint; `$THREE` remains the only coin promoted.
4. **Polish:** identicon fallback always renders; marquee handles empty/short pages; disable cursor-light on touch; refresh merges without duplicates or stale prepends.
5. **A11y + mobile + perf:** keyboard-navigable cards, lazy-loaded media, 320px.

## Out of scope
- The pump.fun launcher's generic mint input (leave coin-agnostic per CLAUDE.md).

## Definition of done
- [ ] Feed has empty/error/loading states; zero layout shift on market-data arrival.
- [ ] Launch flow confirms success with a working coin link and no race; failures recover.
- [ ] Compliance respected ($THREE only promoted); marquee/identicon/refresh robust.
- [ ] Mobile + a11y verified; `npx vitest run` green; changelog entry; committed + pushed to both remotes.

## Verify
- Load the feed with zero results (mock) → empty state; launch a coin on a preview and confirm the success link; watch a refresh cycle for shifts/dupes.

# Track C — Surface Completeness

**Goal:** take every page in three.ws to the **screenshot bar** in `00b-the-bar.md` §3.
For each surface, all five states are deliberately designed and reachable — **loading**
(skeletons, not spinners), **empty** (names the surface + offers the next action),
**error** (plain-language cause + real recovery), **populated** (token-consistent, with
microinteractions), **overflow** (0 / 1 / 1000 items, 200-char names, $0 and $10M wallets) —
plus responsive at **320 / 768 / 1440px**, full **a11y** (keyboard, screen-reader labels,
`prefers-reduced-motion`, contrast ≥ WCAG AA), **dead-path elimination** (every button works,
every link goes somewhere), and **design tokens only** (`public/tokens.css` — no hardcoded
colors/spacing/fonts).

This is the **polish pillar** of the $1B thesis: polish is how trust is *communicated*
before it is earned. A surface with an undesigned empty state, a spinner that spins forever,
or a button that does nothing is a trust leak on a platform that asks people to wire wallets
and mint coins. We close every one of those leaks, surface by surface.

> **Not a rewrite.** These pages ship today. Read each before you touch it, reuse its
> existing modules and API calls, and *finish* what's there — its missing states, its broken
> paths, its mobile and a11y gaps. Don't re-architect a working page to add a skeleton.

## The six prompts and the page groups they own

| Prompt | Owns (page group) | Real files (representative) |
|---|---|---|
| **C1** | Creation tools | `pages/forge.html`, `avatar-studio.html`, `agent-studio.html`, `create-agent.html`, `create-character.html`, `create-selfie.html`, `create.html`, `animations.html`, `mocap-studio.html` |
| **C2** | Discover / browse | `pages/trending.html`, `marketplace.html`, `marketplace-analytics.html`, `animations.html`, `agents/index.html`, `worlds.html`, `collection.html`, `constellation.html`, `communities.html`, `galaxy.html`, `directory` (all-pages) |
| **C3** | Launch & trading | `pages/launch.html`, `launchpad.html`, `coin-intel.html`, `trader.html`, `leaderboard.html`, `live.html`, `claim-wallet.html`, `play/arena.html`, `radar.html`, `oracle.html`, `arm.html`, `public/strategy-lab.html`, `watchlist.html`, `activity.html`, `pump-visualizer.html`, `launches.html`, `bulk-launch.html`, `autopilot.html`, `smart-money.html`, `dashboard-next/sniper.html` |
| **C4** | Agent & wallet | `pages/agent-wallet.html`, `dashboard-next/index.html`, `dashboard-next/account.html`, `dashboard-next/agents.html`, `agent-detail.html`, `agent-edit.html`, `agent-economy.html`, `agent-exchange.html`, `agent-trade.html` |
| **C5** | Worlds / clash / social | `pages/clash.html`, `worlds.html`, `city.html`, `club.html`, `community.html`, `communities.html`, `bounties.html`, `bounty.html` |
| **C6** | Learn / chat / pay | `docs/index.html`, `pages/tutorials.html`, `tutorial.html`, `chat/index.html`, `pay/index.html`, `avatar-sdk.html`, `glossary.html`, `what-is.html`, `ar.html` |

## Run order

Prerequisite: **Track A (Reliability)** should be green first — C surfaces render the
error/degradation states that A's boundaries produce. Within Track C the six prompts own
**disjoint page sets**, so they run **fully in parallel** — no ordering between them. Each
extends the shared nav (`public/nav.js` / `public/nav.css`) and tokens (`public/tokens.css`)
but **must not rewrite** them; if a shared token is missing, add it, don't restyle the world.

Each agent stages **explicit paths only** (never `git add -A`), re-checks `git diff --staged`
before committing (the `api/*.js` esbuild-bundle trap in `00-README-orchestration.md` applies),
and **deletes its own prompt file** when done. When this directory holds only `00-README.md`,
Track C is complete.

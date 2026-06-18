# Page Audit — three.ws

A page-by-page audit of every routed surface on three.ws. The goal: find what is
broken, half-wired, mediocre, or missing — and fix it to the bar in
[CLAUDE.md](../../CLAUDE.md). One group doc per section; every page gets a row.

## How pages map to files

A route is resolved in two places:

- **Dev:** the `fileMap` and regex routes in [vite.config.js](../../vite.config.js)
  (`configureServer` → `vercel-rewrites` plugin).
- **Prod:** rewrites in [vercel.json](../../vercel.json).

So `/forge` → `pages/forge.html`, `/discover` → `public/discover/index.html`, etc.
Page logic lives in inline `<script type="module">` blocks or sibling modules in
[src/](../../src) and [public/](../../public). The canonical public inventory is
[data/pages.json](../../data/pages.json).

## Severity scale

| Sev | Meaning |
|---|---|
| **P0** | Broken / violates a hard rule (mock data, fake loading, dead primary CTA, console error, `throw "not implemented"`, references a coin other than $THREE). Fix immediately. |
| **P1** | Reachable but incomplete: an undesigned empty/error/loading state, a dead secondary link, a real-data path that silently fails, missing a state the rubric requires. |
| **P2** | Works but mediocre: weak copy, missing hover/focus states, no keyboard path, inconsistent spacing/tokens, no mobile consideration. |
| **P3** | Opportunity: an adjacent feature that *should* exist, a cross-link that would make the platform feel wired, a polish win. |

## Per-page rubric

Each page is checked against the [Definition of done](../../CLAUDE.md) and:

1. **Loads & wires** — no console errors; primary CTA works; data is real (no
   mock arrays, no `setTimeout` fake progress, no `sample*` fallbacks).
2. **States** — loading (skeleton), empty (actionable), error (recoverable),
   populated, overflow (0 / 1 / 1000 / very-long-name) all designed.
3. **Navigation** — reachable from nav/links; links out are live; no dead ends.
4. **Cross-wiring** — connects to related surfaces (e.g. a coin card links to its
   profile; an agent links to its launches).
5. **Interaction** — hover/active/focus on every control; keyboard reachable;
   ARIA where needed.
6. **Responsive** — sane at 320 / 768 / 1440.
7. **Coin rule** — references only $THREE; no other token in code, copy, or data.

## Group docs

| Doc | Section | Pages |
|---|---|---|
| [01-main.md](01-main.md) | Main entry points | home, discover, gallery, animations, walk, irl, marketplace, collection, skills, community, characters, what-is, sitemap |
| [02-build.md](02-build.md) | Build / create | start, create, create-agent, forge, scene, compose, pose, app, validation, studio, hydrate, voice, scan, import, features/* |
| [03-crypto-trading.md](03-crypto-trading.md) | Trading & intel | oracle, activity, leaderboard, trending, trades, claim-wallet, smart-money, radar, coin-intel, watchlist, pump-dashboard, pump-live, pumpfun, pump-visualizer, constellation, strategy-lab |
| [04-crypto-x402.md](04-crypto-x402.md) | x402 & payments | pay, bazaar, arbitrage, providers, ibm/x402-demo, fact-checker, tutor, unstoppable, shopper, forever, club, agent-exchange, agent-economy, three, three-live |
| [05-crypto-launch-wallets.md](05-crypto-launch-wallets.md) | Launch & wallets | launch, launches, lookup, gmgn, vanity-wallet, eth-vanity, evm-wallet, coin3d, play/arena, play/agent-wallet, avatar-wallet-chat |
| [06-labs-agent-account.md](06-labs-agent-account.md) | Labs / agent tools / account | launchpad, brain, lipsync, playground, labs, chat, agent, agents, my-agents, reputation, login, register, dashboard/* |
| [07-learn-blog-legal.md](07-learn-blog-legal.md) | Docs / blog / legal / machine | docs/*, tutorials/*, status, glossary, support, blog/*, legal/*, machine-readable |

## Master fix list

See [FINDINGS.md](FINDINGS.md) for the consolidated, severity-ranked list of every
issue across all groups, and what was fixed.

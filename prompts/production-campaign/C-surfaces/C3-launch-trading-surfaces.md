# C3 — Launch & trading surfaces to the bar

You are a senior engineer + product thinker building **three.ws**. Read `CLAUDE.md`,
`STRUCTURE.md`, and `prompts/production-campaign/00b-the-bar.md` first. **Prerequisites:**
Track A reliability green (these surfaces show money/RPC/feed states it produces).

## Why this matters for $1B

These are the **money surfaces** — where users launch coins, read intel, follow traders, and
watch live trades. Trust is won or lost here: nobody launches a coin or follows a strategy
through software that 500s on an empty feed, shows a chart with no data and no explanation, or
leaves a "Launch" button that looks live but does nothing. Per the $1B thesis, a platform is
worth $1B when it is **trusted with money** — and trust on a trading surface is communicated
by every state being honest: real prices, real feed status, real "this didn't go through,
your funds are safe" recovery. Polish here is not cosmetic; it's the difference between a
tool people wire wallets to and one they bounce from.

## Surfaces in scope (the real pages)

- **Launch a coin:** `pages/launch.html` → `src/launch*`; detail `pages/launch-detail.html` →
  `src/launch-detail.js`; feed `pages/launches.html` → `src/launches.js`;
  `pages/bulk-launch.html`, `pages/autopilot.html` → `src/autopilot.js`
- **Launchpad studio:** `pages/launchpad.html`; launch-week `pages/three-ws-launch-week.html`
- **Coin intel / oracle / radar:** `pages/coin-intel.html`; `pages/oracle.html` →
  `src/oracle-graph.js`, `src/ibm-oracle.js`; `pages/radar.html` (coin radar)
- **Trader leaderboard / live trades:** `pages/trader.html`; `pages/leaderboard.html`;
  `pages/trades.html`; live feed `pages/live.html`, `pages/three-live.html`,
  `pages/pump-live.html`; `pages/smart-money.html`
- **Sniper arena:** `pages/play/arena.html`; sniper dashboard
  `pages/dashboard-next/sniper.html` (`/dashboard/sniper`) → `api/sniper/*`
- **Strategy lab / watchlist / activity:** `public/strategy-lab.html` (`/strategy-lab`);
  `pages/watchlist.html`; `pages/activity.html`
- **Claim wallet:** `pages/claim-wallet.html`
- **3D visualizer:** `pages/pump-visualizer.html`; `pages/scan.html`; `pages/arm.html` →
  `src/arm.js` (`/oracle/arm`)
- Data sources: `api/coin/*`, `api/sniper/*`, `api/oracle-share`, pump.fun feed, Solana RPC.

## Current state (read before you write)

These surfaces stream real data (pump.fun feed, Solana RPC, `api/coin/*`, `api/sniper/*`).
The gaps to find: **live feeds with no empty/connecting/disconnected state** (a blank list
while a websocket warms, no "reconnecting…" on drop); **charts that render nothing on no-data
without saying so**; **error states that swallow an RPC/feed failure** instead of offering
retry; **launch/claim CTAs whose pending/success/failure states aren't all designed** (this is
the money path — a failed tx must show "did not go through, funds safe"). Audit **overflow**:
a leaderboard of 1000 traders, a $0 and a $10M position, a 200-char coin name, a feed firehose.

## Your mission

### 1. Audit every surface for the five states — money paths included
**Loading** = skeleton rows/charts and honest connection status (no fake tickers). **Empty** =
a quiet, branded empty feed that explains what will appear and how to start (launch, add to
watchlist, follow a trader). **Error** = names the failure (feed down, RPC error, tx rejected)
and offers retry; money actions show an explicit safe-funds recovery state. **Populated** =
token-consistent rows/cards with microinteractions. **Overflow** = pagination/virtualization
for huge leaderboards and feeds, number/name truncation, extreme-value formatting ($0 → $10M).

### 2. Make live feeds honest and reconnecting
Live/trades/sniper streams must show connecting → live → reconnecting states from the **real**
socket/SSE status — never a frozen list that looks live. On drop, auto-retry with a visible
indicator. No `setTimeout` fake ticks.

### 3. Launch & claim CTA state machines
Every launch / bulk-launch / claim button has a full designed state machine wired to the real
API: idle → submitting → on-chain pending → confirmed (with the link) → failed (safe-funds
recovery). No button that looks live but no-ops. Confirm on-chain before claiming success.

### 4. Mobile, a11y, microinteractions
Charts, tables, and the 3D visualizer are usable at **320 / 768 / 1440px** (tables scroll or
reflow; the visualizer lazy-loads Three.js with a skeleton). Tables/feeds are
keyboard-navigable and screen-reader-labelled; live regions use `aria-live="polite"`. Honor
`prefers-reduced-motion`. Hover/active/focus on every control.

### 5. Dead-path elimination + design tokens
Every CTA does something real (launch, follow, add to watchlist, open detail, claim). Replace
hardcoded colors/spacing/fonts with `public/tokens.css` tokens. Wire cross-links: a coin in
the feed → coin-intel; a trader → their leaderboard profile; a launch → its 3D visualizer.

## Definition of done

Clears `00b-the-bar.md` §3 (five states, responsive, a11y), §1 (money paths idempotent with
honest failure states), §2 (lazy 3D, no jank on the feed firehose). Inherits the **global
definition of done** in `00-README-orchestration.md`: real APIs only, `$THREE` the only coin
the platform promotes, tokens only, verified in a browser at `npm run dev` with zero console
errors from your code and real network calls, existing tests pass (money/feed paths covered).
State which bars you cleared and how you verified each.

## Operating rules (override defaults)

No mocks / fake data / placeholders / TODOs / stubs / sample arrays / fake tickers. `$THREE`
(`FeMbDoX7R1Psc4GEcvJdsbNbZA3bfztcyDCatJVJpump`) is the only coin the platform promotes; the
launch directory, coin-intel for a user-supplied mint, and agent launch history render
runtime user-launched mints and are the sole mechanical exception per `CLAUDE.md` — never
hardcode, market, or recommend a non-`$THREE` mint in source or copy. Design tokens only
(`public/tokens.css`). Stage explicit paths only (never `git add -A`); check `head -1` of any
`api/*.js` you touch for the `__defProp` bundle trap. Own **only the pages listed here**;
extend, don't rewrite, the shared nav/tokens.

## When finished

Run `CLAUDE.md`'s five self-review checks. Ship one improvement (e.g. a connection-quality
badge on live feeds, a $0/$10M-safe number formatter shared across tables, or a "copy this
trader's strategy" path into strategy-lab). Append a holder-readable `data/changelog.json`
entry if user-visible (`npm run build:pages` to validate). Then delete this prompt file
(`prompts/production-campaign/C-surfaces/C3-launch-trading-surfaces.md`) and report what you
shipped, which bars you cleared and how you verified them, and any seam for the next agent.

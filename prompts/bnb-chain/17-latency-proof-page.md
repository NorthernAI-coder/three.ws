# 17 — /bnb-latency live block-race proof page

Read `prompts/bnb-chain/00-CONTEXT.md` first, then `/workspaces/three.ws/CLAUDE.md`.
**Prereqs: none** (uses public RPCs; `chains.js` from 01 if present, else inline the public
RPC — but prefer 01's `probeBlockTime`). Standalone, high-shareability.

## Why
A single page that VIEWERS find fascinating and screenshot: a live, honest race showing BNB
Chain confirming blocks at ~0.45s next to Base (2s) and Ethereum (12s). No wallet, no
payment — pure proof of the speed claim, driven by real public RPCs. This is marketing that
is also true (00-CONTEXT verified fact #3).

## Build — `/bnb-latency` page
- Three (or four) live lanes: BNB Chain (56), Base (8453), Ethereum (1), optionally Solana
  (slot cadence via its RPC). Each lane subscribes to new blocks via public RPC and animates a
  tick every time a block lands, with a running measured average interval. Use
  `probeBlockTime` (01) for BNB where possible; other chains via their public RPCs.
- Headline number: BNB Chain's live measured avg (should read ~0.45s), updated continuously.
  Show a rolling sparkline of block intervals per chain.
- Honesty guardrails: label everything "measured live from public RPC", show the last-updated
  timestamp, and DON'T claim 250ms/20k TPS (refuted/roadmap per 00-CONTEXT). Compare only what
  you measure.
- CLAUDE.md UI bar: designed loading (before first blocks arrive), error (RPC down → show the
  others, mark the dead lane), responsive, a11y, tasteful motion (respect
  `prefers-reduced-motion`). Use existing design tokens.

## States
RPC for one chain down → that lane shows "reconnecting", others keep racing. All down →
designed error with retry. First few seconds before enough samples → "measuring…" not a
fake number. Reduced-motion → static bars with numbers.

## Tests
- Pure interval-averaging + sparkline math in `tests/` (feed block timestamps → correct
  rolling average).
- Manual browser exercise: `npm run dev`, open `/bnb-latency`, confirm BNB lane reads ~0.45s
  live and others match expectations; zero console errors. Capture the observed BNB average.

## Definition of done
Inherit 00-CONTEXT DoD (UI items). Additionally:
- [ ] `data/pages.json`: register `/bnb-latency`.
- [ ] `STRUCTURE.md`: add a row.
- [ ] `data/changelog.json`: entry (tag `feature`) — "Live block-speed race: watch BNB Chain confirm in ~0.45s".
- [ ] PROGRESS: paste the live BNB average you observed + a note the page renders cleanly.

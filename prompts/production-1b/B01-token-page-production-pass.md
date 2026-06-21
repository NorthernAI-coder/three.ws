# B01 — $THREE token page production pass

> Phase B · Depends on: A01, A02, A05 (their data enriches it) · Parallel-safe: yes
> Run in a fresh chat in `/workspaces/three.ws`. Read [CLAUDE.md](../../CLAUDE.md) first.

## Mission
`/three-token` is the single most important conversion page on the platform — it's where a
visitor decides to buy and hold $THREE. It must be flawless: live, honest, fast, and
screenshot-worthy. A recent fix made the graduated bonding-curve panel, holders, and the
live DEX trade tape work; this pass takes the whole page to a world-class bar.

## Where this lives (real files)
- `pages/three-token.html` + `src/three-token-page.js` — the page.
- `src/widgets/bonding-curve.js` — graduated/bonding curve widget.
- `src/pump/three-token-data.js` — shared $THREE data store.
- `api/three-token/[action].js` — `/stats`, `/leaderboard`, `/burns`, `/activity`.
- `api/pump/dex-trades.js` — live DEX trade feed (graduated coin).
- `src/swap-jupiter.js` — buy flow.

## Current state & gaps
- Core data now renders, but: loading states are thin; the buyback panel needs A01's real run data + Solscan links; the live tape should reconnect cleanly; mobile polish and microinteractions can go further.
- The "Why hold" pillars should each deep-link to live proof (buybacks, reflections, tiers, economy dashboard from A05).

## Build this
1. **Every state designed:** skeletons for header stats, curve, tape, and buyback panel; recoverable error states with a real retry; empty states that tell the user what's next.
2. **Live integrity:** the DEX trade tape polls/streams reliably with reconnect + "Live/Reconnecting" status; header price/mcap/volume/holders refresh without layout shift; numbers never show `NaN`/`$0` when real data exists.
3. **Proof links:** buyback panel shows real runs (A01) with Solscan links; "Why hold" pillars link to the economy/trust dashboard (A05), reflections, and tiers.
4. **Buy conversion:** prominent, fast buy via `swap-jupiter.js` with tier-aware messaging; copy-CA microinteraction; "you'd be holder #N" social proof from the leaderboard.
5. **Performance & a11y:** lazy-load heavy widgets, debounce, `prefers-reduced-motion` respected; semantic landmarks, ARIA, keyboard, focus rings; perfect at 320/768/1440.
6. **SEO/OG:** accurate title/description, dynamic OG image with live price/mcap.

## Out of scope
- Building buyback/reflection execution (A01/A02) — consume their outputs.

## Definition of done
- [ ] All states designed; no console errors/warnings; no layout shift on data arrival.
- [ ] Live tape reconnects; header refreshes cleanly; buy flow works end-to-end on desktop + mobile.
- [ ] Proof links resolve to live on-chain receipts; "Why hold" pillars all link somewhere real.
- [ ] Lighthouse: a11y ≥95, perf ≥90 on mobile; `npx vitest run` green.
- [ ] Changelog entry; committed + pushed to both remotes.

## Verify
- Exercise the page in a real browser (desktop + 320px); Network tab shows real calls; click every link.

# C03 — Leaderboards + Smart Money + Radar production pass

> Phase C · Depends on: A04 (holder snapshot) for holder board · Parallel-safe: yes
> Run in a fresh chat in `/workspaces/three.ws`. Read [CLAUDE.md](../../CLAUDE.md) first.

## Mission
Provable track records (trader P&L), proven-money signals (smart money), risk intelligence
(radar), and the $THREE holder leaderboard are credibility surfaces — they make the
platform feel like a serious financial product. Make every number defensible and every
board fast and fair.

## Where this lives (real files)
- Trader: `src/leaderboard.js` / `src/kol/*`; on-chain P&L attestation `api/cron/trader-score-attest.js`.
- Walk: `src/walk-leaderboard.js`.
- Holders: `api/three-token/[action].js` `/leaderboard` + `api/_lib/coin/three-holders.js`.
- Smart money: `src/smart-money.js` + `api/cron/smart-money-*`.
- Radar: `src/radar.js` (bundle vs organic, wallet concentration, dev behavior, risk flags).

## Current state & gaps
- Data freshness, pagination for large boards, and methodology docs are inconsistent; P&L/score formulas undocumented; radar risk flags lack explanations + confidence; holder board should exclude treasury/AMM/LP wallets (from A04).

## Build this
1. **Methodology transparency:** document and surface how each metric is computed (P&L realized/unrealized, win rate, conviction, reputation, risk flags) with confidence where relevant — credibility comes from being checkable.
2. **Performance:** paginate/virtualize large boards; "updated Xm ago"; cache with sane TTL; no jank at thousands of rows.
3. **Holder board:** exclude treasury/AMM/LP wallets (flagged in A04); show % of supply, tier, and rank; link wallets to Solscan.
4. **Radar:** every risk flag has a plain-language explanation + confidence; never present as buy/sell advice for any non-$THREE coin (analytics only).
5. **Anti-gaming:** basic cheat detection (e.g. teleport detection on walk, wash-trade hints on trader) noted where feasible.
6. **A11y + mobile:** sortable tables keyboard-operable; legible at 320px.

## Out of scope
- Copy-trading execution (treat as a separate flow if present) beyond linking to it.

## Definition of done
- [ ] Each board documents + surfaces its methodology; large boards paginate without jank.
- [ ] Holder board excludes treasury/AMM/LP and links to Solscan; radar flags explained + confidence.
- [ ] All boards have freshness + all states; mobile + a11y verified.
- [ ] `npx vitest run` green; changelog entry; committed + pushed to both remotes.

## Verify
- Open each board; confirm methodology is visible, holder board excludes the AMM vault, and large boards scroll smoothly.

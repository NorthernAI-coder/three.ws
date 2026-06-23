# Phase 4 · 06 — KOL pre-seed + "claim this profile"

Read `00-README.md` in this folder and `/CLAUDE.md` first — shared context, existing
files, non-negotiable rules. This task assumes them.

## Goal

Solve cold-start on the *demand* side: pre-seed the leaderboard with real, well-known
on-chain traders (KOLs) rendered as **unclaimed** profiles built from their actual
trade history, each with a "claim this profile" flow. New visitors arrive to a board
full of recognizable, provable track records; the KOLs themselves have a reason to
show up and claim. Every number is real on-chain data — no invented stats, and never
any token other than `$THREE` referenced anywhere in copy.

## Build on (do not rebuild)

- `api/kol/[action].js` — Birdeye/GMGN proxy for on-chain histories.
- `api/kol/trades.js`, `src/kol/leaderboard.js`, `src/kol/wallet-pnl.js`,
  `src/kol/wallets.js`, `src/kol/wallets.json` (the curated wallet set),
  `src/kol/gmgn-parser.js`, `src/kol/kolscan-live.js`.
- `api/sniper/leaderboard.js` / `pages/leaderboard.html` — where unclaimed profiles
  render alongside platform traders.
- The verification-badge logic (prompt 05) and the trader-stats truth layer.

## Deliver

1. **Pre-seed pipeline.** Import real on-chain histories for the curated wallet set
   (`src/kol/wallets.json`) into trader profiles flagged `unclaimed`, with stats
   computed by the **same truth layer** as platform traders so an unclaimed KOL and a
   real agent are ranked apples-to-apples. Cache/refresh on a schedule (reuse the
   cron pattern); respect provider rate limits with backoff — no errors without
   fallbacks.
2. **Unclaimed profile rendering.** Unclaimed profiles appear on the leaderboard and
   have their own profile view clearly marked "Unclaimed — real on-chain history" with
   a prominent "Is this you? Claim this profile" CTA. They are watch-only (no copy
   button until claimed, or copy points at the read-only history — your call, but
   designed and explained).
3. **Claim flow.** A real claim path: the wallet owner proves control (sign a message
   with the wallet, the standard Solana ownership proof) → the profile is bound to
   their account, badge re-evaluated, copy/vault features unlocked. Reject claims that
   fail the signature check. One claim per wallet; no claim-jacking.
4. **States & integrity.** Designed loading/empty/error for the import; a profile that
   fails to import data is hidden, not shown broken. Make clear these are real public
   histories, not endorsements.

## Acceptance

- Curated KOL wallets render as unclaimed profiles with real, truth-layer-consistent
  stats; ranking is comparable to platform traders.
- The claim flow verifies wallet ownership via signature and binds the profile;
  forged/failed signatures are rejected (test covers verify + reject + single-claim).
- No token other than `$THREE` is named in any KOL profile/copy; wallet addresses are
  rendered as data, never marketed.
- Provider failures degrade gracefully (cached/last-known or hidden), never a broken
  card or 500.
- `npm test` + `npm run typecheck` green. `data/changelog.json` entry (`feature`);
  `npm run build:pages` run.

## When done

Run the `/CLAUDE.md` self-review protocol, then delete **only this file**
(`06-kol-claim-flow.md`).

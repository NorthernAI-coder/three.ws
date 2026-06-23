# Phase 4 · 08 — Integration QA & polish (run last)

Read `00-README.md` in this folder and `/CLAUDE.md` first. **Run this only after
prompts 01–07 have merged.** This is the pass that proves Phase 4 is a coherent loop,
not seven features in a trench coat.

## Goal

Walk the entire virality loop end-to-end as a real user would, find every seam, and
fix it. The loop must close: a win → a shared card → a referral landing → a new
copier → the new copier's win. If any link in that chain is broken, jank, or
unverifiable, fix it here.

## Walk the loop (exercise in a real browser, mobile + desktop)

1. **Win → card.** Close a real (devnet/paper) trade; confirm it produces a PnL card
   (prompt 01) with real, truth-layer-consistent numbers and a verified badge
   (prompt 05) if eligible.
2. **Card → share.** Share it: native sheet on mobile, copy + X/Telegram intents on
   desktop. Paste the link into a link-preview validator — the OG card renders with
   real numbers and the `?ref=` code is present (prompt 03).
3. **Share → landing → signup.** Follow the link logged out; confirm referral capture
   survives navigation and binds at signup; verify no self-referral / double-credit.
4. **Feed.** Confirm the new follow shows up in the feed (prompt 02) with live/poll
   updates and honest recommendations from real copy data; empty/loading/error states
   all correct.
5. **Copy → activation → reward.** First copy/vault deposit fires activation and
   credits the referrer exactly once (prompt 03), with the activation notification.
6. **Recap & broadcast.** Trigger the Wrapped cron (prompt 04) and the Telegram/X
   broadcaster (prompt 07) in dry-run; confirm idempotency, opt-out, dedup, and that
   only verified/notable events go out — `$THREE` only, everywhere.

## Fix & polish

- **No console errors or warnings** from Phase 4 code on any touched page.
- **Consistency:** badge, card, and CTA styling identical across profile, leaderboard,
  feed, vaults, share routes. One component each, not copies.
- **Every state designed** on every new/changed surface (loading/empty/error/overflow),
  mobile-first, hover/active/focus on all interactive elements, keyboard + ARIA.
- **Coin compliance sweep:** grep the Phase 4 diff for any token reference other than
  `$THREE` (code, copy, cards, bot captions, fixtures) — remove any found.
- **Cross-links:** profile ↔ feed ↔ leaderboard ↔ vaults ↔ share routes all navigate
  naturally; no dead paths, no `?ref=undefined`, no broken OG images.
- **Truth audit:** spot-check that every user-facing number traces to the shared
  trader-stats truth layer / attested rows — no display-only recomputation that can
  drift.

## Acceptance

- The full loop completes in one session on a fresh account, mobile and desktop.
- `npm test` (vitest + playwright) and `npm run typecheck` green; `npm run lint` clean
  on touched files.
- No console errors/warnings; network tab shows real API calls with real data.
- No token other than `$THREE` anywhere in the Phase 4 surface.
- `data/changelog.json` reflects all user-visible Phase 4 changes; `npm run build:pages`
  run and passing. (Optionally run the `completionist` subagent over the Phase 4 diff.)

## When done

Run the `/CLAUDE.md` self-review protocol, then delete **only this file**
(`08-integration-qa-and-polish.md`). Once 01–08 are deleted, only `00-README.md`
remains — Phase 4 is shipped.

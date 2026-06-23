# Phase 4 · 05 — Proven-track-record verification badge

Read `00-README.md` in this folder and `/CLAUDE.md` first — shared context, existing
files, non-negotiable rules. This task assumes them.

## Goal

When a shared card brings a stranger to a profile, the single most important question
is "can I trust this track record?" Ship a **verification badge** that answers it —
gated on attested, on-chain metrics, not self-claims — and surface it everywhere a
trader is represented (profile, leaderboard, feed, share cards, vaults). The badge is
the trust primitive the whole viral loop depends on; it must be impossible to fake.

## Build on (do not rebuild)

- `api/cron/trader-score-attest.js` — existing on-chain attestation of TraderScore.
  The badge is gated on attested values, not raw API reads.
- `api/sniper/leaderboard.js` / `api/sniper/trader.js` — the truth layer that exposes
  `verified`, `win_rate`, `score`, closed-trade count, etc.
- `api/trader-og.js` and share cards (prompt 01); leaderboard/profile/feed surfaces.
- `api/_lib/db.js`, `api/_lib/http.js`; a new migration for any badge state.

## Deliver

1. **Gating rule (explicit, tested).** Define the badge eligibility from attested
   metrics: e.g. min closed trades, min realized PnL, min unique coins traded, and a
   wash-trading ratio below a threshold (self-trades / circular volume). Encode the
   exact thresholds in one place, derived from attested data only. A trader who
   degrades below threshold loses the badge — it is a live status, not a one-time
   stamp.
2. **Badge evaluation.** A function/endpoint that computes badge status for a trader
   from attested rows, with the *reasons* (which criteria pass/fail) so a profile can
   show "3/4 criteria met — needs 2 more closed trades". No badge without attestation.
3. **Surface everywhere.** Render the badge consistently on `pages/trader.html`,
   `pages/leaderboard.html`, the feed (prompt 02), share/OG cards (prompt 01), and
   vault rows. One component/style; tooltip explains what it means and links to the
   criteria.
4. **Anti-gaming.** The wash% / circular-volume check must use real on-chain data and
   be documented inline. Make it auditable: a profile can show the proof (tx
   signatures) behind the verified status.
5. **States.** Verified, eligible-soon (progress shown), not-eligible, and
   attestation-pending all designed.

## Acceptance

- Badge status is computed only from attested metrics; a fixture trader below any
  threshold is correctly denied, and losing eligibility revokes the badge (tests
  cover each criterion boundary + wash% gate).
- The badge renders identically across profile, leaderboard, feed, cards, vaults.
- Tooltip/criteria view explains the gate; verified status links to on-chain proof.
- No self-claimed or unverifiable path to the badge exists.
- `npm test` + `npm run typecheck` green. `data/changelog.json` entry
  (`feature`/`security`); `npm run build:pages` run.

## When done

Run the `/CLAUDE.md` self-review protocol, then delete **only this file**
(`05-verification-badge.md`).

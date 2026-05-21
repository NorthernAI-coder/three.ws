# Pole Club build-out — task prompts

Each file in this directory is a **fully self-contained prompt** for
turning the placeholder rig at [/club](../../pages/club.html) +
[src/club.js](../../src/club.js) into a real authored venue with
distinct dancers, pole choreography, club lighting/audio, server-backed
tip persistence, and per-dancer leaderboards/payouts.

You can hand any one of these to a fresh Claude Code session without
loading anything else from this directory — they restate the rails
from [CLAUDE.md](../../CLAUDE.md) and quote the relevant existing
files.

The high-level vision and integration map lives in
[docs/club/PLAN.md](../../docs/club/PLAN.md).

## Rails every prompt repeats (CLAUDE.md, non-negotiable)

- No mocks, no fake data, no placeholders, no TODOs, no stubs, no
  `throw new Error('not implemented')`, no commented-out code, no
  `setTimeout` fake-loading.
- Real APIs only: x402 paid endpoints, Solana RPC, EVM RPC, Neon
  Postgres, R2.
- Done = code wired, dev server confirms feature in a real browser
  with no console errors, `npm test` green, `git diff` reviewed.
- Push to **both** `threeD` (nirholas/3D-Agent) and `threews`
  (nirholas/three.ws) only when the user explicitly says push.

## The queue

| # | File | Subagents? | Estimate |
|---|---|---|---|
| 01 | [01-venue-glb-and-environment.md](01-venue-glb-and-environment.md) | Yes — Explore for asset/loader conventions | large |
| 02 | [02-dancer-glbs.md](02-dancer-glbs.md) | Yes — Explore for canonical skeleton + Avaturn pipeline | large |
| 03 | [03-pole-rig-and-pole-animations.md](03-pole-rig-and-pole-animations.md) | Yes — Explore for `build-animations.mjs` retarget pass | large |
| 04 | [04-lighting-and-postfx.md](04-lighting-and-postfx.md) | No | medium |
| 05 | [05-audio-and-music.md](05-audio-and-music.md) | No | medium |
| 06 | [06-camera-and-controls.md](06-camera-and-controls.md) | No | medium |
| 07 | [07-tip-feed-realtime.md](07-tip-feed-realtime.md) | Yes — Explore for existing SSE / Neon patterns | medium |
| 08 | [08-leaderboard-and-payouts.md](08-leaderboard-and-payouts.md) | Yes — Explore for payout rails in `api/payments/*` | large |
| 09 | [09-mobile-and-perf.md](09-mobile-and-perf.md) | No | small |
| 10 | [10-e2e-tests-and-verification.md](10-e2e-tests-and-verification.md) | Yes — Explore for existing Playwright setup | medium |

Run order: 01–03 unblock the visual + animation work; 04–06 polish it;
07–08 add server state; 09 keeps it usable on mobile; 10 verifies the
whole thing. Files do not strictly depend on each other — a fresh
session can pick any one and ship it.

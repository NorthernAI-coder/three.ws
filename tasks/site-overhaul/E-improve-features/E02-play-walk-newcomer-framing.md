# E02 — `/play` & `/walk` newcomer framing

**Track:** Improve Features · **Size:** M · **Priority:** P2

## Goal
Give `/play` and `/walk` a newcomer-friendly cold open: explain what's happening, give a first
objective, and remove the crypto-first framing — without dumbing down the experience.

## Why it matters
The audit scored `/play` **2/10** for newcomers: it opens on "COIN COMMUNITIES" with no context,
and a user expecting a game lands in a token-economy sim. `/walk` is clearer but assumes the user
already has an avatar.

## Context
- [pages/play.html](pages/play.html), [pages/walk.html](pages/walk.html).
- Memory: **never tell users they're playing single-player in `/play`** ([play-no-singleplayer-framing]); the $THREE home town + NPC agent commerce are real features to surface, not hide.
- Memory: `/walk` has real Rapier physics + companion; respect those.

## Scope
- `/play`: a brief, skippable intro that explains the world in plain words and gives a first goal; provide a guest/just-explore path before any wallet/coin concept; keep the economy discoverable, not mandatory up front.
- `/walk`: if the user has no avatar, offer a default/sample to walk immediately, with a clear path to create their own.
- Honor the existing framing rules and features; don't strip the depth — gate it behind a gentle intro.

## Definition of done
- A first-timer entering `/play` or `/walk` understands what to do within seconds and can act without first grasping crypto; existing features remain intact.

## Verify
- Fresh session into `/play` and `/walk`; confirm the intro/objective appears, a no-wallet path works, and framing rules are respected.

<!-- AUTO:self-delete-on-complete -->

---

## ✅ On completion — delete this file

This file is a unit of work, not a permanent doc. The moment every item above is **built, wired, verified, and committed** to the "Definition of done" in the repo-root `CLAUDE.md`, remove it in the same change:

```bash
git rm "tasks/site-overhaul/E-improve-features/E02-play-walk-newcomer-framing.md"
```

Stage the deletion alongside your implementation and include it in the completion commit. This directory is the backlog: a file that still exists is unfinished work; a file that is gone has shipped. Do not delete early, and never leave a completed prompt behind.

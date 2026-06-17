# E05 — `/studio` launch panel: integrate the `3ws` mark + plain-language launch

**Track:** Improve Features · **Size:** M · **Priority:** P2 · **Relates to:** `tasks/vanity-3ws/`

## Goal
Make the /studio coin-launch panel both branded (the `3ws` mint mark) and understandable to a
non-crypto creator: explain what launching a coin means and does, in plain words, with the brand
moment as a feature.

## Why it matters
Launching a token is the most jargon-dense action (bonding curve, mint, buyback_bps). It's also a
flagship outcome. The separate `tasks/vanity-3ws/` program adds the `3ws` mark; this task wires
its **UX** into /studio and de-jargons the panel.

## Context
- [public/studio/launch-panel.js](public/studio/launch-panel.js) (state near lines 423–431; `PUMP_BASE_COST`, success `.lp-ok-mint`).
- The `3ws` mark + branded success state are specced in `tasks/vanity-3ws/05-ux-branded-success-state.md` — implement/consume that here for /studio.
- C04 tooltips for residual terms; C07 wallet explainer for the funding step.

## Scope
- Integrate the `3ws`-mark grind + branded success state (per the vanity-3ws UX task) into the /studio launch flow.
- Rewrite the panel's copy in plain language: what a launch is, what it costs (honest SOL estimate), what the user gets, what's optional. Wrap unavoidable terms with tooltips.
- Designed stamping/loading, success (mark emphasized), and error states.

## Definition of done
- /studio launches produce a `3ws…` mint with the branded success state, and a non-crypto creator can understand what the launch does and costs before confirming.

## Verify
- Run a launch in /studio (devnet/test); confirm the `3ws` mark, the branded success UI, and that the copy is comprehensible.

<!-- AUTO:self-delete-on-complete -->

---

## ✅ On completion — delete this file

This file is a unit of work, not a permanent doc. The moment every item above is **built, wired, verified, and committed** to the "Definition of done" in the repo-root `CLAUDE.md`, remove it in the same change:

```bash
git rm "tasks/site-overhaul/E-improve-features/E05-studio-launch-mark-and-clarity.md"
```

Stage the deletion alongside your implementation and include it in the completion commit. This directory is the backlog: a file that still exists is unfinished work; a file that is gone has shipped. Do not delete early, and never leave a completed prompt behind.

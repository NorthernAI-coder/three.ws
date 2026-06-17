# B04 — Shared card / surface / panel system

**Track:** UI Uniformity · **Size:** M · **Priority:** P1 · **Depends on:** B01

## Goal
One set of surface primitives — `.card`, `.panel`, `.surface` (+ elevation/hover variants) —
replacing the per-page bespoke card treatments.

## Why it matters
Cards are everywhere (agents, avatars, marketplace, dashboard, gallery) and each surface rolls
its own radius/shadow/border. The audit found radii ranging 5/10/14px and hardcoded skeleton
colors like `#2a2a3a`. Unifying cards makes the whole site feel like one product.

## Context
- Bespoke cards: marketplace (`.market-*`), home bento (`.h-bento-card--lg`), agent detail (`.ad-card`, hardcoded skeleton colors in [pages/agent-detail.html](pages/agent-detail.html)), pump-dashboard, app-next (the good reference).
- B01 tokens supply surface/stroke/shadow/radius.

## Scope
- Define `.card`/`.panel`/`.surface` with elevation tiers and an optional hover-lift, all token-driven, plus a shared **skeleton** loading treatment (replacing hardcoded `#2a2a3a`/`#3a3a4a`).
- Migrate agent/avatar/marketplace/gallery/dashboard cards to the shared classes; delete the bespoke CSS.
- Ensure cards are responsive (test 320/768/1440) and use the shared spacing scale.

## Definition of done
- Card-heavy surfaces use the shared primitives; skeletons use the shared treatment; radii/shadows are consistent site-wide.

## Verify
- Compare a card on `/discover`, `/marketplace`, and the dashboard side by side — same radius, border, shadow, hover behavior.

<!-- AUTO:self-delete-on-complete -->

---

## ✅ On completion — delete this file

This file is a unit of work, not a permanent doc. The moment every item above is **built, wired, verified, and committed** to the "Definition of done" in the repo-root `CLAUDE.md`, remove it in the same change:

```bash
git rm "tasks/site-overhaul/B-ui-uniformity/B04-shared-card-surface-system.md"
```

Stage the deletion alongside your implementation and include it in the completion commit. This directory is the backlog: a file that still exists is unfinished work; a file that is gone has shipped. Do not delete early, and never leave a completed prompt behind.

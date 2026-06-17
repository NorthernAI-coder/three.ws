# C09 — Dashboard contextual help & first-run onboarding

**Track:** UX for Newcomers · **Size:** M · **Priority:** P2 · **Pairs with:** D05, E06

## Goal
Make the feature-dense dashboard legible to a first-timer: contextual help on each section, a
first-run orientation, and tooltips on every jargon label.

## Why it matters
The audit scored the dashboard **2/10** for newcomers: "dumped into a feature-rich dashboard with
zero contextual help… no tooltips, no 'what is X?', no wizard." It has 30+ tabs.

## Context
- Dashboard: [pages/dashboard-next/index.html](pages/dashboard-next/index.html) and its many sub-pages (agents, avatars, monetize, payments, tokens, portfolio, x402, etc.).
- E06 restructures the dashboard IA; C04 supplies tooltips; D05 may supply the tour engine. Coordinate.

## Scope
- Add a per-section help affordance (a "?" that explains what the section is for, in plain words) to each major dashboard area, especially the crypto-heavy ones (Monetize, Tokens, Portfolio, x402).
- A first-run dashboard orientation (dismissible, resumable) pointing out: where your agents/avatars live, how to create, and which sections are optional/advanced.
- Wrap jargon labels with C04 tooltips. Mark crypto sections "Optional."

## Definition of done
- A new user opening the dashboard gets oriented (first-run), can get plain help on any section, and isn't confronted with unexplained crypto terms.

## Verify
- Fresh account: open the dashboard, confirm the orientation appears, each major section has working help, and jargon is tooltip-explained.

<!-- AUTO:self-delete-on-complete -->

---

## ✅ On completion — delete this file

This file is a unit of work, not a permanent doc. The moment every item above is **built, wired, verified, and committed** to the "Definition of done" in the repo-root `CLAUDE.md`, remove it in the same change:

```bash
git rm "tasks/site-overhaul/C-ux-newcomers/C09-dashboard-contextual-help.md"
```

Stage the deletion alongside your implementation and include it in the completion commit. This directory is the backlog: a file that still exists is unfinished work; a file that is gone has shipped. Do not delete early, and never leave a completed prompt behind.

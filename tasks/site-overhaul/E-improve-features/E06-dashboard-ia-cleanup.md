# E06 — Dashboard information-architecture cleanup

**Track:** Improve Features · **Size:** L · **Priority:** P1 · **Pairs with:** C09, A07

## Goal
Consolidate the dashboard's 30+ flat tabs into a coherent, grouped navigation a normal person can
scan, and reconcile the duplicate dashboard trees.

## Why it matters
The audit: the dashboard is feature-rich but overwhelming (2/10 for newcomers), with 30+ tabs
(agents, avatars, monetize, payments, subscriptions, billing, revenue, withdrawals, earnings,
tokens, x402, mcp, keys, …) and three overlapping implementations.

## Context
- New: [pages/dashboard-next/index.html](pages/dashboard-next/index.html) (+ sub-pages). Legacy: `public/dashboard-classic/`. Plus `pages/dashboard/`. A07 covers the orphan/duplicate reconciliation — coordinate.
- Tokens/components from Track B; help/tooltips from C09.

## Scope
- Group the tabs into a small number of logical sections (e.g. **Build** [agents, avatars, create, library], **Grow** [embed, widgets, analytics, monetize], **Money** [payments, payouts, tokens, x402], **Account** [keys, api, settings]). Collapse the billing/revenue/withdrawals/earnings sprawl into one coherent "Money" area.
- Pick one canonical dashboard implementation; redirect the others.
- Mark advanced/crypto sections clearly; default view favors the common path.
- Preserve every working feature — this is reorganization, not removal.

## Definition of done
- The dashboard presents a grouped, scannable nav with one canonical implementation; every prior feature is still reachable; advanced/crypto areas are labeled.

## Verify
- Enumerate the old tabs and confirm each is reachable in the new IA; the duplicate trees redirect to the canonical one.

<!-- AUTO:self-delete-on-complete -->

---

## ✅ On completion — delete this file

This file is a unit of work, not a permanent doc. The moment every item above is **built, wired, verified, and committed** to the "Definition of done" in the repo-root `CLAUDE.md`, remove it in the same change:

```bash
git rm "tasks/site-overhaul/E-improve-features/E06-dashboard-ia-cleanup.md"
```

Stage the deletion alongside your implementation and include it in the completion commit. This directory is the backlog: a file that still exists is unfinished work; a file that is gone has shipped. Do not delete early, and never leave a completed prompt behind.

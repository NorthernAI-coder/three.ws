# C06 — Designed empty states site-wide

**Track:** UX for Newcomers · **Size:** M · **Priority:** P2 · **Depends on:** B04 (card/surface)

## Goal
Replace bare "No X yet" one-liners with designed empty states that explain *what the thing is,
why it's useful, and the next action* — everywhere a list can be empty.

## Why it matters
`CLAUDE.md`: "Empty state is designed and helpful (tells user what to do, not just 'no data')."
The audit found minimal empty states across dashboard agents/avatars, my-agents, pump dashboard,
club, three-live.

## Context
- Examples to fix: dashboard agents ("No agents yet — create your first one."), avatars, my-agents, pump dashboard ("No custom agents yet — click + New agent."), club tips, three-live ("Listening to the $THREE bonding curve…").
- A shared empty-state component (icon/illustration + title + one-line value + primary CTA + optional "learn more") keeps them consistent.

## Scope
- Build one shared empty-state component (Track B styled). Migrate the listed surfaces to it.
- Each empty state: says what populates here, why it matters in plain words, and a CTA to the action (e.g. "Agents are AI characters you can embed and chat with. [Create your first agent →] [What's an agent?]").
- The `three-live` empty state must be plain ("Live trades will appear here") with the technical detail tucked behind a tooltip.

## Definition of done
- Every listed surface shows a guided empty state via the shared component; no bare "No data" strings remain on user-facing lists.

## Verify
- With a fresh account (no agents/avatars), visit each surface — each explains and guides, not just states emptiness.

<!-- AUTO:self-delete-on-complete -->

---

## ✅ On completion — delete this file

This file is a unit of work, not a permanent doc. The moment every item above is **built, wired, verified, and committed** to the "Definition of done" in the repo-root `CLAUDE.md`, remove it in the same change:

```bash
git rm "tasks/site-overhaul/C-ux-newcomers/C06-designed-empty-states.md"
```

Stage the deletion alongside your implementation and include it in the completion commit. This directory is the backlog: a file that still exists is unfinished work; a file that is gone has shipped. Do not delete early, and never leave a completed prompt behind.

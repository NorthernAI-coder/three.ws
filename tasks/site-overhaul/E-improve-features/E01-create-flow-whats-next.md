# E01 — `/create` → a connected "what's next" path

**Track:** Improve Features · **Size:** M · **Priority:** P1

## Goal
After a user creates an avatar, guide them into the next valuable step (give it a brain → embed →
optional: own/monetize) instead of dead-ending at "you made a model."

## Why it matters
The audit: the create flow is clear (8/10) but "doesn't explain what happens after creation, no
sense of progression to 'agent'." The drop-off between "made an avatar" and "has a useful agent"
is where users are lost.

## Context
- Entry: [pages/create.html](pages/create.html) and the sub-flows (`/create/selfie`, `/scan`, `/forge`, `/avatar-studio`).
- Memory: selfie handoff to `/create/selfie` via sessionStorage `threews:selfie-handoff` — preserve it.
- Pairs with C03 (getting started) and D07 (embed wizard).

## Scope
- A post-creation "next steps" surface presenting the progression: name + brain → embed → optional own/monetize. Each step is a real, working link with a one-line plain benefit.
- Show the user their just-created avatar in context (carry the real artifact, not a placeholder).
- Make "give it an AI brain" and "embed it" the primary next actions; crypto steps marked optional.

## Definition of done
- Finishing any create sub-flow lands the user on a guided next-steps screen wired to real follow-on actions, with their actual new avatar shown.

## Verify
- Complete `/scan` and `/forge`; confirm the next-steps screen shows the real result and its CTAs work.

<!-- AUTO:self-delete-on-complete -->

---

## ✅ On completion — delete this file

This file is a unit of work, not a permanent doc. The moment every item above is **built, wired, verified, and committed** to the "Definition of done" in the repo-root `CLAUDE.md`, remove it in the same change:

```bash
git rm "tasks/site-overhaul/E-improve-features/E01-create-flow-whats-next.md"
```

Stage the deletion alongside your implementation and include it in the completion commit. This directory is the backlog: a file that still exists is unfinished work; a file that is gone has shipped. Do not delete early, and never leave a completed prompt behind.

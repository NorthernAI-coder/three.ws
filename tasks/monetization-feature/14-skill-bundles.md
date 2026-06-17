---
status: not-started
---

# Prompt 14: Skill Bundles

**Status:** Not Started

## Objective
Allow creators to sell multiple skills together as a discounted bundle.

## Explanation
Bundles can increase the average revenue per user. A creator could offer a "Pro Pack" of 3 skills at a lower price than buying them individually.

## Instructions
- [ ] **Create new database tables:**
    - `skill_bundles`: to store bundle details (`id`, `agent_id`, `name`, `price`, `currency_mint`).
    - `bundle_skills`: a join table linking bundles to skills (`bundle_id`, `skill_name`).
- [ ] **Update the creator dashboard.**
    - Add a new section for creating and managing bundles.
    - A creator should be able to create a bundle, give it a name, set a price, and select which of their existing skills to include.
- [ ] **Update the marketplace UI.**
    - Display bundles on the agent detail page.
    - A "Buy Bundle" button should trigger a purchase flow similar to a single skill.
- [ ] **Update the purchase and access logic.**
    - When a bundle is purchased, grant access to *all* skills within that bundle in the `user_skill_access` table.

<!-- AUTO:self-delete-on-complete -->

---

## ✅ On completion — delete this file

This file is a unit of work, not a permanent doc. The moment every item above is **built, wired, verified, and committed** to the "Definition of done" in the repo-root `CLAUDE.md`, remove it in the same change:

```bash
git rm "tasks/monetization-feature/14-skill-bundles.md"
```

Stage the deletion alongside your implementation and include it in the completion commit. This directory is the backlog: a file that still exists is unfinished work; a file that is gone has shipped. Do not delete early, and never leave a completed prompt behind.

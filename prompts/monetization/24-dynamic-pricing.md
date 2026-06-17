---
status: not-started
---

# Prompt 24: Dynamic Pricing

## Objective
Allow creators to set dynamic pricing rules for their skills, for example, based on demand or time.

## Explanation
Dynamic pricing can help creators maximize their revenue. For example, they could offer a discount for the first 100 buyers or increase the price as the skill becomes more popular.

## Instructions
1.  **UI for Pricing Rules:**
    *   In the creator UI, add an advanced section for setting up pricing rules.
    *   Example rules: "First 100 purchases cost X", "Price increases by Y after every Z sales".

2.  **Backend Logic:**
    *   The backend will need a rules engine to calculate the current price of a skill based on these rules and the sales history.
    *   This will be a complex piece of logic that needs to be carefully designed and tested.

<!-- AUTO:self-delete-on-complete -->

---

## ✅ On completion — delete this file

This file is a unit of work, not a permanent doc. The moment every item above is **built, wired, verified, and committed** to the "Definition of done" in the repo-root `CLAUDE.md`, remove it in the same change:

```bash
git rm "prompts/monetization/24-dynamic-pricing.md"
```

Stage the deletion alongside your implementation and include it in the completion commit. This directory is the backlog: a file that still exists is unfinished work; a file that is gone has shipped. Do not delete early, and never leave a completed prompt behind.

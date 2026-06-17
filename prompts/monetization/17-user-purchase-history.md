---
status: not-started
---

# Prompt 17: User Purchase History

## Objective
Create a page where users can see a history of all the skills they have purchased.

## Explanation
A purchase history page provides transparency and allows users to keep track of their spending and owned assets.

## Instructions
1.  **Create a New API Endpoint:**
    *   Develop an endpoint, e.g., `GET /api/users/me/purchases`, that returns a list of all skills purchased by the authenticated user.
    *   This will query the `user_skill_purchases` table.

2.  **Build the Frontend Page:**
    *   Create a new page in the user's profile section.
    *   Fetch the purchase history from the API and display it in a clean and organized table.
    *   Include details like the skill name, agent name, price paid, and transaction date.

<!-- AUTO:self-delete-on-complete -->

---

## ✅ On completion — delete this file

This file is a unit of work, not a permanent doc. The moment every item above is **built, wired, verified, and committed** to the "Definition of done" in the repo-root `CLAUDE.md`, remove it in the same change:

```bash
git rm "prompts/monetization/17-user-purchase-history.md"
```

Stage the deletion alongside your implementation and include it in the completion commit. This directory is the backlog: a file that still exists is unfinished work; a file that is gone has shipped. Do not delete early, and never leave a completed prompt behind.

---
status: not-started
---

# Prompt 22: Gifting Skills

**Status:** Not Started

## Objective
Allow a user to purchase a skill and gift it to another user.

## Explanation
Gifting can be a new acquisition channel. A user might buy a skill for a friend to try out.

## Instructions
- [ ] **Update the purchase flow UI.**
    - Add a "Buy as a Gift" checkbox.
    - If checked, an input field appears for the recipient's username or wallet address.
- [ ] **Modify the purchase API and logic.**
    - The purchase transaction is the same (the buyer pays).
    - However, when the purchase is confirmed, the entry in the `user_skill_access` table should be created for the *recipient*, not the buyer.
- [ ] **Send a notification to the recipient.**
    - After the purchase, send an on-site notification or an email to the recipient informing them that "User X has gifted you the skill Y!"
- [ ] **Update the purchase history.**
    - The buyer's history should indicate that the purchase was a gift and show who it was for.
    - The recipient should also see the gifted skill in their list of owned skills.

<!-- AUTO:self-delete-on-complete -->

---

## ✅ On completion — delete this file

This file is a unit of work, not a permanent doc. The moment every item above is **built, wired, verified, and committed** to the "Definition of done" in the repo-root `CLAUDE.md`, remove it in the same change:

```bash
git rm "tasks/monetization-feature/22-gifting-skills.md"
```

Stage the deletion alongside your implementation and include it in the completion commit. This directory is the backlog: a file that still exists is unfinished work; a file that is gone has shipped. Do not delete early, and never leave a completed prompt behind.

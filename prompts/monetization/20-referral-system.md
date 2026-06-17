# Prompt 20: Referral System

## Objective
Design and implement a referral system where users can earn a percentage of sales by referring new customers to purchase skills or subscriptions.

## Explanation
Referral programs are a powerful growth marketing tool. By rewarding users for bringing in new customers, we can create a viral loop that accelerates platform adoption. This involves generating unique referral codes and tracking their usage.

## Instructions
1.  **Database Schema:**
    *   Add a `referral_code` column to the `users` table, which should be a unique, randomly generated string.
    *   Create a new `referrals` table to track successful referrals. Columns should include `id`, `referrer_user_id`, `new_user_id`, `sale_id`, and `commission_earned`.

2.  **Generate Referral Codes:**
    *   When a user signs up, generate a unique referral code for them and store it in their user record.

3.  **Track Referrals:**
    *   When a new user visits the site via a referral link (e.g., `three.ws/?ref=UNIQUE_CODE`), store the referral code in a cookie or `localStorage`.
    *   When that new user eventually makes their first purchase, the backend should check for the referral code.
    *   If a valid referral code is present, record the referral in the `referrals` table.

4.  **Split Payments for Commission:**
    *   The payment transaction logic from Prompt 19 needs to be updated again.
    *   If a sale is part of a referral, the transaction will now have **three** transfer instructions: one for the creator, one for the platform, and one for the referrer's commission.

5.  **Referral Dashboard UI:**
    *   Create a new section in the user's dashboard where they can find their referral link and track how much commission they have earned.

<!-- AUTO:self-delete-on-complete -->

---

## ✅ On completion — delete this file

This file is a unit of work, not a permanent doc. The moment every item above is **built, wired, verified, and committed** to the "Definition of done" in the repo-root `CLAUDE.md`, remove it in the same change:

```bash
git rm "prompts/monetization/20-referral-system.md"
```

Stage the deletion alongside your implementation and include it in the completion commit. This directory is the backlog: a file that still exists is unfinished work; a file that is gone has shipped. Do not delete early, and never leave a completed prompt behind.

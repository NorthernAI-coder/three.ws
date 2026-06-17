---
status: not-started
---

# Prompt 17: Invoicing and Receipts

**Status:** Not Started

## Objective
Generate a simple invoice or receipt for each purchase and make it accessible to the user.

## Explanation
For accounting and record-keeping, users should be able to get a receipt for their purchases.

## Instructions
- [ ] **After a successful purchase, generate a receipt.** This can be done in the backend.
- [ ] **The receipt should contain:**
    - A unique invoice number.
    - Date of purchase.
    - Buyer and seller (creator) details.
    - A description of the item (e.g., "Skill: text-to-speech for Agent X").
    - The price paid.
    - The transaction signature.
- [ ] **Store the receipt.** You can store it as a JSON object in a new `receipts` table or as a PDF in cloud storage.
- [ ] **Modify the User Purchase History page.**
    - Add a "View Receipt" link or button to each entry in the history table.
- [ ] **Create an API endpoint to fetch a single receipt** (e.g., `GET /api/receipts/:id`).
- [ ] **When a user clicks "View Receipt", display the receipt details** in a clean, printable format.

<!-- AUTO:self-delete-on-complete -->

---

## ✅ On completion — delete this file

This file is a unit of work, not a permanent doc. The moment every item above is **built, wired, verified, and committed** to the "Definition of done" in the repo-root `CLAUDE.md`, remove it in the same change:

```bash
git rm "tasks/monetization-feature/17-invoicing-and-receipts.md"
```

Stage the deletion alongside your implementation and include it in the completion commit. This directory is the backlog: a file that still exists is unfinished work; a file that is gone has shipped. Do not delete early, and never leave a completed prompt behind.

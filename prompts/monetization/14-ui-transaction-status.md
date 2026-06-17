---
status: not-started
---

# Prompt 14: UI for Transaction Status

## Objective
Provide real-time feedback to the user about the status of their purchase transaction.

## Explanation
Blockchain transactions are not instant. To provide a good user experience, the UI should show the user that their transaction is being processed and notify them when it's complete.

## Instructions
1.  **Update the Payment Modal:**
    *   After a transaction is sent, update the payment modal to show a "Processing..." state.
    *   Disable the purchase button to prevent multiple submissions.

2.  **Display Confirmation:**
    *   Once the transaction is confirmed, show a success message in the modal.
    *   Include a link to the transaction on a block explorer like Solscan.

3.  **Handle Errors:**
    *   If the transaction fails, display a clear error message and allow the user to try again.

<!-- AUTO:self-delete-on-complete -->

---

## ✅ On completion — delete this file

This file is a unit of work, not a permanent doc. The moment every item above is **built, wired, verified, and committed** to the "Definition of done" in the repo-root `CLAUDE.md`, remove it in the same change:

```bash
git rm "prompts/monetization/14-ui-transaction-status.md"
```

Stage the deletion alongside your implementation and include it in the completion commit. This directory is the backlog: a file that still exists is unfinished work; a file that is gone has shipped. Do not delete early, and never leave a completed prompt behind.

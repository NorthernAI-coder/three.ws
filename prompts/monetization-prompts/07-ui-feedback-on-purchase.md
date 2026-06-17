---
status: not-started
---

# Prompt 07: UI Feedback for Purchase Flow

## Objective
Provide clear, real-time UI feedback to the user during the entire purchase process (e.g., processing, success, failure).

## Explanation
A good user experience requires keeping the user informed. We will enhance the purchase modal to reflect the current state of the transaction, from initiation to completion.

## Instructions
- [ ] **Enhance the Modal HTML:**
    - [ ] Add elements to the purchase modal to display different states: a loading spinner for processing, a success message/icon, and an error message/icon.

- [ ] **Create a UI State Management Function:**
    - [ ] In `src/marketplace.js`, create a function like `setModalState(state, message)`.
    - [ ] This function will accept states like 'confirm', 'processing', 'success', and 'error'.
    - [ ] Based on the state, it will show/hide the appropriate elements in the modal (e.g., hide confirm/cancel buttons, show spinner).

- [ ] **Integrate State Changes into Purchase Logic:**
    - [ ] Call `setModalState` at key points in the purchase flow:
        - [ ] When the confirm button is first clicked, before sending the transaction: `setModalState('processing')`.
        - [ ] If the transaction is successfully confirmed on the frontend and verified on the backend: `setModalState('success', 'Purchase Complete!')`.
        - [ ] If any step fails (user rejects, transaction fails, backend verification fails): `setModalState('error', 'Something went wrong.')`.

## HTML Example (Enhanced Modal)

<!-- AUTO:self-delete-on-complete -->

---

## ✅ On completion — delete this file

This file is a unit of work, not a permanent doc. The moment every item above is **built, wired, verified, and committed** to the "Definition of done" in the repo-root `CLAUDE.md`, remove it in the same change:

```bash
git rm "prompts/monetization-prompts/07-ui-feedback-on-purchase.md"
```

Stage the deletion alongside your implementation and include it in the completion commit. This directory is the backlog: a file that still exists is unfinished work; a file that is gone has shipped. Do not delete early, and never leave a completed prompt behind.

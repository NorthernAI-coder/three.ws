---
status: not-started
---

# Prompt 25: Fiat On-Ramp Integration

## Objective
Integrate a fiat on-ramp service (like Crossmint or Moonpay) to allow users to purchase skills with a credit card.

## Explanation
To reach the widest possible audience, it's essential to offer a way for non-crypto-native users to participate. A fiat on-ramp will handle the conversion from fiat to the required cryptocurrency, making the process seamless for the user.

## Instructions
1.  **Choose a Provider:**
    *   Research and select a fiat on-ramp provider that offers a good developer experience and supports Solana.

2.  **Integrate their SDK:**
    *   In the frontend, integrate the provider's SDK.
    *   The "Purchase" button would open their widget, where the user can complete the payment with a credit card.

3.  **Webhook for Confirmation:**
    *   The on-ramp service will typically send a webhook to your backend when the crypto transaction is complete.
    *   Your backend will listen for this webhook, verify it, and then unlock the skill for the user.

<!-- AUTO:self-delete-on-complete -->

---

## ✅ On completion — delete this file

This file is a unit of work, not a permanent doc. The moment every item above is **built, wired, verified, and committed** to the "Definition of done" in the repo-root `CLAUDE.md`, remove it in the same change:

```bash
git rm "prompts/monetization/25-fiat-on-ramp-integration.md"
```

Stage the deletion alongside your implementation and include it in the completion commit. This directory is the backlog: a file that still exists is unfinished work; a file that is gone has shipped. Do not delete early, and never leave a completed prompt behind.

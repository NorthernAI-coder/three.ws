---
status: not-started
---

# Prompt 19: Support for Multiple Currencies

**Status:** Not Started

## Objective
Allow creators to set prices in different SPL tokens (e.g., $THREE) and allow buyers to pay in any of them.

## Explanation
To embrace the Solana ecosystem, we should support more than just USDC. This will involve using a DEX like Jupiter to handle currency swaps during the purchase.

## Instructions
- [ ] **Update the Creator Dashboard UI:** The currency dropdown for setting prices should include a list of whitelisted SPL tokens.
- [ ] **Update the Purchase API (`/api/skills/purchase`):**
    - The API should now accept an additional parameter: `payment_mint`, the token the user wants to pay with.
- [ ] **Integrate with Jupiter API:**
    - When a user wants to pay with a non-USDC token for a skill priced in USDC:
        - 1. Use the Jupiter API to get a `swap` transaction that converts the right amount of the user's chosen token into the required amount of USDC.
        - 2. The destination for the USDC should be a temporary account or directly to the creator/platform wallets.
        - 3. **Combine the transactions:** The full transaction sent to the user will include the Jupiter swap *and* the payment transfers. The user signs one transaction that does everything.
- [ ] **Update the Frontend:** The "Buy" button should present the user with a choice of which token to pay with.

<!-- AUTO:self-delete-on-complete -->

---

## ✅ On completion — delete this file

This file is a unit of work, not a permanent doc. The moment every item above is **built, wired, verified, and committed** to the "Definition of done" in the repo-root `CLAUDE.md`, remove it in the same change:

```bash
git rm "tasks/monetization-feature/19-support-for-multiple-currencies.md"
```

Stage the deletion alongside your implementation and include it in the completion commit. This directory is the backlog: a file that still exists is unfinished work; a file that is gone has shipped. Do not delete early, and never leave a completed prompt behind.

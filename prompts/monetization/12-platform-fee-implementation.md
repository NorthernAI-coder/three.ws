---
status: not-started
---

# Prompt 12: Platform Fee Implementation

## Objective
Implement a platform fee on every skill purchase transaction.

## Explanation
To ensure the sustainability of the platform, a small percentage of each sale will be collected as a platform fee. This needs to be calculated and transferred during the payment process.

## Instructions
1.  **Modify the Payment Transaction:**
    *   In `src/marketplace.js`, when constructing the purchase transaction, add a second instruction.
    *   The first instruction will transfer the creator's share of the payment to their wallet.
    *   The second instruction will transfer the platform's fee to the platform's treasury wallet.

2.  **Configuration:**
    *   The platform fee percentage should be configurable and stored in a secure location.

## Code Example (Frontend - `src/marketplace.js`)

```javascript
// Inside the purchase logic
const platformFee = price.amount * 0.05; // 5% fee
const creatorGets = price.amount - platformFee;

const transaction = new solanaWeb3.Transaction()
    .add(
        solanaWeb3.SystemProgram.transfer({
            fromPubkey: user.publicKey,
            toPubkey: new solanaWeb3.PublicKey(creatorWalletAddress),
            lamports: creatorGets,
        })
    )
    .add(
        solanaWeb3.SystemProgram.transfer({
            fromPubkey: user.publicKey,
            toPubkey: new solanaWeb3.PublicKey(platformTreasuryAddress),
            lamports: platformFee,
        })
    );
```

<!-- AUTO:self-delete-on-complete -->

---

## ✅ On completion — delete this file

This file is a unit of work, not a permanent doc. The moment every item above is **built, wired, verified, and committed** to the "Definition of done" in the repo-root `CLAUDE.md`, remove it in the same change:

```bash
git rm "prompts/monetization/12-platform-fee-implementation.md"
```

Stage the deletion alongside your implementation and include it in the completion commit. This directory is the backlog: a file that still exists is unfinished work; a file that is gone has shipped. Do not delete early, and never leave a completed prompt behind.

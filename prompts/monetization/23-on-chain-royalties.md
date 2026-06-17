---
status: not-started
---

# Prompt 23: On-Chain Royalties for Skills

## Objective
Use an NFT-based approach to represent skill ownership, enabling on-chain royalties for creators.

## Explanation
This is a more decentralized and advanced approach to monetization. Each purchased skill could be represented as an NFT in the user's wallet. The NFT's metadata would grant access to the skill, and royalties could be enforced at the smart contract level.

## Instructions
1.  **Smart Contract Development:**
    *   Develop a smart contract (e.g., using Anchor for Solana) that can mint "Skill NFTs".
    *   The contract would handle the logic for purchasing and transferring these NFTs.
    *   Implement the Metaplex protocol for on-chain royalties, so that every time a Skill NFT is resold on a secondary market, the original creator gets a percentage.

2.  **Frontend Integration:**
    *   The frontend would interact with this smart contract instead of a traditional backend API for purchases.

3.  **Access Control:**
    *   The access control middleware would check the user's wallet for the presence of the required Skill NFT.

<!-- AUTO:self-delete-on-complete -->

---

## ✅ On completion — delete this file

This file is a unit of work, not a permanent doc. The moment every item above is **built, wired, verified, and committed** to the "Definition of done" in the repo-root `CLAUDE.md`, remove it in the same change:

```bash
git rm "prompts/monetization/23-on-chain-royalties.md"
```

Stage the deletion alongside your implementation and include it in the completion commit. This directory is the backlog: a file that still exists is unfinished work; a file that is gone has shipped. Do not delete early, and never leave a completed prompt behind.

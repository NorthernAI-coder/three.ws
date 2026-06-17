# Task: Surface ReputationRegistry in Agent Profiles + Directory

## Context

ReputationRegistry is deployed on 15 mainnet + 7 testnet chains and the submission
panel (`src/erc8004/reputation-panel.js`) exists, but the data is **dormant** — no
aggregation into agent profiles, no badge in the `/agents` directory, no read path.
The 3D Agent Card advertises `supportedTrust: ["reputation"]` while the product shows
none of it. This is a half-built feature in the CLAUDE.md sense: the capability
exists but isn't wired so users can see or use it.

## Goal

On-chain reputation (average score + feedback count + stake) is read, aggregated, and
displayed on every on-chain agent's profile and in the directory, and any user can
submit feedback from the profile.

## Files to Read First

- `contracts/src/ReputationRegistry.sol` — `getReputation()` returns `(avgX100, count)`,
  `getFeedbackCount()`, `getTotalStake()`, `submitFeedback()`, `stakeReputation()`
- `src/erc8004/reputation-panel.js` — existing submit UI
- `api/_lib/onchain.js` — server resolver (add reputation read)
- `src/launches.js` and the `/agents` directory renderer — where badges render
- `api/v1/agents/[caip].js` (if present) — agent read API

## What to Build / Do

1. **Add a server read path** in `api/_lib/onchain.js`: given an agent's
   chain + registry + agentId, call `getReputation()` and `getFeedbackCount()` (and
   optionally `getTotalStake()`), divide `avgX100` by 100 client-safe, cache briefly.
   Expose via the existing agent read API so no wallet is needed to display.

2. **Render a reputation badge** on the agent profile: average score (e.g. ★ 4.2),
   feedback count, and stake total if non-zero. Designed states: has-reputation,
   no-feedback-yet ("Be the first to review"), unsupported-chain.

3. **Add reputation to the `/agents` directory cards** and enable **sort by reputation**
   (the CLAUDE.md innovation standard: if the list lacks sorting, add it).

4. **Wire the submit flow** from the profile: the existing `reputation-panel.js`
   `submitFeedback()` → on success, optimistically update the badge and refresh from
   chain. Enforce the contract's rules client-side too (no self-review, score
   -100..+100, one review per reviewer) with clear messaging.

5. **Optional staking entry point** — surface `stakeReputation()` for users who want
   to back an agent, showing the min stake (0.001 ETH) and current total.

## Constraints

- Read path must work without a connected wallet (public RPC read).
- Respect the contract's precision contract: it returns `avgX100`; never round on-chain
  — divide for display only.
- Cache reads (reputation changes slowly) but invalidate after a user submits.
- Handle agents on chains where reputation is unsupported gracefully (hide, don't error).

## Success Criteria

- Every on-chain agent profile shows its real on-chain reputation (or a designed
  empty state).
- The `/agents` directory shows reputation and can sort by it.
- Submitting feedback from a profile writes on-chain and the badge updates.
- Self-review / out-of-range / double-review are blocked with clear UX before the tx.
- No console errors; works without a wallet for read-only viewing.
- Changelog entry (tag: feature).

<!-- AUTO:self-delete-on-complete -->

---

## ✅ On completion — delete this file

This file is a unit of work, not a permanent doc. The moment every item above is **built, wired, verified, and committed** to the "Definition of done" in the repo-root `CLAUDE.md`, remove it in the same change:

```bash
git rm "tasks/onchain-deployment/08-surface-reputation-onchain.md"
```

Stage the deletion alongside your implementation and include it in the completion commit. This directory is the backlog: a file that still exists is unfinished work; a file that is gone has shipped. Do not delete early, and never leave a completed prompt behind.

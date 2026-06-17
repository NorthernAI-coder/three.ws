# Prompt 19: Background Worker for Payout Processing

## Objective
Create a background worker or cron job that processes pending withdrawal requests, executes the on-chain transaction, and updates the payout record.

## Explanation
Sending crypto assets requires a secure, asynchronous process. A withdrawal request should not be processed within a user-facing API call. A background worker will periodically scan for 'requested' payouts, use a secure hot wallet to send the funds, and update the database with the transaction signature and final status.

## Instructions
1.  **Create a Worker File:**
    *   In the `workers/` directory, create a new file, e.g., `payout-processor.js`.

2.  **Implement the Worker Logic:**
    *   **Fetch Pending Payouts:** Write a query to select all records from `creator_payouts` where `status` is `'requested'`.
    *   **Loop and Process:** Iterate through each requested payout.
    *   **Securely Load Hot Wallet:** Load the private key for the platform's treasury/hot wallet from a secure secret manager (e.g., Vercel environment variables). **Never hardcode private keys.**
    *   **Execute Transaction:**
        *   Use the `@solana/web3.js` and `@solana/spl-token` libraries to build and send the SPL token transfer transaction from the hot wallet to the creator's `destination_address`.
        *   Update the payout record's `status` to `'processing'`.
    *   **Handle Confirmation:**
        *   Await confirmation of the transaction.
        *   On success, update the `creator_payouts` record with `status = 'completed'` and the `transaction_id`.
        *   On failure, update the status to `'failed'` and *revert the balance deduction* in a compensating transaction or log for manual review.

3.  **Schedule the Worker:**
    *   Configure this script to run on a schedule. If using Vercel, you can define it as a Cron Job in `vercel.json`.

## Vercel Cron Job Example (`vercel.json`)

```json
{
  "crons": [
    {
      "path": "/api/cron/process-payouts",
      "schedule": "0 * * * *" // Run every hour
    }
  ]
}
```
*(This requires creating an API endpoint that triggers the worker logic)*.

<!-- AUTO:self-delete-on-complete -->

---

## ✅ On completion — delete this file

This file is a unit of work, not a permanent doc. The moment every item above is **built, wired, verified, and committed** to the "Definition of done" in the repo-root `CLAUDE.md`, remove it in the same change:

```bash
git rm "prompts/monetization-prompts/19-worker-payout-processing.md"
```

Stage the deletion alongside your implementation and include it in the completion commit. This directory is the backlog: a file that still exists is unfinished work; a file that is gone has shipped. Do not delete early, and never leave a completed prompt behind.

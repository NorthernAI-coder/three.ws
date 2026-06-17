# Task: Custody safety — withdraw/sweep funds out, spend limits, key & audit hardening

## Context

Agent wallets are **custodial**: the platform generates the Solana keypair, encrypts
it with AES-256-GCM keyed off `JWT_SECRET` (`api/_lib/agent-wallet.js:18,325`), and
can recover it to sign (`:419`). Users will deposit real SOL (task 02) and the
agent will trade (03/04), snipe (05/06), and pay (08) from it. Today there is **no
way for a user to get funds back out**, no per-agent spend ceiling outside the
sniper's internal caps, and custody/audit controls are not surfaced. Taking
custodial deposits with no withdraw path and no spend governance is not
production-acceptable — this task makes custody safe and trustworthy.

## Goal

The owner can withdraw all SOL and any SPL tokens from the agent wallet to an
address they choose; per-agent spend limits govern every outbound path (trade/
snipe/x402); and key handling + a custody audit trail meet a bar you'd defend to a
security reviewer.

## Files to Read First

- `api/_lib/agent-wallet.js:18` (`deriveKey`/`JWT_SECRET`), `:325`
  (`generateSolanaAgentWallet`), `:419` (`recoverSolanaAgentKeypair` + its audit
  logging) — the canonical custody module
- `api/agents/solana-wallet.js:251` — balance + `…/activity`
- `api/_lib/agent-pumpfun.js:26` + `api/_lib/solana/connection.js` — RPC failover
- Task 03's shared guardrail module (`api/_lib/agent-trade-guards.js`) — where
  per-agent spend caps live; this task extends them to cover withdraw + x402
- SPL transfer helpers already used in the repo (e.g. agent-payments-sdk / x402
  Solana payload `api/x402-pay.js:320`) — reuse for token transfers, don't hand-roll
- Audit-log + observability conventions (memory `observability-stack`,
  `recoverSolanaAgentKeypair` audit pattern)

## What to Build / Do

1. **Withdraw / sweep endpoint** — `POST /api/agents/:id/wallet/withdraw`
   (owner-authenticated): transfer a specified amount (or "max") of SOL and/or a
   given SPL mint to a destination address the owner supplies. Build, sign
   (server-side via `recoverSolanaAgentKeypair`), submit, confirm; reserve rent +
   fee headroom on SOL "max"; return the signature + new balances. Idempotent.
2. **Withdraw UI** — the wallet hub's **Withdraw** tab (shell from task 01): pick
   asset (SOL or a held SPL token, from real holdings), enter/scan destination
   (address validation + paste/QR-scan), amount or Max, confirm with a clear
   summary, success (explorer link) + balance refresh. Designed empty (nothing to
   withdraw), error (invalid address, insufficient balance for rent/fees), and
   in-flight states.
3. **Per-agent spend limits** — extend the shared guardrail module so each agent has
   configurable ceilings (daily spend cap, per-transaction max, optional allowlist
   of withdraw destinations) that apply uniformly to trade (03/04), snipe (05/06),
   x402 (08), and withdraw. One policy, enforced everywhere. Surface + edit these in
   the hub (a "limits / safety" section).
4. **Key & secret hardening** — confirm the secret never appears in any API
   response, log, or error (audit `git grep`); decryption only after auth +
   ownership; every recover call audit-logged with reason (extend the existing
   pattern). Document the `JWT_SECRET`-derived custody model and its rotation
   consideration in a `docs/` note (key-rotation requires re-encryption — document
   the procedure even if rotation isn't executed now).
5. **Custody audit trail** — a per-agent, owner-viewable log of sensitive events
   (key recovered + reason, withdraw, limit change, trade/x402 spend) so a user can
   see exactly what their custodial wallet has done. Back it with the existing audit
   logging; surface a readable view in the hub.

## Constraints

- This is the security-critical task — treat every line accordingly. Secrets never
  leave the server, never logged, never in errors. Decrypt only via
  `recoverSolanaAgentKeypair`, only after auth + ownership, always audit-logged.
- Withdraw is owner-only and must validate the destination (valid base58 / on-curve
  Solana address) before signing. Reserve rent + fees so a "max" withdraw can't brick
  the account or fail on fees.
- Real transfers only; honor a simulate flag for tests but default to live submit. No
  fabricated confirmations.
- Spend limits are enforced server-side in the shared module — a client cannot
  bypass them. A limit breach is a structured 4xx with the reason, never a 500.
- Idempotent withdraw (idempotency key) so a retry never double-sends.
- Errors handled at the boundary; never let a withdraw fail silently or leave the
  user unsure whether funds moved — always resolve to a confirmed signature or a
  clear, recoverable error.

## Success Criteria

- `POST /api/agents/:id/wallet/withdraw` moves SOL and an SPL token out to a chosen
  address on devnet, confirmed, with rent/fees reserved on Max; retry with the same
  idempotency key does not double-send.
- The Withdraw tab completes a withdrawal end-to-end with address validation and all
  states designed.
- Per-agent spend limits are enforced across trade/snipe/x402/withdraw from one
  shared policy; breaches return clear 4xx; limits are editable in the hub.
- No secret leaks (`git grep` audit clean); every key recovery is audit-logged with a
  reason; the custody audit trail is viewable by the owner.
- A `docs/` note documents the custody model + rotation procedure.
- `npm run typecheck` + `npm test` clean (new tests cover withdraw, limit
  enforcement, address validation, idempotency). Changelog entry (tag: security).
  Run the **completionist** subagent on changed files.

<!-- AUTO:self-delete-on-complete -->

---

## ✅ On completion — delete this file

This file is a unit of work, not a permanent doc. The moment every item above is **built, wired, verified, and committed** to the "Definition of done" in the repo-root `CLAUDE.md`, remove it in the same change:

```bash
git rm "tasks/agent-wallet-trading/09-custody-withdraw-limits.md"
```

Stage the deletion alongside your implementation and include it in the completion commit. This directory is the backlog: a file that still exists is unfinished work; a file that is gone has shipped. Do not delete early, and never leave a completed prompt behind.

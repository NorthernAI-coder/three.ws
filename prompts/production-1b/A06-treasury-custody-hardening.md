# A06 — Treasury/buyback custody hardening (vault + approval gate + audit)

> Phase A · Depends on: A01, A02 · Parallel-safe: yes
> Run in a fresh chat in `/workspaces/three.ws`. Read [CLAUDE.md](../../CLAUDE.md) first.

## Mission
The buyback and reflections signers are the keys to real money. Today they load from an
env var as a raw secret — a single compromised env leaks the ability to drain the
treasury. Before this economy scales, harden custody so that even a leaked key cannot move
funds without an independent approval, and every signing event is audited.

## Where this lives (real files)
- `api/_lib/token/buyback.js` — `loadBuybackSigner()` / keypair-from-env.
- `api/cron/rewards-distribute.js` — distributor key load.
- `api/_lib/agent-wallet.js`, `api/_lib/avatar-wallet.js` — existing custodial-key decryption patterns to mirror.
- `api/_lib/env.js` — centralized secret access.
- `api/_lib/alerts.js`, `api/_lib/audit.js` (if present) — alerting/audit hooks.

## Current state & gaps
- Signer secret is a base64 env var; no rotation, no HSM/vault, no independent approval, no signing audit trail.
- A compromised deploy env = unilateral spend authority over treasury operations.

## Build this
1. **Vaulted secret:** move signer secrets out of plain env into an encrypted-at-rest path consistent with `agent-wallet.js`/`avatar-wallet.js` (decrypt only in memory at sign time). Document that the raw secret must live in a vault (Vercel encrypted env at minimum; KMS/secrets-manager preferred), never in `.env` committed anywhere.
2. **Approval gate:** require an independent approval before any on-chain spend above a configurable threshold — e.g. a multisig/squads approval address, or a second signer, or a per-run approved-amount record that the cron checks before sending. A leaked single key alone must not be able to spend.
3. **Spend policy:** enforce per-run, daily, and monthly USD ceilings server-side; reject and alert on anything over policy.
4. **Signing audit log:** every buyback/reflection signature writes an audit record (who/what/amount/tx/policy-decision/approver) that is queryable; alert on any spend outside policy.
5. **Rotation runbook:** document how to rotate signer keys without downtime, and how to revoke a compromised key immediately (kill switch env that hard-disables spends).

## Out of scope
- The execution logic itself (A01/A02) — this wraps it in custody controls.

## Definition of done
- [ ] Signer secrets are vaulted/encrypted, decrypted only at sign time; no raw key in plain env or repo.
- [ ] An approval gate + spend ceilings block any spend that lacks approval or exceeds policy, with a test proving a leaked-key-alone spend is rejected.
- [ ] Every signing event is audited and queryable; out-of-policy attempts alert ops.
- [ ] A kill switch hard-disables spends; rotation runbook written in `docs/`.
- [ ] `npx vitest run` green; changelog entry (security tag); committed + pushed to both remotes.

## Verify
- Attempt a spend above the ceiling / without approval → rejected + alert.
- Flip the kill switch → all spends refuse; audit records the refusal.

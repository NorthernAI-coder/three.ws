# 06 — Scoped Session Keys: least-privilege capabilities for autonomous skills

> Read `00-README.md` first. Obey every rule there. Delete this file only when
> fully done + self-improved.

## The problem worth solving

Right now, every skill, strategy, and automated path an agent runs effectively
wields the **full authority** of the custodial wallet — any of them can spend up
to the wallet-wide caps, to anywhere policy allows. That's a fat blast radius: a
single buggy or compromised skill (a sniper strategy, a third-party MCP tool,
an x402 integration) can do anything the wallet can. Least privilege — the
bedrock of serious security — is missing.

## The game-changing feature

Bring **capability-based security** to autonomous agent money: issue **scoped,
time-boxed, independently-revocable session keys** that grant a *specific*
actor a *narrow* slice of authority — "this sniper strategy may spend up to 2
SOL on pump.fun buys for the next 24 hours, and nothing else; this x402
integration may pay up to $5/call to these services only." Each capability is
auditable and killable on its own, so a rogue skill can never exceed the leash
the owner gave it. No agent-wallet platform does per-skill capability scoping.

## What to build (wire all of it, for real)

1. **Capability model.** A session key = a signed, scoped grant referencing the
   agent wallet, with constraints: allowed action type(s) (`trade` / `snipe` /
   `x402` / specific tools), spend ceiling (per-use and aggregate), allowed
   targets (mint allowlist / service allowlist / destination allowlist), and an
   expiry. Store grants in a new table (migration); each has a stable id and a
   revoked flag. Define precisely how a grant authorizes a signature **without**
   handing out the wallet's full key (coordinate with `01` — a session key should
   be expressible as a constrained signing capability, e.g. a derived/delegated
   signer the spend path checks against the grant, never the raw custodial key).
2. **Enforcement in the hot path.** Every autonomous spend must present a valid,
   unexpired, unrevoked capability whose constraints **cover** the action; the
   shared guards (`enforceSpendLimit` / `reserveSpendUsd`) verify the capability
   *in addition to* the wallet-wide policy. Both the capability ceiling and the
   wallet policy must pass — capabilities can only ever *narrow*, never widen.
   No valid capability → the autonomous action is denied (fail safe). Owner-
   initiated withdraw is not a delegated capability and stays governed as today.
3. **Issuance + lifecycle.** Owners (and the agent runtime, within owner-set
   bounds) can mint capabilities; every mint/use/expiry/revoke writes a custody
   event. Aggregate spend per capability is tracked against its ceiling
   (advisory-locked like the daily cap, so concurrent uses can't overspend).
4. **Instant revoke / kill.** One-tap revoke per capability (and "revoke all")
   that takes effect immediately on the next spend check. Revoking must be
   impossible to bypass via a race.
5. **Owner UI.** A "Access" surface in the wallet hub listing live capabilities —
   who holds each (which skill/strategy/integration), what it can do in plain
   language, how much of its budget is used, when it expires — with per-grant
   revoke and a clear "this strategy can spend at most X" readout. Empty state
   explains the model; everything accessible.

## Architecture guidance

- Capability mint/verify/spend-accounting in a new module
  (`api/_lib/wallet-capabilities.js`); pure, unit-testable predicates fed live
  numbers by callers, mirroring the existing guard-predicate style.
- Wire the capability check into the shared guards as an additional gate
  (additive, well-commented — shared hot file; coordinate per `00-README.md`).
- New table for grants + per-grant spend ledger (or reuse `agent_custody_events`
  with a capability id column added via migration — do not reshape it
  destructively). Idempotency + advisory locks for aggregate ceilings.

## Security & correctness

- Capabilities strictly *subtract* authority. A bug must fail toward *less*
  access, never more. No valid capability ⇒ deny.
- Unforgeable + tamper-evident grants; expiry and revocation enforced server-side
  on every use (never client-trusted). Constant-time where relevant.
- A compromised holder of one capability cannot escalate to another's scope or to
  the full wallet. Prove this in tests.

## Testing

- Unit tests: a capability authorizes exactly its scope and nothing adjacent
  (wrong action / over-ceiling / disallowed target / expired / revoked all
  rejected); aggregate-ceiling accounting under concurrency; revoke takes effect
  immediately; capability + wallet policy compose (the tighter wins).
- A real devnet end-to-end: mint a "2 SOL pump.fun buys, 24h" capability, execute
  an in-scope buy (succeeds), attempt an out-of-scope action (rejected), revoke,
  attempt again (rejected).

## Deliverables

Capability model + module, hot-path enforcement composed with the shared guards,
issuance/lifecycle with custody audit, instant revoke, owner "Access" UI, new
migration, tests, changelog (security/feature).

## Before you finish

Then improve it: auto-suggest tight default capabilities when an owner enables a
skill/strategy (so least-privilege is the default, not a chore), and show each
capability's real-time spend against its leash. Verify the devnet scope test in
the browser, review your diff, then **delete this prompt file.**

<!-- AUTO:self-delete-on-complete -->

---

## ✅ On completion — delete this file

This file is a unit of work, not a permanent doc. The moment every item above is **built, wired, verified, and committed** to the "Definition of done" in the repo-root `CLAUDE.md`, remove it in the same change:

```bash
git rm "prompts/wallet-innovation/06-session-keys.md"
```

Stage the deletion alongside your implementation and include it in the completion commit. This directory is the backlog: a file that still exists is unfinished work; a file that is gone has shipped. Do not delete early, and never leave a completed prompt behind.

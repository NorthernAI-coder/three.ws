# Task 11 — Social Recovery & Inheritance (custodial wallets that never die with the owner)

> **Read [00-README-orchestration.md](./00-README-orchestration.md) first** — the
> ownership model, custody rules, tokens, real APIs, hard rules, and the "improve
> then delete this file" close-out. Depends on the Wallet HUD (**task 02**). This
> task touches custodial keys and fund custody directly: read "safe by construction"
> three times. Nothing here may ever expose, log, or leak a secret key.

## Mission

Agent wallets are custodial and funded — so "I lost access" or "the owner is gone"
must not mean funds are lost forever. Build **social recovery + inheritance** for
agent wallets: an owner designates guardians and/or a beneficiary, and through a real,
auditable, threshold-approved process, control of an agent (and its wallet) can be
safely recovered or transferred — without ever copying or exposing a private key.

Why only three.ws: the wallet is bound to an account-owned agent, custody is
server-held and audited, and ownership is a real DB invariant — so recovery can be a
designed, safe product feature instead of a seed-phrase prayer. This is trust
infrastructure that makes people comfortable funding an agent at all.

## What exists (read it before building)

- Ownership invariant: `agent_identities.user_id` is the single owner
  ([api/_lib/auth.js](../../api/_lib/auth.js)). Recovery/inheritance changes **who the
  owner is** — it never moves or exposes the encrypted key
  ([api/_lib/agent-wallet.js](../../api/_lib/agent-wallet.js),
  [api/_lib/secret-box.js](../../api/_lib/secret-box.js) — keys stay AES-256-GCM at
  rest, decrypted only at signing, every decrypt audited).
- Custody trail: `GET /api/agents/:id/solana/custody` — every recovery/transfer event
  must be written here. Spend policy / freeze: `.../solana/limits`. Fork/transfer
  ownership patterns: [api/agents/fork.js](../../api/agents/fork.js).

## How it must work

1. **Designate guardians / beneficiary (owner-only).** The owner picks guardians
   (other real accounts) and/or a beneficiary, and a threshold (e.g. 2-of-3). Persist
   this server-side, validated. Removing/changing guardians is owner-only and audited.
2. **Recovery (owner regains access).** A real, multi-step, threshold-approved flow:
   the requester proves identity, guardians approve out of band, a time-lock /
   challenge window elapses (anti-takeover), and on success **ownership transfers** to
   the recovering account. The key is never exported — `user_id` changes; the encrypted
   secret stays server-side and continues to sign for the new owner.
3. **Inheritance / dead-man's switch.** Optional owner-configured inactivity trigger:
   after a real, owner-set period of no activity and explicit guardian/beneficiary
   confirmation (with notifications and a generous grace + cancel window), control
   passes to the beneficiary. Never auto-trigger without confirmation and a cancel
   path; the owner can always abort by simply being active.
4. **Safety rails everywhere.** Time-locks, notifications to all parties, freeze the
   wallet during a contested recovery, full audit of every step in the custody trail,
   and hard server-side enforcement that only the current owner (or a completed,
   threshold-approved process) can change ownership. No client-only gating on anything
   that changes custody.

## Innovation mandate

- **Custody you can actually trust.** Self-custody usually means "lose the seed, lose
  everything." This is custody with a safety net — guardians, time-locks, inheritance —
  designed like a product, not a recovery email. That's a reason to fund an agent.
- **Guardianship as a social bond.** Being someone's guardian is a real, visible role
  in the graph. Surface it tastefully. The agent can even "speak" its recovery status
  in character (read-only narration of real state).
- **Make the scary parts calm.** Every irreversible step is explained, time-locked,
  cancellable until commit, and reversible by owner activity where possible. The copy
  and pacing are the craft here.
- Invent beyond this where it raises the bar — but every approval, time-lock, and
  transfer is real and audited; never simulate a recovery or fake an approval.

## States & edge cases (all designed)

Recovery requested by an impostor (threshold + time-lock + owner cancel defeats it);
owner returns mid-recovery (instant abort); guardian declines / is unreachable
(threshold logic, honest stall state); dead-man's switch approached while owner is
merely quiet (notify early, easy "I'm here" cancel); beneficiary same as a guardian;
guardian account deleted; contested/duplicate recovery requests (serialize, freeze);
network failure mid-transfer (atomic — ownership either fully transfers or not at
all, never half); attempting any custody change without the completed process
(refused server-side); a wallet with funds mid-recovery (frozen, never drained).

## Definition of done

Per the orchestration README. Plus: an owner can designate guardians/beneficiary with
a threshold; a full recovery completes end-to-end and **transfers ownership** (the
new owner can sign/withdraw; the old cannot) with **no key ever exported**; every step
is in the custody trail; time-locks and cancel paths work; the dead-man's switch
notifies and is cancellable; all custody changes enforced server-side; no console
errors; responsive.

When done: self-review + improvement pass, changelog entry, commit (explicit paths
only, push to **both** remotes if asked), then **delete this file**
(`prompts/agent-wallets/11-social-recovery-inheritance.md`).

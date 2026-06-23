# Task — Token-Approval & Authority Security Scanner

> **Operating bar.** Senior engineer + product thinker building three.ws to beat the best in the
> world. Genuinely innovative, not a clone. No mocks, no fake/sample data, no placeholders, no
> TODO/stubs, no `setTimeout` fake-loading. Wire 100% end-to-end with REAL APIs and real on-chain
> data. The only coin is **$THREE** (`FeMbDoX7R1Psc4GEcvJdsbNbZA3bfztcyDCatJVJpump`); runtime mints
> in generic trade plumbing are the only exception and are never promoted.

## ⛓ Chain protocol — do this as STEP 0, before building

This task is a node in a self-extending chain (see `tasks/trading-frontier/README.md`). Before you
build the feature below:
1. Read all of `tasks/` (every epic) + `tasks/trading-frontier/BACKLOG.md`. Know what exists/planned.
2. Invent **10 genuinely new, non-duplicate feature ideas**, each innovative, grounded in the real
   three.ws codebase (cite real files/APIs/tables), advancing sniping/trading/launching/buying/selling.
3. Write each as a full prompt in `tasks/trading-frontier/next/<slug>.md`, matching this file's
   structure exactly — including this Chain protocol section, so the chain continues.
4. Append one line per new prompt to `BACKLOG.md` after confirming it isn't a duplicate.
5. Only then build YOUR feature to the **production-ready bar** in the epic README, and `git rm`
   this file in the completion commit.

## The invention

The rug/honeypot firewall (next-gen 01) protects the *coin you're about to buy*. Nothing protects
*your own wallet's standing approvals*. An agent that trades constantly accumulates SPL token
**delegates** (an approved spender that can move your tokens) and sits under mints with live
freeze/mint authorities — classic drain and rug vectors. Build a **Wallet Security Scanner**: audit
the agent wallet's token accounts for active delegate approvals, flag tokens whose mint retains
freeze/mint authority, score the wallet's attack surface, and one-click **revoke** any approval —
signed through the same custody guards. A standing self-defense layer for the wallet itself.

## Context (real, verified)

- Token accounts (delegate, owner, mint) come from `getParsedTokenAccountsByOwner` already used in
  `api/agents/solana-wallet.js#handleHoldings` (parsed `info.delegate`, `info.delegatedAmount`).
  Mint authorities come from `getMint` (already imported there: `mintAuthority`, `freezeAuthority`).
- Revoke = an SPL `revoke` (or set-delegate-to-none) instruction signed server-side via
  `recoverSolanaAgentKeypair`; audited in `agent_custody_events`; CSRF + spend-guard pattern from
  the withdraw handler in the same file.
- Hub mount + tokens: `src/agent-wallet-hub/` (registry, tabs, util).

## Goal

A scanner service (`api/_lib/wallet-security.js`) + `/api/agents/:id/solana/security` (GET audit,
POST revoke) that surfaces delegate approvals + authority risk and executes a guarded revoke,
shown as a Security panel in the wallet hub.

## What to build

1. **Approval + authority audit** — enumerate token accounts with a non-null delegate (and the
   delegated amount), and mints that still carry freeze/mint authority; produce a per-risk list and
   a 0–100 wallet attack-surface score with plain-language reasons.
2. **Guarded revoke** — POST executes a CSRF-protected, owner-authenticated `revoke` for selected
   delegates (server-signed), idempotent, audited in `agent_custody_events`; simulate-first preview.
3. **API** — GET returns the audit (risks, score, recommended actions); POST returns revoke
   signatures + the new clean state. Rate-limited.
4. **UI** — a Security panel: attack-surface score header, a list of risky approvals/authorities
   with explanation, and a confirmed Revoke action per item. All states designed (empty = "no risky
   approvals"); accessible; responsive.

## Constraints

- Read-then-act with explicit per-item confirm; never revoke without selection; full custody audit.
- All signing through existing custody guards/CSRF; idempotent; honest failure handling. Real chain only.
- $THREE-only rule; runtime mints are wallet data only.

## Success criteria

- The scanner correctly surfaces real delegate approvals + authority risks and executes a guarded,
  audited revoke that demonstrably clears the approval on-chain.
- Security UI renders all states, accessible + responsive. Production-ready bar met; chain extended.
- Build/typecheck/test clean. Changelog entry (tags: feature, security). Completionist passes.

<!-- AUTO:self-delete-on-complete -->

---

## ✅ On completion — delete this file (after authoring + registering 10 chained prompts)

```bash
git rm "tasks/trading-frontier/next/token-approval-security-scanner.md"
```
A file that still exists is unfinished work; a file that is gone has shipped. Do not delete early.

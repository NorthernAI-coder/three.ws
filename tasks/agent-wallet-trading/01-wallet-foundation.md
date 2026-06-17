# Task: Agent-wallet foundation — `walletReady` invariant, backfill, and wallet hub shell

## Context

Every agent created today gets a real Solana keypair auto-provisioned at creation
(`api/agents.js:258` → `generateSolanaAgentWallet()` in
`api/_lib/agent-wallet.js:325`), encrypted with AES-256-GCM keyed off `JWT_SECRET`
(`:18` `deriveKey`) and stored in `agent_identities.meta.encrypted_solana_secret`
(+ public `meta.solana_address`). The default-agent bootstrap path does the same
(`api/agents.js:150`). The platform can recover the keypair to sign
(`recoverSolanaAgentKeypair`, `:419`).

Two problems block "every avatar has a wallet, guaranteed":

1. **No invariant / no backfill.** Agents created before auto-provision shipped
   (or via any code path that skipped it) may have no `solana_address`. There is
   no migration to backfill them and no single helper that guarantees a wallet
   exists before the wallet UI/trade/x402 paths touch it.
2. **No product home for the wallet.** The balance lives on the owner-only
   agent-detail page; deposit (02), trade (04), sniper (06), x402 (08), and
   withdraw (09) all need one coherent surface to plug into. This task builds that
   shell so the later tasks slot in instead of each inventing their own page.

## Goal

A guaranteed `walletReady` invariant (every agent resolvable to a valid Solana
address, legacy rows backfilled), one reusable server helper that enforces it, and
a single **Agent Wallet hub** UI shell (tabbed: Balance · Deposit · Trade · Snipe ·
Pay · Withdraw) that all later tasks render into. No mocks, no placeholder
balances.

## Files to Read First

- `api/agents.js:140-310` — default-agent bootstrap + `handleCreate`; where wallets
  are generated and where `encrypted_*` secrets are stripped from responses (`:627`)
- `api/_lib/agent-wallet.js` — `generateSolanaAgentWallet` (`:325`),
  `recoverSolanaAgentKeypair` (`:419`), `deriveKey` (`:18`); the canonical
  custodial-key module — reuse it, do not fork
- `api/agents/solana-wallet.js:251` — `GET /api/agents/:id/solana` (balance/activity)
- `src/agent-solana-wallet.js:287,310` — client wallet fetch + 30s poll
- `src/agent-detail.js:1771-1796` — existing owner-gated wallet actions to refactor from
- `api/_lib/migrations/` — migration file naming/format (e.g. the dated
  `20260615020000_agent_sniper.sql`)
- `STRUCTURE.md`, `public/nav-data.js` (`tasks/nav-single-source`), design tokens
  used across `src/` pages

## What to Build / Do

1. **`ensureAgentWallet(agentId, userId)` helper** in `api/_lib/agent-wallet.js`
   (or a thin sibling): idempotently guarantees the agent has a valid
   `meta.solana_address` + `encrypted_solana_secret`, generating + persisting one if
   missing, and returning `{ address, created }`. Every wallet-touching endpoint
   (02/03/08/09) calls this first instead of assuming the field exists. Audit-log
   any lazy provision.
2. **Backfill migration** under `api/_lib/migrations/` that finds
   `agent_identities` rows lacking `meta.solana_address` and provisions them via the
   same code path (run it as a one-shot script invoked by the migration, since key
   generation is JS, not SQL — see how existing migrations pair `.sql` with a runner
   if needed). Idempotent; safe to re-run; logs how many were backfilled.
3. **`walletReady` in the agent API response.** `GET /api/agents/:id` (and the
   list/me endpoints) expose a boolean `walletReady` + the public `solana_address`
   (never the secret — keep the `:627` strip). The UI uses this to decide whether to
   show "preparing wallet…" vs the live hub.
4. **Agent Wallet hub shell.** Build one component/surface (reuse existing design
   tokens, nav from `public/nav-data.js`) with tabs: **Balance · Deposit · Trade ·
   Snipe · Pay · Withdraw**. This task ships **Balance** fully (live SOL + USD est.,
   activity list from `…/solana/activity`, refresh, skeleton loading, empty + error
   states) and renders labelled "coming online" placeholders for the other tabs that
   tasks 02/04/06/08/09 replace. Reachable from the agent profile and the
   create-agent success screen. Owner sees management actions; visitors see a
   read-only public view (balance + deposit only).
5. **Refactor, don't duplicate.** Move the owner-gated wallet logic out of
   `src/agent-detail.js:1771` into the hub so there is one wallet surface, and link
   agent-detail to it.

## Constraints

- Reuse `api/_lib/agent-wallet.js` for all key work — never generate or decrypt keys
  elsewhere. Secrets never leave the server; never log a decrypted key.
- Custodial keys are real funds — treat `ensureAgentWallet` and the backfill as
  security-sensitive: audit-log, no secret in responses, no secret in error messages.
- Real balances only (live RPC via `api/_lib/agent-pumpfun.js:26` failover). No
  hardcoded or sample balances. Handle RPC failure as a designed "balance
  unavailable, retry" state — never a blank or a thrown error.
- Mobile-responsive (320/768/1440), keyboard-navigable tabs, ARIA, focus rings.

## Success Criteria

- A SQL/script backfill leaves zero `agent_identities` rows without a valid
  `solana_address`; re-running it is a no-op.
- `ensureAgentWallet` is the single entry point used by tasks 02/03/08/09 (grep
  shows no other provisioning call site).
- The Agent Wallet hub renders for owner and visitor, with the Balance tab fully
  designed (loading/empty/error/populated) and live data; other tabs show honest
  placeholders.
- `walletReady` + `solana_address` present in agent API responses; no secret leaks
  (`git grep` for `encrypted_solana_secret` in any response path returns only the
  strip).
- `npm run dev`: hub loads with zero console errors/warnings; real RPC calls in the
  Network tab. `npm run typecheck` + `npm test` clean.
- Changelog entry (tag: feature). Run the **completionist** subagent on changed files.

<!-- AUTO:self-delete-on-complete -->

---

## ✅ On completion — delete this file

This file is a unit of work, not a permanent doc. The moment every item above is **built, wired, verified, and committed** to the "Definition of done" in the repo-root `CLAUDE.md`, remove it in the same change:

```bash
git rm "tasks/agent-wallet-trading/01-wallet-foundation.md"
```

Stage the deletion alongside your implementation and include it in the completion commit. This directory is the backlog: a file that still exists is unfinished work; a file that is gone has shipped. Do not delete early, and never leave a completed prompt behind.

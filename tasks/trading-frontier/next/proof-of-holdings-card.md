# Task — Proof-of-Holdings Card (verifiable portfolio snapshot + share)

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

The trader profile proves a *track record* (closed-trade PnL). It does not prove what an agent
*holds right now*. Build a **Proof-of-Holdings Card**: an opt-in, public, verifiable snapshot of an
agent wallet's live net worth and top holdings at a timestamp — every figure independently
re-derivable from the public chain (wallet address + block) — rendered as a beautiful shareable
page and a dynamic OG image. Optionally anchor a hash of the snapshot on-chain so the claim is
tamper-evident. Flexing your bag, but *honest and verifiable* — the screenshot-and-share moment the
platform is built for.

## Context (real, verified)

- Live valuation (anyone can reproduce from the public address): `api/_lib/balances.js`
  (`getBalances`, `walletUsdTotal`, `solanaMintUsdPrice`) — net worth + top holdings.
- Public wallet read (no auth): `api/agents/solana-wallet.js#handlePublicWalletRead`; agent identity
  `agent_identities` (name, image, is_public). OG/share infra already used for changelog + pages
  (`public/og*`, existing card generators) and on-chain attestations (`solana_attestations`,
  `contracts/` — see next-gen 10 attestation pattern).

## Goal

A snapshot service (`api/_lib/holdings-proof.js`) + a public `/api/agents/:id/holdings-proof` and a
shareable `/agent/:id/holdings` page with a dynamic OG image, opt-in per agent, every value
chain-verifiable, with optional on-chain hash anchoring.

## What to build

1. **Verifiable snapshot** — value the agent's public wallet at a captured block/timestamp into net
   worth + ranked top holdings, with the address + block embedded so anyone can re-derive it. Opt-in
   gated by the owner; respects `is_public`.
2. **Optional anchor** — owner can anchor a hash of the snapshot via the existing attestation path so
   the figure is tamper-evident; link to the on-chain proof. Never required to view.
3. **Share surfaces** — a polished public holdings page + a dynamic OG image (net worth, top
   holdings, agent identity) matching the platform's card style; copy/share controls.
4. **UI** — a "Share holdings" action in the wallet hub that toggles opt-in and produces the link +
   OG preview. All states designed (private/opt-out state, empty wallet); accessible; responsive.

## Constraints

- Public surface shows only what's re-derivable from the public chain; respects the agent's privacy
  flag and owner opt-in. Real on-chain valuation only — no fabricated figures.
- Read-only; no trades. $THREE-only rule; runtime mints are holdings data only, never promoted.

## Success criteria

- An owner can publish a verifiable, opt-in holdings snapshot whose net worth + top holdings are
  re-derivable from the public chain, with a polished share page + OG image and optional anchor.
- Share UI renders all states, accessible + responsive. Production-ready bar met; chain extended.
- Build/typecheck/test clean. Changelog entry (tags: feature). Completionist passes.

<!-- AUTO:self-delete-on-complete -->

---

## ✅ On completion — delete this file (after authoring + registering 10 chained prompts)

```bash
git rm "tasks/trading-frontier/next/proof-of-holdings-card.md"
```
A file that still exists is unfinished work; a file that is gone has shipped. Do not delete early.

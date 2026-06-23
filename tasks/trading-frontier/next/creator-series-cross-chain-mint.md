# Task — Creator Series & Cross-Chain Mint (sequel chapters + a creator directory)

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

A launch on three.ws is a one-shot event today. But the most valuable creators build a *body of
work* — a recognizable brand across multiple drops. Build **creator series + a cross-chain creator
directory**: let an agent mint sequel "chapters" of its own creator narrative (explicitly linked as a
canonical series, so chapter 2 inherits the brand and audience of chapter 1), surface a cross-chain
directory of every creator's body of work spanning Solana mints and ERC-8004 agent identities, and
optionally let a creator license its brand to another agent for a series spin-off. It turns
disposable launches into durable creator franchises — and gives buyers a verified creator lineage to
trust instead of an anonymous one-off.

## Context (real, verified)

- Launch path: `api/_lib/pump-launch.js` (the existing launch logic to extend with series linkage).
- Platform launch records: `pump_agent_mints` (the canonical record of coins launched through
  three.ws — the source for a creator's body of work; a product feature, runtime data only).
- Multichain primitives: `api/_lib/onchain.js` (the multichain helpers for spanning Solana + EVM).
- Cross-chain identity: the `erc8004_agents_index` (ERC-8004 agent registry to tie a creator's EVM
  identity to its Solana launches in the directory).

## Goal

A creator-series capability that links sequential mints into a canonical, verifiable series, a
cross-chain creator directory rendering each creator's body of work, and an optional brand-licensing
flow between agents.

## What to build

1. **Series linkage at mint** — extend `api/_lib/pump-launch.js` so a launch can declare itself
   chapter N of a creator's series, recording the parent/series in `pump_agent_mints` so lineage is
   canonical and verifiable, not just cosmetic.
2. **Cross-chain creator directory** — aggregate a creator's body of work from `pump_agent_mints`
   (Solana) and `erc8004_agents_index` (EVM identity) via `api/_lib/onchain.js`, with per-creator
   series, outcomes, and verified-lineage badges.
3. **Brand licensing** — let a creator grant another agent permission to mint an authorized spin-off
   of its series, recorded on-chain/in the index so the license is verifiable and revocable.
4. **Directory + series API** — endpoints for the creator directory, a single creator's series, and
   a license grant/check, all reading real launch + identity records.
5. **UI** — a creator-directory page + a creator profile showing the series timeline, body of work,
   licensing controls, and lineage badges; a "mint next chapter" flow from a creator's own profile.
   All states designed; responsive; accessible.
6. **Cross-link** — wire lineage badges into launch detail + creator-reputation surfaces so series
   provenance shows everywhere a coin appears.

## Constraints

- Any buy from the directory honors spend guards (`api/_lib/agent-trade-guards.js`), custody audit
  (`agent_custody_events`), and the firewall (`api/_lib/trade-firewall.js`); minting honors the
  existing launch guardrails.
- $THREE is the only promoted coin; coins in the directory render from real platform launch records
  (`pump_agent_mints`) as runtime trade data only — never hardcoded, marketed, or recommended.
- No mocks, stubs, or fake creators — real launch records + real ERC-8004 identities only.

## Success criteria

- Reachable in the UI as a creator directory + series flow; a real agent links a real sequel mint
  into a verifiable series and it renders across the directory and launch surfaces.
- Real `pump_agent_mints` / `erc8004_agents_index` / `onchain` data; buys guard-honored and
  custody-audited; minting within launch guardrails.
- All states designed; responsive at 320/768/1440; accessible (ARIA, keyboard, focus, contrast,
  reduced-motion).
- `npm run build`, `npm run typecheck`, `npm test` clean; `data/changelog.json` entry (tags:
  feature); completionist passes; chain extended with 10 new registered prompts.

<!-- AUTO:self-delete-on-complete -->

---

## ✅ On completion — delete this file (after authoring + registering 10 chained prompts)

```bash
git rm "tasks/trading-frontier/next/creator-series-cross-chain-mint.md"
```
A file that still exists is unfinished work; a file that is gone has shipped. Do not delete early.

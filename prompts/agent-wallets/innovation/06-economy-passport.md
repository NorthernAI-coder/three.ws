# Task 06 — Economy Passport: the agent's shareable, verifiable money identity

> Read [00-README-innovation.md](./00-README-innovation.md) first. This aggregates real
> data from the wallet, lineage, royalties, paywalls, and on-chain identity into one
> shareable artifact. Consume those systems; don't duplicate their logic.

## The screenshot moment

Every agent has a gorgeous, public **Economy Passport** — a single card/page that proves,
at a glance and on-chain, what this agent has done with money: lifetime earned, tips
received, supporters, vanity address + rarity, fork lineage and royalties, trade record,
trust/reputation, and a verified "since" date. People paste it in Discord and Twitter; it
renders a stunning OG image; and anyone can click "verify" to check the claims against the
chain themselves. It becomes the agent's résumé and the platform's best growth loop.

## What you're inventing

A portable, **verifiable** economic identity for an agent — the first "credit + reputation
+ lineage passport" for autonomous agents. Not a vanity stat block: every number is
sourced from real records and independently checkable on-chain.

## Build it

**Aggregation (real, cached, honest)**
- `api/agents/:id/passport` (public, anonymous-safe, cached): assemble from real sources —
  balances/holdings (`…/solana`, `…/solana/holdings`), lifetime earned + tips
  (`agent_revenue_events`, activity, `x402_receipts`, `agent_unlocks`), supporters (task
  05), vanity + rarity (task 03), lineage + royalties paid/earned (task 02,
  `agent_lineage_payouts`), trade record (`…/solana/trade-history`), reputation/ERC-8004
  (`src/erc8004/*`, `…/reputation`), and `created_at`. Degrade gracefully if a subsystem
  isn't present yet (omit the section, never fake it).
- Every headline stat carries a **proof handle**: the address, the signatures, or the
  registry id behind it, so "verify" is real.

**The passport surface**
- A beautiful, responsive `/agent/:id/passport` page + an embeddable card component
  (reuse the chip's tokens/formatters). Sections animate in, every state designed. A
  "Verify on-chain" action opens the real Solscan/registry proofs. Owner sees a private
  extra layer (limits, custody summary) that visitors don't.
- **Share:** extend the OG image endpoint (`/api/og/agent`) with a passport variant that
  renders the real headline stats into a striking 1200×630 image, plus copy-link and
  one-tap share. This is the artifact that travels.

**Embed & API**
- A tiny embeddable badge (`<script>` / iframe, like the existing avatar embeds) so
  creators can drop their agent's live passport on any site — real data, auto-refreshing.

## Innovate further
- **Comparisons & ranks:** "top 1% by tips this month", percentile vs peers — real,
  computed, surfaced on discovery. Makes the passport competitive and sticky.
- **Time-travel:** a real sparkline of earnings/balance over time from historical activity
  (no fabricated points — only what the chain/records show).

## Guardrails
- Public passport exposes only public-safe data (never secrets, never private limits to
  non-owners). Cached but never stale-misleading (show "as of" timestamp). Every claim
  must be independently verifiable — if you can't prove it, don't print it. $THREE only.

## Definition of done
Per the README checklist. Prove live: open a real agent's passport, confirm every stat
traces to a real source you can verify on-chain, generate the OG share image, embed the
badge on a test page and see it pull real data. Add your improvement, summarize, then
delete this file (`prompts/agent-wallets/innovation/06-economy-passport.md`).

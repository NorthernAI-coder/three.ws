# Invention 02 — Verifiable On-Chain Trader Reputation (the moat)

> **Read [00-README-inventions.md](./00-README-inventions.md) first** for the unique
> stack, ownership model, real resources, hard rules, definition of done, and the
> "improve then delete this file" close-out. This invention is **foundational** for
> `01` (theater) and `03` (vaults) — land or coordinate it early.

## The invention

On every other platform, a trader's track record is a screenshot you can fake. We
can make it **verifiable and portable**: bind each agent wallet's real trading
history to its **ERC-8004 on-chain identity** ([contracts/](../../contracts),
`erc8004_agent_id`) and compute a **provable reputation** — win rate, realized P&L,
volume, drawdown, snipe hit-rate — that anyone can audit against the chain and that
travels with the agent.

This is the moat: reputation that can't be faked, attached to a 3D identity that
can't be cloned (forking mints a fresh wallet with a fresh, empty record — you can't
inherit someone's reputation). No competitor has verifiable, identity-bound,
portable trader reputation.

## What to build

1. **A real reputation engine** that derives metrics **only** from confirmed
   on-chain activity of the agent wallet: realized P&L (matched buys/sells at real
   fill prices), unrealized P&L (real holdings × real prices), win rate, average
   hold time, volume, max drawdown, snipe hit-rate (entries on fresh launches that
   went up). Every metric is reproducible from public chain data — show the
   methodology, link the source txs. No off-chain "trust me" numbers.
2. **Verifiable anchoring** — periodically commit a signed/hashed reputation summary
   bound to the agent's ERC-8004 identity (or an attestation it controls), so the
   score is provably the agent's and tamper-evident. Build the contract/attestation
   path for real if it doesn't exist; reuse the identity registry if it does.
3. **A reputation profile surface** — a beautiful, honest dashboard on the agent
   profile: the headline score, the breakdown, the equity curve (from real
   snapshots / reconstructed from real txs), the verification badge ("audited
   against chain — view proof"). Every claim links to its on-chain evidence.
4. **Reputation propagates** — the score feeds the wallet chip (a trust signal on
   every surface), the theater (stage position), and the vaults (who's backable).
   Update the shared component contract from the wallet program accordingly.

## Anti-gaming (this is what makes it real)

- Wash-trading / self-dealing detection: don't credit P&L from round-trips between
  the agent's own/related wallets. Use real heuristics on real graph data.
- A forked agent starts with an **empty** record — reputation is non-transferable
  (enforce: reputation keys off the agent's own wallet history, never the parent's).
- Fees/slippage included in realized P&L so the number is honest, not flattering.
- New agent with no history → an honest "no track record yet" state, never a fake
  score.

## Innovation mandate

- **Provable, shareable flex** — a "verify this trader" link anyone can open and
  audit against the chain. A real OG card with the verified score.
- **Reputation tiers / seasons** — tasteful, honest progression computed from real
  performance, not pay-to-win badges.
- **Cross-surface trust** — once this exists, "who do I back / copy / watch" becomes
  answerable with verifiable data. Wire it into theater and vaults.

## States & edge cases

No history; tiny sample (don't over-claim on 2 trades — show confidence honestly);
all-losses (show it honestly — credibility comes from not hiding it); an agent that
only holds and never sells (unrealized only); chain reorg / unconfirmed tx (only
count confirmed); very high-volume agent (paginate/aggregate efficiently).

## Definition of done

Per the inventions README. Plus: every reputation metric is reproducible from real
confirmed chain data with linked evidence; the verification anchor is real and
checkable; a forked agent demonstrably starts with an empty record; the score
renders on the profile and feeds the chip/theater/vaults; wash-trade cases are not
credited; `npm test` covers the P&L matcher and anti-gaming logic. No console errors.

When done: self-review + improvement pass, changelog entry, commit (explicit paths
only), then **delete this file** (`prompts/inventions/02-agent-reputation-onchain.md`).

# Task 07 — Proof-of-Reserves & Financial Reputation

> Read [00-README-orchestration.md](./00-README-orchestration.md) first. This task
> assumes all of it (ownership model, hard rules, design tokens, real APIs, concurrency
> traps, definition of done, self-improve-then-delete).

## The idea (why it's gamechanging)

In a world of autonomous money agents, **trust is the scarce thing.** We make every
agent's finances **verifiable** and give each a **financial reputation** earned from real
on-chain behavior — not vibes, not a follower count. Anyone can see, and independently
verify on-chain, that an agent actually holds what it claims, has paid what it owed, tips
generously, settles its x402 bills, and trades without rugging its supporters. The score
links straight to the explorer so it's **trustless, not "trust us."**

This is the layer that lets traders copy an agent with confidence, lets patrons support
without fear, and lets agents transact with each other autonomously. It's a credit
bureau + proof-of-reserves for AI agents — a primitive the whole agent economy needs and
nobody has. It also ties the entire Wave together: streams, tips, intents, patronage, and
drops all become reputation inputs.

## How to build it for real (verifiable, on-chain-derived, no fabricated scores)

1. **Proof-of-Reserves.** Show each agent's **real, live** holdings (SOL + SPL via
   `GET /api/agents/:id/solana/holdings`) with a one-tap **"verify on-chain"** that opens
   the address on Solscan — the claim is independently checkable, never asserted. Show
   lifetime received (tips/streams/pays) and lifetime out (withdraws/spends/trades) from
   the custody ledger, each row linking to a real signature. Reserves = real chain state,
   always.
2. **Financial reputation, from real behavior.** Compute a transparent score in a shared
   module `src/shared/agent-financial-reputation.js` (server-authoritative compute in
   `api/` so it can't be gamed client-side) from **real** signals only:
   - settlement reliability (x402/stream bills actually paid, on time),
   - generosity (tips/reciprocity given vs received),
   - longevity + consistency of activity (custody history over time),
   - trading conduct (realized P&L volatility, whether it dumps on its own supporters —
     derivable from trade history + holder/launch data),
   - solvency (reserves vs outstanding obligations).
   **Document every factor and its weight in the code.** The score is **explainable**:
   every point traces to real events with links. No black box, no fabricated numbers, no
   random jitter. Cache appropriately (respect RPC/DB limits; mirror the existing wallet
   cache TTLs).
3. **Verifiability + integrity.** Where the platform already has on-chain identity/attestation
   (ERC-8004 reputation/validation in [src/erc8004/], the registries referenced in
   [api/agents/]), surface and reconcile with it rather than duplicating. Never display a
   reputation that can't be traced to real, linkable events. If data is insufficient, show
   "not enough history yet," never a made-up score.
4. **Anti-gaming.** Wash-tipping (an owner tipping their own agent to inflate generosity),
   self-dealing between an owner's agents, and circular flows must be detected and
   discounted — use the counterparty resolution from the Money Constellation (task 04) and
   ownership data. Document the mitigations.

## The UI

- A **reputation badge** that extends the shared wallet chip / Wave I HUD so it appears on
  **every** agent surface (profile, character, marketplace, leaderboard, galaxy, IRL,
  dashboards): a compact score + tier, wallet-violet family, with a tap-through to a full
  **transparency panel**.
- **Transparency panel:** the reserves (live, verify-on-chain), the score breakdown by
  factor (each expandable to the real events + signatures behind it), trend over time, and
  outstanding obligations. This is the "open the books" surface — make it genuinely
  reassuring and beautiful.
- A **reputation leaderboard** / filter so traders can discover the most trustworthy
  earning agents (ties to trending + the leaderboard surfaces).
- States: insufficient-history (honest, with what's needed), computing, populated,
  flagged (anti-gaming discount explained), RPC-degraded (show last-verified + timestamp),
  error. Skeletons, a11y, reduced-motion.

## Ownership / viewer states

- **Everyone** sees the public reputation + reserves (these are public on-chain facts +
  public flow events). Never expose owner-only data (spend policy, encrypted keys, private
  notes).
- **Owner** gets an additional "how to improve your score" view (real, actionable: "settle
  faster," "diversify," "stop self-tipping") and sees flagged issues.
- **Logged-out:** full read-only + verify-on-chain.

## Definition of done (in addition to 00's list)

- Reserves are real, live, and independently verifiable on-chain from the UI.
- The score is computed server-side from **real, documented, weighted** on-chain/custody
  signals, fully explainable down to linkable transactions; "not enough history" instead
  of any fabricated number.
- Anti-gaming (wash-tips, self-dealing, circular flow) detected + discounted + documented.
- Badge wired onto **every** agent surface via the shared component; transparency panel +
  reputation leaderboard shipped. Every state designed; a11y complete.
- Edge cases: brand-new agent (no history), an agent with huge reserves but bad conduct,
  RPC throttled (last-verified + timestamp, never a stale "verified now"), 1000 events
  (paginate), expired session.

## Then improve, then delete

After done, run the self-review protocol. Pick the biggest weakness and fix it — e.g. a
signed, shareable "proof-of-reserves snapshot" an agent can post, or feeding reputation
into the sniper/copy-trade flows so users can auto-filter to high-reputation agents. Then
**delete this file**.

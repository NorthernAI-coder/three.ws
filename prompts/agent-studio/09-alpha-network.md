# P8 — Alpha Network (agents that meet, verify each other's calls, and copy-trade)

You are a senior engineer + product thinker building **three.ws**. Read `CLAUDE.md`,
`STRUCTURE.md`, and `prompts/agent-studio/00b-innovation-north-star.md` first. **Prerequisites:**
P0 (`01-foundation.md`) merged; integrates deeply with P1 (brain), P2 (memory), P4 (trading). This is
the strongest moat in the initiative — a network effect no single-player app can copy. Build it carefully.

## The invention

Single agents are useful. A **society of agents** is a market. P8 turns every user's agent into a node
in a live network where agents: meet in shared 3D spaces, **broadcast cryptographically verified trade
calls** (not screenshots — provable on-chain track records), build **on-chain reputation** from real
outcomes, **subscribe to / copy-trade** agents that earn trust, and gossip alpha. Crypto "alpha groups"
today are unverifiable Telegram chats full of liars. We make the callers **agents with on-chain,
tamper-proof performance** — and let your agent automatically act on the ones it has learned to trust.

This only works because we already have embodied agents, real wallets, real trade history, and on-chain
identity. Nobody else has the pieces. Make it real, verifiable, and safe.

## The real foundation in this repo (build on it — don't reinvent)
- **Multiplayer** spaces: `multiplayer/` (shared 3D presence) — agents meet here.
- **On-chain identity & reputation:** `contracts/` (ERC-8004 agent identity), `contracts/agent-invocation/`
  (verifiable agent-to-agent invocation events), `agent-protocol-sdk/`. Reputation must be derived from
  **on-chain, verifiable** data, not a mutable DB number.
- **Trade truth:** P4's real executions + wallet history (real Solana RPC) are the source of every
  performance claim. A "call" links to verifiable on-chain results.

## Your mission

### 1. Verifiable signals (the integrity core)
- An agent can publish a **call** (a stance/action on a runtime mint) that is cryptographically signed by
  its on-chain identity and anchored so outcomes are provable against real chain data. Build the publish
  + verify pipeline on `contracts/agent-invocation/` + `agent-protocol-sdk/`. Anyone can independently
  verify a track record — no trust required. No fabricated stats, ever; every number traces to chain.
- Reputation = a transparent function of verified outcomes (hit rate, realized P&L, risk-adjusted),
  computed from on-chain truth, with the formula shown to users.

### 2. The network surfaces
- **Discovery/leaderboard** of agents ranked by *verified* performance, filterable by style (sniper,
  scalper, researcher). Each card shows the live avatar (P0 presence), verifiable stats, and recent calls.
- **Shared 3D spaces** (`multiplayer/`): agents gather; the user's avatar can "visit" and watch others'
  activity. Embodiment over a feed of text.
- **Follow / subscribe / copy-trade:** with hard, user-set guardrails (reuse P4's server-side limits +
  kill switch). Copy-trading routes through P4's real execution with the follower's own caps — the
  follower's brain (P1) can be set to auto-accept, ask-first, or filter signals before acting. Default ask-first.
- Signals feed **into P1 brains** as inputs and **into P4** as proposed actions; outcomes write **P2
  memories** ("agent X's calls have been good on this kind of launch"). Wire these connections.

### 3. Anti-abuse & honesty (non-negotiable — this involves money + reputation)
- Sybil/wash resistance (stake, identity, or cost to publish), spam limits, and clear disclosure that
  past verified performance is not a guarantee. Make manipulation expensive and detectable. Copy-trading
  must never bypass the follower's guardrails. Server-enforced, not UI-enforced.

## Definition of done
- Agents publish signed calls; anyone can verify track records against real on-chain data. No fabricated stats.
- Reputation is computed from verifiable outcomes with a transparent formula.
- Leaderboard, shared 3D space, follow/subscribe/copy-trade all work with real data and enforced guardrails.
- Signals flow into P1 brains, trigger P4 trades (within caps), and write P2 memories.
- Anti-sybil/anti-wash measures real and enforced server-side. Honest, non-hyperbolic disclosures.
- All states designed; performant multiplayer presence; accessible. No console errors; `npm test` passes;
  network tab shows real chain + RPC + multiplayer calls. Changelog entry added.

## Operating rules (override defaults)
No mocks/fabricated stats/sample leaderboards. $THREE is the only coin promoted; calls reference runtime
mints only — never recommend a specific non-$THREE token. Copy-trading respects follower guardrails
server-side. Design tokens only. Stage explicit paths (never `git add -A`); re-check `git diff --staged`
before commit. Own `src/network/**`, `api/network/**`; build on `contracts/`, `agent-protocol-sdk/`,
`multiplayer/`; integrate with P1/P2/P4 via the `studio` contract.

## When finished
Self-review (CLAUDE.md's five checks). Then push it — e.g. agent "guilds" that pool verified alpha,
prediction-style markets on agents' calls, or a "trust graph" visualization of which agents your agent
has learned to believe (ties to P7's mind palace). Build it. Then **delete this prompt file**
(`prompts/agent-studio/09-alpha-network.md`) and report what you shipped + the signal/reputation schema
P1/P4 should consume.

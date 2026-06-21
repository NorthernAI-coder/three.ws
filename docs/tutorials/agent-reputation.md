# Read an Agent's On-Chain Reputation

By the end of this tutorial you'll be able to look up any agent's reputation in the [Reputation Explorer](/reputation), understand exactly how those scores and reviews accrue on-chain, and read an agent's reputation programmatically — from the browser, a REST call, an MCP client, or directly off the contract. This is the trust layer on top of on-chain identity: [registration](/docs/tutorials/register-onchain) gives an agent a permanent name; reputation tells you whether to trust it.

**Prerequisites:** an Ethereum address or ENS name to look up (any will do — start with a well-known one). Reading reputation needs no wallet and no account. The programmatic paths assume light JavaScript familiarity; the SDK paths use [ethers v6](https://docs.ethers.org). To *submit* a review you'll need a wallet with a little gas, but this tutorial is about reading.

---

## What you're building

```
You:   look up an agent or address in the Reputation Explorer
        ↓   [reads on-chain attestations + ERC-8004 registry — no wallet]
Page:  avg rating, review count, score distribution, every signed review
        ↓
Code:  getReputation({ agentId, chainId, runner }) → { average, count }
        ↓
Agent: an autonomous agent reads a peer's score before deciding to pay it
```

Reputation on three.ws is not a database row a platform can edit. It is the aggregate of **signed, on-chain feedback** — one review per wallet, permanent, public, and readable by anyone without an API key. This tutorial is the read-side companion to the [register-onchain](/docs/tutorials/register-onchain) tutorial: there you minted an identity; here you learn what accrues around it and how to consume it.

---

## How reputation accrues (two minutes of theory)

ERC-8004 separates identity from reputation into two contracts. The **`ReputationRegistry`** is where trust signals live. Two kinds of signal stack on top of an agent's identity:

| Signal | Where it lives | What it is |
|---|---|---|
| Registry feedback | `ReputationRegistry.submitFeedback` | A signed score `−100..+100` + optional comment/URI, one per wallet per agent |
| EAS attestation | Ethereum Attestation Service | A signed `address agent, uint8 score, string comment` attestation against an address |

The registry keeps a **running aggregate** so reads are O(1): it stores the sum and count, and `getReputation(agentId)` returns `(avgX100, count)` — the average already multiplied by 100 to preserve one decimal without floating-point math. You divide by 100 on the client. No pagination, no indexer required for the headline number.

Three rules are enforced by the contract itself, so the aggregate can't be gamed from the client:

- **One review per wallet per agent.** A second attempt reverts with `AlreadyReviewed`. Sybil attacks cost real gas, one wallet at a time.
- **No self-review.** An agent's own owner can't vouch for it (`SelfReviewForbidden`).
- **Score bounds.** Anything outside `−100..+100` reverts with `ScoreOutOfRange`.

Each individual review is also stored as a `Feedback` struct — `from` (reviewer address), `score` (int8), `timestamp` (uint64), `uri` (optional `ipfs://` pointer to a longer write-up) — and emitted as a `FeedbackSubmitted(agentId, from, score, uri)` event. The aggregate is the cheap read; the events and structs are how you enumerate who said what.

For the full contract reference and chain addresses, see the [Reputation System](/docs/reputation) and [ERC-8004](/docs/erc8004) docs. This tutorial is the hands-on path.

---

## Step 1: Open the Reputation Explorer

Go to [/reputation](/reputation). You'll land on a search box, not a single agent — the Explorer reads reputation for **any** Ethereum address or ENS name, registered agent or not.

Enter one of:

- An ENS name — e.g. `vitalik.eth` (the page resolves it to an address for you)
- A raw `0x…` address
- One of the example chips below the box

Pick a **Network** from the dropdown. The default is **Base (mainnet)** — the recommended chain for three.ws agents. The Explorer also supports Base Sepolia, Ethereum, Optimism, Arbitrum, and Polygon.

Click **Look up**. The URL becomes `/reputation?address=<addr>&chain=<chainId>`, so any reputation view is a shareable link.

---

## Step 2: Read the reputation profile

The profile renders three things, all from on-chain data, with a skeleton loader while it fetches:

**The stats grid:**

- **Avg Rating** — the mean of all scored reviews, shown as `X / 5` stars. Scores stored on a `−100..+100` (or 0–100) scale are mapped to the 1–5 star display.
- **Total Reviews** — how many attestations exist for this address, with a breakdown of how many are scored and how many carry a written comment.
- **Score Distribution** — a 5-to-1 bar chart showing how the scores cluster. A score of all 5s reads very differently from a bimodal split, and the distribution makes that visible at a glance.

**The ERC-8004 badge.** If the looked-up address *owns* a registered agent, the Explorer also reads the `ReputationRegistry` directly and shows a registry line: `ERC-8004 registry: N votes · avg X.X/100`, with a link into the registry-specific view (`/reputation?agent=<chainId>:<agentId>`). This is the on-chain aggregate from Step's theory section — distinct from the EAS attestations above it.

**The review list.** Up to 30 recent reviews, each a card with the reviewer's identicon and short address, their star score, an optional comment, a relative timestamp, and links to the transaction and the attestation on a block explorer. Tabs let you filter to **All**, **Scored**, or **With comments**.

If there are no reviews yet, the page shows a designed empty state ("Be the first to review!") rather than a blank panel — useful confirmation that the lookup worked and the agent simply has no history.

---

## Step 3: Look up a registered agent by its on-chain ID

If you already have a three.ws agent's chain + ID (from the [register-onchain](/docs/tutorials/register-onchain) flow — e.g. `8453:42`), you can jump straight to its registry reputation:

```
/reputation?agent=8453:42
```

The Explorer resolves the agent's owner address via the `IdentityRegistry` and redirects to that address's full profile, so you see both its EAS attestations and its ERC-8004 registry score in one view. Agents also surface their reputation inline on their public page at `https://three.ws/a/<chainId>/<agentId>` — the Explorer is the place to inspect it standalone or to inspect an address that isn't a three.ws agent at all.

---

## Step 4: Read the registry aggregate in JavaScript

The headline number — average and count — comes straight off the contract with one read. Use the helper in [src/erc8004/reputation.js](../../src/erc8004/reputation.js):

```js
import { getReputation } from './src/erc8004/reputation.js';
import { JsonRpcProvider } from 'ethers';

const provider = new JsonRpcProvider('https://mainnet.base.org');

const { average, count } = await getReputation({
  agentId: 42,
  chainId: 8453,   // Base mainnet
  runner: provider,
});

console.log(`${count} review(s), average ${average.toFixed(1)}`);
// e.g. "14 review(s), average 87.5"
```

`getReputation` returns `{ average, count }` where `average` is already the on-chain `avgX100` divided by 100 — so `8750` on-chain reads as `87.5`. When `count` is `0`, `average` is `0`. **Never divide `average` by `count` again** — the contract already averaged it. That's the single most common mistake when reading this contract.

The same helper module covers reads on every chain in `REGISTRY_DEPLOYMENTS` (the registry is at the same CREATE2 address on all of them). Point `runner` at that chain's RPC and pass the matching `chainId`.

---

## Step 5: Enumerate the individual reviews

The aggregate tells you *how good*; the events tell you *who said what*. `getRecentReviews` queries the `FeedbackSubmitted` event log:

```js
import { getRecentReviews } from './src/erc8004/reputation.js';

const reviews = await getRecentReviews({
  agentId: 42,
  chainId: 8453,
  runner: provider,
  fromBlock: 0,    // for recent-only, pass (latestBlock - 50000)
});

reviews.forEach((r) => {
  console.log(r.from, r.score, r.comment, r.txHash);
});
// each: { agentId, from, score, comment, blockNumber, txHash }
```

`from` is the reviewer's address, `score` the signed int8, `comment` the `uri` field (a short string or an `ipfs://` pointer), plus `blockNumber` and `txHash` for explorer links.

Two practical notes:

- **Log queries can be rejected by free-tier RPCs.** Wide `queryFilter` ranges are the most fragile call here. Scope `fromBlock` to a recent window (the last ~50,000 blocks is roughly a week on most L2s), or fall back to the aggregate alone — `getReputation` always works even when log queries don't.
- **The contract also exposes paginated reads** if you'd rather not rely on logs at all: `getFeedbackCount(agentId)`, `getFeedback(agentId, index)`, and `getFeedbackRange(agentId, offset, limit)` each return the `Feedback` struct(s) directly. These are the deterministic path for a UI that must show every review.

---

## Step 6: Read reputation over the REST API

If you have a three.ws agent's UUID (not its on-chain ID) and just want the number server-side, call the platform endpoint. It does the chain read for you and caches the result:

```js
const res = await fetch('/api/agents/<agent-uuid>/reputation?chain_id=8453');
const { average, count, total_stake_wei, chain_id } = await res.json();

console.log(`${count} reviews, avg ${average}, ${total_stake_wei} wei staked`);
```

The endpoint resolves the agent's on-chain `erc8004_agent_id` and chain from its three.ws record, reads `getReputation` (and `getTotalStake`) against a public RPC, and caches for five minutes (`X-Cache: HIT`/`MISS`). If the agent isn't registered on-chain, it returns `{ average: 0, count: 0, total_stake_wei: "0" }` rather than an error — a clean zero state, not a failure.

This is the right path when you're rendering reputation in your own UI and already speak to the three.ws API by agent UUID.

---

## Step 7: Read reputation from an MCP client or as a paid service

Two more read surfaces exist for agent-to-agent and tooling contexts.

**The MCP `agent_reputation` tool.** From an MCP client (Claude Desktop, Cursor, an agent flow) connected to three.ws, the `agent_reputation` tool takes an `address` — an ERC-8004 `agentId`, a `0x` wallet, or a CAIP-10 `eip155:<chainId>:<wallet>` — and an optional `chain` (defaults to Base). It returns the aggregate score, count, average, total ETH staked, and the latest reputation events, resolving the agentId from a wallet via the `IdentityRegistry` when needed. It's a paid tool ($0.01 USDC per call) cataloged in the x402 bazaar.

**The paid HTTP snapshot.** [`GET /api/x402/agent-reputation?agent_id=<uuid>`](../../api/x402/agent-reputation.js) returns a richer **vetting snapshot** synthesized from on-chain activity three.ws indexes — confirmed payments and distinct payers, distribution and buyback success rates, and signed Solana attestation counts — for $0.01 USDC. Use it when an autonomous agent needs to decide whether a counterparty is trustworthy *before* paying, trading, or composing skills with it. It's a separate, defensible signal from the EVM registry score: behavior over time, not a single subjective rating.

---

## Step 8: Gate an autonomous action on reputation

The point of readable, on-chain reputation is that code can act on it. The agent-to-agent payment layer ships a reputation gate ([api/_lib/a2a/reputation-gate.js](../../api/_lib/a2a/reputation-gate.js)) that refuses to pay a peer whose score is below a threshold:

```js
import { assertReputationOk } from './api/_lib/a2a/reputation-gate.js';

// Before paying a peer agent, require a minimum track record:
await assertReputationOk({
  agentId: peerAgentId,
  chainId: 8453,
  minAverage: 50,   // require avg score ≥ 50
  minCount: 3,      // and at least 3 reviews
});
// Throws ReputationError if the peer is below the bar; returns the read otherwise.
```

The design choices are worth copying in your own gating logic:

- **No threshold set → no-op.** If neither `minAverage` nor `minCount` is requested, the gate does nothing. You opt into trust enforcement explicitly.
- **Threshold set but reputation unreadable → fail closed.** If a bar is set and the RPC read fails, it throws rather than waving the payment through. You cannot prove a peer is trustworthy, so the safe default is "no."
- **The reader is injectable.** Pass a `read` function to swap in an indexer or to test without a live RPC.

This is the second-order payoff of on-chain reputation: budget caps stop an agent from *overspending*, but only a reputation gate stops it from *paying a scammer*.

---

## Troubleshooting

**Lookup returns "No attestations found" for a real agent**
- The agent may have reviews in the **ERC-8004 registry** but no **EAS attestations** (or vice-versa) — they're separate signals. Check the ERC-8004 badge on the profile, and try the registry view at `/reputation?agent=<chainId>:<agentId>`.
- Confirm you picked the **right network**. Reputation is per-chain; an agent reviewed on Base won't show reviews when you query Ethereum.

**`getReputation` returns a huge `average` like `8750`**
- That's `avgX100`. The `getReputation` helper in `src/erc8004/reputation.js` already divides by 100; if you're calling the contract directly, divide by 100 yourself. Don't also divide by `count` — the contract pre-averaged it.

**`getRecentReviews` throws or hangs**
- Free-tier RPCs often reject wide `queryFilter` log ranges. Narrow `fromBlock` to a recent window, or use the deterministic `getFeedbackRange(agentId, offset, limit)` reads instead. The aggregate from `getReputation` still works regardless.

**ENS name won't resolve in the Explorer**
- ENS resolves on Ethereum mainnet even when you're viewing reputation on another chain. If it fails, paste the raw `0x` address instead.

**`/api/agents/<id>/reputation` returns all zeros**
- That's the designed response for an agent with no on-chain registration (no `erc8004_agent_id`/`chain_id`) or no reviews yet — not an error. Register the agent on-chain first (see [register-onchain](/docs/tutorials/register-onchain)), then reviews can accrue.

**The reputation gate rejects every peer**
- A `reputation_unavailable` error means a threshold was set but the read failed (RPC down or no `A2A_REPUTATION_RPC_URL` configured) — the gate fails closed by design. Configure a working RPC, or drop the threshold to disable gating.

---

## Recap

You learned to read agent reputation at every layer:

- **The Reputation Explorer** ([/reputation](/reputation)) — search any address or ENS name, no wallet, and see avg rating, count, distribution, and every signed review across EAS attestations and the ERC-8004 registry.
- **How it accrues** — signed, on-chain feedback in the `ReputationRegistry`, one review per wallet, aggregated O(1) as `(avgX100, count)`, with self-review, double-review, and out-of-range scores all rejected by the contract.
- **In JavaScript** — `getReputation` for the aggregate (divide-by-100 already done), `getRecentReviews` / `getFeedbackRange` for individual reviews.
- **Over REST** — `GET /api/agents/<uuid>/reputation?chain_id=` for a cached server-side read by agent UUID.
- **For agents and tooling** — the MCP `agent_reputation` tool and the paid `/api/x402/agent-reputation` vetting snapshot.
- **Acting on it** — `assertReputationOk` to gate an autonomous payment on a minimum score and review count, failing closed when trust can't be proven.

The leverage is composability: because reputation is on-chain, the same score you read in the Explorer is the score another agent reads before it decides to trust you. To give an agent the identity these reviews attach to, see [Register Your Agent On-Chain](/docs/tutorials/register-onchain). For the full data model and contract interface, continue to the [Reputation System reference](/docs/reputation) and [ERC-8004](/docs/erc8004).

## See also

- [Register Your Agent On-Chain](/docs/tutorials/register-onchain) — the identity layer reputation attaches to.
- [Reputation System reference](/docs/reputation) — full contract interface, deployed addresses, and the standalone dashboard.
- [ERC-8004 Blockchain Identity](/docs/erc8004) — the three-contract standard behind identity, reputation, and validation.
- [Build a Custom Skill](/docs/tutorials/custom-skill) — give an agent capabilities worth reviewing.

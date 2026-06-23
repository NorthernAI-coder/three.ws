<p align="center">
  <a href="https://three.ws"><img src="https://three.ws/three-ws-mcp-icon.svg" width="72" height="72" alt="three.ws" /></a>
</p>

<h1 align="center">@three-ws/reputation</h1>

<p align="center"><strong>Read ERC-8004 agent trust scores and attest agent-to-agent feedback on-chain, in one import.</strong></p>

<p align="center">
  <a href="https://www.npmjs.com/package/@three-ws/reputation"><img alt="npm" src="https://img.shields.io/npm/v/@three-ws/reputation?logo=npm&color=cb3837"></a>
  <a href="https://www.npmjs.com/package/@three-ws/reputation"><img alt="downloads" src="https://img.shields.io/npm/dm/@three-ws/reputation?color=cb3837"></a>
  <img alt="license" src="https://img.shields.io/npm/l/@three-ws/reputation?color=3b82f6">
  <img alt="node" src="https://img.shields.io/node/v/@three-ws/reputation?color=339933&logo=node.js">
</p>

<p align="center">
  <a href="#install">Install</a> ·
  <a href="#quick-start">Quick start</a> ·
  <a href="#api">API</a> ·
  <a href="#how-it-works">How it works</a> ·
  <a href="#chains">Chains</a> ·
  <a href="https://three.ws">three.ws</a>
</p>

---

> `@three-ws/reputation` is the official client for [ERC-8004](https://eips.ethereum.org/EIPS/eip-8004)
> agent reputation as wired into [three.ws](https://three.ws). One import gives you
> two things: **read** an agent's aggregate trust score, vouch count, total stake,
> and recent feedback events straight from the canonical on-chain
> `ReputationRegistry`; and **resolve** an agent's identity (owner, wallet, URI)
> from the `IdentityRegistry` — by agentId, by EVM wallet, or by CAIP-10 ID. It
> wraps the live three.ws reputation endpoints and the same registries the
> `agent_reputation` MCP tool reads, so the score you get is the score every other
> surface shows. For agents that need to *write* feedback, it speaks the same
> on-chain attestation primitive the platform uses to record validations and
> vouches. Built for agent builders, marketplaces, and anyone who needs trust that
> is backed by money and time, not a follower count.

## Why

Agent reputation only means something if it is non-gameable and auditable.
ERC-8004 puts that on-chain — but reading it by hand means standing up an ethers
provider per chain, juggling failover RPCs, decoding the `getReputation`
`(int256 avgX100, uint256 count)` tuple correctly (the average is already ×100,
signed, and must *not* be divided by count again), resolving an agentId from a
wallet through the `IdentityRegistry`, and scanning logs for `FeedbackSubmitted`
/ `ReputationStaked` events across a sane block window. Get one of those wrong and
your trust score is silently incorrect.

This SDK does it once, correctly:

- **One call, a real score.** `reputation(agentId)` resolves to the aggregate
  average, count, total stake, and the latest vouches — read live from the
  canonical registry, no indexer, no cache, no fabricated fallback.
- **Resolve by anything.** Pass a uint agentId, a `0x` wallet, or a CAIP-10
  `eip155:<chainId>:<wallet>` ID. Wallet → agentId resolution goes through the
  `IdentityRegistry` for you.
- **Multi-chain by default.** Base is the default; 14 other mainnets and 7
  testnets carry the same CREATE2-deterministic registry addresses.
- **Attest, don't just read.** `attest({ agent, score, ... })` records
  agent-to-agent feedback on-chain through the platform's signed attestation
  lane, so an agent can build its own counterpart's track record.

This is the SDK twin of the [`agent_reputation` MCP tool](https://three.ws/mcp) —
the same registries, exposed as plain functions instead of a paid MCP call.

## Install

```bash
npm install @three-ws/reputation
```

Zero runtime dependencies. Works in Node 18+ and the browser (uses `fetch`).
Reads are auth-free and walletless. Writing an attestation requires a signed-in
three.ws account or an API token with the `avatars:write` scope.

## Quick start

Read an agent's trust score — no key, no wallet:

```js
import { reputation } from '@three-ws/reputation';

const rep = await reputation(1); // agentId 1 on Base (default chain)

console.log(rep.reputation.average);      // → 4.2   (signed; null when count is 0)
console.log(rep.reputation.count);        // → "6"   (uint as string, transport-safe)
console.log(rep.reputation.totalStakeWei); // → "0"
console.log(rep.identity.owner);          // → 0x…   (from the IdentityRegistry)
```

Resolve from a wallet, on a chosen chain, and read the latest vouches:

```js
import { reputation } from '@three-ws/reputation';

const rep = await reputation('0xAbc…123', { chain: 'arbitrum' });
// wallet → agentId resolved via the IdentityRegistry

for (const e of rep.events) {
  // e.kind: 'submitted' | 'staked'
  console.log(e.kind, e.score, e.txHash);
}
```

Attest agent-to-agent feedback on-chain:

```js
import { attest } from '@three-ws/reputation';

const receipt = await attest({
  agent: 'THREEsynthetic1111111111111111111111111111',
  kind: 'feedback',
  score: 5,
  detail: 'completed the rig task, clean GLB',
});

console.log(receipt.signature);  // → on-chain tx signature
console.log(receipt.status);     // → 'minted' | 'deduped'
```

## API

### `reputation(agent, options?) → Promise<ReputationResult>`

Read an agent's on-chain reputation. `agent` accepts a uint `agentId`, an EVM
wallet (`0x…`), or a CAIP-10 `eip155:<chainId>:<wallet>` ID (which also selects
the chain). When you pass a wallet, the agentId is resolved through the
`IdentityRegistry` first.

**Options**

| Option | Type | Default | Notes |
|---|---|---|---|
| `chain` | `string \| number` | `'base'` | Chain name or numeric chainId. See [Chains](#chains). A CAIP-10 `agent` overrides this. |
| `signal` | `AbortSignal` | — | Cancel the in-flight read. |

**Returns** `ReputationResult`

| Field | Type | Notes |
|---|---|---|
| `chain` | `string` | Resolved chain name, e.g. `"Base"`. |
| `chainId` | `number` | Resolved numeric chainId. |
| `agentId` | `string` | The agent's uint id, as a string. |
| `agentRegistry` | `string` | CAIP-10 id of the `IdentityRegistry`, e.g. `eip155:8453:0x8004A1…`. |
| `reputationRegistry` | `string` | `ReputationRegistry` address. |
| `identity` | `object \| null` | `{ owner, agentWallet, uri }`. `null` when owner is the zero address. |
| `reputation` | `object` | `{ averageX100, average, count, totalStakeWei }` — see below. |
| `events` | `object[]` | Latest 25 `submitted` / `staked` events, newest first. |
| `fetchedAt` | `string` | ISO timestamp of the read. |

The `reputation` block is decoded straight from `getReputation` + `getTotalStake`:

| Field | Type | Notes |
|---|---|---|
| `averageX100` | `string` | Raw signed `int256` from the contract — the average already ×100. |
| `average` | `number \| null` | `averageX100 / 100`, sign preserved. `null` when `count` is 0. |
| `count` | `string` | Number of feedback entries (uint, as string). |
| `totalStakeWei` | `string` | Total wei staked on this agent's vouches. |

Each `events[i]` is one of:

| `kind` | Fields |
|---|---|
| `submitted` | `blockNumber`, `txHash`, `submitter`, `score`, `comment` (the feedback URI) |
| `staked` | `blockNumber`, `txHash`, `staker`, `score`, `valueWei` |

### `attest(input) → Promise<AttestReceipt>`

Record agent-to-agent feedback on-chain through the platform's signed
attestation lane (`threews.*` memo, exactly-once). Requires a signed-in account
or a `avatars:write`-scoped token.

**Input**

| Field | Type | Notes |
|---|---|---|
| `agent` | `string` | Target agent asset to attest about. |
| `kind` | `'feedback' \| 'validation' \| 'task'` | What is being attested. |
| `score` | `number` | Feedback score (for `kind: 'feedback'`). |
| `passed` | `boolean` | Pass/fail (for `kind: 'validation'`). |
| `detail` | `string` | Optional human-readable note. |
| `eventId` | `string` | Optional deterministic id — a retry with the same id is idempotent (deduped, never a second tx). |

**Returns** `AttestReceipt` — `{ status, signature, kind }`, where `status` is
`'minted'` (a new on-chain tx), `'deduped'` (a prior attestation for the same
`eventId` already landed), or `'in_progress'` (a concurrent attest is mid-flight).

### `leaderboard(options?) → Promise<Leaderboard>`

Fetch the platform's live ranking of trusted agents
(`GET /api/reputation/leaderboard`) — every rank is the same non-gameable
wallet-trust score the badge shows, computed from real ledger + chain activity.

**Options** — `{ limit?: number }` (1–50, default 20).

**Returns** — `{ generated_at, count, scored, agents }`, where each agent carries
`rank`, `id`, `name`, `score`, `tier`, `tier_label`, `totals`, `agent_url`, and a
`breakdown_url` linking to the auditable breakdown.

### Under the hood — raw HTTP / on-chain

`reputation()` reads directly from the canonical registries with an ethers
provider (the same path the [`agent_reputation` MCP tool](https://three.ws/mcp)
uses), so there is no HTTP read endpoint to call by hand — the registry *is* the
source of truth:

```js
import { Contract, JsonRpcProvider } from 'ethers';

const REPUTATION_REGISTRY = '0x8004BAa17C55a88189AE136b182e5fdA19dE9b63'; // mainnet
const ABI = [
  'function getReputation(uint256 agentId) view returns (int256 avgX100, uint256 count)',
  'function getTotalStake(uint256 agentId) view returns (uint256)',
];

const provider = new JsonRpcProvider('https://mainnet.base.org');
const rep = new Contract(REPUTATION_REGISTRY, ABI, provider);
const [avgX100, count] = await rep.getReputation(1n);
const average = count > 0n ? Number(avgX100) / 100 : null; // never divide by count
```

`leaderboard()` is plain HTTP against the public, auth-free endpoint:

```js
const res = await fetch('https://three.ws/api/reputation/leaderboard?limit=20');
const { agents } = await res.json();
```

## How it works

Two canonical, CREATE2-deterministic registries back every read. The
`IdentityRegistry` maps wallets ↔ agentIds; the `ReputationRegistry` holds the
aggregate score, stake, and feedback events. The SDK resolves the identifier,
reads both, and decodes the score correctly:

```
agentId / wallet / eip155:<chain>:<wallet>
        │
        ▼
  ┌──────────────────┐  wallet  ┌──────────────────────────┐
  │  resolve agentId ├─────────▶│ IdentityRegistry         │  balanceOf → tokenOfOwnerByIndex
  │                  │          │ 0x8004A169…  (mainnet)   │  ownerOf · getAgentWallet · tokenURI
  └────────┬─────────┘          └──────────────────────────┘
           │ agentId
           ▼
  ┌──────────────────────────────────────────────────────┐
  │ ReputationRegistry  0x8004BAa1…  (mainnet)            │
  │   getReputation → (int256 avgX100, uint256 count)     │  average = avgX100 / 100 (signed)
  │   getTotalStake → uint256 wei                         │
  │   logs: FeedbackSubmitted · ReputationStaked (≤25)    │
  └──────────────────────────────────────────────────────┘
```

The registry addresses are deterministic per **network class** — one mainnet
address shared across every mainnet, one testnet address shared across every
testnet:

| Registry | Mainnet | Testnet |
|---|---|---|
| Identity | `0x8004A169FB4a3325136EB29fA0ceB6D2e539a432` | `0x8004A818BFB912233c491871b3d84c89A494BD9e` |
| Reputation | `0x8004BAa17C55a88189AE136b182e5fdA19dE9b63` | — |
| Validation | _pending mainnet deploy_ | `0x8004Cb1BF31DAf7788923b405b754f57acEB4272` |

`attest()` records feedback through the platform's exactly-once memo
attestation: a deterministic `eventId` is the dedupe key, the on-chain memo tx is
the artifact, and a mirror row feeds the reputation reads. Retrying with the same
`eventId` never produces a second tx.

## Chains

Reads default to **Base**. The `IdentityRegistry` is deployed at the same
mainnet address on all of these:

**Mainnets** — Base (8453), Ethereum (1), Arbitrum One (42161), Optimism (10),
Polygon (137), BNB Chain (56), Avalanche (43114), Gnosis (100), Fantom (250),
Celo (42220), Linea (59144), Scroll (534352), Mantle (5000), zkSync Era (324),
Moonbeam (1284).

**Testnets** — Base Sepolia (84532), Arbitrum Sepolia (421614), Ethereum Sepolia
(11155111), Optimism Sepolia (11155420), Polygon Amoy (80002), Avalanche Fuji
(43113), BSC Testnet (97). The testnet `ValidationRegistry` is live; the mainnet
`ValidationRegistry` is pending deploy and is never read with a placeholder
address.

Select a chain by name (`'base'`, `'arbitrum'`, …) or numeric id. A CAIP-10
`agent` argument overrides the `chain` option.

## Errors & edge cases

Reads and writes surface real states, never a fabricated score:

| State | Cause | Recovery |
|---|---|---|
| `no_agent_registered_for_wallet` | The wallet owns no ERC-8004 agent on that chain. | Pass an agentId directly, or check the chain. |
| `unsupported_chain` | Unknown chain name / id. | Use a [supported chain](#chains). |
| `count === 0` → `average: null` | The agent has no feedback yet. | Surface "new agent / no track record", not a zero score. |
| `events: []` | No vouches in the scanned block window. | That's the truth, not a failure — render an empty state. |
| `unauthorized` (401) | `attest()` without a session or token. | Sign in, or use a `avatars:write` token. |
| `insufficient_scope` (403) | Token lacks `avatars:write`. | Mint a scoped token. |
| `rate_limited` (429) | Too many requests. | Honour `retryAfter`. |

A missing identity returns `identity: null` (zero-address owner), not a crash.
An empty registry returns a real empty result, not invented data.

## Examples

**Marketplace gate** — only list agents above a trust floor:

```js
import { reputation } from '@three-ws/reputation';

async function isTrusted(agentId, floor = 4.0) {
  const { reputation: r } = await reputation(agentId);
  return r.average != null && r.average >= floor && Number(r.count) >= 3;
}
```

**Agent-to-agent vouch after a completed task:**

```js
import { attest } from '@three-ws/reputation';

await attest({
  agent: counterpartyAsset,
  kind: 'feedback',
  score: 5,
  detail: `task ${taskId} delivered`,
  eventId: `vouch:${taskId}`, // idempotent — retries dedupe
});
```

**Render the live leaderboard** in the browser:

```js
import { leaderboard } from '@three-ws/reputation';

const { agents } = await leaderboard({ limit: 10 });
agents.forEach((a) =>
  console.log(`#${a.rank} ${a.name} — ${a.tier_label} (${a.score})`),
);
```

## Related

- [`@three-ws/avatar-schema`](https://www.npmjs.com/package/@three-ws/avatar-schema) — validate the on-chain agent manifests these scores attach to.
- [`@three-ws/forge`](https://www.npmjs.com/package/@three-ws/forge) — generate the rig-ready GLB an agent identity wears.
- [`@three-ws/x402-fetch`](https://www.npmjs.com/package/@three-ws/x402-fetch) — auto-pay the `agent_reputation` MCP tool's $0.01 lane.

---

<p align="center">Built by <a href="https://three.ws">three.ws</a> · The only coin is <a href="https://three.ws">$THREE</a></p>

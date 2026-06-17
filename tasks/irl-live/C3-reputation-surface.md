# C3 — Reputation surface for a placed agent

> Epic C · Size **S** · Opens from the C1 card "Reputation" link.
> Depends on C1. Read-only; links out to the full passport/manage flow.

## Goal

Show the placed agent's on-chain reputation inside the dashboard card: a headline
score, trust tier, and the list of attestations behind it — with a link to the
full agent passport for management. Mirrors what B2's tap card shows a passer-by,
so the owner sees exactly what the public sees.

## Why it matters

Reputation is the single strongest reason a stranger pays an IRL agent. The owner
needs to confirm their agent is accruing it, and jump to the passport to manage
attestations. This closes the trust loop the marketplace already established —
Solana attestations are the canonical reputation source (not the dormant EVM
ERC-8004 path).

## Current state (real lines)

- `GET /api/agents/solana-reputation?asset=<pubkey>&network=mainnet|devnet`
  (`api/agents/solana/_handlers.js:902` `handleReputation`, routed in
  `vercel.json:419`). It aggregates `solana_attestations` of kind
  `threews.feedback.v1` / `validation.v1` / `accept.v1` / `stake.v1` into counts:
  `total, verified, credentialed, score_avg_weighted, unique_attesters, …` (`:926`).
  History sparkline: `GET /api/agents/solana-reputation-history?asset=&days=`.
- Trust tiers are documented in `api/agents/SOLANA_OPS.md:85` ("read by
  solana-reputation").
- **Keying:** the endpoint wants the agent's Solana **asset** pubkey, not the
  wallet. C1's `agent-summary` should also select `a.meta->>'solana_asset'`; pass
  that as `?asset=`. If the agent has no asset, show the empty state, not an error.
- An existing client renders this shape already: `src/pump/agent-token-widget.js:403`
  fetches the same endpoint — reuse its parsing as reference.

## What to build

A compact **Reputation** panel (use `compact` state-kit variant for the empty
case). Render:

```js
const asset = agent.solana_asset;           // from C1 agent-summary
if (!asset) return emptyStateHTML({ compact:true,
  title:'No on-chain identity yet',
  body:'This agent has no Solana asset, so it can\'t accrue attestations.',
  actions:[{ label:'Open passport', href:`/agents/${agent.id}`, primary:true }] });

const { data } = await get(`/api/agents/solana-reputation?asset=${asset}&network=mainnet`);
// score: data.score_avg_weighted (0–100 band per tiers doc)
// tier:  derive from counts (verified/credentialed attesters) per SOLANA_OPS.md
// list:  data.total / verified / credentialed / disputed breakdown
```

Layout: a score ring/number + tier badge, then a small breakdown
(`N verified · N credentialed · N disputed`), then a **"Manage on passport →"**
link to `/agents/:id` (the canonical attestation management surface). Optionally
fetch `…-history` for a tiny sparkline; skip silently if it 404s.

### States (all via state-kit, `compact: true`)

- **Loading** — `skeletonHTML(1, 'text')`.
- **Empty** — no asset, or `total === 0`: "No attestations yet — share this agent
  to start earning reputation." with a "View in IRL" / passport CTA.
- **Error** — endpoint failure → `errorStateHTML` + Retry (`attachRetry`).

## Data / API changes

None. Pure read against the existing `solana-reputation` endpoint. The only
upstream dependency is C1 selecting `solana_asset` in `agent-summary`.

## Acceptance checklist

- [ ] Panel shows score, tier badge, and verified/credentialed/disputed counts
      from real `solana-reputation` data.
- [ ] "Manage on passport →" links to `/agents/:id`.
- [ ] No-asset and zero-attestation cases render the designed empty state, not an
      error.
- [ ] Error state retryable; loading skeleton; no console errors.

## Out of scope

Writing/disputing attestations (lives on the passport), and the reputation
*history* visualization beyond an optional sparkline.

## Verify

`npm run dev` → open Reputation from a C1 card whose agent has a Solana asset →
Network tab shows one `solana-reputation` call returning real counts; the passport
link resolves.

<!-- AUTO:self-delete-on-complete -->

---

## ✅ On completion — delete this file

This file is a unit of work, not a permanent doc. The moment every item above is **built, wired, verified, and committed** to the "Definition of done" in the repo-root `CLAUDE.md`, remove it in the same change:

```bash
git rm "tasks/irl-live/C3-reputation-surface.md"
```

Stage the deletion alongside your implementation and include it in the completion commit. This directory is the backlog: a file that still exists is unfinished work; a file that is gone has shipped. Do not delete early, and never leave a completed prompt behind.

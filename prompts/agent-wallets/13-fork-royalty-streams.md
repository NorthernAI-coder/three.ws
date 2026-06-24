# Task 13 — Fork Royalty Streams (provenance income for avatar creators)

> **Read [00-README-orchestration.md](./00-README-orchestration.md) first** —
> especially the **ownership model** and the safety rules. Builds on the
> fork-to-own flow (**task 04**) and the wallet identity layer (**task 01**).
> Invention-layer — read **The invention bar**.

## Why only three.ws can build this

The platform already has the two pieces nobody else welds together: a **verifiable
fork lineage** (every forked avatar stores `meta.forked_from` →
`{ agent_id, owner_id, name, forked_at }`) and a **real custodial wallet on every
agent**. So we can invent something genuinely new: **provenance-based royalties.** When
you create a great avatar and others fork it, and *their* forks earn, a creator-set
share of that real income streams back up the lineage to your wallet — automatically,
transparently, on-chain. Making excellent avatars becomes a real, compounding income
stream. This is the feature that makes three.ws the place creators *want* their work to
spread.

## The ownership invariant this builds on (do not violate)

A fork is already a brand-new agent with a **brand-new wallet** owned by the forker;
no secret is ever copied; the original owner can never touch the fork's funds. **Fork
royalties never change that.** They are an *opt-in, creator-configured revenue split on
the fork's own earnings* — the forker still owns their wallet and their funds; a
defined slice of *new income* is shared upstream by prior agreement, like a sample
clearance, not a seizure. Make this distinction unmistakable in the UI.

## Mission

Let an avatar creator set an optional royalty on forks of their work, and implement the
real, transparent, on-chain revenue split that pays it — recursively up the lineage,
capped and decaying so it can never become extractive, fully legible to everyone
involved.

## What exists (read it before building — do NOT reinvent)

- **Lineage:** `meta.forked_from` written by the fork flow
  ([api/avatars/fork.js](../../api/avatars/fork.js) /
  [api/agents/fork.js](../../api/agents/fork.js)) and rendered as "forked from
  @creator" by task 04. Walk it to build the ancestor chain.
- **Real splits/distribution:**
  [api/_lib/coin/distribution.js](../../api/_lib/coin/distribution.js) and
  [api/_lib/coin/treasury.js](../../api/_lib/coin/treasury.js) already move value with
  splits and buybacks — reuse this real plumbing for the payout path; do not invent a
  parallel fake one.
- **Earnings sources a royalty can apply to (all real):** tips received
  (`/solana/tip` ledger), the agent's own pump.fun coin **creator fees**, and strategy
  sales (task 10). Define clearly which income types royalties apply to and make it
  explicit per source.
- **Wallet identity** (task 01) to render the royalty relationship on both the
  ancestor's and the fork's wallet.

## What to build (real splits, transparent ledger)

1. **Creator royalty setting.** On an avatar/agent the owner created, an opt-in
   control: "forks of this pay N% of <eligible income> upstream" (N within a platform
   cap). Persist it on the agent record. It applies to *future* forks; show creators
   what it means in plain language.
2. **Lineage resolution + decay.** When a fork earns eligible income, walk
   `forked_from` up the chain and compute each ancestor's share using the royalty each
   ancestor set, with **depth decay and a hard total cap** (e.g. total upstream
   royalties can never exceed X%; shares shrink with distance) so deep lineages stay
   fair to the active forker. The forker always keeps the large majority.
3. **Real payout.** Execute the split through the existing distribution plumbing —
   real transfers to ancestors' real wallets, on-chain, idempotent, audited. No
   off-chain IOU, no fake "pending royalties" number that never pays.
4. **Transparent split ledger.** Both sides see the truth: a forker sees exactly what
   share goes where and keeps a clear majority; an ancestor sees real royalty income by
   descendant. Every payout links to its real transaction. No hidden cuts.
5. **Consent + cap on fork.** When someone forks an avatar that carries a royalty, the
   fork flow **shows the terms before they confirm** — they opt in knowingly. A fork
   with terms they reject simply isn't created (or is created only if terms allow). No
   surprise downstream taxation.
6. **Identity surfacing.** The wallet identity chip/HUD shows "earns royalties from N
   forks" (ancestor) and "shares N% upstream" (descendant) as real, legible trust/【
   provenance signals.

## Safety & fairness (non-negotiable)

- **Opt-in, capped, decaying, majority-to-forker.** Royalties can never make forking
  feel like a trap. Hard platform cap on total upstream take; the active forker always
  keeps the clear majority of their own earnings.
- **Funds safety unchanged.** The fork still solely owns its wallet; royalties are a
  split on *defined new income at the moment it's earned*, executed transparently —
  never a claim on the fork's existing balance, never key access.
- **Idempotent + audited.** Every royalty computation and payout is idempotent (no
  double-pay on retry) and written to the custody/audit trail on both sides.
- **$THREE rule honored** throughout; payout rails use the existing real value plumbing
  and never name or promote a non-$THREE mint.

## States & edge cases (all designed, all honest)

No royalty set (forks are fully free — the default); deep lineage hitting the cap;
ancestor account deleted (route their share per a defined, fair rule — e.g. to the next
live ancestor or platform treasury, disclosed); a fork that earns nothing (no payout,
honest zero); concurrent earnings/payouts; royalty changed after forks exist (applies
forward only, never retroactively); network failure mid-payout (idempotent retry,
re-check real on-chain state). Each designed and disclosed.

## Definition of done

Per the orchestration README's checklist. Plus: a creator sets a royalty; a real fork
opts into the disclosed terms; the fork earning real eligible income triggers a real,
on-chain, idempotent, audited upstream split (devnet acceptable) with explorer links;
the split ledger shows the truth to both sides and the forker keeps the majority; the
cap + decay are enforced; deleting an ancestor is handled per the disclosed rule;
ownership/funds-safety invariant proven intact (the fork still solely controls its
wallet). No console errors. No non-$THREE coin named or promoted.

When done: run the self-review + improvement pass, add a real changelog entry,
`npm run build:pages` to validate, commit (staging explicit paths only; push to
**both** `threeD` and `threews` if asked), then **delete this file**
(`prompts/agent-wallets/13-fork-royalty-streams.md`).

<!-- AUTO:self-delete-on-complete -->

---

## ✅ On completion — delete this file

This file is a unit of work, not a permanent doc. The moment every item above is **built, wired, verified, and committed** to the "Definition of done" in the repo-root `CLAUDE.md`, remove it in the same change:

```bash
git rm "prompts/agent-wallets/13-fork-royalty-streams.md"
```

Stage the deletion alongside your implementation and include it in the completion commit. This directory is the backlog: a file that still exists is unfinished work; a file that is gone has shipped. Do not delete early, and never leave a completed prompt behind.

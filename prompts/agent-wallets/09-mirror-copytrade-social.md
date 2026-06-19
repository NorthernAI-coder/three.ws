# Task 09 — Mirror / Copy-Trade Social Graph

> **Read [00-README-orchestration.md](./00-README-orchestration.md) first** —
> especially **The invention bar** and the safety rules. Builds on the trade engine
> + spend guards (**task 05**) and the wallet identity layer (**task 01**).
> Invention-layer.

## Why this is uniquely ours

Every agent wallet is attached to a **public, ownable, social 3D identity** with a
visible, real track record (holdings, P&L, lifetime volume — task 01). So we can do
what isolated wallets can't: make sniping **social**. Follow a winning agent and your
own agent **mirrors its moves** — within *your* spend limits, from *your* custodial
wallet. The platform becomes a live, on-chain copy-trading network of characters.

## Mission

Let an owner subscribe their agent to mirror another public agent's wallet activity,
so that when the followed agent trades, the follower's agent makes the proportional
move automatically — real execution, owner-scoped limits, fully audited.

## What to build

1. **Follow a wallet** — from any public agent's chip/HUD/profile, an owner can set
   *their* agent to mirror *that* agent. Choose which of the owner's agents follows
   (they may own several). Real relationship persisted server-side.
2. **Mirror policy** — the owner sets how mirroring works for them: allocation mode
   (proportional to the leader, fixed size per trade, or % of own balance), a hard
   max per trade and per day, asset allowlist/denylist, and slippage. This policy is
   **bounded by and never exceeds** the agent's existing spend policy
   (`agent-trade-guards.js`). The follower is always in control of their own risk.
3. **Real detection + execution** — when the followed agent makes a real trade
   (detected from real on-chain activity / the trade engine's events, not a poll
   guess), the follower's agent executes the corresponding real trade through task
   05's engine, sized by the mirror policy, gated by spend limits, signed with the
   follower's custodial key. Real tx, real fill, real explorer link.
4. **Leaderboard of real performance** — rank public agents by **real, verifiable**
   P&L / volume / win-rate computed from real activity (no vanity metrics, no fake
   numbers). This is the discovery surface for who to copy. Honest, on-chain-derived.
5. **Follower graph** — show, on an agent, who it follows and who follows it (counts,
   and the network). A real social-financial graph between avatars. Ties naturally
   into the galaxy money-cam (task 12).
6. **Instant unfollow / pause** — one tap stops mirroring immediately. Always visible.

## Safety (non-negotiable)

- **Owner-only to configure; owner's funds only.** You can only set *your* agent to
  follow; you never touch anyone else's wallet. Server-side ownership checks.
- **Spend policy is the ceiling.** Mirror sizing is clamped to the follower's spend
  limits at execution time, server-side. A leader's huge buy never drains a follower
  beyond their set caps.
- **Consent + transparency.** Following is an explicit opt-in with the policy spelled
  out. The follower sees exactly what will be copied and the max exposure. Leaders
  can opt out of being copyable if we offer that (respect a leader's setting).
- **Fully audited.** Every mirrored trade writes to the follower's custody trail with
  the leader reference + trigger. Traceable end to end.
- **No leakage.** Mirroring uses only public trade signals; never expose a leader's
  keys, balances beyond public, or anything private.

## Innovation mandate

- **Copy-trading with a face.** You're not following an address — you're following a
  *character* with a persona, a voice, and a 3D presence. Lean into that: the leader
  and follower avatars relate visibly.
- **Risk made legible.** The follower always sees worst-case exposure and live
  attribution ("this fill came from copying @leader"). Trust through clarity.
- **Discovery that rewards real skill.** The leaderboard surfaces genuinely
  performant agents from real data — a reason to *be* great, not just to copy.
- Invent past this — every mirrored trade is real and limit-bounded.

## States & edge cases

Following yourself (block/no-op); leader goes private/deleted (auto-pause + notify);
follower out of balance or over limit (skip that trade, log why, keep the
subscription); leader makes a trade in a denied asset (skip); rapid leader activity
(rate-limit/clamp to policy); circular follows; leader opts out mid-relationship;
session expiry. Each designed and honest.

## Definition of done

Per the orchestration README. Plus: an owner sets agent A to mirror public agent B;
a real trade by B triggers a real, correctly-sized, limit-gated, audited trade by A
(devnet acceptable) with explorer links on both; over-limit/denied cases are skipped
with logged reasons; the performance leaderboard reflects real on-chain numbers;
unfollow stops it instantly; owner-only enforced server-side. No console errors.

When done: self-review + improvement pass, changelog entry, commit (explicit paths
only), then **delete this file**
(`prompts/agent-wallets/09-mirror-copytrade-social.md`).

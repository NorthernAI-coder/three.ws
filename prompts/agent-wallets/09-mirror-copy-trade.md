# Task 09 — Mirror / Copy-Trade Social Graph (follow a wallet, your agent mirrors it)

> **Read [00-README-orchestration.md](./00-README-orchestration.md) first** — the
> invention bar, ownership model, tokens, real APIs, hard rules, and the "improve
> then delete this file" close-out. Depends on the trade execution engine
> (**task 05**) and the wallet identity layer (**task 01**). Anything autonomous here
> is owner-only, spend-gated, and audited — read "safe by construction" twice.

## Mission

Turn the network of agent wallets into a **live copy-trading social graph**. Follow a
high-performing agent; when *its* wallet makes a real on-chain move, *your* agent
mirrors it — proportionally, and strictly within *your* spend policy. The leaderboard
of agents stops being vanity and becomes an investable signal, and your avatar becomes
an autonomous-but-leashed fund manager.

Why only three.ws: every "trader" you'd copy is itself a real, ownable, transparent
agent wallet with a public, real track record — not an anonymous address. You copy a
*character* with a verifiable history, and your character executes, under your limits.

## What exists (read it before building)

- Execution engine: task-05 `POST /api/agents/:id/solana/trade` — the only way your
  agent trades. Mirroring calls it; it never bypasses the spend guard or audit.
- Real activity to mirror: `GET /api/agents/:id/solana/activity` and Solana RPC /
  parsed transactions in [api/_lib/agent-wallet.js](../../api/_lib/agent-wallet.js) —
  the real source of a followed agent's swaps. Holdings/prices for proportional
  sizing: `.../solana/holdings`, `.../solana`.
- Spend policy: `.../solana/limits` — your daily/per-tx caps bound every mirrored
  trade. Real track records (P&L, win rate) come from task 05's persisted fills.

## How it must work

1. **Follow graph (real, persisted).** Build the follow relationship server-side
   (a real table: follower agent, leader agent, sizing rule, enabled). Owner-only to
   create/edit for your own agents. Expose follower/following counts on the wallet
   identity layer.
2. **Detect real leader trades.** Watch the leader's real on-chain activity (poll the
   activity endpoint / RPC efficiently, or a real webhook if available). Detect a real
   swap — mint, direction, size — from confirmed chain data only.
3. **Size within your limits.** Translate the leader's trade into yours by a real
   rule (fixed amount, % of the leader's size, or % of your balance), then run it
   through your spend policy. If it would exceed your budget, scale down or skip and
   tell the owner honestly — never silently overspend.
4. **Execute via the real engine, fully audited.** Mirrored trades go through the
   task-05 path (reason: `mirror`), produce real signatures, and are clearly labeled
   in your custody trail and activity as "mirrored from @leader." Owner can pause or
   stop following instantly; a kill-switch halts all mirroring at once.
5. **Verifiable track records.** A leader's stats (real P&L, win rate, drawdown,
   volume) come from real fills — never inflated, never fake. Show the honest numbers,
   including losers.

## Innovation mandate

- **Copy a character, not an address.** The thing you follow has a face, a voice, a
  history, and skin in the game (its own real funds). That trust surface doesn't exist
  on any copy-trade product today.
- **Leashed autonomy as a selling point.** The spend policy is what makes "my agent
  trades while I sleep" sane. Surface the leash prominently: "mirroring @leader, max
  0.5 SOL/trade, 2 SOL/day, you can stop anytime." Safety is the feature.
- **Performance-weighted discovery.** Rank followable agents by real, verified
  performance from real fills, with honest risk stats. Make finding a good leader
  delightful — and make over-performance claims impossible because every number is
  on-chain-derived.
- Invent beyond this where it raises the bar — but no simulated leader, no fake fill,
  no backfilled track record. Every mirrored trade is a real tx within real limits.

## States & edge cases (all designed)

Leader makes a trade you can't afford (scale down or skip + notify); leader trades a
token you've allowlisted out (skip, explain); rapid-fire leader trades (debounce /
queue within limits, never blow the daily cap); leader wallet goes dormant; you stop
following mid-trade (in-flight tx completes, no new ones start); circular follows;
following your own agent; leader's track record with 0 trades (honest "no history");
network failure during detection or execution (reconcile against real chain state,
never double-execute); visitor cannot configure mirroring on agents they don't own.

## Definition of done

Per the orchestration README. Plus: a real follow relationship persists; a real
leader swap is detected and produces a **real** mirrored trade in the follower's
wallet (devnet acceptable), correctly sized within the follower's spend policy and
labeled in the custody trail; the kill-switch instantly halts mirroring; leader
track records show real, on-chain-derived stats; owner-only enforced in UI and
server; no console errors; responsive.

When done: self-review + improvement pass, changelog entry, commit (explicit paths
only, push to **both** remotes if asked), then **delete this file**
(`prompts/agent-wallets/09-mirror-copy-trade.md`).

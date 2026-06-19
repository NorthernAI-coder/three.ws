# Task 10 — Strategy Objects (an ownable, equippable, shareable trade strategy)

> **Read [00-README-orchestration.md](./00-README-orchestration.md) first** — the
> invention bar, ownership model, tokens, real APIs, hard rules, and the "improve
> then delete this file" close-out. Depends on the trade execution engine
> (**task 05**). Every automated action runs through the spend policy and audit — read
> "safe by construction" twice.

## Mission

Make a trading strategy a **first-class object** an agent can equip — like a skill or
an item, not a buried setting. A Strategy Object encodes a real, rule-based plan
("snipe launches under N minutes old with >X liquidity, size 0.2 SOL, take-profit at
2x, stop at -40%") as a named, ownable, shareable thing. Equip it on your agent and,
within your spend policy, the agent executes it for real, on-chain.

Why only three.ws: the strategy is bound to a character with its own real wallet, its
own real track record, and a hard spend leash. Strategies become collectible,
forkable, leaderboard-ranked assets — a marketplace of *how agents trade*, all proven
on real chain data.

## What exists (read it before building)

- Execution engine: task-05 `POST /api/agents/:id/solana/trade` and its spend-guard /
  audit path — strategies trigger trades **only** through it.
- Real triggers: the pump.fun launch feed
  ([api/_lib/agent-pumpfun.js](../../api/_lib/agent-pumpfun.js)), real prices and
  holdings ([api/_lib/agent-wallet.js](../../api/_lib/agent-wallet.js),
  `.../solana/holdings`), and the agent's real positions/P&L from task 05.
- Spend policy: `.../solana/limits` bounds every strategy action. Ownership +
  fork lineage patterns from [api/agents/fork.js](../../api/agents/fork.js) — reuse
  them so strategies can be forked with proper attribution.

## How it must work

1. **Strategy as a real object.** Persist strategies server-side as structured,
   validated rule sets (entry conditions, sizing, take-profit, stop-loss, max
   concurrent positions, cooldown). Owner-authored, named, with a real config schema —
   not free text. Versioned.
2. **Equip / unequip on an agent.** Equipping activates the strategy for that agent;
   the agent evaluates real triggers (a real new launch, a real price move) and, on a
   match, executes via the task-05 engine within the spend policy. Unequip stops it
   cleanly. A global kill-switch halts all strategies at once.
3. **Real evaluation, no fake backtests.** If you show expected performance, it must
   be a real backtest over real historical data you actually have, clearly labeled as
   backtest vs live. Never fabricate a curve. Live performance comes from real fills.
4. **Shareable & forkable.** A strategy can be published, viewed, and forked into
   another owner's library (fresh ownership, lineage credited to the author, like
   avatar/agent forks). Forking a strategy never grants access to anyone's wallet — it
   copies the *rules*, and the forker runs them under *their own* spend policy.
5. **Fully audited & leashed.** Every strategy-initiated trade is labeled (reason:
   `strategy:<name>`) in the custody trail, counts against the daily budget, and is
   owner-only to configure. No strategy can exceed the spend policy. Ever.

## Innovation mandate

- **Trading know-how becomes a collectible.** "Equip a strategy your favorite agent
  uses" is a brand-new primitive — ownable alpha, ranked by real on-chain results,
  forkable with attribution. That's a moat no DEX or bot has.
- **Strategies have track records.** Rank published strategies by real, verified live
  performance (and honest drawdown/risk). Make discovery delightful and the numbers
  impossible to fake.
- **Cross-pollinate.** A Strategy Object should feel native next to agent skills and
  the mirror graph (task 09): mirror an agent *or* equip its strategy. Wire that
  relationship. Surface equipped strategies on the wallet identity layer.
- Invent beyond this where it raises the bar — but every trigger, trade, and
  performance number is real and on-chain; backtests are real and labeled.

## States & edge cases (all designed)

Strategy whose next action exceeds the spend budget (skip + notify, never overspend);
conflicting equipped strategies (define precedence, no double-spend); a trigger firing
during a network outage (reconcile against real chain state, no duplicate fills);
take-profit/stop-loss on a position with no real entry basis (honest handling);
forking a strategy (new owner, lineage, no wallet access transferred); equipping on an
agent you don't own (refused server-side); unequip mid-evaluation (clean stop);
0 / 1 / many equipped strategies; very long strategy names; a published strategy with
no live history yet (honest "unproven" state).

## Definition of done

Per the orchestration README. Plus: a real strategy object persists and validates;
equipping it causes a **real** trigger-driven trade through the task-05 engine within
the spend policy (devnet acceptable), labeled in the custody trail; the kill-switch
halts it; a strategy can be forked into another library with lineage and no wallet
access; performance shown is real (live) or a real, labeled backtest; owner-only
enforced in UI and server; no console errors; responsive.

When done: self-review + improvement pass, changelog entry, commit (explicit paths
only, push to **both** remotes if asked), then **delete this file**
(`prompts/agent-wallets/10-strategy-objects.md`).

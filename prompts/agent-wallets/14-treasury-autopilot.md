# Task 14 — Treasury Autopilot (the agent that funds its own existence)

> **Read [00-README-orchestration.md](./00-README-orchestration.md) first** — the
> ownership model, design tokens, real APIs, hard rules, and the safety rules for
> anything that moves custodial funds. Builds on the spend-policy engine (**task 05**)
> and the Wallet HUD (**task 02**). Invention-layer — read **The invention bar**.

## Why only three.ws can build this

Our agents both **earn** (tips, their coin's creator fees, trading) and **cost money to
run** (the LLM + voice compute that makes them talk and think). No one else has an
autonomous entity whose income and running costs live in the *same* real wallet. So we
can close the loop and invent the **self-sustaining agent**: one that pays for its own
brain out of its own earnings, under a policy its owner sets in plain language. An agent
that funds its own existence is a genuinely new kind of digital being — and a reason to
build your agent here.

## Mission

Give the owner a natural-language treasury policy that the agent executes on its own
wallet — autonomously, bounded, audited: pay its own metered compute costs, hold a
safety buffer, dollar-cost-average a slice of income into $THREE, auto-compound coin
fees into buybacks, and sweep profit to the owner on a schedule. Every action is a
real on-chain transaction inside the existing spend policy, with a prominent kill
switch.

## What exists (read it before building — do NOT reinvent)

- **Spend policy + guards:**
  [api/_lib/agent-trade-guards.js](../../api/_lib/agent-trade-guards.js)
  (`enforceSpendLimit`, `reserveSpend`, per-action cap, daily budget, circuit breaker,
  kill switch), read/written via `GET/PUT /api/agents/:id/solana/limits`. Every
  autopilot action routes through it — the policy is the trust anchor.
- **Metered compute billing:**
  [api/_lib/pricing/charge-three.js](../../api/_lib/pricing/charge-three.js) and the
  pricing helpers — the real cost of the agent's LLM/voice usage. Autopilot can settle
  these costs **from the agent's wallet** instead of (or alongside) the owner's
  balance. Wire to the real metering; never invent a cost number.
- **Real income sources:** tips (`/solana/tip` ledger), the agent's pump.fun coin
  creator fees + buyback path
  ([api/_lib/coin/treasury.js](../../api/_lib/coin/treasury.js),
  [api/_lib/coin/distribution.js](../../api/_lib/coin/distribution.js)), trading P&L
  (task 05).
- **Real swaps for DCA/buyback:** the existing Solana/pump swap plumbing
  ([api/_lib/agent-wallet.js](../../api/_lib/agent-wallet.js),
  [api/_lib/agent-pumpfun.js](../../api/_lib/agent-pumpfun.js)). $THREE
  (`FeMbDoX7R1Psc4GEcvJdsbNbZA3bfztcyDCatJVJpump`) is the only coin the platform
  features — DCA targets $THREE; buybacks are the agent's own coin.

If you need a scheduler/executor that doesn't exist (a server-side worker that runs each
agent's autopilot policy on a cadence), **build it for real**: reads real balances,
executes real txs through the guards, idempotent, audited. No cron that fakes activity.

## What treasury autopilot must do (all real, all bounded)

1. **Natural-language policy → structured rules.** The owner writes the policy in plain
   English ("Pay your own compute. Keep a 1 SOL buffer. Put 10% of tips into $THREE.
   Compound coin fees into buybacks weekly. Sweep anything over 3 SOL to me on
   Fridays."). Parse it into validated, structured rules using the model's tool-use
   (see `claude-api`), and **show the compiled rules back for explicit approval** before
   anything runs. The owner always sees exactly what they armed.
2. **Self-funded compute.** With consent, the agent settles its real metered
   compute/voice costs from its own wallet via the real billing path — the agent
   literally pays for its own brain. Surface a clear "this agent is self-funding"
   state and the real running cost vs. real income (is it net-positive?).
3. **Buffer + DCA + buyback + sweep.** Execute each rule as a real, scheduled,
   spend-policy-gated transaction: maintain the buffer, DCA income into $THREE,
   compound the agent's coin fees into real buybacks, sweep profit to the owner. Each is
   a real tx with an explorer link in the activity trail.
4. **Always disarmable.** A prominent kill switch halts all autopilot instantly;
   per-rule pause/edit is one tap. Arming an autonomous treasury you can't immediately
   stop is unacceptable.
5. **The runway view.** A real dashboard: income vs. cost over time, current buffer,
   $THREE accumulated, buybacks executed, profit swept, and a real "runway" (how long
   it self-sustains at the current real burn). Every number from real data; a
   net-negative agent shows the honest truth, not a rosy projection.

## Safety (non-negotiable — this moves real custodial funds autonomously)

- **Owner-only to configure; the agent's own wallet only.** Server-side checks; the
  executing endpoints reject non-owners. Autopilot can never touch another wallet.
- **Spend policy is the hard ceiling.** Every autopilot action is clamped to the
  agent's spend policy at execution time, server-side. The NL policy can only *tighten*,
  never exceed, the limits.
- **Explicit consent + compiled-rule preview** before any rule runs. No "magic"
  autonomous spending the owner didn't see and approve.
- **Idempotent + fully audited.** Every scheduled action is idempotent (no double-spend
  on retry) and written to the custody trail with its trigger and result.
- **Fail safe.** On any ambiguity, price-feed gap, or error, autopilot **pauses and
  notifies** — it never guesses with real money. No errors without solutions, but never
  a reckless action to avoid one.

## States & edge cases (all designed, all honest)

Net-negative agent (honest runway, suggest tightening, never hide it); income too small
to cover compute (pause self-funding, notify); buffer breached by a market move; DCA
when balance is below buffer (skip); buyback with no coin or no liquidity; sweep when
under threshold (no-op); policy that contradicts itself (reject at compile, explain);
kill switch mid-execution (halt cleanly, no partial double-action); price feed down
(pause); expired session (config needs re-auth; running autopilot keeps honoring the
last approved policy until changed). Each designed.

## Definition of done

Per the orchestration README's checklist. Plus: an owner writes an NL policy, reviews
the compiled rules, and arms it; the agent executes at least one real autopilot action
of each armed kind (self-fund compute, DCA into $THREE, buffer maintenance, sweep)
through `enforceSpendLimit` with explorer links (devnet acceptable); the runway view
shows real income/cost/runway including an honest net-negative case; the kill switch
halts everything instantly; owner-only + spend-policy ceiling enforced server-side;
idempotent and audited; no non-$THREE coin named or promoted; no console errors.

When done: run the self-review + improvement pass, add a real changelog entry,
`npm run build:pages` to validate, commit (staging explicit paths only; push to
**both** `threeD` and `threews` if asked), then **delete this file**
(`prompts/agent-wallets/14-treasury-autopilot.md`).

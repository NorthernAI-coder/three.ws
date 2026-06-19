# Invention 03 — Back-an-Agent Vaults (stake into a trader you can see)

> **Read [00-README-inventions.md](./00-README-inventions.md) first** for the unique
> stack, ownership model, real resources, hard rules, definition of done, and the
> "improve then delete this file" close-out. Depends on invention `02` (verifiable
> reputation) — a vault is only trustworthy on top of a provable track record.

## The invention

Copy-trading exists. **Copy-trading a 3D character with a verifiable on-chain
reputation, a persona that explains its strategy, and a face that performs its wins
in a live theater — does not.** Build **Back-an-Agent Vaults**: a user can stake
funds behind an agent's trading strategy and share its real, on-chain P&L, with the
agent's owner earning a performance fee. Real custody, real settlement, real limits.

This fuses our stack: reputation (`02`) makes backing rational, the avatar makes it
emotional, the wallet makes it real, the theater (`01`) makes it watchable.

## What to build (a real on-chain financial product — build it properly and safely)

1. **Vault model** — an agent owner can open their agent to backers. Backers deposit
   into a vault associated with the agent's strategy; the agent trades the pooled
   capital within **hard, owner-and-protocol-enforced spend limits**; P&L is shared
   pro-rata; the owner takes a transparent, disclosed performance fee. Settlement is
   real and auditable.
2. **Custody & safety (non-negotiable)** — backers' funds and risk are protected by
   real mechanisms: per-vault spend policy (`api/_lib/agent-trade-guards.js`),
   max-drawdown circuit breakers that halt trading and protect remaining capital,
   per-backer caps, instant pause, and a full audit trail of every vault action in
   the custody log. Never let an agent exceed its mandate. Re-derive balances from
   chain before any settlement.
3. **Deposit / withdraw / accounting** — real on-chain deposits and redemptions with
   correct share accounting (a backer's share of the vault, valued at real current
   holdings). No fake unit prices. Slippage, fees, and gas reflected honestly.
4. **A vault surface** — a beautiful page per backable agent: the agent (3D), its
   verified reputation (`02`), the live vault P&L (real), terms (fee, limits,
   drawdown stop), backers, and one-tap Back / Redeem. Plus a "vaults" discovery
   feed ranked by **real** verified performance.
5. **Owner controls** — the owner sets terms, limits, and can pause; they see vault
   composition, obligations, and their accrued fees. All real.

## $THREE & compliance guardrails

- Vaults transact in real runtime assets (SOL/USDC and runtime-supplied mints).
  **Never name, hardcode, or recommend any non-$THREE coin** in copy, defaults, or
  "suggested" strategies. $THREE is the only coin the platform features.
- Present this as the user's own opt-in deployment of their own funds into a
  transparent, limit-bound, auditable strategy — explicit consent, full disclosure
  of fees/risks/limits at the moment of backing. No guaranteed-return language.

## Innovation mandate

- **Watch your capital trade** — a backer can open the theater (`01`) and literally
  watch the agent they backed execute. No one else can offer that.
- **Strategy transparency** — surface the agent's real rules/criteria and (if the
  owner opts in) the co-pilot's in-character rationale (`04`) for each trade. Backers
  back a strategy they understand.
- **Reputation-gated** — only agents with a real verified track record (`02`) can
  open vaults; new agents must earn it. Honest and protective.

## States & edge cases

Vault with 0 backers; agent hits drawdown stop mid-session (halt + protect +
notify); redemption during an open position (price at real NAV, handle slippage);
owner pauses; insufficient liquidity to redeem instantly (honest queue, never a fake
instant number); session expiry mid-deposit; an agent that gets forked (the fork is
a different agent with its own empty vault — never co-mingle). Every path designed,
honest, and funds-safe.

## Definition of done

Per the inventions README. Plus: a real deposit → real trade-within-limits → real
share accounting → real redemption completes end-to-end (devnet acceptable) with
on-chain evidence; the drawdown circuit breaker demonstrably halts an over-limit
loss; only reputation-verified agents can open vaults; fees/risks/limits disclosed
at backing; full audit trail; `npm test` covers share accounting + circuit breaker.
No console errors. Responsive.

When done: self-review + improvement pass, changelog entry, commit (explicit paths
only), then **delete this file** (`prompts/inventions/03-back-an-agent-vaults.md`).

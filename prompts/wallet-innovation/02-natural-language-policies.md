# 02 — Natural-Language Spend Policies with Backtested Simulation

> Read `00-README.md` first. Obey every rule there. Delete this file only when
> fully done + self-improved.

## The problem worth solving

Owners protect autonomous agent wallets today with a handful of numeric knobs:
`daily_usd`, `per_tx_usd`, `withdraw_allowlist`, `frozen`, plus the trade limits
(`per_trade_sol`, slippage, price-impact breaker). Powerful, but blunt — and
most owners will never find or tune them, so their agent runs under-protected.
Real intent is richer than four numbers: *"let it trade up to $50/day on tokens
at least a day old, never spend my last 1 SOL, stop everything if a single trade
drops more than 30%, and only ever pay services I've used before."*

## The game-changing feature

Let owners **write their wallet's safety rules in plain English** and have the
platform compile them into a **deterministic, code-enforced policy** — then
**backtest that policy against the agent's real history** before it goes live, so
the owner sees exactly what it would have allowed or blocked. Nobody in the
agent-wallet space lets a human govern autonomous money in natural language with
a simulation that proves what the rule does.

**The hard constraint that makes this trustworthy:** the LLM **never enforces
anything at runtime.** It only *authors* and *explains*. Enforcement stays 100%
deterministic in `api/_lib/agent-trade-guards.js`. The LLM compiles English →
a structured, validated policy object; code enforces that object on every spend.

## What to build (wire all of it, for real)

1. **Policy DSL / schema.** Extend the spend policy with a structured, versioned
   rule format that the existing guards can evaluate deterministically — e.g.
   conditions over `{ amount_usd, asset, counterparty, token_age, daily_spent,
   sol_reserve_floor, trade_pnl_pct, time_of_day, destination_allowlisted }` →
   actions `{ allow | block | require_step_up | freeze }`. Keep it small, total,
   and auditable. Store at `agent_identities.meta.policy_rules` (jsonb, versioned).
2. **NL → policy compiler.** A real Claude call (latest model, via the existing
   worker proxy — never a client-side key) that turns the owner's sentence(s)
   into the DSL, with strict schema validation and a refusal path for ambiguous
   or unsafe requests ("I couldn't safely interpret X — did you mean…"). The LLM
   output is parsed and validated by code; anything that doesn't validate is
   rejected, never enforced.
3. **Plain-English readback.** Render the compiled policy back to the owner as
   numbered, human rules ("1. Block any payment over $50. 2. Never let SOL drop
   below 1.0…") so they confirm intent before saving. Round-trip must be lossless
   and honest.
4. **Backtest / simulation engine.** Replay the agent's real `agent_custody_events`
   history (and a set of synthetic edge cases) against the proposed policy and
   show the result: "Against your last 30 days, this policy would have **blocked
   3 spends** ($X total) and **allowed 47**." Let the owner click a blocked event
   to see which rule caught it and why. This is real data, computed by the same
   deterministic evaluator that will run in production — not an approximation.
5. **Enforcement.** Wire the deterministic evaluator into `enforceSpendLimit` /
   `reserveSpendUsd` so the policy governs trade / snipe / x402 / withdraw exactly
   like the numeric caps. A blocked spend returns a structured 4xx whose message
   is the **human rule that caught it** ("Blocked by your rule: never pay a
   service you haven't used before"). Owner withdraw stays evacuable unless the
   owner explicitly wrote a rule otherwise.
6. **Audit.** Every policy change writes a `limit_change` custody event with the
   English, the compiled DSL, and a diff vs the prior policy. Every block records
   which rule fired.

## UX / UI (in the wallet hub, owner-only)

- A "Policy" surface: a single text box ("Describe how your agent should spend"),
  a live compile + readback, the backtest result, and Save. Show the numeric
  caps and the NL rules as one coherent policy, not two competing systems.
- Suggested starter policies as one-tap chips ("Conservative", "Active trader",
  "Pay-only") that the owner can then edit in English.
- All states: composing, compiling (real async), invalid/refused (actionable),
  backtest-empty (no history yet → explain), saved. Accessible + keyboard-driven.

## Security & correctness

- The LLM is untrusted input → validate its output hard; cap rule count/complexity
  so a policy can't become a DoS or an unbounded eval.
- Deterministic evaluator must be **total** (no throw on weird input → fail safe
  to block for autonomous paths). Pure + unit-testable; no network in the hot path.
- Never let a generated policy *weaken* protection silently — surface every
  loosening ("this removes your $50 cap — confirm").

## Testing

- Unit tests: representative English → expected DSL; evaluator decisions for each
  condition/action; totality on malformed policies; the backtest math.
- Golden tests pinning the readback so the round-trip stays honest.

## Deliverables

Policy DSL + validator, NL compiler (real LLM proxy), readback, backtest engine
over real custody history, deterministic enforcement wired into the shared
guards, owner-only Policy UI, audit, tests, changelog (feature/security).

## Before you finish

Then improve it: add the "explain why this spend was allowed/blocked" inline on
the live spend feed if it exists, and make the backtest visceral (a tiny timeline
of allowed vs blocked). Verify with real history in the browser, review your
diff, then **delete this prompt file.**

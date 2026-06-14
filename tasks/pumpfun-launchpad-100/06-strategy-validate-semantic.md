# Task 06 — Real strategy validation

**Priority:** LOW–MEDIUM. **Type:** backend.

## Goal

Upgrade the `strategy-validate` action from syntax-only checking to genuine semantic validation,
so a user can't save or run a trading strategy that is structurally valid but operationally
broken (references a missing mint, impossible thresholds, conflicting rules, unsupported quote
asset).

## Why this matters

`strategy-run` executes real on-chain trades via the custodial wallet. A strategy that passes
"validation" but then fails or misbehaves at runtime burns real SOL/USDC and erodes trust.
Validation that only checks syntax gives false confidence.

## Context — read first

- `api/pump/[action].js` — `strategy-validate`, `strategy-run` (SSE), `strategy-backtest`,
  `strategy-close-all`.
- `PUMP_DEFAULT_AGENT_MINT` env fallback used by `strategy-run`.
- Task 01/03 — quote-asset awareness (a strategy on a USDC coin must validate against USDC).

## Scope

1. **Define the strategy schema** explicitly (the set of valid rule types, operators, params) if
   not already centralized; validate structure against it.
2. **Semantic checks:** referenced mint exists and is an agent coin; quote asset matches the
   strategy's denominated thresholds; numeric bounds sane (slippage, sizes, intervals); no
   contradictory/unreachable rules; custodial wallet has the capability the strategy assumes.
3. **Return actionable errors** — field-level messages the UI can show, not a single opaque fail.
4. **Reuse, don't duplicate** the backtest's interpretation of the strategy so validate and run
   agree on semantics.

## Definition of done

- [ ] A strategy referencing a nonexistent mint, an impossible threshold, or a quote-asset
      mismatch is rejected with a specific, field-level reason.
- [ ] A valid strategy validates and then runs/backtests consistently (validate and run agree).
- [ ] No false positives on currently-working strategies.
- [ ] `npm test` passes; add cases for each rejection class.
- [ ] Changelog entry (tag: `improvement`) if the strategy UI surfaces the new errors.

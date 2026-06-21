# 12 · Enforce agent spend policy (no silent platform-wallet fallback)

> **Phase 2 — Money safety** · **Depends on:** none · **Parallel-safe:** yes · **Effort:** M

## Mission
In `api/x402-pay.js`, `resolvePayerRouting` **warns but allows** a fallback to the shared platform
wallet (`X402_AGENT_SOLANA_SECRET_BASE58`) when a call is missing `agentId` — bypassing per-agent
spend policy. A regression that drops `agentId` would spend platform funds *unmetered* until someone
reads the logs. Make the policy enforced, not advisory, and add a hard daily ceiling as a backstop.

## Context (read first)
- `CLAUDE.md`.
- `api/x402-pay.js` (~lines 1084–1106 `resolvePayerRouting`; line ~1100 `log.warn('platform_wallet_fallback')`).
- Spend policy + guards: `api/_lib/agent-spend-policy.js`, `agent-custody-guards.js`, `agent-trade-guards.js` (and `tests/agent-custody-guards.test.js`).

## Build this
1. **Reject, don't warn** — an agent payment call missing `agentId` (or with an `agentId` that can't be resolved to a funded, policy-bound wallet) returns **403** with a clear error. The shared platform wallet is used only for explicitly platform-initiated operations, never as an implicit fallback for agent calls.
2. **Per-agent caps enforced server-side** — ensure every spend path runs through `agent-spend-policy` (per-tx + rolling daily/period caps). No code path spends agent funds without a policy check.
3. **Global backstop** — a per-SKU and per-wallet daily ceiling (config-driven) that halts runaway spend from a bug even if per-agent policy is somehow bypassed; breach → block + ops alert (prompt 06 helper).
4. **Audit trail** — record every spend decision (allowed/blocked + reason) for reconciliation (prompt 14).
5. **Tests** — missing `agentId` → 403; over-cap → blocked; platform op still works; daily ceiling halts a simulated runaway. Add to gate.

## Files likely in play
`api/x402-pay.js`, `api/_lib/agent-spend-policy.js`, `api/_lib/agent-custody-guards.js`, config for ceilings, tests.

## Definition of done
- [ ] No silent platform-wallet fallback; missing/unresolvable `agentId` → 403.
- [ ] Every agent spend passes a server-side policy check.
- [ ] Global per-SKU/per-wallet daily ceiling enforced; breach alerts.
- [ ] Spend decisions recorded for audit.
- [ ] Tests cover all four; added to `GATE_TESTS`.
- [ ] Changelog: internal money-safety → optional **security**/**fix** entry if user-observable.

## Guardrails
Follow CLAUDE.md. Fail-closed. Don't loosen guards to make a flow work — fix the caller to pass `agentId`. Push both remotes.

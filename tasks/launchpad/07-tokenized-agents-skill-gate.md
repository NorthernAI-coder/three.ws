# 07 — Tokenized agents: wire $THREE holder gate into skill execution

## Problem

[pump-fun-skills/tokenized-agents/](../../pump-fun-skills/tokenized-agents/) documents the "Tokenized Agent Payments" skill: agents accept USDC or SOL payments on-chain and verify invoices. The payment infrastructure (prep + confirm) works. What does not exist is the **holder gate**: an agent can be configured to require that the calling wallet holds a minimum amount of $THREE tokens to access the agent's skills at all — the equivalent of a token-gated service.

This is a core part of the three.ws value proposition: $THREE utility beyond speculation. Without this, there is no reason for users to hold $THREE to interact with agents.

**$THREE contract address**: `FeMbDoX7R1Psc4GEcvJdsbNbZA3bfztcyDCatJVJpump`

## Target files

**New API endpoint** (create):
- `api/pump/check-three-balance.js` — returns whether a wallet meets a $THREE threshold

**Modified files**:
- [api/pump/[action].js](../../api/pump/[action].js) — add `check-three-balance` case to the dispatcher
- [api/agents/](../../api/agents/) — identify the agent skill execution handler (find `handleSkillCall` or similar) and add gate check before skill invocation
- [pump-fun-skills/tokenized-agents/SKILL.md](../../pump-fun-skills/tokenized-agents/SKILL.md) — document the gate config

## How the gate works

### Agent configuration

An agent opts into the gate by setting in their `meta` JSON (stored in `agents.meta`):
```json
{
  "three_gate": {
    "enabled": true,
    "min_balance": 1000
  }
}
```
`min_balance` is the minimum $THREE tokens (raw, no decimals — $THREE has 6 decimals, so 1000 raw = 0.001 $THREE). This is intentionally low to make gate-testing easy. Real agents might set 10_000_000 (= 10 $THREE).

### Balance check endpoint

```
GET /api/pump/check-three-balance?wallet=<base58>&min=<raw_amount>
```

Response:
```json
{
  "wallet": "…",
  "balance": 12345678,
  "min": 1000,
  "eligible": true
}
```

Implementation in `api/pump/check-three-balance.js`:
1. Import `Connection` from `@solana/web3.js` using the `SOLANA_RPC_URL` env var (already used throughout `api/_lib/`).
2. Fetch all token accounts for the wallet via `connection.getParsedTokenAccountsByOwner(pubkey, { mint: THREE_CA_PUBKEY })`.
3. Sum `tokenAmount.amount` across all matching accounts.
4. Compare to `min`. Return the result JSON.
5. Cache the response in Upstash Redis for 30 seconds (same pattern as `/api/pump/coin` — see [api/_lib/redis.js](../../api/_lib/redis.js)). The cache key is `three-gate:<wallet>:<min>`.
6. Return 400 if `wallet` is not a valid base58 public key (use `PublicKey` constructor in a try-catch).
7. Return 200 in all other cases (including balance = 0, eligible = false).

### Gate enforcement in skill execution

Find the API handler that processes agent skill calls (search for `skill` or `handleSkill` in `api/agents/`). Before executing the skill:

1. Check if `agent.meta?.three_gate?.enabled` is `true`.
2. If yes, extract the caller's wallet from the request (it should already be present as part of the payment/auth flow — find where `caller_wallet` or `payer` is validated in existing handlers).
3. Call the balance check (`fetch('/api/pump/check-three-balance?wallet=<wallet>&min=<min_balance>')` internally, or call the database directly).
4. If `eligible: false`, return HTTP 402 with body:
```json
{
  "error": "insufficient_three_balance",
  "message": "This agent requires a minimum $THREE balance. Acquire $THREE to use this skill.",
  "required": 10000000,
  "held": 5000,
  "buy_url": "https://pump.fun/FeMbDoX7R1Psc4GEcvJdsbNbZA3bfztcyDCatJVJpump"
}
```
5. If `eligible: true`, proceed with skill execution as normal.

### Agent settings UI

In [pages/agent-edit.html](../../pages/agent-edit.html) or [pages/agent-home.html](../../pages/agent-home.html) (whichever contains the agent settings panel), add a "$THREE Gate" toggle:
- A checkbox "Require $THREE to use this agent's skills"
- A number input "Minimum $THREE balance" (shown when checked, default 10_000_000 = 10 $THREE)
- Save writes to `agent.meta.three_gate` via `PATCH /api/agents/<id>` (already exists)

## Definition of done

- Create an agent, enable the $THREE gate with min=10_000_000.
- Send a skill call from a wallet with 0 $THREE → receive 402 with `insufficient_three_balance` error and `buy_url`.
- Send the same skill call from a wallet with ≥ 10_000_000 $THREE (test with a real mainnet wallet that holds $THREE, or stub the balance check in test) → skill executes normally.
- `GET /api/pump/check-three-balance?wallet=<valid>&min=1000` returns correct `balance` and `eligible` fields.
- `GET /api/pump/check-three-balance?wallet=invalid` returns 400.
- The agent settings panel shows the gate toggle and min-balance field. Saving persists.
- `npm test` green.
- Completionist subagent run on changed files.

<!-- AUTO:self-delete-on-complete -->

---

## ✅ On completion — delete this file

This file is a unit of work, not a permanent doc. The moment every item above is **built, wired, verified, and committed** to the "Definition of done" in the repo-root `CLAUDE.md`, remove it in the same change:

```bash
git rm "tasks/launchpad/07-tokenized-agents-skill-gate.md"
```

Stage the deletion alongside your implementation and include it in the completion commit. This directory is the backlog: a file that still exists is unfinished work; a file that is gone has shipped. Do not delete early, and never leave a completed prompt behind.

# 15 — Generalize Agent Reputation → any agent, any chain

Read `prompts/x402-overhaul/00-CONTEXT.md` first, then `/workspaces/three.ws/CLAUDE.md`.
Independent work order — completes fully on its own.

## The problem
`api/x402/agent-reputation.js` scores only three.ws agents from pump.fun activity. No outside
agent has a reason to call it — that's why it doesn't sell. A trust primitive is only valuable
if it works on ANY counterparty an agent is about to transact with.

## Agent use-case (name it in the docs)
Before Agent A pays / trades / delegates to Agent B, it calls one endpoint to get B's trust
score from real on-chain evidence — regardless of which platform B was minted on. This is a
genuine pre-transaction primitive agents will pay for.

## Build — upgrade `api/x402/agent-reputation.js` (keep the route + paid model)
- Accept ANY identifier: a wallet address (Solana or EVM), an ERC-8004 agent id, a pump.fun
  mint/creator, or a three.ws agent_id — auto-detect the type.
- Score from REAL on-chain signals available for that identifier: transaction history,
  age, counterparties, holdings, prior settled x402/agent payments, ERC-8004 feedback if
  present. Reuse `_lib/agent-registry.js`, `_lib/solana/*`, `_lib/helius.js`, `_lib/aixbt.js`,
  ERC-8004 helpers, and the existing scoring logic — generalize it, don't fork it.
- Output: `{ subject, subjectType, score, tier, signals: { ... real evidence ... },
  evidence: [{ kind, ref }], caveats[], ts }`. Score rule documented + deterministic.
- Keep the sweep/leaderboard/decay modes but make them work over the generalized subject set.
- Pricing stays (this is a paid unique). Update the `BAZAAR` description + the `api/wk.js`
  discovery mirror + run `node scripts/verify-x402-discovery.mjs`.

## States
Unknown/unscannable subject → 200 with `score:null`, `tier:'unknown'`, explicit caveat — never
a fake score. Chain data unavailable → degrade to what's readable, mark caveats. Never 500.

## Tests
Subject-type detection (Solana wallet vs EVM vs mint vs agent_id); score determinism; unknown
subject path; discovery mirror matches live 402. `$THREE`/synthetic fixtures.

## Definition of done
Inherit 00-CONTEXT DoD + gates. Plus:
- [ ] Real scores for at least 3 different subject types captured in PROGRESS.md.
- [ ] `scripts/verify-x402-discovery.mjs` passes; paste output.
- [ ] `docs/` trust-primitive doc updated (`docs/api-reference.md` or a new
      `docs/trust-primitives.md` linked from `docs/start-here.md`) with the score rule + use-case.
- [ ] `data/changelog.json` (tags: `feature`,`improvement`) — "Agent reputation now scores any
      wallet or agent on any chain".

# USE-36: Dynamic Endpoint Shopper

## Goal
Agent that discovers paid endpoints in a Bazaar registry, picks the right one for a task, pays, chains results across multiple endpoints to deliver a higher-level outcome.

## Why (from PROJECT-IDEAS.md)
> Agent discovers an MCP registry, pays for its service, chains results. Payment moments: Pay-per-call to each discovered endpoint.

## Reference
- PROJECT-IDEAS.md
- Bazaar (USE-13/14)

## Dependencies
- USE-00..09
- USE-13, USE-14 (Bazaar)
- USE-22, USE-24

## Files to create
- `agents/endpoint-shopper/`
- `agents/endpoint-shopper/src/planner.js` — LLM-based task decomposition into search queries
- `agents/endpoint-shopper/src/discover.js` — Bazaar discovery + ranking
- `agents/endpoint-shopper/src/orchestrator.js` — sequential or parallel endpoint calls; data passing
- `agents/endpoint-shopper/src/judge.js` — quality-checks results, decides whether to re-call or escalate
- `api/agents/endpoint-shopper-run.js` — paid endpoint accepting a high-level task

## Files to modify
- Root `package.json` — add workspace
- `.env.example` — `SHOPPER_MAX_CHAIN_DEPTH` (default 5), `SHOPPER_MAX_COST_USD` (per task)

## Implementation

### Endpoint contract
```
POST /api/agents/endpoint-shopper-run
Body: { task: "Tell me the current weather in San Francisco and convert it to Celsius.", maxCostUsd: 0.50 }
402 → upto $0.50
200 → {
  result: { ... final answer ... },
  steps: [
    { endpoint, action, cost, output: { ... } },
    ...
  ],
  totalCostUsdc: "..."
}
```

### Planner
LLM call: given task + Bazaar catalog (filtered + summarized), generate a step plan. Each step: which endpoint to call, with what args, expected output shape.

### Orchestrator
- Sequential by default
- Parallel if planner marks steps as independent
- Each call paid via wrapped client (USE-06/07)
- Output of each step feeds into the next (LLM transforms if shape mismatch)

### Quality gate
After each step, judge: was the response well-formed? Was the cost reasonable? If not, fall back to alternate endpoint or fail gracefully.

### Cost ceiling
`upto` scheme with `maxCostUsd` from request. If task can't complete under budget, return partial result + clear explanation.

### Caching
Same task with same inputs → cache for 1h. Idempotency via payment-identifier.

## Wiring checklist
- [ ] Bazaar catalog filtered by task-relevant tags
- [ ] Spending cap per task enforced
- [ ] Each step uses payment-identifier (idempotency for the step itself)
- [ ] Failed steps logged with reason
- [ ] Cost ceiling never exceeded

## Acceptance
- [ ] Submit "weather in San Francisco in Celsius" — agent discovers weather + unit-conversion endpoints, calls in order, returns answer
- [ ] Cost stays under ceiling even when plan requires unexpected fallbacks
- [ ] Same task twice = same result (cached + idempotent)
- [ ] Audit log shows every step + cost

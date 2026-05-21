# USE-34: Bounty-Hunter Agent

## Goal
Autonomous agent that scans bounty platforms, picks tasks it can complete, executes them (paying for tools used along the way), submits work, claims reward.

## Why (from PROJECT-IDEAS.md)
> Scans for open bounties, completes tasks, claims reward. Payment moments: Entry fee; streaming pay-as-you-work compute. Suggested APIs: Bountycaster, basic web-scrape, image gen, code sandbox.

## Reference
- PROJECT-IDEAS.md
- Bountycaster, Replicate, Stability AI, web-scrape services

## Dependencies
- USE-00..09
- USE-22, USE-24
- USE-29 (similar autonomous-agent patterns)

## Files to create
- `agents/bounty-hunter/`
- `agents/bounty-hunter/src/index.js` — orchestrator
- `agents/bounty-hunter/src/scanner.js` — polls Bountycaster + GitHub Issues with bounty labels
- `agents/bounty-hunter/src/classifier.js` — LLM-based "can I do this?" gate
- `agents/bounty-hunter/src/executors/image-gen.js`
- `agents/bounty-hunter/src/executors/code-task.js`
- `agents/bounty-hunter/src/executors/research.js`
- `agents/bounty-hunter/src/submitter.js` — submits the work + posts proof
- `api/agents/bounty-hunter-status.js` — paid endpoint to read the agent's current task list + history

## Files to modify
- Root `package.json` — add workspace
- `.env.example` — `BOUNTYCASTER_API_KEY`, `GITHUB_TOKEN`, `REPLICATE_API_KEY`, `STABILITY_API_KEY`, `BOUNTY_MIN_REWARD_USD`, `BOUNTY_MAX_COST_RATIO` (don't accept a bounty whose tooling cost exceeds X% of reward)

## Implementation

### Loop
1. Scan bounty sources every N minutes
2. For each new bounty: classify (can we do it? cost estimate? reward worth it?)
3. If accept: enter the bounty (entry fee paid via x402 if applicable)
4. Execute task — every paid tool used goes through buyer client with audit logging
5. Submit work
6. Track outcome (accepted/rejected/paid)

### Profitability gating
Reject bounties where estimated cost > `BOUNTY_MAX_COST_RATIO * reward`. Conservative defaults (e.g., 30%).

### Audit
Every task is a row: bounty ID, entry fee paid, costs incurred, work output, reward received, profit. Surface via the status endpoint.

### Safety
- Don't auto-submit work to bounties involving real-world consequences (financial trades, account actions, etc.)
- Whitelist of allowed bounty categories: image gen, research, code review, content tagging.

### Status endpoint
`GET /api/agents/bounty-hunter-status` ($0.01) — returns recent bounty stats:
```json
{
  "active": [...],
  "completed": [...],
  "totals": { "rewardEarned": "...", "costsIncurred": "...", "netProfit": "..." },
  "winRate": 0.x
}
```

## Wiring checklist
- [ ] Bountycaster + GitHub bounty sources configured
- [ ] Classifier rejects tasks outside whitelisted categories
- [ ] Profitability gate enforced
- [ ] Tools (image gen, scrape, LLM) paid via x402
- [ ] Status endpoint live, paid
- [ ] Kill switch via env var

## Acceptance
- [ ] Agent runs 24h+, processes at least one bounty end-to-end
- [ ] No bounty accepted outside whitelist
- [ ] No tool used without audit log entry
- [ ] Status endpoint returns real, accurate stats
- [ ] Net profit positive over a representative sample (or report negative and tune)

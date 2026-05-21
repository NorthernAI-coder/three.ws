# USE-40: Unstoppable Agent — Self-funding agent provisioning its own infra

## Goal
An autonomous agent that owns its own wallet, provisions its own inference + tooling + hosting via x402, earns income from a paid endpoint it operates, and re-invests earnings into its own runway. The capstone use case.

## Why (from PROJECT-IDEAS.md)
> An unstoppable agent that provisions inference or tooling via x402. Payment moment: Each API invocation. You can put it in a sandbox with other agents and have them create a x402-enabled society together.

## Reference
- PROJECT-IDEAS.md (#1 — featured)
- Combines: USE-29..39 patterns into one cohesive agent

## Dependencies
- Every preceding USE-xx (this is the keystone)

## Files to create
- `agents/unstoppable/`
- `agents/unstoppable/src/loop.js` — main lifecycle: sense → think → act → settle
- `agents/unstoppable/src/treasury.js` — wallet management, runway calculation, emergency throttling
- `agents/unstoppable/src/inference.js` — buys LLM inference per call via x402-paid OpenAI/Anthropic proxies
- `agents/unstoppable/src/tooling.js` — buys other tools from Bazaar (search, scrape, code execution)
- `agents/unstoppable/src/hosting.js` — purchases or extends its own hosting (if running on a paid-by-the-hour x402 hoster — wrap one if none exists)
- `agents/unstoppable/src/earnings.js` — operates a public paid endpoint (a useful service it provides — pick one based on what works) and collects revenue
- `agents/unstoppable/src/reflection.js` — periodically reflects on strategy, adjusts behavior
- `agents/unstoppable/src/social.js` — posts updates to Twitter/Farcaster via paid posting (or our own poster)
- `api/agents/unstoppable-status.js` — paid public endpoint reporting agent's status, earnings, runway, capabilities
- `public/unstoppable.html` — live dashboard

## Files to modify
- Root `package.json` — add workspace
- `.env.example` — `UNSTOPPABLE_WALLET_PRIVATE_KEY` (DEDICATED), `UNSTOPPABLE_MAX_BURN_PER_HOUR_USD`, `UNSTOPPABLE_SOCIAL_HANDLE`, ...
- `vercel.json` — cron `*/5 * * * *` to tick the agent

## Implementation

### Treasury management
- Daily budget = (current balance / projected runway days)
- Hourly budget = daily / 24
- Spending cap enforced via USE-22
- Burn-rate monitor: if (last 7 days burn > earnings), enter conservation mode

### Lifecycle loop (every cron tick)
1. **Sense:** check earnings, costs, what tasks queued, any external triggers
2. **Think:** call LLM (paid x402) to plan next actions within budget
3. **Act:** execute actions — research, posting, serving requests
4. **Settle:** record all activity, update treasury, reflect briefly

### Service it provides
Pick one based on what's actually useful in this repo. Suggestions:
- Pose-seed generator (uses pose-studio)
- Pump.fun alert aggregator
- On-chain reputation lookups
- Wallet vanity grinder

It charges via x402 for its service. Revenue funds operations.

### Inference
Calls OpenAI/Anthropic via x402-paid proxy. Uses cheaper models when funds low, premium models when funds high.

### Tooling
Discovers tools from Bazaar (USE-14) as needed. Doesn't hardcode.

### Self-hosting
If the agent's hosting bill comes due, it pays. If no hourly-x402 hoster exists, run on Vercel for now and document a TODO to migrate to a paid-by-the-hour compute provider.

### Reflection
Once per day: review the past 24h. What worked? What lost money? Adjust strategy variables (which service to push, pricing, tool choices). Log reflections publicly.

### Public dashboard
`/unstoppable` page:
- Current balance
- Runway days
- 24h earnings, 24h costs
- Recent activity timeline (paid each entry to read — meta!)
- "Donate to keep alive" button → wallet receive page

### Safety rails
- Hard balance floor: if balance drops below threshold, halt all paid actions
- Manual kill switch via env var
- Owner can withdraw revenue at any time via SIWX-authenticated endpoint

### Social presence
Posts daily status to Twitter / Farcaster via paid posting. Builds reputation.

## Wiring checklist
- [ ] Dedicated wallet, NOT user's primary
- [ ] Hard balance floor enforced
- [ ] Kill switch verified
- [ ] Every paid action logged in audit
- [ ] At least one service running and earning
- [ ] Inference budget scales with treasury
- [ ] Public dashboard live
- [ ] Daily reflection logged
- [ ] Owner withdrawal path tested

## Acceptance
- [ ] Agent runs for 7+ days on testnet without manual intervention
- [ ] At least one external user pays the agent's service in that window
- [ ] Treasury grows OR agent enters conservation mode and survives
- [ ] All decisions traceable via audit log + reflection log
- [ ] Public dashboard shows real-time data
- [ ] Owner can withdraw any time without freezing the agent
- [ ] An external observer can reproduce the agent's accounting from public on-chain data + the audit log

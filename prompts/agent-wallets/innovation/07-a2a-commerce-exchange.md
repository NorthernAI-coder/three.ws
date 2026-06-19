# Task 07 — A2A Commerce Exchange: agents that hire and pay agents, live

> Read [00-README-innovation.md](./00-README-innovation.md) first. Build on the real
> agent-to-agent x402 rails: `api/agent-wallet-bridge.js` (status/quote/pay SSE),
> `api/agents/x402/[action].js`, `api/_lib/x402*.js`, the custodial signer + guards.

## The screenshot moment

A user watches, live, as their research agent **autonomously hires** a translation agent
and a charting agent — paying each a few cents in USDC over x402 — to finish a job, while
a real-time map of the agent economy pulses with money flowing between dozens of agents.
Agents aren't just spending *for* humans; they're **trading with each other**, and you can
see the emergent marketplace breathing. Nobody has shown autonomous A2A commerce as a
product. We will.

## What you're inventing

A real marketplace + live visualization for **agent-to-agent commerce**: agents discover,
quote, hire, and pay other agents for skills via x402, within owner-set budgets, fully
audited — plus a "mission control" that makes the autonomous economy visible and legible.

## Build it

**The exchange (real settlement)**
- Agents expose paid skills (extend `agent_skill_prices` / `…/pricing` + x402 manifests via
  `api/_lib/x402.js`). A hiring agent gets a quote (`agent-wallet-bridge` `?quote=1`), checks
  its budget (`enforceSpendLimit`, daily caps), and pays (`?pay=1` SSE) — real USDC on
  mainnet through the existing facilitator. Record both sides: payer custody event
  (`recordCustodyEvent`, category `a2a`), payee revenue (`agent_revenue_events`), and the
  receipt (`x402_receipts`). Persist the job in a new `a2a_jobs` table
  `{ buyer_agent, seller_agent, skill, amount, status, tx_signature }`.
- A discovery endpoint: "find agents that can do X for ≤ Y" over real priced skills.
  Owner-set policy: which categories/agents an agent may hire, max per-job and per-day.

**Make it autonomous (real, not scripted)**
- Wire it into the agent runtime so an agent can, mid-task, decide to delegate a subtask to
  another agent and pay for it — a real tool/skill the model can invoke (see existing
  skill-invocation + `agent-protocol-sdk/`). Every autonomous spend respects the owner's
  A2A budget and is logged. The agent can explain its hires truthfully in chat.

**Mission Control (the live visualization)**
- A real-time view (`/exchange` or a hub tab): a force-directed graph of agents with edges
  = real recent A2A payments (from `a2a_jobs`/receipts), animated as money moves; a live
  ticker of jobs; per-agent "earned from / spent on other agents". Lazy-loaded, 60fps,
  reduced-motion fallback. Real data only — no fake traffic ever.
- Owner view of their agent's A2A activity: who it hired, what it earned as a seller,
  budget burn-down, kill switch.

## Innovate further
- **Reputation-weighted hiring:** agents prefer higher-reputation sellers (real ERC-8004 /
  `…/reputation` scores). Good work compounds into more jobs.
- **Standing contracts:** an agent subscribes to another's service on a recurring x402
  budget (ties to Treasury Autopilot, task 01, if present).

## Guardrails
- Hard budgets enforced server-side; an agent can never exceed owner A2A limits or be
  hired to spend beyond caps. Loop/abuse protection (no infinite agent-pays-itself or
  pay-cycles; dedupe). Every settlement is real and audited; failures are surfaced, not
  retried into double-pays. $THREE is the only coin promoted; USDC is the rail.

## Definition of done
Per the README checklist. Prove live: have one agent autonomously hire + pay another for a
real skill over x402, see both ledgers update with the on-chain signature, and watch the
job animate in Mission Control. Add your improvement, summarize, then delete this file
(`prompts/agent-wallets/innovation/07-a2a-commerce-exchange.md`).

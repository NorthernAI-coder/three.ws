# Task 01 — Treasury Autopilot: the self-governing agent wallet

> Read [00-README-innovation.md](./00-README-innovation.md) first. Reuse the wallet
> core, custody guards, and surfaces it maps. Do not rebuild the chip/HUD.

## The screenshot moment

A user opens their agent's wallet and writes, in plain language:
*"Tip back anyone who tips me more than 0.1 SOL. Keep 0.5 SOL for gas, convert the
rest of my tips to $THREE every Friday, and send 10% of everything I earn to my
creator."* — and the agent **just does it**, on its own custodial wallet, forever,
on-chain, while they sleep. No human wallet on earth governs itself. Ours will.

## What you're inventing

A **programmable, autonomous treasury** for each agent: owner-authored *money rules*
the agent executes itself against its own self-custodied Solana wallet, within hard
spend guards, fully audited, beautifully visualized.

This is not a cron of dumb transfers. It's an agent reasoning about its own economy:
triggers (tip received, balance threshold, schedule, earnings milestone, price move),
conditions, and actions (tip-back, split, auto-convert to $THREE, recurring payout,
donate, top-up gas, buy/burn). Owners compose rules visually **and** in natural
language (parse with the platform's LLM proxy — real, no fake parsing).

## Build it

**Rule engine (server, real execution)**
- New module `api/_lib/treasury/rules.js`: a typed rule schema
  `{ id, trigger, conditions[], action, limits, enabled, lastRunAt }` persisted in a new
  additive table `agent_treasury_rules` (migration in `api/_lib/migrations/`, mirror in
  `schema.sql`). Store per-rule + global caps.
- Execution paths — both real:
  - **Event-driven:** when a tip/earning lands (hook the existing activity/revenue
    detection — `…/solana/activity`, `agent_revenue_events`, the tip flow in
    `src/shared/agent-tip.js` settlement), evaluate matching rules immediately.
  - **Scheduled:** a Vercel cron (`vercel.json` `crons`, handler under `api/cron/`)
    that evaluates time-based rules. Idempotent; dedupe by `(rule, window)`.
- Every action signs through `recoverSolanaAgentKeypair` + the existing transfer/sweep/
  swap primitives in `api/agents/solana-wallet.js` / `solana-trade.js`, and **must** pass
  `enforceSpendLimit` and log `recordCustodyEvent` (category e.g. `autopilot`). A rule can
  never exceed the owner's spend limits or its own per-rule cap. Failures are caught,
  recorded, surfaced — never silently dropped, never retried into double-spends.
- Auto-convert / buy actions route through the real trade path; the only coin a rule may
  *promote/acquire by name* is `$THREE`.

**Natural-language authoring (real LLM)**
- `POST /api/agents/:id/treasury/parse` → uses the platform's Anthropic/OpenAI worker
  proxy (see existing usage in `api/` / `workers/`) to turn a sentence into a structured
  rule the user confirms before save. Show the parsed rule back for explicit approval —
  never auto-arm a misread rule.

**UI (owner-only, in the wallet hub)**
- New hub tab `src/agent-wallet-hub/tabs/autopilot.js` (self-registers via the tab
  registry). Visual rule builder + NL box + a live "next actions" preview computed from
  the real current balance/limits. Each rule shows its real run history (from custody
  events) and a kill switch. Empty/loading/error states designed.
- A compact "Autopilot: N rules active" line on the wallet chip/affordance for owners.

**Visualize the autonomy**
- A live "treasury timeline": real executed actions with on-chain signatures (Solscan
  links), upcoming scheduled actions, and a simple sankey of where money flowed
  (tips in → rules → out). Real data only.

## Innovate further (do this before you call it done)
- Let an agent **explain its own money** in chat: wire a read-only treasury context so
  the agent can answer "what did you do with your tips this week?" truthfully from real
  custody data.
- Simulate-before-arm: a dry-run that replays the rule against the last 30 days of real
  activity so owners see what *would* have happened. No fake numbers — real history.

## Guardrails
- Hard daily/again caps independent of rule caps. A frozen wallet or hit limit pauses
  autopilot and tells the owner why. Anonymous/visitor can see *that* an agent runs on
  autopilot (social proof) but never its rules or controls.

## Definition of done
Per the README checklist. Prove live: arm a real rule, trigger it with a real tip on
mainnet (or devnet for the demo, clearly labeled in UI as network), watch the agent
act on-chain, see it in the timeline + custody ledger. Then add your improvement.
Summarize, then delete this file (`prompts/agent-wallets/innovation/01-treasury-autopilot.md`).

<!-- AUTO:self-delete-on-complete -->

---

## ✅ On completion — delete this file

This file is a unit of work, not a permanent doc. The moment every item above is **built, wired, verified, and committed** to the "Definition of done" in the repo-root `CLAUDE.md`, remove it in the same change:

```bash
git rm "prompts/agent-wallets/innovation/01-treasury-autopilot.md"
```

Stage the deletion alongside your implementation and include it in the completion commit. This directory is the backlog: a file that still exists is unfinished work; a file that is gone has shipped. Do not delete early, and never leave a completed prompt behind.

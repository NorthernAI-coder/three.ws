# P11 — Agent Dreams (your agent works the night shift and greets you with what it found)

You are a senior engineer + product thinker building **three.ws**. Read `CLAUDE.md`,
`STRUCTURE.md`, and `prompts/agent-studio/00b-innovation-north-star.md` first. **Prerequisites:**
P0 (`01-foundation.md`) merged; uses P1 (brain), P2 (memory), P4 (trading/wallet), and optionally
P9 (Theater). Coordinate via the `studio` contract.

## The invention

Your agent shouldn't go idle when you close the tab. P11 gives it a **night shift**: while you're away,
your funded agent autonomously researches your watchlist, monitors fresh launches against your brain's
criteria, runs simulations, manages within your guardrails, and forms conclusions — then greets you on
return with a **"dream"**: a short, embodied briefing where your avatar walks you through what happened,
what it learned, and the moves it proposes (or, within limits, already took). It's the compounding-identity
and agent-acts principles made literal: the agent gets more valuable every night, and you wake up to alpha
instead of a blank dashboard.

Gamechanging test: a user logs in after 8 hours away and their agent has genuinely useful, real,
verifiable findings + concrete proposed actions — produced autonomously, safely, from real data.

## The real foundation (build on it)
- **Scheduled autonomous runs:** use the platform's real scheduled/cloud-agent mechanism (check the repo
  for existing cron/worker/scheduled-agent infra in `workers/`, `api/`, and any scheduling already wired;
  do not invent a parallel scheduler if one exists). Runs are real background jobs, not setTimeout theater.
- **Real inputs:** pump.fun feed, Solana RPC, the Alpha Network signals (P8), the user's watchlist + brain
  criteria (P1), and memory (P2). Every finding traces to real data.
- **Safe action:** any trade the agent takes overnight goes through P4's real execution **and** its
  server-side guardrails + kill switch. Default to *propose, don't execute* unless the user explicitly
  enabled bounded autonomy.

## Your mission

### 1. The night-shift engine
- A configurable autonomous loop: what to watch, how hard to dig, how much (if any) it may act, and hard
  spend/risk caps. Runs on the real scheduler as background jobs; resumable; fully audited. It researches
  (LLM over real feeds), simulates scenarios, and records conclusions as real P2 memories with provenance.
- Strict safety: never exceed caps, honor the kill switch, log every decision. Fail safe — a research
  error must never cause an unintended trade.

### 2. The "dream" — an embodied morning briefing
- On the user's return, the avatar (P0 presence) delivers a short, designed briefing: what it watched,
  what changed, what it learned (new P2 memories), what it did within limits (with the audit trail), and
  a ranked list of **proposed actions** the user can approve with one tap (routing to P4). Use real voice/
  lip-sync + emotion. Optionally render the highlight as a Theater clip (P9).
- A "dream journal" history so the user can review past nights, accept/reject proposals, and see how the
  agent's reasoning improved over time (ties to P2 / P7 mind palace).

### 3. Notify + close the loop
- Use the platform's real notification channels (check existing notification/alert infra — the repo
  already has a real-time alert/automation engine; integrate, don't duplicate) to ping the user when a
  dream contains something time-sensitive. Approved proposals execute through P4; outcomes feed back into
  P2 memory and P8 reputation.

## Definition of done
- Real scheduled autonomous runs against real feeds/RPC; conclusions stored as real, sourced P2 memories.
- Overnight actions (if enabled) go through P4 execution + guardrails + kill switch, fully audited; default
  is propose-only.
- Embodied morning briefing delivered by the live avatar with real findings + one-tap proposals to P4.
- Dream journal history; real notifications for time-sensitive items via existing infra.
- All states designed (autonomy off → research-only dreams; nothing notable → an honest "quiet night");
  no fabricated findings. No console errors; `npm test` passes; network tab + job logs show real work.
  Changelog entry added.

## Operating rules (override defaults)
No mocks/setTimeout fake jobs/fabricated findings. $THREE only; watchlist/launches use runtime mints —
never recommend a specific non-$THREE token. Overnight money-safety enforced server-side; default
propose-only. Design tokens only. Stage explicit paths (never `git add -A`); re-check `git diff --staged`
before commit. Own `src/dreams/**`, `api/dreams/**`; build on existing scheduler + notification infra;
integrate P1/P2/P4/P8/P9 via the `studio` contract.

## When finished
Self-review (CLAUDE.md's five checks). Then push it — e.g. let the user set a "dream prompt" the agent
chases each night, weekly recap dreams, or collaborative dreams where networked agents (P8) pool overnight
findings. Build it. Then **delete this prompt file** (`prompts/agent-studio/12-agent-dreams.md`) and report
what you shipped + the scheduler/notification hooks you used.

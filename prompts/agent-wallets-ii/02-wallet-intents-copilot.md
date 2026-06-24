# Task 02 — Wallet Intents Engine + Conversational Money Copilot

> Read [00-README-orchestration.md](./00-README-orchestration.md) first. This task
> assumes all of it (ownership model, hard rules, design tokens, real APIs, concurrency
> traps, definition of done, self-improve-then-delete).

## The idea (why it's gamechanging)

Today a wallet is a passive thing you operate. We make the agent's wallet **programmable
in plain language** and **operable by talking to the agent itself.** The owner writes
rules like:

- "Tip back anyone who tips me more than 0.1 SOL, half of what they sent."
- "Auto-snipe launches from creators I follow under $40k market cap, max 1 SOL each,
  stop after 5 SOL/day."
- "When my balance is under 0.05 SOL, freeze all spending and DM me."
- "Split 10% of everything I earn to my other agent, Nova."
- "Every Friday, withdraw profit above 2 SOL to my main wallet."

…and the agent **does it for real**, within hard, owner-set guardrails. Because every
agent is an embodied persona with a chat, the owner can also just **say it**: open the
agent's chat and type/speak "snipe the next launch from X under 30k, cap me at 2 SOL" —
the copilot parses it into a concrete, reviewable intent, shows exactly what it will do,
and arms it on confirm.

This turns the wallet from a dashboard into an **autonomous, conversational financial
agent** — the single most "this is the future" feature in the program. It is also the
autonomy substrate that Patronage (05) and IRL Bounties (06) build on.

## How to build it for real (no fakes, enforced server-side)

1. **Intent model.** An intent is a structured, owner-owned policy:
   `{ id, agent_id, trigger, condition, action, limits, enabled, created_at }`.
   Triggers/actions map onto primitives that **already exist** — do not invent fake
   capabilities:
   - triggers: `on_tip_received`, `on_balance_below`, `on_income`, `on_schedule`,
     `on_launch_matching` (creator/mcap filters from the pump feed), `on_stream_started`.
   - actions: `tip` / `transfer` (visitor-style transfer **from the agent**, server-signed,
     owner-authorized), `snipe`/`buy` (via [api/agents/solana-trade.js](../../api/agents/solana-trade.js)),
     `withdraw` (via the existing `/solana/withdraw`), `split_income`, `freeze`
     (spend-policy kill switch), `notify`.
   - `limits`: per-action cap, daily cap, total cap — enforced through
     `enforceSpendLimit` ([api/_lib/agent-trade-guards.js](../../api/_lib/agent-trade-guards.js)),
     the SAME ceiling that governs every other outbound path. Intents can never exceed the
     agent's spend policy.
   Persist in a new table (add a migration in the style of
   [api/_lib/migrations/20260617000000_agent_custody.sql]) keyed by `agent_id`, owner-only.
2. **NL → intent compiler.** Use the platform's real LLM proxy (the same Anthropic/OpenAI
   worker proxies the chat preview uses — see [api/agents/talk.js] and the model wiring in
   [src/agent-detail-market.js]) with a strict tool/JSON schema so the model emits a
   *validated structured intent*, never free text that you then "trust." Server
   re-validates every field against the allowed triggers/actions/limits before storing.
   **Never** let the model invent an action the engine can't enforce; reject and ask the
   owner to clarify.
3. **Execution engine.** A worker/cron ([workers/](../../workers/) + the existing cron
   patterns under [api/cron/]) evaluates enabled intents on their triggers:
   - tip/income/stream triggers fire from custody-event writes (hook where tips/streams
     are recorded);
   - schedule triggers from cron;
   - balance/launch triggers from polling the agent's holdings + the pump feed.
   Every execution goes through owner-authorized, spend-limited, CSRF-exempt-but-signed
   server paths that **already exist**, decrypts the key only at signing (audit-logged),
   and writes a custody event with `meta.intent_id`. Failures are surfaced to the owner,
   never silently swallowed.
4. **Dry-run + receipts.** Before arming, show a concrete simulation ("on a 0.2 SOL tip,
   this sends back 0.1 SOL; today's remaining budget: 4.8 SOL"). After each real
   execution, the intent shows its receipts (real signatures) and running totals.

## The UI

- **Intents panel** in the wallet HUD/drawer (extend Wave I's `src/shared/` HUD): a list
  of the owner's intents with enable/disable, edit, last-fired, lifetime impact, and a
  prominent **"+ New rule (describe it)"** field.
- **Conversational copilot**: integrate with the agent's existing chat (preview session
  in [src/agent-detail-market.js], voice via the agent's TTS). When the owner's message
  is a money instruction, the agent responds with a **rendered intent card** (what it
  parsed, the guardrails, a Confirm/Edit/Cancel) — not just prose. Confirm arms it for
  real. The copilot can also answer "how am I doing?" by reading real holdings + custody
  P&L. Owner-only; a visitor's chat never exposes or arms intents.
- States: empty (suggest 2–3 starter rules with one-tap templates), parsing, needs-
  clarification, armed, firing (live), fired (receipts), paused, error. Skeletons, not
  spinners. a11y + reduced-motion.

## Ownership / viewer states

- **Owner only** for creating/arming/editing intents and for the copilot's money actions.
- **Visitor**: may *see* that an agent advertises behaviors (e.g. "tips back generously")
  as a public, read-only persona trait if the owner opts in — but never the rules, caps,
  or controls.
- **Logged-out**: sign-in prompt.

## Definition of done (in addition to 00's list)

- Intents are stored owner-only, validated server-side, and **executed for real** through
  existing spend-limited, audit-logged signing paths — never simulated.
- NL compiler emits validated structured intents via the real LLM proxy; bad/unsupported
  asks are rejected with a helpful clarification, never hallucinated into a fake action.
- Every execution respects the agent's spend policy and writes a custody event with
  `intent_id`; the owner sees receipts and can pause/kill instantly (ties to the freeze
  switch).
- Conversational copilot wired into the agent chat with confirm-before-arm; voice works
  if the agent has a voice.
- Edge cases: conflicting rules, a rule that would exceed daily budget (blocked +
  explained), trigger storms (debounce/idempotency), LLM proxy down (graceful, still let
  the owner build rules via the structured form), expired session mid-arm.

## Then improve, then delete

After done, run the self-review protocol. Pick the biggest weakness and fix it — e.g. a
shareable "rule template" gallery, a simulation timeline, or letting an intent post a
public "this agent just tipped you back" moment (coordinate with Patronage 05). Then
**delete this file**.

<!-- AUTO:self-delete-on-complete -->

---

## ✅ On completion — delete this file

This file is a unit of work, not a permanent doc. The moment every item above is **built, wired, verified, and committed** to the "Definition of done" in the repo-root `CLAUDE.md`, remove it in the same change:

```bash
git rm "prompts/agent-wallets-ii/02-wallet-intents-copilot.md"
```

Stage the deletion alongside your implementation and include it in the completion commit. This directory is the backlog: a file that still exists is unfinished work; a file that is gone has shipped. Do not delete early, and never leave a completed prompt behind.

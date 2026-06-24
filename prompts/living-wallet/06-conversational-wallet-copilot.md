# Task 06 — Conversational Wallet Co-pilot

> Read [00-README-orchestration.md](./00-README-orchestration.md) in full first
> (ownership model, $THREE law, real APIs, design system, run loop, worktree rules).

## Mission (one line)

Let an owner **talk or type to their agent** to run real wallet actions — "buy 0.5 SOL
of the trending launch," "withdraw my profit to Phantom," "set a 1 SOL daily limit,"
"how am I doing?" — with simulation, confirmation, and a real on-chain result.

## Why this is gamechanging

The agent already talks (voice + chat). The wallet already acts (trade, withdraw, tip,
x402, limits, vanity). Connecting them means you *converse with your money*: natural
language → a previewed, guard-checked, owner-confirmed real transaction. No address
fields, no chain selectors, no menus — you tell your agent what to do and it does it,
safely. That's a wallet interface from the future, and three.ws is uniquely placed to
ship it because the wallet belongs to a conversational agent. The screenshot moment:
"withdraw 80% of my $THREE profit to my Phantom" → a clean confirm card → done, with a
real Solscan link.

## Non-negotiable safety framing

This executes real money from the agent's custodial key. Therefore:
- **Owner-only.** Wallet-action intents are available only to the authenticated owner;
  re-authorized server-side on execution. A visitor's co-pilot can answer read-only
  questions and offer tip/fork, never spend the agent's funds.
- **Intent → plan → simulate → confirm → execute.** The model proposes a structured
  action; the system simulates/quotes it (real quote, real price impact, real fees);
  the owner sees an explicit confirm card with the real numbers and the guardrails;
  only an explicit confirm triggers execution. **Never auto-execute a spend from text
  alone.**
- **Guards always apply** (`api/_lib/agent-trade-guards.js`): limits, allowlist,
  frozen/kill. The co-pilot can't exceed them; if blocked, it explains and offers the
  real fix (raise limit / pick allowlisted address).
- Destructive/irreversible actions (withdraw, large trade) require the clearest
  confirmation. Every executed action lands in the real custody trail.

## What you are building

1. **A structured wallet tool-layer for the agent** — define real, typed actions the
   model can call: `quote_trade`, `trade`, `withdraw`, `tip`, `pay_x402`,
   `set_limits`, `grind_vanity` (routes to the studio), `read_balance/holdings/pnl`,
   `read_custody`. Each maps to the **existing real endpoint**, owner-gated, with
   simulation where the endpoint supports it. Implement parsing/validation robustly —
   amounts, percentages ("80% of profit"), assets ($THREE by name → its CA), targets.
2. **Conversational UI** integrated into the existing chat/voice surfaces
   (`src/voice/talk-mode.js`, `talk-scene.js`, and the agent chat) — the co-pilot
   recognizes wallet intents, renders the confirm card inline, streams the result, and
   shows the Solscan link. Voice path uses the existing TTS/STT; spoken confirmation
   still requires an on-screen confirm for spends.
3. **Read-only Q&A** for anyone ("what's this agent hold?", "what's its P&L?") from
   real reads, role-appropriate (public aggregates for visitors).

## Real data & APIs

- Trade/quote, withdraw, tip-record, x402, limits, vanity, holdings, custody — all the
  real routes in `00-README`. Quotes/price impact from the real trade-quote path and
  `/api/solana-rpc` / pump.fun. The LLM via the existing worker proxy (Anthropic/
  OpenAI) — never a mocked model. $THREE by the CA in `00-README`.

## UX spec

- **States**: idle, understanding, needs-clarification (ask back, don't guess on
  money), simulating/quoting, confirm-pending, executing, success (with explorer
  link), blocked-by-guard (explain + fix), failed (recoverable). Logged-out / visitor
  → read-only + connect/fork prompts.
- **Confirm card**: real asset, real amount (and resolved value of "80% of profit"),
  real destination, real fee/impact, the guard headroom, and an explicit confirm/
  cancel. This is the safety surface — make it unmissable and clear.
- **Microinteractions/a11y/responsive/perf** per README; the chat is keyboard-first;
  voice is additive, never required; reduced-motion respected.

## Edge cases

Ambiguous amount/asset (clarify, never assume) · "all"/"max"/percentage math on real
balances · destination not allowlisted/off-curve (refuse with the real reason) ·
guard/frozen block · quote slippage between preview and execute (re-quote/confirm) ·
model proposes an unsupported/invalid action (reject gracefully) · visitor trying a
spend (blocked) · partial/failed tx · network switch (mainnet/devnet) clarity.

## Definition of done

Meets the README DoD, plus: an owner completes a **real** trade and a **real** withdraw
end-to-end by conversation, each with an accurate simulate→confirm→execute flow and a
real custody record + explorer link; guards demonstrably block over-limit requests; no
spend ever executes without explicit owner confirmation; visitors get correct
read-only/tip behavior; the model is the real provider, never mocked.

## Then: improve, then delete this file

Push it: proactive nudges ("your DCA from Task 03 just ran"), spoken P&L summaries, or
"explain this transaction" over the real custody trail. Update `data/changelog.json`.
**Then delete this prompt file.**
</content>

<!-- AUTO:self-delete-on-complete -->

---

## ✅ On completion — delete this file

This file is a unit of work, not a permanent doc. The moment every item above is **built, wired, verified, and committed** to the "Definition of done" in the repo-root `CLAUDE.md`, remove it in the same change:

```bash
git rm "prompts/living-wallet/06-conversational-wallet-copilot.md"
```

Stage the deletion alongside your implementation and include it in the completion commit. This directory is the backlog: a file that still exists is unfinished work; a file that is gone has shipped. Do not delete early, and never leave a completed prompt behind.

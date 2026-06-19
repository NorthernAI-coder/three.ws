# Task 01 — Conversational Trading Copilot (voice + chat, in-world execution)

> **Operating bar.** Senior engineer + product thinker building three.ws to beat the best in the
> world. Genuinely innovative, not a clone. No mocks, no fake/sample data, no placeholders, no
> TODO/stubs, no `setTimeout` fake-loading. Wire 100% end-to-end with REAL APIs and real on-chain
> data. The only coin is **$THREE** (`FeMbDoX7R1Psc4GEcvJdsbNbZA3bfztcyDCatJVJpump`); runtime mints
> in generic trade plumbing are the only exception and are never promoted.

## ⛓ Chain protocol — do this as STEP 0, before building

This task is a node in a self-extending chain (see `tasks/trading-frontier/README.md`). Before you
build the feature below:
1. Read all of `tasks/` (every epic) + `tasks/trading-frontier/BACKLOG.md`. Know what exists/planned.
2. Invent **10 genuinely new, non-duplicate feature ideas**, each innovative, grounded in the real
   three.ws codebase (cite real files/APIs/tables), advancing sniping/trading/launching/buying/selling.
3. Write each as a full prompt in `tasks/trading-frontier/next/<slug>.md`, matching this file's
   structure exactly — including this Chain protocol section, so the chain continues.
4. Append one line per new prompt to `BACKLOG.md` after confirming it isn't a duplicate.
5. Only then build YOUR feature to the **production-ready bar** in the epic README, and `git rm`
   this file in the completion commit.

## The invention

three.ws agents are 3D characters with voices and personas. Make the agent a **conversational
trading copilot**: the user talks (text or voice) — "what's the safest new launch right now?",
"buy me 0.5 SOL of the one smart money is in, take profit at 2x", "how's my position?" — and the
agent answers with real data and *executes real trades* through the guarded paths, narrating what
it did and why. A trading terminal you can simply talk to, in-world. Nobody has that.

## Context (real, verified)

- Agent persona + voice: `agent_identities` (`persona_prompt`, `voice_provider`, `voice_id`,
  `voice_settings`); LLM access via the platform's existing worker proxy (CLAUDE.md: OpenAI/
  Anthropic via worker proxies — use it; no browser-side keys).
- Trade execution (guarded, server-signed): `api/agents/agent-trade.js`, `api/agents/solana-trade.js`;
  spend guards `api/_lib/agent-trade-guards.js`; firewall `tasks/next-gen-trading/01`.
- Live market context the copilot can cite: intel (`pump_coin_intel`), oracle
  (`oracle_conviction`), positions (`api/sniper/stream.js`), balances (`api/agents/solana-wallet.js`).
- Chat UI surfaces + SDK: `sdk/src/index.js` (AgentKit panel), agent-detail chat, wallet hub.

## Goal

A tool-calling trading copilot: an LLM with a real **trade/quote/portfolio/intel toolset**, a
confirm-before-execute safety model, optional voice in/out, surfaced as a conversation that can
actually trade from the agent wallet.

## What to build

1. **Copilot tool layer** — define a real function/tool schema the LLM calls: `getQuote`,
   `assessSafety` (firewall), `getSmartMoney`, `getPositions`, `getBalance`, `placeBuy`,
   `placeSell`, `setStrategy`. Each maps to the existing guarded endpoints — the LLM never signs;
   it calls server endpoints that enforce spend limits + firewall + custody audit.
2. **Confirm-before-execute** — any state-changing action (buy/sell/arm) returns a structured
   proposal the user must confirm (UI affirmation or explicit voice "confirm"); express mode after
   first confirm, per-session, never bypassing spend caps. Read-only queries run freely.
3. **Voice** — optional speech-to-text in + the agent's configured voice out (use the existing
   voice provider config); text-only fully functional without voice.
4. **Grounded answers** — the copilot cites real numbers (price, impact, safety verdict, smart-
   money count, PnL) pulled live; it never invents figures. If data is unavailable, it says so.
5. **UI** — a copilot panel (in agent-detail + wallet hub): conversation with streamed responses,
   inline trade-proposal cards (showing quote + firewall verdict + confirm/cancel), voice toggle,
   and a transcript of executed actions linking to Solscan. All states designed; accessible
   (ARIA live regions, keyboard); responsive.

## Constraints

- The LLM proposes; the guarded server endpoints decide. Spend limits, kill switch, and firewall
  are never bypassable by conversation. Every execution is audited in `agent_custody_events`.
- Real LLM + real market data only — no canned responses, no fake quotes. Honest degradation on
  failures with retry.
- $THREE-only rule in all copilot copy/examples; runtime mints are trade data only.

## Success criteria

- A user can converse (text + optional voice) and the copilot answers with live data and executes
  a real, confirmed, firewall+spend-guarded trade from the agent wallet, audited.
- Confirm-before-execute enforced; read-only queries free; data is real and cited.
- Copilot UI renders all states, accessible + responsive. Production-ready bar met; chain extended.
- Build/typecheck/test clean. Changelog entry (tags: feature). Completionist passes.

<!-- AUTO:self-delete-on-complete -->

---

## ✅ On completion — delete this file (after authoring + registering 10 chained prompts)

```bash
git rm "tasks/trading-frontier/01-conversational-trading-copilot.md"
```
A file that still exists is unfinished work; a file that is gone has shipped. Do not delete early.

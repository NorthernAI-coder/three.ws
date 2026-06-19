# Task 08 — The Conversational Wallet (talk to your agent, it trades)

> **Read [00-README-orchestration.md](./00-README-orchestration.md) first** — the
> invention bar, ownership model, tokens, real APIs, hard rules, and the "improve
> then delete this file" close-out. Depends on the Wallet HUD (**task 02**) and the
> trade execution engine (**task 05**). Safety is the whole point — read the
> README's "safe by construction" rule twice.

## Mission

You already talk to your agent. Now your words **move real money** — safely. Tell
your avatar, out loud or in text, "tip the creator 0.1 SOL," "snipe that launch with
half a SOL," "swap my USDC to $THREE," "withdraw 2 SOL to my Phantom" — and the agent
parses the intent, shows you exactly what it will do, you confirm, and it executes a
**real** on-chain action through the task-05 engine, gated by your spend policy.

Only three.ws can do this: the wallet, the keys, the spend policy, and a talking 3D
character are one object. This is the agent acting on your behalf, visibly, as itself.

## What exists (read it before building)

- Voice / talk mode: [src/voice/talk-mode.js](../../src/voice/talk-mode.js) and the
  existing chat surface — your input channel. Reuse it; don't fork a new one.
- LLM access: Anthropic/OpenAI via the existing **worker proxies** (see
  `workers/` and `CLAUDE.md`). Use the latest Claude model
  (`claude-opus-4-8`) with **tool use** to turn natural language into a strict,
  validated intent object — never free-text-to-transaction. Consult the `claude-api`
  skill for the correct tool-use / model details before wiring it.
- Execution: the task-05 `POST /api/agents/:id/solana/trade`, plus the existing
  `.../withdraw` and `.../tip` endpoints. All owner-only, CSRF, spend-policy gated,
  audited. The conversational layer **calls these** — it never signs or moves funds
  on its own path.

## How it must work

1. **Intent extraction (structured, not vibes).** The LLM maps the utterance to a
   typed intent via tool use: `{ action: tip|swap|snipe|withdraw, amount, asset,
   destinationOrMint, slippage? }` with confidence. Ambiguity -> the agent asks a
   real clarifying question, in character. Never guess an amount or a destination.
2. **Read-back + explicit confirm.** Before anything executes, the agent states
   plainly what it will do, the real quote / real USD value, the fee, and the
   remaining daily budget after — then waits for an explicit confirm (tap or a clear
   spoken "yes"). No silent execution, ever. This confirm step is non-negotiable.
3. **Execute via the real engine.** On confirm, call the appropriate task-05 /
   withdraw / tip endpoint. Surface the real signature + explorer link in the
   conversation. The avatar reacts (task 07 flourish) only on the real confirmed tx.
4. **Owner-only, spend-gated, audited.** Visitors can converse but cannot trigger any
   fund movement — the server rejects it regardless of phrasing. Every action is the
   same spend-policy- and audit-gated path as the rest of the program. The LLM has no
   privileged route around the spend guard.

## Innovation mandate

- **The agent is the interface.** No form to fill — you speak, it understands, it
  confirms, it acts, it reports back, in character. That is a genuinely new way to
  use a wallet, and it only works because the wallet is the agent.
- **Proactive, consented co-pilot.** With the owner's standing permission and within
  the spend policy, the agent can *suggest* ("a launch matching your watch just hit;
  want me to snipe 0.2 SOL?") — suggestions only, always requiring confirm, always
  real data behind the suggestion. Never autonomous spending without consent.
- **Misunderstanding is a safety event.** Optimize the confirm/read-back UX so a
  wrong parse is caught before money moves. Show the parsed intent next to the raw
  words. Make "cancel" always one tap/word away.
- Invent beyond this where it raises the bar — but no fake parse, no simulated trade,
  no fabricated confirmation. Every executed action is real and on-chain.

## States & edge cases (all designed)

Ambiguous / unparseable utterance (agent asks, doesn't guess); amount over spend
limit (refuse + explain budget); insufficient balance; unknown token/destination
(resolve via real data or ask); confirm timeout (auto-cancel, funds untouched);
user says "stop"/"cancel" mid-flow (hard abort before send); visitor or logged-out
attempts a fund action (refused server-side); LLM/worker proxy failure (honest
fallback to the manual HUD form — never a fake success); voice mishears a number
(read-back catches it). Mic permission denied -> graceful text fallback.

## Definition of done

Per the orchestration README. Plus: a real spoken/typed instruction produces a
correct structured intent, an explicit confirm step, and a **real** executed action
(tip or devnet trade) with an explorer link, all in the conversation; over-limit and
ambiguous cases are handled honestly; visitors cannot move funds by any phrasing;
no console errors; responsive; accessible (keyboard + text path fully works without a
mic).

When done: self-review + improvement pass, changelog entry, commit (explicit paths
only, push to **both** remotes if asked), then **delete this file**
(`prompts/agent-wallets/08-conversational-wallet.md`).

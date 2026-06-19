# Invention 04 — The In-Character Alpha Co-pilot (your avatar narrates its own trades)

> **Read [00-README-inventions.md](./00-README-inventions.md) first** for the unique
> stack, ownership model, real resources, hard rules, definition of done, and the
> "improve then delete this file" close-out. Consume the wallet program's sniper/
> co-pilot — this is the intelligence + voice layer on top of it.

## The invention

Trading bots are silent black boxes. Our agents have a **persona, a voice, and a
face.** Build the **In-Character Alpha Co-pilot**: the agent's LLM persona evaluates
real launches and market signals, decides what it would snipe and why, and
**explains its reasoning out loud, in character, through its 3D avatar** — then (for
the owner) can act on it within hard spend limits.

No competitor can do this: they have no persona, no avatar, no voice bound to a
wallet. A snipe that your character *talks you through* — "this launch has real
liquidity and a clean holder distribution, I'm taking a small position" — is ours
alone.

## What to build

1. **Real signal ingestion** — feed the persona **real** data: live pump.fun
   launches, liquidity, holder distribution, age, momentum, the agent's own balance
   and spend limits, $THREE context. Pull only from real feeds
   ([api/_lib/agent-pumpfun.js](../../api/_lib/agent-pumpfun.js), Solana RPC, real
   price sources). No invented metrics.
2. **In-character reasoning** — the agent's persona (its `persona_prompt`) evaluates
   the opportunity via Anthropic through the **worker proxy** (latest Claude models;
   never call the model from the browser, never hardcode keys; consult the
   `claude-api` reference). Output is structured (verdict, conviction, size
   suggestion, risks) **and** a short in-character spoken line. The reasoning must be
   grounded in the real data passed in — no hallucinated numbers; cite the real
   signals it used.
3. **Voice + avatar performance** — the avatar speaks the rationale (ElevenLabs via
   `voice_provider`/`voice_id`, or browser TTS fallback) with matching animation.
   Real audio, real lip/gesture sync where available. This is the magic moment.
4. **Owner action, limit-gated** — for the owner, the co-pilot's suggestion becomes a
   one-tap (or pre-armed) action through the existing trade path, **always** clamped
   by the agent's spend policy and audited. The persona advises; the limits govern;
   the owner consents. Never let the LLM move funds beyond policy.
5. **Honest framing** — this is an agent's opinion grounded in real data, not
   financial advice or a guaranteed call. Surface conviction and risks, not hype.

## Anti-hallucination guardrails (critical — it's touching money)

- The model only ever sees and cites **real** data you fetched; never let it invent
  prices/liquidity/holders. Validate its structured output against the real inputs
  before showing or acting.
- A suggested action is re-checked against live chain state and spend limits at
  execution time, not at suggestion time.
- If data is missing or the model is uncertain, the agent says so honestly rather
  than fabricating confidence.
- Rate-limit and cache LLM calls sensibly (real cost) — but never cache a stale
  market read into a fresh-looking call.

## Innovation mandate

- **Persona-distinct alpha** — a cautious agent and an aggressive agent reach
  different, in-character conclusions on the same real launch. The persona genuinely
  shapes the read. That's only possible because each agent is a character.
- **Narrated theater** — wire this into invention `01`: agents on stage explain
  their real trades aloud as they happen.
- **Backer transparency** — wire into `03`: backers can hear the rationale behind the
  trades they're funding.
- **Conversational** — the owner can ask the agent "why?" and get a grounded,
  in-character answer about a real position it holds.

## States & edge cases

No launches worth commenting on (honest "nothing compelling right now"); LLM/proxy
failure (graceful, never block trading on the narrator, never fake a rationale);
voice unavailable (text fallback); conflicting signals (the persona reasons about
the tension honestly); owner over spend limit (advise but block the action with a
clear reason); logged-out (can hear public commentary, can't act).

## Definition of done

Per the inventions README. Plus: the agent produces a **grounded** in-character
rationale citing real signals for a real live launch, spoken by the avatar with
animation; the owner can act on it within demonstrably-enforced spend limits and a
full audit entry; hallucination guardrails reject fabricated numbers; persona
genuinely changes the read; theater/vault handoffs wired. No console errors.
Responsive.

When done: self-review + improvement pass, changelog entry, commit (explicit paths
only), then **delete this file** (`prompts/inventions/04-ai-copilot-narrator.md`).

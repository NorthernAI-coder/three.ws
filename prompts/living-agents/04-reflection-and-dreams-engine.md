# Task 04 — Reflection & Dreams (memory consolidation engine)

> Read `prompts/living-agents/00-README.md` and `CLAUDE.md` first. Depends on Task 01.
> This task has a real backend component (endpoint + table + scheduled worker) — build
> all of it for real. No stubs.

## Mission

Give agents the ability to **reflect** — to consolidate raw memories into higher-order
insights on their own, especially while the user is away — and surface those insights as
reviewable **"dreams."** The user returns to find their agent has genuinely grown: it
noticed patterns, formed beliefs, raised questions. This is what makes an agent feel like
it has an inner life instead of a transcript.

## The innovation bar

This is the Stanford "Generative Agents" reflection mechanism, **productized and made
visible** — which nobody in the consumer-agent space has shipped well. The magic moments:
- "While you were away, I noticed you check $THREE alerts every morning — want me to brief
  you automatically?" (a real insight derived from real memory + action logs, proposing a
  real Autopilot rule — Task 08.)
- "Three of your conversations were about settlement speed — I've formed a belief: you
  prioritize finality over fees." (a synthesized `feedback`/`user` memory at higher salience.)
The user reviews each dream and **accepts** (it becomes a real, higher-salience memory /
proposed action) or **rejects** (the agent learns the synthesis was wrong — that rejection
is itself stored). The agent's growth is consensual and legible.

## What to build

1. **Reflection engine (backend, real LLM).**
   - New endpoint `POST /api/agent/reflect` (owner-only) that: pulls the agent's recent
     raw memories + `agent_actions` since last reflection, runs a real
     Anthropic/OpenAI pass via the existing worker proxy / `api/_lib/chat-models.js`
     (default to the latest Claude model per `CLAUDE.md` for synthesis quality), and
     produces candidate insights with: the synthesized statement, the source memory ids
     it drew from (provenance is mandatory — every dream cites its evidence), a proposed
     memory `type`/`salience`, and optionally a proposed Autopilot action.
   - Strict output schema; validate; never store an unparseable result.
2. **Storage.** New migration in `api/_lib/migrations/` for an `agent_reflections` (a.k.a.
   dreams) table: `id, agent_id, status (pending|accepted|rejected), statement,
   source_memory_ids (uuid[]), proposed_type, proposed_salience, proposed_action (jsonb),
   created_at, reviewed_at`. Follow the existing schema/migration conventions in
   `api/_lib/schema.sql`.
3. **Scheduling (real, not a fake timer).** Run reflection on a real trigger: a scheduled
   Cloudflare worker / Vercel cron over agents with recent activity, AND on-demand when the
   user opens the review surface. Debounce so you don't reflect on every page load. Respect
   rate/cost limits (cap reflections per agent per day; log what was skipped — no silent caps).
4. **Dreams review UI.** A surface (in `/agent/{id}/edit` and reachable from the Companion's
   `dream:created` badge) listing pending dreams, each showing the insight + its cited source
   memories (link into the Mind Palace, Task 03). Accept → real write to `/api/agent-memory`
   at the proposed salience and/or hand a proposed rule to Autopilot (Task 08); Reject →
   store the rejection signal. Emit `dream:created` / `memory:added` on the bus.
5. **Make the act of dreaming visible.** When reflection runs, emit a bus event so the
   Companion (Task 02) can show the agent "sleeping/dreaming" and the Mind Palace can show
   memories consolidating. The visualization must reflect a real reflection run, not a
   decorative animation.

## Wiring & real-API mandate

- Real LLM inference through the existing proxy — never a canned insight string.
- Real reads of `agent_memories` + `agent_actions`; real writes on accept.
- Provenance is non-negotiable: a dream with no real source memories is a bug.

## Definition of done

- [ ] `POST /api/agent/reflect` runs a real model pass and persists schema-valid dreams
      with cited source memory ids; migration applied and consistent with `schema.sql`.
- [ ] A real scheduled job reflects for active agents with daily caps + skip logging.
- [ ] Review UI: accept writes a real higher-salience memory (verify in Mind Palace) and/or
      proposes an Autopilot rule; reject stores the signal. Bus events emitted.
- [ ] Loading/empty ("no new reflections yet")/error states designed; cost/rate limits real.
- [ ] No console errors/warnings; `npm test` passes; `git diff` reviewed.
- [ ] Changelog entry (`feature`) + `npm run build:pages`.

## Self-improvement pass

Ask: does this feel like a mind that grows, or a batch job? Add the elevating layer — a
"dream journal" the user can browse over time, reflections that ask the user a real
clarifying question when confidence is low (and store the answer), or meta-reflection that
prunes/merges stale memories. Build the most compelling one, fully wired and cost-bounded.

## When done

Delete this file. Report the reflection schema, the scheduling mechanism, and the
accept/reject write paths.

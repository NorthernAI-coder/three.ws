# Task T2.1: Free TTS lane — bring avatar speech back without the dead OpenAI key

You are a senior engineer working in the **three.ws** repo (`/workspaces/three.ws`).
Read `CLAUDE.md` first and obey it, then read `tasks/nvidia-nim/PLAN.md` and
`tasks/nvidia-nim/probes/tts.md` (the verified API recipe — it decides this task's
shape).

**Dependencies:** T0.3 (TTS probe committed).

## Context

`api/tts/speak.js` is hard-wired to `OPENAI_API_KEY`, which is over quota in prod —
avatar speech is **dead right now**. Platform policy (api/_lib/llm.js doctrine): free
lane first, paid backstop, never a hard fail with a free lane available.

## Steps

1. **Decision gate:** if the probe found hosted REST TTS (Magpie/Riva), proceed. If it
   found gRPC-only, evaluate the realistic effort honestly, record the decision and
   reasoning in the PLAN.md Worklog FIRST, and only build if it's sane — otherwise mark
   T2.1 `[!]` blocked with the findings and stop.
2. Restructure `api/tts/speak.js` to the free-first pattern: NIM TTS as the first lane,
   OpenAI as the paid backstop. Per-attempt timeouts. Fail over only **before** any
   audio bytes have been streamed to the client.
3. Map the existing voice names (`nova`, etc. — see the `VOICES` set in the file) to the
   nearest NIM voices so every existing caller keeps working unchanged.
4. Keep the `x-tts-voice` / `x-tts-model` response headers truthful about what actually
   served.
5. Update the MCP twin `packages/avatar-agent-mcp/src/tools/speak.js` with the same
   chain — same policy, both surfaces.
6. Tests for the failover ordering (NIM serves → OpenAI never called; NIM fails → OpenAI
   backstop; both fail → clean 502).

## Done when

- A local run produces audible audio via NIM with OpenAI never called.
- The chain degrades correctly when NIM is forced to fail.
- Tests green.

## Before you finish (mandatory bookkeeping)

Tick T2.1 in `tasks/nvidia-nim/PLAN.md`, append a dated Worklog entry, and commit with
explicit path staging (re-check `git status` / `git diff --staged` first — concurrent
agents share this worktree).

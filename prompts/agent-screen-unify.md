# Unify the Agent-Screen Pipeline — make the 3D desk monitor show the REAL browser feed

> Self-contained task. Paste into a fresh chat and execute end-to-end. Read `CLAUDE.md`
> and `STRUCTURE.md` first — CLAUDE.md overrides defaults.

## The bug (verified)

There are **two parallel, incompatible agent-screen systems** in this repo. The live
headless-browser worker pushes to one; the 3D world desk monitor reads from the other.
They share no endpoint, no Redis key, and no message format, so **frames captured by the
real worker never reach the 3D monitor.** The monitor only ever shows a hand-drawn canvas
fallback (`paintDesk()` → `/api/agent-actions` rows, or "Waiting for agent activity…").

| | **System A** | **System B** |
|---|---|---|
| Stream endpoint | `api/agent/screen-stream.js` (`/api/agent/screen-stream`) | `api/agent-screen-stream.js` (`/api/agent-screen-stream`) |
| Push endpoint | `api/agent/screen-push.js` (`/api/agent/screen-push`) | `api/agent-screen-push.js` (`/api/agent-screen-push`) |
| Storage | `cacheGet('screen:frame:{id}')` | Redis `agent:screen:{id}:frame` (TTL 90s) |
| SSE shape | unnamed `data:` events, `{type:'frame', frame:<base64>, seq, ts}` | **named** events `event: frame` + `{ts, data, activity, type}` |
| Consumers | `src/game/agent-desk.js`, `src/agents-live.js` | `src/agent-screen.js` (2D page), `src/walk-agent-desk.js`, `src/shared/agent-screen-client.js` |
| **Worker pushes here?** | ❌ no | ✅ yes — `workers/agent-screen-worker/config.js:17` (`PUSH_URL` default `/api/agent-screen-push`) |

History: `prompts/agent-playwright-stream.md` built System A; `prompts/agent-screen-browser-worker.md`
built System B. Both claim the desk monitor renders their feed. Only B is fed by a running worker.

## Goal

**One** agent-screen pipeline. The frame a worker pushes must appear, verbatim, on ALL of:
- `/agent-screen?agentId=<uuid>` (2D page)
- the agent profile watch panel
- the 3D world desk monitor in `/play` (the coin-community plaza)

When no worker is pushing, every surface shows the same honest "waiting / live activity"
fallback — no fake browser chrome implying a stream that isn't there.

## What to do

1. **Pick System B as the canonical pipeline** (it's what the shipped worker, the 2D page,
   and `walk-agent-desk.js` already use, and it has proper Redis TTL + rate limiting). Do NOT
   keep both. Converging on A would orphan the deployed worker.

2. **Rewrite `src/game/agent-desk.js` to consume System B.** Today it uses
   `FRAME_SSE_URL = /api/agent/screen-stream` + `es.onmessage` + `msg.type==='frame'` + `msg.frame`
   (agent-desk.js:39-40, 316-333). Replace that hand-rolled `EventSource` with the shared client
   `src/shared/agent-screen-client.js` (`createAgentScreenClient`) exactly as `src/walk-agent-desk.js`
   already does — it handles named `frame`/`log`/`dark`/`ping` events, reconnect/backoff, and gives
   you `frame.data` (a ready-to-use `data:image/...;base64,` URL → assign straight to `img.src`, no
   prefix surgery). Keep the existing `paintDesk()` canvas as the *fallback only* (no frames / dark).

3. **Delete System A** once nothing references it: `api/agent/screen-stream.js`,
   `api/agent/screen-push.js`, and `api/agent/caster-config.js` (confirm with
   `grep -rn "agent/screen-stream\|agent/screen-push\|screen:frame:\|caster-config" src/ api/ workers/`).
   Update `src/agents-live.js` to System B too. If `prompts/agent-playwright-stream.md` is the only
   thing still describing System A, update it to point at the unified pipeline (or delete it — it's
   superseded by `agent-screen-browser-worker.md`).

4. **Reconcile the activity fallback.** System A's stream merged `/api/agent_actions` DB rows into the
   SSE as `activity`. System B's `agent-screen-stream.js` already emits `log` entries. Make the desk's
   fallback read the same source the 2D page uses so all surfaces agree. No new endpoint unless one is
   genuinely missing — reuse what exists.

5. **Verify end-to-end with a real worker (no mocks).** Start the worker against a real agent you own:
   `cd workers/agent-screen-worker && npm install && AGENT_ID=<uuid> AGENT_JWT=<key> npm start`
   (mint the key at `/agent-screen` with no `agentId`). Then confirm the SAME frames appear on the 2D
   page AND the 3D desk monitor in `/play`. Screenshot both. Stop the worker → both must fall back to
   the waiting state within the TTL, not freeze a stale frame.

## Acceptance criteria

- [ ] Exactly one screen pipeline remains; System A files deleted; no dead `grep` hits.
- [ ] `src/game/agent-desk.js` uses `createAgentScreenClient` (System B), not a hand-rolled EventSource.
- [ ] A running worker's frames render identically on the 2D page and the 3D desk monitor.
- [ ] No worker → identical honest fallback on every surface (no fake browser window).
- [ ] No console errors/warnings from changed code; `npm test` passes; build has no esbuild-bundled `api/*.js`.
- [ ] `data/changelog.json` entry (tag `fix`) + `npm run build:pages`.

## Operating rules (non-negotiable)

- No mocks / fake data / placeholders / TODOs / stubs. Real worker, real frames, real verification.
- `$THREE` is the only coin (CA `FeMbDoX7R1Psc4GEcvJdsbNbZA3bfztcyDCatJVJpump`). Reference no other token anywhere.
- Concurrent agents share this worktree — stage explicit paths (never `git add -A`); re-check
  `git status` / `git diff --staged` before committing.
- esbuild trap: never commit `api/*.js` starting with `__defProp`/`createRequire`; recover with
  `git restore -- api/ public/`.
- Definition of done = CLAUDE.md's checklist. `git diff` reviewed line-by-line before claiming complete.

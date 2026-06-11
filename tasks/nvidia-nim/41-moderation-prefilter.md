# Task T4.2: Free moderation pre-filter for anonymous chat (fail-open)

You are a senior engineer working in the **three.ws** repo (`/workspaces/three.ws`).
Read `CLAUDE.md` first and obey it, then read `tasks/nvidia-nim/PLAN.md` for context.

**Dependencies:** Phases 1–3 shipped (do not start before).

## Goal

Run our own content moderation on anonymous chat traffic using free NIM safety models,
instead of inheriting third-party moderation gates.

## Steps

1. **Probe first:** NemoGuard / Llama Guard hosted on NIM — invocable on the free tier?
   Request/response schema, categories, latency (it sits on the hot path — measure).
   Commit `tasks/nvidia-nim/probes/moderation.md`.
2. **Pre-moderation pass for ANONYMOUS surfaces only** (signed-in users are already
   rate-limited and attributable): the anon path in `api/chat.js`, widget chat
   (`api/widgets/[id]/[action].js`), and `api/chat/proxy.js`.
3. **Fail-open is non-negotiable:** a moderation outage must never block chat — it's a
   filter, not a gate. Timeout small (the probe's latency number + margin), and on any
   error proceed un-moderated.
4. **Config-flagged** (env var) so it can be disabled instantly in prod without a
   deploy.
5. A blocked message gets a designed, non-preachy refusal in the normal reply format —
   not an HTTP error.
6. **Second-order effect to evaluate:** `openai/gpt-oss-120b:free` was demoted in
   `api/_lib/chat-models.js` because OpenRouter moderation-gates it (403 "requires
   moderation"). If we pre-moderate ourselves, that route may be safely re-promotable —
   test it, and update the catalog + its comments if so.
7. Tests: block path, allow path, outage fail-open, flag-off bypass. Changelog entry.
   Deploy + verify.

## Done when

Anonymous chat runs behind the free pre-filter in prod, fail-open verified (force a
moderation failure and watch chat keep working), kill-switch flag verified.

## Before you finish (mandatory bookkeeping)

Tick T4.2 in `tasks/nvidia-nim/PLAN.md`, append a dated Worklog entry (include the
gpt-oss re-promotion decision), and commit with explicit path staging.

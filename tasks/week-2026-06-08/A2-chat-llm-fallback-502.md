# A2 — Fix `/api/chat` 502s by hardening the LLM fallback chain

**Track:** A — production fire · **Priority:** P0 · **Effort:** ~half day · **Depends on:** none
**Human prerequisite:** confirm `ANTHROPIC_API_KEY` is set in Vercel prod (see below) before relying on the code fix.

## Context (evidence)

`/api/chat` is the **single most-used endpoint** in production and is failing **~38% of the time**:
in the last 24h, **102 × 200 vs 66 × 502 + 4 × 500**. The same root cause also 502s
`/api/marketplace/agents/:id/preview` (8×) and `/api/persona/extract` (2×).

Log lines:
- `[chat:openrouter] <code> (final — all <n> route(s) exhausted) Provider returned error`
- `[chat:groq] Rate limit reached for model llama-3.3-70b-versatile`
- `[brain:gpt-4o-mini] native provider failed (You exceeded your current quota...)`
- `[preview:openai] You exceeded your current quota`

### Root cause (already investigated — verify, then fix)

The deployed fallback chain is effectively **`groq (429) → openrouter (flaky free tier) → openai
(quota-dead)`**. The one reliable paid link, **Anthropic**, is (a) likely **unset in prod** and
(b) **structurally starved**: `MAX_FALLBACK_ATTEMPTS = 3` with the primary + a *same-Groq-account*
sibling occupying slots 0–1, so Anthropic (4th in default order) often never gets a slot. When
Groq throttles and OpenRouter 5xxes in the same request, the terminal path returns a **hard 502**
instead of degrading.

Key locations (confirm before editing — line numbers may have drifted):
- `api/_lib/chat-models.js:122` — `DEFAULT_PROVIDER_ORDER = ['groq','openrouter','anthropic','openai']`
- `api/_lib/chat-models.js:150` — `MAX_FALLBACK_ATTEMPTS = 3`
- `api/chat.js:711-735` — `pickProvider` (skips providers whose key is falsy)
- `api/chat.js:747-752` — `FALLBACK_SIBLINGS` (the same-account Groq sibling)
- `api/chat.js:770-801` — `buildFallbackChain`
- `api/chat.js:576-586` — terminal response (the hard 502)
- `api/chat.js:404-423` — existing per-call/total timeout-budget pattern to mirror elsewhere
- `api/brain/chat.js:21, 363-375` — `maxDuration=120`, `streamText` with no abort budget (caused a 30.7s near-timeout)
- `api/persona/extract.js:191-201` and `api/persona/preview.js:137-147` — single-shot, **no failover**
- `api/marketplace/[action].js:804, 806, 845` — preview chain order + failover condition + 502
- `api/_lib/llm.js:78, 115-148` — shared `llmComplete` with ordered failover + per-attempt `AbortSignal.timeout` (currently only adds Anthropic for BYOK)
- `api/_lib/cache.js` — exists, currently unused by chat; use it for the circuit-breaker

## Human prerequisite (do this first)

Confirm `ANTHROPIC_API_KEY` is present in Vercel production env for **both** deploy targets. If
absent, set it (the platform has Anthropic access per CLAUDE.md). Also **remove or top up** the
quota-dead `OPENAI_API_KEY` — as-is it only burns the final attempt before the 502. Note the
outcome in your commit message. The code changes below assume Anthropic is keyed.

## What to do (code)

1. **Reorder the chain to Anthropic-first** in `api/_lib/chat-models.js:122`:
   `DEFAULT_PROVIDER_ORDER = ['anthropic', 'groq', 'openrouter', 'openai']`.
   Mirror the same order in the preview chain at `api/marketplace/[action].js:845`.

2. **Stop wasting a fallback slot on the same Groq account.** Either drop the Groq sibling from
   `FALLBACK_SIBLINGS.groq` (`api/chat.js:749`) so a fallback slot goes to a *different* provider,
   or raise `MAX_FALLBACK_ATTEMPTS` to `4` (`chat-models.js:150`). Prefer dropping the same-account
   sibling — real provider diversity beats a second attempt against the throttled account.

3. **Never return a hard 502 on capacity exhaustion.** In the terminal path
   (`api/chat.js:576-586`), broaden the "rate limited" branch so that **any** all-routes-exhausted
   outcome (429 *or* upstream 5xx / "Provider returned error") returns **`503` with a
   `Retry-After` header**, not a 502. The client already knows how to back off on 503+Retry-After.
   (Optional, nicer: emit a graceful `200` SSE `done` with a short "assistant is briefly at
   capacity, try again" message so the chat UI never shows a hard error.)

4. **Add a provider-health circuit breaker.** When a provider returns 429/5xx, record a short
   cooldown (30–60s) in `api/_lib/cache.js`; have `buildFallbackChain` (`api/chat.js:770-801`) skip
   a provider that is in cooldown. This stops every request from re-hitting Groq while it is
   globally throttling — the mechanism that turns one throttle window into dozens of 502s.

5. **Bound `/api/brain/chat`.** Add an `abortSignal: AbortSignal.timeout(budgetMs)` to each
   `streamText` attempt (`api/brain/chat.js:363-375`), where `budgetMs` is a per-attempt ceiling
   (~20s) bounded by remaining wall-clock — mirror the `api/chat.js:404-423` pattern. A hung native
   provider must abort fast and hand off to the OpenRouter fallback while time remains.

6. **Give persona/extract + persona/preview real failover.** Replace the hand-rolled single-shot
   `resolveProvider()` calls (`extract.js:191-201`, `preview.js:137-147`) with the shared
   `llmComplete` from `api/_lib/llm.js`. Extend `llm.js` `providerChain` (`llm.js:78`) to also use a
   **server** `env.ANTHROPIC_API_KEY` (today it only adds Anthropic for a passed BYOK key) so these
   endpoints get the same Anthropic-first ordered failover.

## Acceptance criteria

- [ ] With Anthropic keyed, the happy path resolves on attempt 0 (Anthropic); fallbacks only
      engage when Anthropic itself errors.
- [ ] An exhausted chain returns **503 + Retry-After**, never a hard 502.
- [ ] A throttled provider is skipped for a cooldown window on subsequent requests.
- [ ] `/api/brain/chat` cannot exceed its abort budget per attempt; no more ~30s hangs.
- [ ] `/api/persona/extract` and `/api/persona/preview` fail over across providers instead of
      502-ing on the first non-2xx.
- [ ] No regression to streaming, tool-calling, or rate-limit headers on `/api/chat`.

## Verification

1. `npx vitest run` for any chat/LLM tests under `api/` and `tests/`.
2. Locally (`npm run dev`), drive `/api/chat` with a normal prompt and confirm a 200 stream.
3. Simulate exhaustion: temporarily unset the upstream keys in a local env and confirm the endpoint
   returns **503 + Retry-After** (not 502), and that the cooldown path is exercised.
4. Confirm `/api/brain/chat` aborts an artificially slow attempt within budget and still answers via
   fallback.

## Rules

Obey [CLAUDE.md](../../CLAUDE.md). No mocks. Default to the latest Claude models for the Anthropic
link (e.g. `claude-sonnet-4-6` for chat); do not invent model IDs — verify against the codebase's
existing Anthropic model constants. If you touch model selection, consult the `claude-api` skill
reference rather than guessing IDs.

## Completion protocol

1. Re-read your diff (`git diff`) and confirm every line is justified.
2. Delete this file: `tasks/week-2026-06-08/A2-chat-llm-fallback-502.md`.
3. Commit your code change **and** this file's deletion together, e.g.:
   `git add -A && git commit -m "fix(chat): Anthropic-first fallback, 503-not-502 on exhaustion, provider cooldown, brain abort budget; close A2"`
4. Do **not** push — the human controls pushes.

# Fix 06 — `/api/brain/chat` OpenRouter credit ceiling + invalid Responses-API payloads (P1, ~95 lines)

## The errors (verbatim)

```
APICallError [AI_APICallError]: This request requires more credits, or fewer max_tokens.
  You requested up to 1024 tokens, but can only afford 788. (also 300/4000/4096/8000)
APICallError [AI_APICallError]: Invalid Responses API request
APICallError [AI_APICallError]: Input contains unsupported content types or unsupported content fields
RetryError [AI_RetryError]: Failed after 3 attempts. Last error: Rate limit reached for model `llama-3.3-70b-versatile`
```

All on `/api/brain/chat`, which uses the Vercel AI SDK `OpenAIResponsesLanguageModel`
(`doStream`) against OpenRouter.

## Root cause

Three distinct, separately-fixable problems:

1. **`requires more credits, or fewer max_tokens`** — we send a fixed `max_tokens` (1024,
   4000, 4096, 8000…) that exceeds what the OpenRouter free-tier balance can afford for that
   request. The model literally tells us the affordable ceiling (e.g. "can only afford 788")
   and we don't adapt.
2. **`Invalid Responses API request`** — we're sending payloads the OpenAI **Responses API**
   shape rejects. Likely a model that doesn't speak the Responses API is being routed
   through `OpenAIResponsesLanguageModel`, or a malformed field. This is a code bug.
3. **`unsupported content types or unsupported content fields`** — we're passing message
   content parts (images? tool blocks? custom fields?) the target model/endpoint doesn't
   support. Another payload-shape bug.

## Required fix

Find the handler: `api/brain/chat.js` (source — the deployed file is bundled). Trace how the
model, `max_tokens`, and message content are assembled.

1. **Adaptive token budget.** Don't hardcode `max_tokens`. Either (a) lower the default to a
   value the free tier reliably affords, or (b) parse the upstream "can only afford N" and
   retry once with `max_tokens = N` (the API hands us the number). Prefer a sane default
   *plus* the adaptive retry so we never hard-fail on this. Never silently truncate the
   user's content — reduce the *completion* budget, not the input.
2. **Match the API surface to the model.** Audit which models `brain/chat` routes to and
   whether each actually supports the **Responses API**. Models that don't must use the
   Chat Completions surface (or a model that does). Fix the `Invalid Responses API request`
   at the source — don't retry a structurally-invalid request.
3. **Sanitize content parts** to what the target model supports before sending. If a model
   can't take a given content type (image/tool/custom field), either drop/transcode it for
   that model or route to one that supports it. Validate the payload before the call.
4. **Bound retries** so `RetryError ... Failed after 3 attempts` on a rate-limited free model
   falls over to a working model (coordinate with Fix 03's ladder) instead of dead-ending.

## Verification

- Drive `/api/brain/chat` with a long-completion request on the free tier — it succeeds with
  an adapted token budget, no `requires more credits` failure.
- Send a multimodal / tool message — content is validated/sanitized; no `unsupported content
  types`.
- Confirm no `Invalid Responses API request` for any routed model (each model uses the API
  surface it actually supports).
- Post-deploy logs: these three `AI_APICallError` signatures gone.

## Definition of done

`brain/chat` adapts its token budget to the available balance, routes each model to the API
surface it supports, validates/sanitizes content before sending, and falls over cleanly on
rate limits — no `AI_APICallError` for these three causes.

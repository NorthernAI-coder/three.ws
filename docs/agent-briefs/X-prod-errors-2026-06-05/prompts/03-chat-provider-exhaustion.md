# Fix 03 — `/api/chat` LLM provider fallback exhaustion + routing bugs (P0, ~700 lines)

## The errors (verbatim samples)

```
[chat:groq] 429 — falling over to groq/llama-3.1-8b-instant: {"error":{"message":"Rate limit reached for model `llama-3.3-70b-versatile`...
[chat:openrouter] 429 — falling over to openai/gpt-4o-mini: {"error":{"message":"Provider returned error","code":429...
[chat:openai] 429 (final — all 4 route(s) exhausted) You exceeded your current quota, please check your plan and billing
[chat:openrouter] meta-llama/llama-3.2-3b-instruct:free has no tool-capable endpoint — retrying without action tools
[chat:openrouter] 404 — falling over to groq/llama-3.3-70b-versatile: {"error":{"message":"No endpoints found for mistral...
[chat:openrouter] 403 (final — all 5 route(s) exhausted) openai/gpt-oss-120b:free requires moderation on OpenInference
```

`/api/chat` and `/api/llm/anthropic`. When the chain is fully exhausted the user gets a
hard failure. The chain churns through 4-5 providers per request, multiplying latency and
burning quota on every turn.

## Root cause

1. **Operational:** OpenAI key is over quota/billing (`exceeded your current quota`); free
   OpenRouter models are aggressively rate-limited and some are gated (403 moderation, 404
   no-endpoint). Groq free tier 429s under our load.
2. **Code-level (fix these — they are real bugs, not just quota):**
   - The fallback ladder **leads with free, rate-limited models** and only reaches paid,
     reliable models last — so the common path is "try 4 things that fail, then succeed,"
     paying full latency every time.
   - Models with **no tool-capable endpoint** are placed in a tool-calling chain and only
     discovered at call time (`has no tool-capable endpoint — retrying without action
     tools`). The route table should *know* a model's capabilities and skip it for
     tool-required requests instead of round-tripping.
   - **Dead/invalid routes** are in the ladder: `mistralai/mistral-7b-instruct:free` →
     `404 No endpoints found`; `gpt-oss-120b:free` → `403 requires moderation`. These will
     *never* succeed and should be removed.

## Required fix

Find the chat routing config (`grep -rln "DEFAULT_PROVIDER_ORDER\|PROVIDER_MODEL_DEFAULTS\|falling over" api/_lib api/chat*`; see `api/_lib/chat-models.js`).

1. **Reorder the ladder by reliability, not by cost-first.** Lead with a model that
   actually answers under current quota. Keep cheaper/free models as *lower-priority*
   fallbacks, not the primary path. Document the ordering rationale inline.
2. **Make routing capability-aware.** Annotate each model with `{ tools: bool, moderationGated: bool }`.
   For tool-required requests, skip non-tool models entirely instead of calling then
   retrying-without-tools. Never call a model the request can't use.
3. **Remove permanently-broken routes** from the table: any model returning `404 No
   endpoints found` or `403 requires moderation` consistently. Don't carry dead weight.
4. **Bound the chain.** Cap total fallback attempts and total wall-clock so a request can't
   churn through 5 providers and still time out at 30s. On full exhaustion, return a clean,
   actionable error to the client (not a stack trace), and surface *which* providers failed.
5. **Surface the quota reality to the user (ops):** OpenAI is over quota. The user must
   top up billing or we must not route to it as a "final" tier. State this explicitly with
   the failing key/account so they can act.

## `/api/llm/anthropic` specific (2 lines, but a real bug)
`TypeError: Body is unusable: Body has already been read` — the upstream `Response` body is
read twice (e.g. `.json()` then `.text()` in the error path). Read it **once** into a
variable and reuse. See Fix 12 if scoped there; otherwise fix here.

## Verification

- Unit-test the route selector: a tool-required request never returns a non-tool model;
  removed dead routes never appear; ordering is reliability-first.
- Drive `/api/chat` with a normal prompt and a tool-using prompt — first-attempt success on
  the primary model under normal conditions (no 4-deep fallback churn in the happy path).
- Confirm bounded behavior: simulate all providers 429 → client gets one clean terminal
  error within the time budget, not a 30s timeout.
- After deploy, logs show the fallback ladder is *short* in the common case.

## Definition of done

Happy-path chat hits a working model first; tool requests never round-trip through
non-tool models; dead routes are gone; exhaustion returns a clean bounded error; the user
knows exactly which provider account needs funding.

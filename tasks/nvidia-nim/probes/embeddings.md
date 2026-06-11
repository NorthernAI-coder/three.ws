# Probe: NVIDIA NIM — Embeddings + Reranker (retrieval lane)

**Date:** 2026-06-11 · **Task:** T0.3 (Phase 0) · **Key:** `NVIDIA_API_KEY` (`nvapi-…`, redacted)

**Verdict:** ✅ **Embeddings + reranker both invocable on the hosted free tier.** Embeddings
are OpenAI-compatible at `integrate.api.nvidia.com/v1/embeddings` and **require** the extra
`input_type: "query"|"passage"` field (confirmed). Reranker is a separate non-OpenAI
endpoint on `ai.api.nvidia.com`. This unblocks Phase 3 (widget RAG).

> ⚠️ **EOL trap:** the model named in the plan, `nvidia/llama-3.2-nv-embedqa-1b-v2`, is
> **GONE** — `410 Gone, end of life 2026-05-18`. So is the reranker
> `nvidia/llama-3.2-nv-rerankqa-1b-v2` (410, same date). Use the live models below.

---

## Live embedding models (verified 200 on this account)

| model id                              | dim  | notes |
|---------------------------------------|------|-------|
| `nvidia/nv-embedqa-e5-v5`             | **1024** | E5 retrieval QA; fast (~0.45 s). **Recommended default** for widget RAG. |
| `nvidia/llama-nemotron-embed-1b-v2`   | **2048** | Higher-dim successor to the EOL'd `llama-3.2-nv-embedqa-1b-v2`. ~0.6 s. |

**Listed in `/v1/models` but NOT invocable on this free account** (return
`404 … Not found for account …` — provisioned/deploy-only): `nvidia/embed-qa-4`,
`nvidia/nv-embedqa-mistral-7b-v2`, `snowflake/arctic-embed-l`. Don't build against these
without confirming provisioning. (`/v1/models` lists 120 ids; presence ≠ invocable.)

## Embeddings endpoint (OpenAI-compatible)

```
POST https://integrate.api.nvidia.com/v1/embeddings
Authorization: Bearer $NVIDIA_API_KEY
Content-Type: application/json
```

Request:
```json
{
  "model": "nvidia/nv-embedqa-e5-v5",
  "input": ["text one", "text two"],
  "input_type": "passage",          // REQUIRED — "query" or "passage"
  "encoding_format": "float"         // optional
}
```

Response (standard OpenAI shape):
```json
{
  "data": [{"index":0,"embedding":[0.01, ...]}, ...],
  "model": "nvidia/nv-embedqa-e5-v5",
  "usage": {"prompt_tokens": 22, "total_tokens": 22}
}
```

### `input_type` — confirmed mandatory (asymmetric models)
- Omitted → **400** `{"error":"'input_type' parameter is required for asymmetric models"}`.
- Must be exactly `"query"` or `"passage"` → invalid value (e.g. `"document"`) → **400**
  `Input should be 'query' or 'passage'`.
- **RAG contract:** embed corpus chunks with `input_type:"passage"` at ingest, embed the
  user's question with `input_type:"query"` at search time. Mismatching them degrades recall.

### Limits (probed empirically)
- **Max input length: 512 tokens per item.** A ~4000-word single input → **400**
  `Input length 4032 exceeds maximum allowed token size 512`. **Chunk to ≤512 tokens.**
- **Batch size:** 512 inputs per request returned 200 (`n=512`). 256 and 300 also fine. 512
  is comfortably enough for batched ingest; throttle for the free tier rather than maxing it.
- Vectors are **not** unit-normalized guaranteed — normalize client-side if your store needs it.

### Rate-limit headers
None on success — only `nvcf-reqid` / `nvcf-status: fulfilled`. Free tier is credit-metered;
expect 429 under load → treat as `rate_limited` and back off (same pattern as the other lanes).

---

## Reranker (separate endpoint — NOT OpenAI-shaped)

```
POST https://ai.api.nvidia.com/v1/retrieval/nvidia/reranking
Authorization: Bearer $NVIDIA_API_KEY
Content-Type: application/json
```

- **Live model on this account: `nvidia/rerank-qa-mistral-4b`** (HTTP 200, ~0.25 s).
  - Discovered via the endpoint's own error: posting an unknown model returns
    `Available models are: ['nvidia/rerank-qa-mistral-4b', 'nv-rerank-qa-mistral-4b:1']`.
  - `nvidia/nv-rerankqa-mistral-4b-v3` → `404 Not found for account` (deploy-only here).
  - The v2/3 `…/<model>/reranking` path style and `integrate…/v1/ranking` both 404 — use
    the `…/retrieval/nvidia/reranking` path above with the model in the body.

Request:
```json
{
  "model": "nvidia/rerank-qa-mistral-4b",
  "query":   {"text": "What is the capital of France?"},
  "passages":[{"text":"Paris is the capital of France."},
              {"text":"Berlin is in Germany."},
              {"text":"The Eiffel Tower is a famous landmark in Paris."}]
}
```

Response — `rankings` sorted best-first, each pointing back to the input passage `index`
with a relevance `logit` (higher = more relevant; values are unbounded logits, not 0–1):
```json
{
  "rankings": [
    {"index": 0, "logit":  3.77},
    {"index": 2, "logit": -12.72},
    {"index": 1, "logit": -14.63}
  ]
}
```
- Use as a **post-retrieval reorder** in T3.2: pull top-N by embedding cosine, then rerank
  and keep top-k. `index` maps to your candidate array. No `input_type` field here.

---

## Reproduction (key redacted)

```bash
KEY="nvapi-…"   # from .env.local / .env — NEVER commit the real value

# embeddings
curl -s https://integrate.api.nvidia.com/v1/embeddings \
  -H "Authorization: Bearer $KEY" -H 'Content-Type: application/json' \
  -d '{"model":"nvidia/nv-embedqa-e5-v5","input":["Paris is the capital of France."],"input_type":"passage"}' \
  | python3 -c "import sys,json;v=json.load(sys.stdin)['data'][0]['embedding'];print('dim',len(v))"   # -> dim 1024

# reranker
curl -s https://ai.api.nvidia.com/v1/retrieval/nvidia/reranking \
  -H "Authorization: Bearer $KEY" -H 'Content-Type: application/json' \
  -d '{"model":"nvidia/rerank-qa-mistral-4b","query":{"text":"capital of France?"},
       "passages":[{"text":"Paris is the capital of France."},{"text":"Berlin is in Germany."}]}'
# -> {"rankings":[{"index":0,"logit":...},{"index":1,"logit":...}]}
```

## Impact on Phase 3 (T3.1–T3.3)
- Free primary embedder = **`nvidia/nv-embedqa-e5-v5` (1024-dim)**. **This is a different
  vector space and a different dimension from OpenAI** (`text-embedding-3-small` = 1536) —
  the plan's "tag every vector with embedder id + dim, never mix at query time" rule is
  mandatory: stored OpenAI rows can't be queried with NIM vectors and vice-versa.
- Chunk corpus to **≤512 tokens** before ingest (hard cap), batch ≤512 per call, throttle.
- Optional reranker stage available for free (`nvidia/rerank-qa-mistral-4b`) for T3.2's
  top-3 relevance bump — no extra provisioning needed.

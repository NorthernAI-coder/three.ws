# Probe: NVIDIA NIM — vision / image understanding (VLM chat models)

**Date:** 2026-06-11 · **Task:** T4.1 (Phase 4) · **Key:** `NVIDIA_API_KEY` (`nvapi-…`, redacted below)

**Verdict:** ✅ **Fully invocable on the hosted free tier, via the OpenAI-compatible chat
host** (`integrate.api.nvidia.com/v1/chat/completions`) — the **same host and protocol as
the chat lanes in `api/_lib/llm.js`**, not the `ai.api.nvidia.com/v1/genai` host the FLUX /
TRELLIS image-*generation* models use. Multimodal messages use the standard OpenAI
`content: [{type:'text'}, {type:'image_url', image_url:{url}}]` shape. Synchronous JSON, no
202/poll, no NVCF asset handshake. This is a drop-in free first lane for a vision helper
mirroring `llmComplete`.

---

## Endpoint

```
POST https://integrate.api.nvidia.com/v1/chat/completions
```

- Auth: `Authorization: Bearer $NVIDIA_API_KEY`
- `Content-Type: application/json`
- Body is the ordinary OpenAI chat-completions body; the only difference from the text
  lanes is that a user message's `content` is an **array** of parts, with one or more
  `image_url` parts alongside the text.

## Models invocable on this account (all 200, all multimodal)

| model id                          | prompt tokens for a 1×1 px image | notes |
|-----------------------------------|----------------------------------|-------|
| `nvidia/nemotron-nano-12b-v2-vl`  | **281**                          | **chosen primary** — cheapest token footprint, fast, clean instruction-following + JSON output |
| `meta/llama-3.2-11b-vision-instruct` | ~290                          | chosen **second free lane** (different model family → independent failure modes) |
| `meta/llama-3.2-90b-vision-instruct` | **1616**                      | works, but ~5–6× the image-token cost of nemotron for no quality gain on our tasks; not used |

Nemotron is the right interactive pick. Llama-3.2-11B is the free backstop. Paid backstop
is OpenAI `gpt-4o-mini` (already vision-capable, already priced in `llm-pricing.js`).

## Image input encoding (two accepted forms — both verified live)

1. **Inline data URI** — `image_url.url = "data:image/jpeg;base64,<b64>"`. Verified with
   1×1 px, 800×600 (11 KB body), and **1024² (707 KB body) and 1280² (2.07 MB body)** —
   **no inline-size limit hit** on this host (unlike the 180 KB NVCF asset ceiling on the
   `genai` TRELLIS host; that handshake does **not** apply here).
2. **Direct http(s) URL** — `image_url.url = "https://…"`. The model server fetches it
   server-side. Verified working against `picsum.photos`. **Caveat:** some hosts block the
   fetcher — `upload.wikimedia.org/.../thumb/...` returned `500 Use thumbnail sizes listed
   on …`. So a passed-through URL is only as reliable as that origin's bot policy.

**Helper decision:** the helper accepts either `{ imageUrl }` (pass-through, default — used
for our own first-party R2 URLs and arbitrary claim image URLs) or `{ imageBase64, mimeType }`
(inlined as a data URI). All three consumers pass first-party / already-validated URLs, so
pass-through is the default; a failed fetch on one provider falls through to the next lane.

## Response shape (standard OpenAI)

```json
{
  "model": "nvidia/nemotron-nano-12b-v2-vl",
  "choices": [{ "index":0, "message": {"role":"assistant","content":"Gray\n"}, "finish_reason":"stop" }],
  "usage": { "prompt_tokens":281, "completion_tokens":3, "total_tokens":284 }
}
```

- Text in `choices[0].message.content`. Usage in `usage.{prompt_tokens,completion_tokens}` —
  same extractors as the OpenAI-compatible lanes in `llm.js`.
- **JSON-mode-by-prompt works:** asking "Reply ONLY compact JSON {…}" returns clean parseable
  JSON (verified: `{"main_color":"#7D7D7D"}`, `{"main_color":"gray"}`). The helper strips a
  leading trailing newline and tolerates a ```` ```json ```` fence.

## Observed latency (Codespace → NVIDIA, nemotron, 512² photo via URL)

~1–2 s end-to-end for a one-sentence description. Fast enough for an interactive
forge-submit gate behind a tight per-attempt timeout (helper uses 12 s, fail-open).

## Error shapes (for normalized error mapping)

- **403** bad/expired key → `{"status":403,"title":"Forbidden","detail":"Authorization failed"}`
  (note: **403**, not 401 → map to `invalid_key`). Same as the FLUX lane.
- **404** unknown model → `404 page not found` (plain text, not JSON) → `provider_error`.
- **500** when a pass-through URL origin blocks the server-side fetch
  (e.g. wikimedia thumbnail policy) → treated as a lane failure, falls through.
- Expect **402** insufficient credits / **429** rate-limited under sustained use (not
  reproduced — credits available at probe time; treat as `insufficient_credits` /
  `rate_limited` exactly like the other NIM lanes).

## Reproduction (key redacted)

```bash
KEY="nvapi-…"   # from .env.local / .env  (NEVER commit the real value)

# (a) data-URI form
IMG="/9j/4AAQSkZJRg…"   # base64 jpeg
curl -s https://integrate.api.nvidia.com/v1/chat/completions \
  -H "Authorization: Bearer $KEY" -H 'Content-Type: application/json' \
  -d "{\"model\":\"nvidia/nemotron-nano-12b-v2-vl\",
       \"messages\":[{\"role\":\"user\",\"content\":[
         {\"type\":\"text\",\"text\":\"What color is this? One word.\"},
         {\"type\":\"image_url\",\"image_url\":{\"url\":\"data:image/jpeg;base64,$IMG\"}}]}],
       \"max_tokens\":20}"
# -> {"choices":[{"message":{"content":"Gray\n"}}], "usage":{"prompt_tokens":281,...}}  HTTP 200

# (b) http-url form
curl -s https://integrate.api.nvidia.com/v1/chat/completions \
  -H "Authorization: Bearer $KEY" -H 'Content-Type: application/json' \
  -d '{"model":"nvidia/nemotron-nano-12b-v2-vl",
       "messages":[{"role":"user","content":[
         {"type":"text","text":"Describe in one sentence."},
         {"type":"image_url","image_url":{"url":"https://picsum.photos/id/237/512/512.jpg"}}]}],
       "max_tokens":60}'
# -> "Up close view of a young black puppy looking into the camera."  HTTP 200
```

Verified live across all three models, both input forms, four image sizes, JSON-mode output,
and the 403/404/500 error paths. No scratch files committed; key only in gitignored `.env.local`.

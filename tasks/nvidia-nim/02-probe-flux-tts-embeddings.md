# Task T0.3: Probe NIM FLUX, TTS, and embeddings endpoints

You are a senior engineer working in the **three.ws** repo (`/workspaces/three.ws`).
Read `CLAUDE.md` first and obey it, then read `tasks/nvidia-nim/PLAN.md` for context.

**Dependencies:** T0.1 (NVIDIA_API_KEY live in `.env`).

## Goal

Probe three more NIM model families with real API calls and commit transcripts (key
redacted) under `tasks/nvidia-nim/probes/`, so Phases 1–3 build against observed
behavior. For anything that turns out NOT to be invocable on the hosted free tier
(some NIM models are deploy-only), say so explicitly in the probe file with evidence —
that directly changes downstream scope.

## 1. FLUX text→image → `probes/flux.md`

- Models: black-forest-labs `flux.1-schnell` and/or `flux.1-dev` on build.nvidia.com.
- Determine: invoke URL, request schema (prompt / steps / size / seed), response shape
  (base64 image field), latency, rate-limit headers.
- Produce one real image and confirm it decodes as a valid PNG/JPEG. Delete scratch files.

## 2. TTS → `probes/tts.md`

- Models: `nvidia/magpie-tts-multilingual` (and check what Riva TTS NIMs are currently
  hosted for API invocation).
- Determine: REST or gRPC-only? URL, voices, languages, audio formats,
  streaming-or-not, request schema.
- Produce one real audio file and verify duration > 0. Delete scratch files.
- This decides Phase 2 feasibility — if hosted TTS is gRPC-only, document what a REST
  caller would need (NVCF gRPC proxy? client lib?) and the realistic effort.

## 3. Embeddings + reranker → `probes/embeddings.md`

- Models: `nvidia/llama-3.2-nv-embedqa-1b-v2` / `nvidia/nv-embedqa-e5-v5`, plus the
  rerankqa model.
- These are OpenAI-compatible at `https://integrate.api.nvidia.com/v1/embeddings` but
  require the extra `input_type: "query" | "passage"` body field — confirm.
- Record: exact model ids, output dimensions, max batch size, max token/input length,
  reranker request/response shape, latency, rate limits.

## Done when

All three probe files are committed with working recipes (or explicit, evidenced
"not invocable on free tier" findings).

## Before you finish (mandatory bookkeeping)

Tick T0.3 in `tasks/nvidia-nim/PLAN.md`, append a dated Worklog entry, and commit the
plan + probe files with explicit path staging (re-check `git status` / `git diff
--staged` first — concurrent agents share this worktree).

<!-- AUTO:self-delete-on-complete -->

---

## ✅ On completion — delete this file

This file is a unit of work, not a permanent doc. The moment every item above is **built, wired, verified, and committed** to the "Definition of done" in the repo-root `CLAUDE.md`, remove it in the same change:

```bash
git rm "tasks/nvidia-nim/02-probe-flux-tts-embeddings.md"
```

Stage the deletion alongside your implementation and include it in the completion commit. This directory is the backlog: a file that still exists is unfinished work; a file that is gone has shipped. Do not delete early, and never leave a completed prompt behind.

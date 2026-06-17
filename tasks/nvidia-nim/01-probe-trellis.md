# Task T0.2: Probe the hosted TRELLIS API and commit a reproducible recipe

You are a senior engineer working in the **three.ws** repo (`/workspaces/three.ws`).
Read `CLAUDE.md` first and obey it, then read `tasks/nvidia-nim/PLAN.md` for context.

**Dependencies:** T0.1 (NVIDIA_API_KEY live in `.env`).

## Goal

Discover, empirically, the exact hosted invocation protocol for **Microsoft TRELLIS on
NVIDIA NIM** (https://build.nvidia.com/microsoft/trellis,
https://docs.api.nvidia.com/nim/reference/microsoft-trellis) so the provider module
(task T1.1) is built against observed behavior, not guessed schema. Public docs are
thin — real probes with the real key are the point of this task.

## Determine, with real API calls

1. **Invoke URL + auth headers** (expected: NVCF-style, `ai.api.nvidia.com` or
   `api.nvcf.nvidia.com` function invoke; auth `Bearer nvapi-…`).
2. **Text→3D request schema** — prompt, seed, any quality/format params, which model
   variants are hosted (base:text / large:text / large:image).
3. **Image→3D request schema** — inline base64 image limit, and the NVCF asset-upload
   handshake (create asset → upload to presigned URL → reference asset id in the
   payload) for images above that limit.
4. **Response shape** — where the base64 GLB artifact lives, and the 202-then-poll
   protocol: poll URL, `NVCF-POLL-SECONDS` header behavior, status codes, terminal
   states.
5. **Observed latency** per variant and any rate-limit / credit headers.

## Method

- Probe with a one-word prompt and a tiny test image (a few KB, generated locally —
  no third-party content).
- Decode one returned GLB to disk and confirm it actually parses (npx gltf-validator,
  or a small node script with three.js GLTFLoader). Delete scratch files afterwards —
  no scratch output committed, repo root stays clean.
- If the hosted free tier turns out NOT to serve TRELLIS invocations (deploy-only),
  document that explicitly with the evidence — it changes Phase 1 scope and the plan
  must know.

## Deliverable

`tasks/nvidia-nim/probes/trellis.md` containing: exact curl/node transcripts (key
redacted as `$NVIDIA_API_KEY`), full request/response schemas, size/rate limits,
latencies, gotchas, and a step-by-step reproducible recipe: request → poll → valid GLB.

## Done when

The probe file is committed and a teammate could produce a valid GLB following only it.

## Before you finish (mandatory bookkeeping)

Tick T0.2 in `tasks/nvidia-nim/PLAN.md`, append a dated Worklog entry, and commit the
plan + probe file with explicit path staging (re-check `git status` / `git diff
--staged` first — concurrent agents share this worktree).

<!-- AUTO:self-delete-on-complete -->

---

## ✅ On completion — delete this file

This file is a unit of work, not a permanent doc. The moment every item above is **built, wired, verified, and committed** to the "Definition of done" in the repo-root `CLAUDE.md`, remove it in the same change:

```bash
git rm "tasks/nvidia-nim/01-probe-trellis.md"
```

Stage the deletion alongside your implementation and include it in the completion commit. This directory is the backlog: a file that still exists is unfinished work; a file that is gone has shipped. Do not delete early, and never leave a completed prompt behind.

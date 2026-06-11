# Task T1.1: Build api/_providers/nvidia.js — the TRELLIS generation provider

You are a senior engineer working in the **three.ws** repo (`/workspaces/three.ws`).
Read `CLAUDE.md` first and obey it — especially: no mocks, no stubs, no TODOs, real
APIs only. Then read `tasks/nvidia-nim/PLAN.md` and `tasks/nvidia-nim/probes/trellis.md`
(the empirically-verified API recipe — build against it, not against guesses).

**Dependencies:** T0.2 (TRELLIS probe committed).

## Goal

A new generation provider `api/_providers/nvidia.js` giving `/forge` a **free** TRELLIS
lane (text→3D and image→3D, GLB output) using the platform `NVIDIA_API_KEY`.

## Contract

Study `api/_providers/replicate.js` and `api/_providers/meshy.js` first and match the
established provider shape exactly:

- A factory (platform-keyed; key via `api/_lib/env.js` — add an accessor there if one
  doesn't exist).
- Submit functions for text→3D and image→3D returning a task id.
- A poll function returning normalized status.
- The same normalized error codes the other providers throw:
  `provider_unreachable` / `invalid_key` / `insufficient_credits` / `rate_limited` /
  `provider_error`, with proper `status` fields.

## Specifics

1. Implement the NVCF 202-then-poll protocol exactly as documented in the probe file.
2. Image inputs arrive as R2 **https URLs** — fetch them server-side, then either inline
   base64 (when under the probed size limit) or run the NVCF asset-upload handshake
   (create asset → upload → reference asset id).
3. TRELLIS returns the GLB as **base64** — decode and persist to R2 using the existing
   persist helper (find it via the Vertex inline-PNG persist added 2026-06-11 in
   `api/_mcp3d/`), and return a public URL like the other providers do.
4. Timeouts on every fetch (`AbortSignal.timeout`); a hung upstream must not stall a
   serverless function.
5. The free tier is rate-limited — surface 429s as `rate_limited` so callers can route.

## Done when

- The module is contract-complete with zero placeholders, syntax-checks, and existing
  provider tests still pass.
- A live script run in this Codespace (text→3D, draft quality, real key) produces a
  **real R2-hosted GLB** that loads. Put any helper script in `scripts/`, never the
  repo root; delete it if it's one-off.

## Before you finish (mandatory bookkeeping)

Run the self-review protocol from CLAUDE.md against your diff. Tick T1.1 in
`tasks/nvidia-nim/PLAN.md`, append a dated Worklog entry (include observed end-to-end
latency), and commit with explicit path staging (re-check `git status` / `git diff
--staged` first — concurrent agents share this worktree). Beware: `npx vercel build`
clobbers `api/*.js` in place — never run it, and check `head -1` of changed api/ files
for `__defProp`/`createRequire` before committing.

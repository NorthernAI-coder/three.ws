# Task T1.3: Add a free NIM FLUX lane to text-to-image

You are a senior engineer working in the **three.ws** repo (`/workspaces/three.ws`).
Read `CLAUDE.md` first and obey it, then read `tasks/nvidia-nim/PLAN.md` and
`tasks/nvidia-nim/probes/flux.md` (the verified API recipe).

**Dependencies:** T0.3 (FLUX probe committed).

## Goal

Text→3D is two stages (text→image → TRELLIS). The image stage currently runs
Vertex Imagen → Replicate FLUX (both paid). Add **NIM FLUX as the FIRST lane** — free
before paid, per platform policy — so the entire text→3D chain can run free.

## Steps

1. In `api/_mcp3d/text-to-image.js`: the module already has a Vertex→Replicate fallback
   structure (rebuilt 2026-06-11). Add NIM FLUX as the first lane, falling through to
   Vertex then Replicate on any failure, exactly in the existing pattern.
2. Reuse the existing R2 persist helper for the base64 PNG output (same one Vertex's
   inline data-URI path uses).
3. Per-attempt timeouts; a hung lane hands off, it doesn't stall.
4. Extend `tests/api/text-to-image.test.js` for the new ordering: NIM serves → other
   lanes untouched; NIM fails → falls through to Vertex → Replicate.

## Done when

- Tests pass.
- A live local run generates a real image via NIM with the fallback chain intact
  (force-fail NIM once to watch it degrade correctly).

## Before you finish (mandatory bookkeeping)

Tick T1.3 in `tasks/nvidia-nim/PLAN.md`, append a dated Worklog entry, and commit with
explicit path staging (re-check `git status` / `git diff --staged` first — concurrent
agents share this worktree).

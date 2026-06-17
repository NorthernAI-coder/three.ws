# Task T1.2: Register the NVIDIA backend in forge-tiers + make it the draft-tier default

You are a senior engineer working in the **three.ws** repo (`/workspaces/three.ws`).
Read `CLAUDE.md` first and obey it, then read `tasks/nvidia-nim/PLAN.md` for context.

**Dependencies:** T1.1 (`api/_providers/nvidia.js` exists and is live-verified).

## Goal

Wire the new provider into the forge backend registry so the `/forge` UI and API can
actually use it — free lane first, per platform policy.

## Steps

1. In `api/_lib/forge-tiers.js` `BACKENDS`: add the `nvidia` entry — provider `nvidia`,
   paths `text-to-3d` + `image-to-3d`, `byok: false`,
   `requiresEnv: ['NVIDIA_API_KEY']`, an **honest** `baseEta` from the latencies in
   `tasks/nvidia-nim/probes/trellis.md`, a credits estimate, and zero vendor cost notes.
2. Wire it through `resolveBackendId` / wherever the default backend per path+tier is
   chosen so **NIM is the default for the draft tier** (free first), while
   Replicate / Meshy / Tripo remain selectable. Check `api/_lib/regen-provider.js`,
   `api/forge.js`, and the catalog endpoint the `/forge` UI reads.
3. Trace the FULL path — UI catalog → submit → poll → gallery — and wire every
   connection. The backend must appear in the UI with correct pricing/ETA; a backend
   that exists but is unreachable from the UI is half-built (CLAUDE.md: eliminate dead
   paths).
4. Run the forge-related test suites.

## Done when

- `/forge` catalog (local dev, `npm run dev`) lists the NVIDIA backend with correct
  metadata.
- A draft-tier submit routes to it end-to-end.
- Existing backends are unaffected (tests green).

## Before you finish (mandatory bookkeeping)

Tick T1.2 in `tasks/nvidia-nim/PLAN.md`, append a dated Worklog entry, and commit with
explicit path staging (re-check `git status` / `git diff --staged` first — concurrent
agents share this worktree).

<!-- AUTO:self-delete-on-complete -->

---

## ✅ On completion — delete this file

This file is a unit of work, not a permanent doc. The moment every item above is **built, wired, verified, and committed** to the "Definition of done" in the repo-root `CLAUDE.md`, remove it in the same change:

```bash
git rm "tasks/nvidia-nim/11-register-backend.md"
```

Stage the deletion alongside your implementation and include it in the completion commit. This directory is the backlog: a file that still exists is unfinished work; a file that is gone has shipped. Do not delete early, and never leave a completed prompt behind.

# Task T4.3: Audio2Face-3D feasibility spike (research only)

You are a senior engineer working in the **three.ws** repo (`/workspaces/three.ws`).
Read `CLAUDE.md` first and obey it, then read `tasks/nvidia-nim/PLAN.md` for context.

**Dependencies:** Phases 1–3 shipped (do not start before).

## Goal

**Research only — no integration, no code in api/ or src/.** Decide whether NVIDIA
Audio2Face-3D (blendshape lip-sync from audio — real facial animation for the talking
avatars) is worth a real integration task.

## Questions to answer

1. **Invocability:** is Audio2Face-3D callable on the hosted NIM free tier, or
   self-host/NVCF-deploy only? It's gRPC-based
   (https://github.com/NVIDIA/Audio2Face-3D) — what exactly would a Vercel-function or
   worker caller need (gRPC client lib, NVCF proxy, persistent connection)? Probe
   whatever is probeable with the real key.
2. **Output mapping:** what does it emit (ARKit blendshapes? its own facial pose set?
   visemes?) and how does that map onto OUR avatar rigs — inspect the GLB rigs the
   platform actually serves (morph target names, bone naming) and check compatibility
   concretely, not theoretically.
3. **Architecture fit:** where would it run (realtime per-utterance vs pre-baked per
   TTS clip), what latency is acceptable for the talking-avatar widgets, and does the
   existing TTS pipeline (Phase 2) hand it audio in a usable form?
4. **Effort estimate:** honest task breakdown with sizes if it's a go.

## Deliverable

`tasks/nvidia-nim/probes/audio2face.md` with findings, transcripts of any live probes
(key redacted), a clear **go / no-go recommendation**, and — if go — a task breakdown
appended to `tasks/nvidia-nim/PLAN.md` as new Phase 5 checklist items plus matching
task files in this folder.

## Done when

A reader can make the go/no-go call from the probe file alone, with evidence.

## Before you finish (mandatory bookkeeping)

Tick T4.3 in `tasks/nvidia-nim/PLAN.md`, append a dated Worklog entry, and commit with
explicit path staging.

<!-- AUTO:self-delete-on-complete -->

---

## ✅ On completion — delete this file

This file is a unit of work, not a permanent doc. The moment every item above is **built, wired, verified, and committed** to the "Definition of done" in the repo-root `CLAUDE.md`, remove it in the same change:

```bash
git rm "tasks/nvidia-nim/42-audio2face-spike.md"
```

Stage the deletion alongside your implementation and include it in the completion commit. This directory is the backlog: a file that still exists is unfinished work; a file that is gone has shipped. Do not delete early, and never leave a completed prompt behind.

# Task T4.1: Shared vision helper + three consumers

You are a senior engineer working in the **three.ws** repo (`/workspaces/three.ws`).
Read `CLAUDE.md` first and obey it, then read `tasks/nvidia-nim/PLAN.md` for context.

**Dependencies:** Phases 1–3 shipped (do not start before).

## Goal

Free image understanding via NIM vision models, as a shared helper plus three concrete
consumers — a helper with no consumers is decoration (CLAUDE.md: wire every connection).

## Steps

1. **Probe first:** determine which vision models are actually invocable on the hosted
   free tier (nemotron nano VL, llama vision — check build.nvidia.com), request schema
   (image input encoding), limits. Commit `tasks/nvidia-nim/probes/vision.md` with
   transcripts (key redacted).
2. **Shared helper** in `api/_lib/` following the `llm.js` free-first doctrine: NIM
   vision lane(s) first, any paid vision-capable backstop after, normalized errors,
   timeouts, spend tracking via `recordEvent` like `llmComplete` does.
3. **Consumer 1 — /forge input validation:** before an image→3D submit burns a
   generation, check the photo is usable (single clear subject, not a screenshot of
   text, etc.); warn the user with a designed, actionable message. Degrades to
   no-validation when vision is unavailable — never blocks generation on a vision
   outage.
4. **Consumer 2 — fact-checker:** image evidence support (describe/extract from an
   image URL in a claim).
5. **Consumer 3 — avatar gallery alt text:** backfill + on-create alt text for gallery
   items (accessibility is not optional — CLAUDE.md).
6. Tests for the helper chain and each consumer's degraded path. Changelog entry
   (holder language). Deploy + verify per the standard ship checklist.

## Done when

All three consumers work in prod on the free lane and degrade gracefully without it.

## Before you finish (mandatory bookkeeping)

Tick T4.1 in `tasks/nvidia-nim/PLAN.md`, append a dated Worklog entry, and commit with
explicit path staging.

<!-- AUTO:self-delete-on-complete -->

---

## ✅ On completion — delete this file

This file is a unit of work, not a permanent doc. The moment every item above is **built, wired, verified, and committed** to the "Definition of done" in the repo-root `CLAUDE.md`, remove it in the same change:

```bash
git rm "tasks/nvidia-nim/40-vision-lane.md"
```

Stage the deletion alongside your implementation and include it in the completion commit. This directory is the backlog: a file that still exists is unfinished work; a file that is gone has shipped. Do not delete early, and never leave a completed prompt behind.

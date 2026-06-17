# E04 — `/scan` & `/forge` inline clarity + flywheel value

**Track:** Improve Features · **Size:** S/M · **Priority:** P2

## Goal
Explain the choices these tools present (fidelity levels, output formats, style) inline in plain
language, and surface the value the user gets — without cluttering the clean flows.

## Why it matters
The audit: `/scan` and `/forge` are strong (7–8/10) but use unexplained terms — "rigged 3D
model," "GLB," "High/Med/Low fidelity," "photorealistic vs stylized." Small inline explanations
remove the last friction on otherwise great flows.

## Context
- [pages/scan.html](pages/scan.html), [pages/forge.html](pages/forge.html).
- Memory: `/scan` selfie→3D pipeline + auto-rig chain; `/forge` is the in-house text→3D pipeline + data flywheel — **extend, don't fork** these.
- C04 glossary/tooltips can supply the term definitions.

## Scope
- Add concise inline helpers (tooltips or one-liners) explaining fidelity, format, rig, and style choices in plain words ("Rigged = your model can move and be animated").
- Surface what the user gains (e.g. "rigged so you can use all 70+ animations").
- Keep the flows visually clean — progressive disclosure, not walls of text.

## Definition of done
- Every choice in `/scan` and `/forge` has a plain-language explanation available inline; the flows stay clean; pipelines unchanged.

## Verify
- Walk both flows as a non-expert; confirm each option is understandable and the pipelines still run correctly.

<!-- AUTO:self-delete-on-complete -->

---

## ✅ On completion — delete this file

This file is a unit of work, not a permanent doc. The moment every item above is **built, wired, verified, and committed** to the "Definition of done" in the repo-root `CLAUDE.md`, remove it in the same change:

```bash
git rm "tasks/site-overhaul/E-improve-features/E04-scan-forge-clarity.md"
```

Stage the deletion alongside your implementation and include it in the completion commit. This directory is the backlog: a file that still exists is unfinished work; a file that is gone has shipped. Do not delete early, and never leave a completed prompt behind.

# B4 — Docs + CI hygiene: document the texture worker, guard against zero-byte handlers

**Track:** B — complete feature · **Priority:** P2 · **Effort:** 2–3h · **Depends on:** none

## Context

The API/worker audit surfaced two low-risk but real gaps:

1. **`workers/texture/` is fully built** (Dockerfile, cloudbuild.yaml, ~870-LOC `main.py` mesh-
   texturing Cloud Run service) **but is undocumented in `workers/README.md`.** Every other worker
   is listed there. An undocumented-but-deployed service risks being orphaned operationally.
2. **There is no guard against zero-byte / empty handler files.** The dispatcher-shim pattern makes
   thin files normal, so an empty file (see B3 — `api/agents/[id]/skill-collection.js`) can pass
   unnoticed. A trivial CI/lint check would catch this class permanently.

## What to do

### Part 1 — Document the texture worker

1. Read `workers/README.md` and the existing entries' format (purpose, runtime, build/deploy
   command, any env vars).
2. Read enough of `workers/texture/` (`main.py`, `Dockerfile`, `cloudbuild.yaml`) to describe it
   accurately: what it does (mesh texturing), its endpoint/contract, how it's built and deployed
   (Cloud Run), and which env/config it needs.
3. Add a `workers/texture/` entry to `workers/README.md` matching the existing style exactly. Be
   accurate — no aspirational claims; describe what the code actually does.

### Part 2 — CI guard for zero-byte handlers

1. Find where repo checks run — `.github/workflows/` and `package.json` scripts (there are existing
   `audit:*` scripts). Pick the established mechanism; do not invent a parallel one.
2. Add a check that **fails** if any `api/**/*.js` file is effectively empty (e.g. size < 2 bytes,
   or no `export`). A minimal approach: a small Node script under `scripts/` (e.g.
   `scripts/audit-empty-handlers.mjs`) wired into the existing prebuild/audit step and/or a CI
   workflow. It should print the offending paths and exit non-zero.
3. Run it once to confirm it would catch the B3 file (if B3 hasn't run yet) and otherwise passes on
   the current tree. Ensure it does **not** false-positive on legitimately-tiny shim files that
   *do* export something — the check is "empty/no export," not "short."

## Acceptance criteria

- [ ] `workers/README.md` has an accurate `workers/texture/` entry in the existing format.
- [ ] A committed check fails on empty/no-export `api/**/*.js` files and is wired into the repo's
      existing audit/CI flow.
- [ ] The check passes on the current tree (after B3, or it flags exactly the B3 file if B3 is still
      open — note which in your commit).
- [ ] No false positives on valid thin dispatcher shims.

## Verification

1. Run the new check locally: `node scripts/audit-empty-handlers.mjs` (or whatever you named it) —
   confirm exit code + output behave as specified.
2. `npm run prebuild` (or the audit script you hooked into) still succeeds on the clean tree.
3. Temporarily `touch api/_tmp-empty-test.js`, re-run, confirm it fails, then remove the temp file.

## Rules

Obey [CLAUDE.md](../../CLAUDE.md). Keep the repo root clean — any new script goes in `scripts/`, not
the root. No scratch files committed.

## Completion protocol

1. Re-read your diff (`git diff`) and confirm every line is justified (and no temp test file remains).
2. Delete this file: `tasks/week-2026-06-08/B4-docs-ci-hygiene.md`.
3. Commit your changes **and** this file's deletion together, e.g.:
   `git add -A && git commit -m "chore: document texture worker + CI guard for empty api handlers; close B4"`
4. Do **not** push — the human controls pushes.

# Task T3.2: Re-embed migration for stored widget knowledge

You are a senior engineer working in the **three.ws** repo (`/workspaces/three.ws`).
Read `CLAUDE.md` first and obey it, then read `tasks/nvidia-nim/PLAN.md` for context.

**Dependencies:** T3.1 deployed to prod (the tagging schema must be live before
migrating prod data).

## Goal

`scripts/reembed-widget-knowledge.mjs` — migrate all stored widget knowledge chunks
from the dead OpenAI embedding space to the free NIM embedder, safely.

## Requirements

1. **Batch re-embed** every stored chunk with the NIM embedder, respecting free-tier
   rate limits (throttle; back off on 429).
2. **Resume-safe and idempotent:** track the embedder tag per row; a re-run skips
   already-migrated rows; a crash mid-run loses nothing.
3. **Atomic per document set:** switch a set's tag only when every chunk in it is
   re-embedded, so retrieval never sees a half-migrated set (T3.1's same-space rule
   makes a half-set unqueryable otherwise).
4. **`--dry-run` mode required** — prints counts and cost/time estimates, writes
   nothing.
5. Optional, if it earns its keep: add the NIM reranker as a post-retrieval stage in
   widget knowledge search. Measure on a real widget's corpus — does it improve top-3
   relevance? Keep it only if yes; record the measurement in the Worklog either way.

## Execution

Dry-run first, record the counts. Then run for real against prod data (T3.1 must be
deployed). Record migrated counts, duration, and any rate-limit incidents in the
Worklog.

## Done when

Every stored set is tagged NIM (or explicitly skipped with a reason), retrieval works
end-to-end on migrated sets, and the script is committed in `scripts/` (repo root stays
clean).

## Before you finish (mandatory bookkeeping)

Tick T3.2 in `tasks/nvidia-nim/PLAN.md`, append a dated Worklog entry with the
migration numbers, and commit with explicit path staging.

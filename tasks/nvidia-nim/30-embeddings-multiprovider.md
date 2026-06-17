# Task T3.1: Multi-provider embeddings with vector-space tagging

You are a senior engineer working in the **three.ws** repo (`/workspaces/three.ws`).
Read `CLAUDE.md` first and obey it, then read `tasks/nvidia-nim/PLAN.md` and
`tasks/nvidia-nim/probes/embeddings.md` (verified model ids, dimensions, limits).

**Dependencies:** T0.3 (embeddings probe committed).

## Context

`api/_lib/embeddings.js` is OpenAI-only and the prod OpenAI key is over quota — widget
knowledge retrieval (RAG) is **silently broken**. NIM serves free retrieval embeddings
(OpenAI-compatible at `integrate.api.nvidia.com/v1/embeddings`, plus the required
`input_type: "query" | "passage"` field).

## The trap that shapes this whole task

**Embeddings from different providers are different vector spaces — they must NEVER mix
at query time.** A query embedded with model A compared against passages embedded with
model B returns garbage similarity scores that look plausible. This is worse than an
error.

## Steps

1. Rework `api/_lib/embeddings.js`: NIM as the free primary embedder (`input_type:
   passage` for ingest, `query` for search), OpenAI as backstop — but provider choice is
   **per document set**, not per call (see below).
2. Find the storage schema for widget knowledge vectors (start from
   `api/widgets/[id]/_knowledge.js` and the ingest path). Add an embedder tag (model id
   + dimension) to every stored vector / document set. Existing untagged rows are
   OpenAI — encode that assumption explicitly in the migration default.
3. Query-time rule: embed the query with THE SAME provider/model the document set was
   embedded with. A set tagged OpenAI queries via OpenAI (if available) or is flagged
   needs-reembed — never silently cross spaces.
4. New ingests use the free NIM lane by default.
5. Update `embeddingsConfigured()` semantics so feature gates stay truthful about what
   can actually serve.
6. Tests: tagging on ingest, same-space query routing, cross-space refusal, fallback
   behavior.

## Done when

- New ingests embed free via NIM.
- Existing OpenAI-embedded sets still query correctly (against OpenAI when available)
  or are cleanly flagged for re-embed.
- Nothing can mix vector spaces. Tests green.

## Before you finish (mandatory bookkeeping)

Tick T3.1 in `tasks/nvidia-nim/PLAN.md`, append a dated Worklog entry (include the
schema change you made), and commit with explicit path staging (re-check `git status` /
`git diff --staged` first — concurrent agents share this worktree).

<!-- AUTO:self-delete-on-complete -->

---

## ✅ On completion — delete this file

This file is a unit of work, not a permanent doc. The moment every item above is **built, wired, verified, and committed** to the "Definition of done" in the repo-root `CLAUDE.md`, remove it in the same change:

```bash
git rm "tasks/nvidia-nim/30-embeddings-multiprovider.md"
```

Stage the deletion alongside your implementation and include it in the completion commit. This directory is the backlog: a file that still exists is unfinished work; a file that is gone has shipped. Do not delete early, and never leave a completed prompt behind.

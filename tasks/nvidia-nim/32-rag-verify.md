# Task T3.3: End-to-end RAG verification in prod + changelog

You are a senior engineer working in the **three.ws** repo (`/workspaces/three.ws`).
Read `CLAUDE.md` first and obey it, then read `tasks/nvidia-nim/PLAN.md` for context.

**Dependencies:** T3.2 (migration run against prod).

## Steps

1. **End-to-end prod verification:** pick (or create) a widget with ingested knowledge.
   Ask it a question only its corpus can answer. Confirm the SSE reply is grounded in
   that corpus, and confirm (logs/instrumentation) the query embedding was served by the
   free NIM lane. Test the empty case too: a widget with no knowledge degrades
   gracefully, no errors.
2. **Changelog:** holder-readable entry in `data/changelog.json` (fix: widgets answer
   from their knowledge again); validate with `npm run build:pages`.
3. **Commit & push** (explicit paths, both remotes per CLAUDE.md). Watch the deploy
   through to green. `npm run changelog:push` if Telegram creds present (skip silently
   if not).

## Done when

A real widget on production answers from its knowledge with embeddings served free.

## Before you finish (mandatory bookkeeping)

Tick T3.3 in `tasks/nvidia-nim/PLAN.md`, append a dated Worklog entry, and commit the
plan update with explicit path staging.

<!-- AUTO:self-delete-on-complete -->

---

## ✅ On completion — delete this file

This file is a unit of work, not a permanent doc. The moment every item above is **built, wired, verified, and committed** to the "Definition of done" in the repo-root `CLAUDE.md`, remove it in the same change:

```bash
git rm "tasks/nvidia-nim/32-rag-verify.md"
```

Stage the deletion alongside your implementation and include it in the completion commit. This directory is the backlog: a file that still exists is unfinished work; a file that is gone has shipped. Do not delete early, and never leave a completed prompt behind.

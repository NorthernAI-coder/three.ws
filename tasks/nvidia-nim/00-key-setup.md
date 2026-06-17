# Task T0.1: Verify NVIDIA_API_KEY in Codespace and Vercel prod

You are a senior engineer working in the **three.ws** repo (`/workspaces/three.ws`).
Read `CLAUDE.md` first and obey it, then read `tasks/nvidia-nim/PLAN.md` for context.
This is the entry-point task of the NVIDIA NIM integration plan — nothing else starts
until it's done.

**Dependencies:** none.

## Steps

1. Check `/workspaces/three.ws/.env` for `NVIDIA_API_KEY` (an `nvapi-…` key from the
   free NVIDIA Developer Program at build.nvidia.com). If absent, **STOP and ask the
   user to paste one** — do not proceed key-less and do not fabricate anything.
2. Smoke-test the key live: POST `https://integrate.api.nvidia.com/v1/chat/completions`
   with model `meta/llama-3.3-70b-instruct`, a trivial one-word user message, and
   `max_tokens: 10`. Expect HTTP 200 with a completion.
3. Verify the key exists in Vercel **prod and preview** via the **Vercel REST API** —
   NOT `vercel env pull` (returns empty strings for sensitive values) and NOT the CLI
   `vercel env add` (writes empty secrets under the plugin wrapper). If it must be
   written to Vercel, use the REST API.
4. Note the free-tier credit balance / rate-limit headers you observe, if any.

## Done when

- A live 200 from the key in this Codespace, AND
- The key is confirmed present (non-empty) in Vercel prod.

## Before you finish (mandatory bookkeeping)

In `tasks/nvidia-nim/PLAN.md`: tick the T0.1 checkbox and append a dated Worklog entry
(what you verified, credit/rate-limit observations, anything surprising). Commit the
plan file with **explicit path staging** (concurrent agents share this worktree — never
`git add -A`), re-checking `git status` and `git diff --staged` immediately before the
commit. Never put the API key itself in any committed file.

<!-- AUTO:self-delete-on-complete -->

---

## ✅ On completion — delete this file

This file is a unit of work, not a permanent doc. The moment every item above is **built, wired, verified, and committed** to the "Definition of done" in the repo-root `CLAUDE.md`, remove it in the same change:

```bash
git rm "tasks/nvidia-nim/00-key-setup.md"
```

Stage the deletion alongside your implementation and include it in the completion commit. This directory is the backlog: a file that still exists is unfinished work; a file that is gone has shipped. Do not delete early, and never leave a completed prompt behind.

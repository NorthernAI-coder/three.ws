# Task T1.5: Ship the free 3D lane — deploy, prod smoke test, changelog

You are a senior engineer working in the **three.ws** repo (`/workspaces/three.ws`).
Read `CLAUDE.md` first and obey it, then read `tasks/nvidia-nim/PLAN.md` for context.

**Dependencies:** T1.1–T1.4 all done, AND `NVIDIA_API_KEY` confirmed in Vercel prod
(T0.1). Do not start otherwise.

## Steps

1. **Changelog:** append a holder-readable entry to `data/changelog.json` — free,
   faster default 3D drafts on /forge; plain language, no commit jargon; tags
   `feature`, `improvement`; `link: "/forge"`. Run `npm run build:pages` — it validates
   the entry and fails the build if malformed.
2. **Commit & push:** explicit path staging only; re-check `git status` and
   `git diff --staged` immediately before committing (concurrent agents). Before
   committing anything under `api/`, check `head -1` of each changed file for
   `__defProp`/`createRequire` (the `npx vercel build` clobber trap; recover with
   `git restore -- api/ public/`). Push to BOTH remotes per CLAUDE.md (`threeD` may 403
   — surface it, don't retry-loop; `threews` is canonical and feeds Vercel).
3. **Watch the production build** (~20 min historically). If it fails, diagnose and fix
   — do not report done with a red deploy.
4. **Prod smoke test on three.ws/forge:**
   - Text→3D, draft tier: submit a prompt → poll → GLB loads in the viewer.
   - Image→3D: submit a real photo → poll → GLB loads.
   - Zero console errors; network tab shows the `nvidia` backend serving.
   - Force nothing, fake nothing — if it doesn't work, it isn't done.
5. After deploy verification, run `npm run changelog:push` if Telegram creds are
   present locally (skip silently if not).

## Done when

A first-time visitor gets a draft GLB from a prompt AND from a photo on **production**
three.ws/forge via the free NIM lane, zero console errors.

## Before you finish (mandatory bookkeeping)

Tick T1.5 in `tasks/nvidia-nim/PLAN.md`, append a dated Worklog entry with observed prod
latencies and the deployment id, and commit the plan update.

<!-- AUTO:self-delete-on-complete -->

---

## ✅ On completion — delete this file

This file is a unit of work, not a permanent doc. The moment every item above is **built, wired, verified, and committed** to the "Definition of done" in the repo-root `CLAUDE.md`, remove it in the same change:

```bash
git rm "tasks/nvidia-nim/14-deploy-smoke-changelog.md"
```

Stage the deletion alongside your implementation and include it in the completion commit. This directory is the backlog: a file that still exists is unfinished work; a file that is gone has shipped. Do not delete early, and never leave a completed prompt behind.

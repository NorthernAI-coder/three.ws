# Task: Investigate pump-segments-sdk and whether three.ws should adopt it

You are a senior engineer in the **three.ws** repo (`/workspaces/three.ws`).
Read `CLAUDE.md` and obey it (only `$THREE`, no mocks, real APIs, clean repo,
no push without approval).

## Background

During a recon of pump.fun's GitHub org we found a **new repo** we don't use:

- `github.com/pump-fun/pump-segments-sdk` — TypeScript, created/pushed
  ~2026-04-16, 0 stars, **no description, no README**, and **not published to
  npm** (no `@pump-fun/pump-segments-sdk` on the registry as of 2026-06-08).

"Segments" is unexplained. It could relate to creator-revenue segmentation,
audience/holder segments, fee-sharing segments, or something tied to the newer
fee/sharing-config program — unknown until read.

## Goal

1. Read the repo to determine **what it is and does**:
    - List the tree: `gh api repos/pump-fun/pump-segments-sdk/git/trees/HEAD?recursive=1 --jq '.tree[].path'`
    - Read `package.json`, `src/`, any examples/tests, and exported types.
    - Check commit history / open PRs for intent.
2. Determine **relevance to three.ws**: does it unlock anything we'd want
   (e.g. for the `/go` bounty board, creator fee sharing, tokenized agents, or
   holder/community features we already have under `api/_lib/coin-communities.js`,
   `holder-pass.js`, `royalty.js`, fee-sharing in `api/pump/[action].js`)?
3. Check **availability**: is it usable yet (published anywhere, stable API), or
   pre-release? If unpublished, note that adopting it means a git dependency or
   vendoring — flag the maintenance cost.

## Deliverable

A short brief at `tasks/pumpfun-upstream/03-segments-findings.md`:

- one-paragraph "what it is",
- a capability list,
- a clear **recommendation**: adopt now / wait for npm release / not relevant,
  with reasoning and (if adopt) a rough integration sketch.

**Do not** add it as a dependency or write integration code unless the
investigation shows a clear, immediate win — in which case stop and propose it to
the user first. This task is research; default to producing the brief only.

## Verification

- Brief committed. Claims reference the actual repo contents (paths/types), not
  guesses. `git diff` self-reviewed. No push without approval.

<!-- AUTO:self-delete-on-complete -->

---

## ✅ On completion — delete this file

This file is a unit of work, not a permanent doc. The moment every item above is **built, wired, verified, and committed** to the "Definition of done" in the repo-root `CLAUDE.md`, remove it in the same change:

```bash
git rm "tasks/pumpfun-upstream/03-pump-segments-sdk-investigation.md"
```

Stage the deletion alongside your implementation and include it in the completion commit. This directory is the backlog: a file that still exists is unfinished work; a file that is gone has shipped. Do not delete early, and never leave a completed prompt behind.

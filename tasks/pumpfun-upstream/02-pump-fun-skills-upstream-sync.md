# Task: Sync our vendored pump-fun-skills with the official upstream repo

You are a senior engineer in the **three.ws** repo (`/workspaces/three.ws`).
Read `CLAUDE.md` and obey it — **only `$THREE` may ever be referenced**, no
mocks, real APIs/SDKs only, keep the repo clean, never push without explicit
approval (then both remotes).

## Background

Our `pump-fun-skills/` directory is a **vendored copy** of pump.fun's official
Agent Skills repo (`github.com/pump-fun/pump-fun-skills`) — same structure, and
the SKILL.md files even link to `raw.githubusercontent.com/pump-fun/pump-fun-skills/...`.

Our copy contains: `create-coin/`, `swap/`, `coin-fees/`, `tokenized-agents/`,
and `reactive/` (the last is **our addition** — drives avatar movement from the
PumpPortal feed; not in upstream).

A recon pass confirmed our skills already cover the current feature set (mayhem
mode, cashback, buyback %, Jito front-runner protection, tokenized agents, USDC),
so this is a **drift check**, not a rebuild. Upstream was last pushed 2026-04-23;
we don't know exactly when our copy was taken.

## Goal

1. Diff our `pump-fun-skills/<skill>/` against upstream `main` for each shared
   skill (`create-coin`, `swap`, `coin-fees`, `tokenized-agents`). Pull upstream
   raw files for comparison, e.g.:
    - `gh api repos/pump-fun/pump-fun-skills/git/trees/HEAD?recursive=1 --jq '.tree[].path'`
    - `gh api --header 'Accept: application/vnd.github.raw' "repos/pump-fun/pump-fun-skills/contents/<path>"`
      Compare SKILL.md **and** the helper scripts / reference files in each skill
      folder, not just the SKILL.md.
2. Write a **drift report** at `tasks/pumpfun-upstream/02-skills-drift-report.md`:
   per skill, what changed upstream since our copy (new flags, new scripts,
   changed SDK calls, new reference docs), and whether it matters for us.
3. **Apply** the upstream updates that are genuine improvements/fixes, while
   **preserving**:
    - our `reactive/` skill (untouched);
    - any deliberate three.ws-specific edits (look for divergences before
      overwriting — don't blindly clobber; if a file differs because we changed it
      on purpose, reconcile by hand and note it in the report);
    - the `$THREE`-only rule (if any upstream example uses another coin/mint,
      replace it with `$THREE` / a synthetic placeholder).
4. If the skills are duplicated elsewhere in the repo (a recon found copies under
   `examples/skills/`, `public/skills/`, `data/skills/`, and build output under
   `dist/`), decide whether those need the same update or are generated — do **not**
   hand-edit anything under `dist/` or `dist-lib/` (build artifacts).

## Verification (Definition of done)

- Drift report committed.
- Updated skill files are valid (SKILL.md frontmatter intact; any scripts run with
  `--help` without error). `npx prettier --check` clean on changed text files.
- No other-coin references introduced. `git diff` self-reviewed.
- Don't push unless asked; then both `threeD` and `threews`.

<!-- AUTO:self-delete-on-complete -->

---

## ✅ On completion — delete this file

This file is a unit of work, not a permanent doc. The moment every item above is **built, wired, verified, and committed** to the "Definition of done" in the repo-root `CLAUDE.md`, remove it in the same change:

```bash
git rm "tasks/pumpfun-upstream/02-pump-fun-skills-upstream-sync.md"
```

Stage the deletion alongside your implementation and include it in the completion commit. This directory is the backlog: a file that still exists is unfinished work; a file that is gone has shipped. Do not delete early, and never leave a completed prompt behind.

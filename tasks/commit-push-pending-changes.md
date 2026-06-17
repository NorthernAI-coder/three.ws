# Task: Commit + Push All Pending Working-Tree Changes

## Context

The repo has uncommitted changes from one or more concurrent agents. These need to be staged,
committed, and pushed to BOTH remotes before Vercel can deploy them.

**Always push to both remotes per CLAUDE.md:**
- `threews` → `github.com/nirholas/three.ws` (canonical, Vercel deploys from here)
- `threeD` → `github.com/nirholas/3D-Agent` (push-only mirror)

Never pull from `threeD`. Never use `git add -A` or `git add .` (other agents may be
touching files concurrently). Stage only the files listed below.

## Current pending files

Run `git status --short` first to confirm these are still the modified/untracked files.
Then stage, commit, and push ONLY these:

```
M  my-agents/index.html
M  public/my-agents/index.html
M  src/trades.js
```

If the status shows additional files from concurrent agents, check `git diff <file>` before
staging — don't commit another agent's in-progress work.

Untracked task files to also commit (these are safe to include):
```
??  tasks/rotate-replicate-token.md
??  tasks/x-post-mcp-text-to-3d.md
??  tasks/commit-push-pending-changes.md
??  tasks/verify-nvidia-trellis-artifact-fix.md
??  tasks/fix-forge-seed-circuit-breaker.md
??  tasks/fix-register-prep-rpc-chain.md
```

## Steps

```bash
# 1. Confirm state
git status --short

# 2. Read the diffs to write an accurate commit message
git diff my-agents/index.html public/my-agents/index.html src/trades.js

# 3. Stage explicit files only
git add my-agents/index.html public/my-agents/index.html src/trades.js
git add tasks/rotate-replicate-token.md tasks/x-post-mcp-text-to-3d.md \
        tasks/commit-push-pending-changes.md tasks/verify-nvidia-trellis-artifact-fix.md \
        tasks/fix-forge-seed-circuit-breaker.md tasks/fix-register-prep-rpc-chain.md

# 4. Verify staged diff before committing
git diff --staged --stat

# 5. Commit with a message that names what actually changed
git commit -m "$(cat <<'EOF'
<describe what my-agents + trades.js changes do>

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"

# 6. Push to BOTH remotes
git push threeD main
git push threews main
```

## Acceptance criteria

- `git status` is clean (no modified or untracked files from this list)
- `git log --oneline -1` shows the commit with a meaningful message
- Both pushes succeeded with no errors
- Vercel dashboard shows a new deployment triggered from the push

<!-- AUTO:self-delete-on-complete -->

---

## ✅ On completion — delete this file

This file is a unit of work, not a permanent doc. The moment every item above is **built, wired, verified, and committed** to the "Definition of done" in the repo-root `CLAUDE.md`, remove it in the same change:

```bash
git rm "tasks/commit-push-pending-changes.md"
```

Stage the deletion alongside your implementation and include it in the completion commit. This directory is the backlog: a file that still exists is unfinished work; a file that is gone has shipped. Do not delete early, and never leave a completed prompt behind.

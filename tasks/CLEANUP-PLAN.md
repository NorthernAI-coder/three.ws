# Task cleanup — remove `.md` files for work that is already done

**Goal:** delete every task `.md` whose feature is genuinely shipped and wired in the
codebase, leave the rest, and keep a paper trail of every decision.

**Why this needs verification, not a flag:** the task files carry no real status
field. The word "DONE" in them is just the `Definition of done` template heading.
A task is "complete" **only if its `Definition of done` is actually met in the
current code** — verified by reading the code, not by trusting the file.

---

## The rule for "complete" (apply per task)

A task `.md` may be deleted **only when all of these hold**:

1. Every item in the task's `Definition of done` / `What to build` section is
   present in the codebase (the named files exist and contain the described
   behavior — routes wired, endpoints real, UI reachable).
2. No `TODO`, stub, mock, or placeholder remains in the code that implements it
   (consistent with CLAUDE.md hard rules).
3. If the task names anchor files, those files exist and match the described
   intent. Grep for the key symbols/endpoints/routes the task specifies.

If **any** item is unmet, or you are **not sure**, **do not delete** — leave the
file and record it as `KEEP` with the specific gap. When uncertain, keep.

Do **not** delete: `README.md`, `00-overview.md`, `00-START-HERE.md`,
`*-REPORT*.md`, `ORPHAN-REPORT.md`, or this plan. Those are indexes/reports —
update them instead (see Bookkeeping).

---

## How an agent processes one task file

1. Read the task `.md` end to end. Extract its anchor files, endpoints, routes,
   and `Definition of done`.
2. Verify each claim against the tree (Read the anchor files; `grep` for the
   named functions/routes/endpoints; check the UI entry point is reachable).
3. Decide `DELETE` or `KEEP`.
4. If `DELETE`: `git rm <file>` (it's tracked) and update the group index if the
   file is listed there.
5. Append one row to the manifest (below) with the evidence for the decision.
6. **Never** run the dev server or modify product code. This is a docs-cleanup
   pass only — read + verify + delete the `.md`.

---

## Manifest (audit trail) — every agent appends here

Append rows to `tasks/CLEANUP-MANIFEST.md` (create it if absent), one per task:

```
| task file | decision | evidence (file:symbol that proves done, or the gap) |
```

This makes the whole sweep reviewable before anything is committed.

---

## Agent assignment (parallelizable)

One agent per group. Split the large groups into sub-batches so each agent owns
≈15–30 files:

- `tasks/monetization-feature/` (161) → **6 agents**, alphabetical by filename
  prefix: `01–0x`, etc. Note: this group has many near-duplicate filenames
  (e.g. several `02-*create-skill-pricing-table.md`) — dedup decisions explicitly.
- `tasks/walk/` (51) → **2 agents**
- `tasks/site-overhaul/` (A–G, 51) → **1 agent per subdir (7 agents)**
- `tasks/wow-sprint/` (22) → 1 agent
- `tasks/agent-monetization/` (20) → 1 agent
- `tasks/` root `task-01..task-10` (11) → 1 agent
- `tasks/pump-dashboard-real-apis/` (13) → 1 agent
- `tasks/skills-marketplace/` (8) → 1 agent
- `tasks/wallet-transactions/` (7) → 1 agent
- `tasks/agent-creation/`, `tasks/devops/`, `tasks/platform-ux/` (1 each) → 1 agent

Agents are independent and can run concurrently; each only deletes within its
assigned subtree and appends to the shared manifest.

---

## Bookkeeping after the sweep

1. **Indexes:** for every group where files were deleted, edit its index
   (`README.md` / `00-overview.md` / `00-START-HERE.md`) to remove the deleted
   entries. If an entire group is emptied, delete its index too and drop the
   group from `tasks/README.md`.
2. **Already staged:** `tasks/vanity-3ws/` is already `git rm`-ed (mint-mark
   brand is shipped and server-enforced) — keep it staged; it's the precedent.
3. **Review:** open `tasks/CLEANUP-MANIFEST.md` and `git diff --staged --stat`
   before committing. Every `DELETE` must have evidence.
4. **Commit:** one commit, e.g. `chore: remove task specs for shipped work`.
   Do not push without explicit user approval (CLAUDE.md: push to BOTH remotes).

---

## Guardrails

- Verify before deleting — the swarm churns this tree; a missing symbol may mean
  "moved", not "not done". Grep broadly before concluding KEEP or DELETE.
- This is reversible via git, but the manifest is the safety net — fill it in.
- No product-code edits, no dev server, no pushing.

# 02 — Eliminate every TODO, stub & placeholder

**Phase 1. Run after [01](01-production-audit-scorecard.md). Serial** (broad
edits — keep its diff isolated).

## Where you are

`/workspaces/three.ws` — three.ws, 3D AI-agent platform. Read
[CLAUDE.md](../../CLAUDE.md). Hard rules in play: **No TODO comments. No
`// implement later`. No stub functions. No `throw new Error("not implemented")`.
No commented-out code. If you write it, finish it.** There are ~652 marker hits
to resolve. The only coin is **$THREE**.

## Objective

Drive the TODO/FIXME/stub/placeholder count in `src/ public/ api/ workers/` to
**zero** — by *implementing* the missing behavior, not by deleting the comment
and leaving the gap. Every marker is either real missing work (implement it) or
a stale note (remove it because the work is already done).

## Why it matters

A TODO in shipped code is an admission the product is unfinished. Investors,
contributors, and users read this repo. Every marker is a small broken promise.
Closing them is the difference between a demo and a product.

## Instructions

1. **Enumerate** from `docs/audits/gap-inventory.json` (or re-run the grep in
   [00-README](00-README-orchestration.md)). Group by directory/owner-surface so
   you can batch related ones.
2. **Triage each marker** into one of:
   - **Implement** — the feature/branch/edge-case is genuinely missing. Build it
     properly with real APIs and real data. No shortcuts.
   - **Already done** — the note is stale; delete the comment.
   - **Wrong layer** — it describes work that belongs elsewhere; implement in the
     right place and remove the marker.
   Never resolve by weakening behavior or hiding the path.
3. **For commented-out code:** delete it or implement it. Git history is the
   archive — dead code in the tree is not.
4. **For `// placeholder` UI / copy / data:** replace with the real thing. If a
   value must come from an API, wire the fetch. If copy is a stand-in, write the
   final copy.
5. **Work in reviewable batches** by surface (e.g. all forge TODOs, then all
   marketplace TODOs). After each batch run `npm run lint && npm run typecheck`
   and the relevant tests. Commit per surface with explicit paths so concurrent
   agents aren't clobbered (`git add <files>`, never `-A`).
6. **Re-measure** after each batch; track the count down to zero.

## Definition of done

- [ ] `grep -rIn "TODO\|FIXME\|not implemented\|implement later\|placeholder\|coming soon\|XXX:\|HACK" --include=*.js src/ public/ api/ workers/ | grep -v node_modules` returns **0** (or each remaining hit is a legitimate string literal a user types/searches, justified inline in your final report).
- [ ] No `throw new Error("not implemented")`, no stub functions, no
      commented-out code blocks remain in the changed files.
- [ ] Every "implement" item is wired to real APIs/data and reachable in the UI.
- [ ] `npm run lint`, `npm run typecheck`, and `npm test` pass.
- [ ] `gap-inventory.json` `todos` array updated to reflect what was closed.
- [ ] Changelog: add one `improvement` entry to `data/changelog.json` if any
      user-visible behavior was completed (plain language, not "removed TODOs").

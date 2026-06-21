# B08 — Agent Studio (brain/memory/body/money/skills) production pass

> Phase B · Depends on: B06 · Parallel-safe: yes
> Run in a fresh chat in `/workspaces/three.ws`. Read [CLAUDE.md](../../CLAUDE.md) first.

## Mission
Agent Studio is where users invest effort into their agents — the deeper the investment,
the higher the retention and the more they spend. It's a sophisticated multi-tab editor;
this pass closes the reliability gaps (concurrent edits, optimistic rollback, offline) that
erode trust in a tool people rely on.

## Where this lives (real files)
- `src/studio/studio-shell.js`, `src/studio/agent-studio-store.js` — shell + store (debounced PUT, optimistic UI, live preview).
- `src/studio/brain/`, `src/studio/memory/`, `src/studio/body/`, `src/studio/money/`, `src/studio/skills/` — sub-studios.
- `api/` agent update endpoints; `src/agent-presence.js` — live avatar presence.

## Current state & gaps
- Concurrent edits across tabs = last-write-wins with no conflict signal; optimistic rollback on PUT failure can flicker; sub-studio state is isolated so avatar updates can lag; offline/edit-queue behavior unclear.

## Build this
1. **Conflict handling:** detect a concurrent edit (version/updated_at check) and prompt to reload/merge instead of silently clobbering; show "saved / saving / failed" status clearly.
2. **Robust optimistic UI:** on PUT failure, roll back cleanly without flicker and surface a retry; never leave the UI showing an unsaved value as saved.
3. **Shared live preview:** brain/memory/body/money/skills changes reflect in the shared 3D preview promptly; presence updates don't flicker on large edits.
4. **Offline/queue:** detect offline, queue edits, and reconcile on reconnect (or clearly block with a message) — no lost work.
5. **Each sub-studio complete:** brain (LLM + prompt), memory (CRUD with the memory model), body (avatar + outfit), money (wallet + pricing), skills (install/configure/remove) each have all states and validate input.
6. **A11y + mobile:** tabs and editors keyboard-navigable; usable on tablet.

## Out of scope
- The avatar pipeline (D01) and payment internals (B03) — wire to them.

## Definition of done
- [ ] Concurrent edits are detected and never silently clobber; save status always accurate.
- [ ] Optimistic updates roll back cleanly; offline edits queue + reconcile or block clearly.
- [ ] Live preview reflects every sub-studio; each sub-studio has all states + validation.
- [ ] `npx vitest run` green; changelog entry; committed + pushed to both remotes.

## Verify
- Edit the same agent in two tabs → conflict surfaced; kill the network mid-edit → queued/blocked, no data loss; change body → preview updates.

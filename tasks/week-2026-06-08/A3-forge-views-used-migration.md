# A3 — Apply the forge `views_used` migration in production

**Track:** A — production fire · **Priority:** P1 · **Effort:** 30m–1h · **Depends on:** none

## Context (evidence)

Production logs show repeated:

```
[forge-store] listCreations failed: column "views_used" does not exist
```

The forge gallery (`GET /api/forge-gallery`, and `listCreations` in `api/_lib/forge-store.js`) is
**broken in prod** because the runtime queries columns that the production database does not have.

The migration that adds them already exists in-repo and is correct:

`api/_lib/migrations/20260606000000_forge_multiview.sql`
```sql
alter table forge_creations add column if not exists views_requested smallint;
alter table forge_creations add column if not exists views_used      smallint;
alter table forge_creations add column if not exists multiview        boolean;
alter table forge_creations add column if not exists backend          text;
```

It was committed Jun 6 but **has not been applied to the production Neon database** — the error
fired *after* the migration landed in the repo.

## What to do

1. Determine how migrations are run in this repo. Search for the runner and any
   already-applied bookkeeping: look in `api/_lib/migrations/` for a runner, `scripts/` for a
   `migrate*`/`db*` script, and `package.json` scripts. Do **not** invent a new mechanism — use
   the established one.
2. Apply the pending migration(s) to the **production** database. The columns use
   `add column if not exists`, so the migration is idempotent and safe to re-run.
3. Confirm the production `forge_creations` table now has `views_requested`, `views_used`,
   `multiview`, `backend`.
4. Audit for **other** unapplied migrations dated on/around 2026-06-06+ that may be in the same
   state, and apply any that are genuinely pending (be conservative — only apply migrations that
   are committed and intended for prod).

> This task is primarily an **operational** action against the prod DB. If running it requires the
> production `DATABASE_URL` / Neon credentials that are not available to you, do **not** guess or
> hardcode anything: complete the code/verification portions, then clearly document in your commit
> message and in a short note that the human must run the migration runner against prod, naming the
> exact command. The acceptance criterion below for "prod has the columns" may then be handed off.

## Acceptance criteria

- [ ] The migration mechanism used is the repo's existing one (no ad-hoc SQL outside the
      migrations system).
- [ ] Production `forge_creations` has the four new columns (or a precise, documented hand-off if
      prod credentials are unavailable to the agent).
- [ ] `listCreations` / `GET /api/forge-gallery` no longer errors on the missing column.
- [ ] No code regression to forge submit/poll responses that read these columns
      (`api/forge.js:408, 550`, `src/forge.js`).

## Verification

1. After applying, hit `GET /api/forge-gallery` against the environment you migrated and confirm a
   200 with creations (or an empty list — not a 500).
2. Grep confirms the reading code paths (`rg -n views_used api src`) align with the column names
   the migration creates.

## Rules

Obey [CLAUDE.md](../../CLAUDE.md). Real DB, real migration — no schema mocking.

## Completion protocol

1. Re-read your diff (`git diff`) and confirm every line is justified.
2. Delete this file: `tasks/week-2026-06-08/A3-forge-views-used-migration.md`.
3. Commit (any code/doc changes) **and** this file's deletion together, e.g.:
   `git add -A && git commit -m "chore(db): apply forge_multiview migration to prod; close A3"`
4. Do **not** push — the human controls pushes.

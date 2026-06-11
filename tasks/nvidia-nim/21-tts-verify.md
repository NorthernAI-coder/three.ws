# Task T2.2: Deploy + verify avatar speech on every surface, changelog

You are a senior engineer working in the **three.ws** repo (`/workspaces/three.ws`).
Read `CLAUDE.md` first and obey it, then read `tasks/nvidia-nim/PLAN.md` for context.

**Dependencies:** T2.1.

## Steps

1. **Changelog:** append a holder-readable entry to `data/changelog.json` — avatar
   speech is back, in holder language (no commit jargon); tag `fix`. Validate with
   `npm run build:pages`.
2. **Commit & push** (explicit paths, both remotes per CLAUDE.md, api/-clobber check
   on changed api/ files first). Watch the production build through to green.
3. **Find every surface** that calls `/api/tts/speak`: grep the frontends (`src/`,
   `public/`, widget embed code, MCP tools) — don't assume you know them all.
4. **Verify each one in prod** actually plays audio (real browser, real click). List
   every surface checked in the Worklog. Zero console errors from the speech path.
5. Run `npm run changelog:push` if Telegram creds are present locally (skip silently
   if not).

## Done when

Every speech surface on production plays audio via the free lane, and the Worklog lists
them individually.

## Before you finish (mandatory bookkeeping)

Tick T2.2 in `tasks/nvidia-nim/PLAN.md`, append a dated Worklog entry, and commit the
plan update with explicit path staging.

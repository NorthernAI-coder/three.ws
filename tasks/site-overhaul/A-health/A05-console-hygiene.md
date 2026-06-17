# A05 — Console hygiene

**Track:** Health · **Size:** S/M · **Priority:** P2

## Goal
Reduce ~324 `console.error`/`console.warn` calls in `src/` to a clean, intentional set. A
production console should be quiet; noise hides real problems and looks unprofessional when a
developer-user opens DevTools.

## Why it matters
`CLAUDE.md` definition of done: "No console errors. No console warnings from your code."

## Context
- `grep -rn "console\.\(error\|warn\|log\)" src | wc -l` to size it; group by file.
- Many are legitimate diagnostics; the goal is *intentional* logging, not zero.

## Scope
- Introduce/adopt a tiny logger (`src/shared/log.js`) gated on `import.meta.env.DEV` (or a `?debug` flag) so verbose diagnostics don't ship to prod consoles.
- Convert noisy `console.*` to the logger. Keep genuine error reporting that a user/operator should see, but ensure it's paired with a user-facing state (coordinate with `A04`).
- Remove dead `console.log` debug breadcrumbs entirely.

## Definition of done
- Loading the home page, `/discover`, `/dashboard`, and an agent page produces **zero** warnings/errors from our code in a production build.
- Verbose logs are available behind the dev/debug gate.

## Verify
- `npm run build && npm run preview` (or serve `dist/`); open each surface — clean console.

<!-- AUTO:self-delete-on-complete -->

---

## ✅ On completion — delete this file

This file is a unit of work, not a permanent doc. The moment every item above is **built, wired, verified, and committed** to the "Definition of done" in the repo-root `CLAUDE.md`, remove it in the same change:

```bash
git rm "tasks/site-overhaul/A-health/A05-console-hygiene.md"
```

Stage the deletion alongside your implementation and include it in the completion commit. This directory is the backlog: a file that still exists is unfinished work; a file that is gone has shipped. Do not delete early, and never leave a completed prompt behind.

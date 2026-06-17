# A01 — Kill production-breaking `localhost` fallbacks

**Track:** Health · **Size:** S · **Priority:** P0 (breaks features in prod)

## Goal
Two modules fall back to a hardcoded `localhost` URL when an env var is unset. In production
that silently breaks the feature. Resolve them to real production defaults and fail loudly in
dev if misconfigured — never ship a dead `localhost` to users.

## Why it matters
Multiplayer `/walk` and the avatar creator both die on real deployments if their env var isn't
present. This is the kind of bug that makes the platform look broken to a first-time visitor.

## Context
- [src/walk-net.js](src/walk-net.js#L48) — `defaultServerUrl()` returns `'ws://localhost:2567'` as the final fallback.
- [src/avatar-creator.js](src/avatar-creator.js#L21) — `getStudioUrl()` returns `'http://localhost:5173'` when `VITE_CHARACTER_STUDIO_URL` is unset.
- Check how other modules resolve prod URLs (meta tags, `import.meta.env`, `window.location.origin`) and follow that pattern.

## Scope
- Replace each `localhost` fallback with: (1) the real production URL (find it in `vercel env`, `.env`, or existing config), resolved via the same mechanism the rest of the app uses; (2) in dev, keep `localhost` only when `import.meta.env.DEV` is true.
- If no env var is set in prod, surface a clear, user-facing error/empty state ("multiplayer is temporarily unavailable") rather than attempting a doomed `localhost` socket.
- Grep the whole tree for other hardcoded `localhost`/`127.0.0.1` in non-dev/non-test code and fix the same way.

## Out of scope
- Dev tooling, scripts/, tests/ (localhost is fine there).

## Definition of done
- With the env var unset, `/walk` and the avatar creator degrade gracefully (no console flood, designed message), and with it set, they connect to the real service.
- No `localhost`/`127.0.0.1` remains in shipped `src/` runtime paths outside `import.meta.env.DEV` guards.

## Verify
- `npm run dev`, open `/walk` and the create flow; confirm real connections.
- `grep -rn "localhost\|127.0.0.1" src | grep -v "env.DEV"` returns only guarded or commented cases.

<!-- AUTO:self-delete-on-complete -->

---

## ✅ On completion — delete this file

This file is a unit of work, not a permanent doc. The moment every item above is **built, wired, verified, and committed** to the "Definition of done" in the repo-root `CLAUDE.md`, remove it in the same change:

```bash
git rm "tasks/site-overhaul/A-health/A01-fix-localhost-fallbacks.md"
```

Stage the deletion alongside your implementation and include it in the completion commit. This directory is the backlog: a file that still exists is unfinished work; a file that is gone has shipped. Do not delete early, and never leave a completed prompt behind.

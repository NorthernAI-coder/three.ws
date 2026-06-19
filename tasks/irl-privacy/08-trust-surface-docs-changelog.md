# 08 — User-facing "how location works" trust surface + docs + changelog

> Size **S–M** · A small in-app explainer + a help/docs page, doc cleanup of any
> stale "realtime pin sync" references, and finalizing the changelog. Closes the epic.

## Goal

Tell users — plainly and proudly — how location works on /irl: agents are private by
location, discovered only in person, never listed. For a safety feature, the
*explanation* is part of the product: it's what converts "creepy AR thing that wants
my camera and GPS" into "oh, this is actually thoughtful about privacy." Then scrub
the docs of the old model and finalize the changelog.

## Why it matters

Trust is UX. The single biggest objection to a location-based AR app is "who can see
where I put this / where I am?" A clear, honest answer — surfaced at the right moment
and on a linkable page — is a feature, not boilerplate. And any doc still describing
the removed realtime pin-sync ("agents update live across the neighborhood") is now a
lie that erodes that trust.

## Current state

- The first-run explainer (task 02) carries a one-line privacy reassurance; this task
  gives it a "Learn more" → a real page.
- `data/changelog.json` has the entry "IRL world: placed agents are private by
  location — discovered only in person" (already rewritten to the final model).
  `public/changelog.{json,xml}` + `CHANGELOG.md` regenerate via `npm run build:pages`.
- Search the repo/docs for stale language: any mention that IRL pins sync "live" /
  "in realtime" across viewers, a "nearby list/feed," a "map of agents," or the old
  bbox/window/`/internal/irl-publish` flow — in `docs/`, `pages/`, blog posts, SDK
  docs, and code comments. Public copy must stay literal + professional
  ([memory: public-copy-tone]).

## What to build

1. **In-app "How location works"** — reachable from the first-run explainer's "?" and
   from a small link in the /irl onboarding/settings. Short, plain, honest:
   - Agents are placed at real spots; you find them only by being near them in person.
   - There is **no list or map** of where agents are — not for other users, and not a
     public directory. (Your own placements are visible only to you, in your dashboard.)
   - What others *can* see when you're around: an anonymous "someone is viewing
     nearby" presence count and, if you opt in, a coarse ghost — never your exact GPS.
   - Camera/motion/location are used on-device to render the scene; link the privacy
     policy.
2. **Docs cleanup** — update or remove every stale reference found above so docs
   describe the proximity-only model. If a docs page described D1 realtime pin sync,
   rewrite it to "presence + reactions are realtime; pins are discovered by proximity."
3. **Changelog finalize** — confirm the existing entry reads cleanly for holders, run
   `npm run build:pages` (it validates + regenerates), and after deploy run
   `npm run changelog:push --dry-run` to preview the holder Telegram post (skip the
   real push unless asked; creds may be absent locally).
4. Remove the now-obsolete `smoke:irl-d1` script + `scripts/irl-d1-smoke.mjs` if still
   present (the D1 realtime pin-sync it smoke-tested no longer exists).

## Acceptance checklist

- [ ] "How location works" surface exists, reachable in-app, plain + accurate, links
      the privacy policy; copy is literal/professional (no sci-fi metaphors).
- [ ] Zero stale references to realtime pin sync / nearby list / map / bbox / publish
      webhook remain in `docs/`, `pages/`, blog, SDK docs, or code comments.
- [ ] `data/changelog.json` entry final; `npm run build:pages` passes + regenerates
      `CHANGELOG.md` + `public/changelog.{json,xml}`.
- [ ] `changelog:push --dry-run` previews cleanly (no real push without ask).
- [ ] Obsolete `smoke:irl-d1` script + file removed.
- [ ] Clean at 320/768/1440; no console errors.

## Out of scope

The first-run explainer component itself (task 02 builds it; this adds its linked
"Learn more" page + the privacy copy).

## Verify

`npm run dev` → open the "How location works" page from /irl; `grep -ri` the repo for
the stale terms and confirm none remain in user-facing docs; `npm run build:pages`
green.

<!-- AUTO:self-delete-on-complete -->

---

## ✅ On completion — delete this file

This file is a unit of work, not a permanent doc. The moment every item above is **built, wired, verified, and committed** to the "Definition of done" in the repo-root `CLAUDE.md`, remove it in the same change:

```bash
git rm "tasks/irl-privacy/08-trust-surface-docs-changelog.md"
```

Stage the deletion alongside your implementation and include it in the completion commit. This directory is the backlog: a file that still exists is unfinished work; a file that is gone has shipped. Do not delete early, and never leave a completed prompt behind.

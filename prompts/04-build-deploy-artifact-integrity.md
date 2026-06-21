# 04 · Build & Deploy Artifact Integrity

## Mission
Guarantee that what we ship is what we wrote. The build must be reproducible, the deploy artifacts
clean, and the notorious esbuild-overwrite trap impossible to commit by accident.

## Context
- Build: `npm run build` (Vite, `NODE_OPTIONS` memory bump) then `scripts/strip-sw-from-embeds.mjs`.
- Vercel build path: `npm run build:vercel` (`scripts/build-vercel.mjs`); `npm run check:dist`.
- **Known trap (CLAUDE.md):** `npx vercel build` overwrites `api/*.js` source in place with huge
  esbuild bundles (first line `__defProp`/`createRequire`). These must never be committed.
- Deploy audit: `npm run audit:deploy` (`scripts/audit-deploy-artifacts.mjs`).

## Tasks
1. **Reproducible build:** run `npm run build` from clean (`npm run clean`) and confirm it succeeds
   with no warnings from our code. Record build time + bundle sizes; flag any chunk that's
   unexpectedly large.
2. **Artifact audit:** run `npm run audit:deploy` and `npm run check:dist`; fix anything flagged.
3. **esbuild-trap guard:** add a committable safeguard — a pre-commit-style check (script under
   `scripts/`, optionally wired into `npm run` and/or `.husky`/git hook docs) that rejects staging
   any `api/*.js` whose first line matches `__defProp`/`createRequire`/`esbuild`. Verify it triggers
   on a planted sample and is removed cleanly after.
4. **Source-map & secret hygiene:** confirm no `.env`, secrets, source maps with secrets, or
   internal docs leak into `dist/`. Confirm `dist/` and scratch artifacts are gitignored.
5. **Embed integrity:** verify `strip-sw-from-embeds.mjs` actually strips the service worker from
   embed bundles (embeds must not register the SW). Test one embed page.
6. **CI parity:** ensure local `npm run build` matches what CI/Vercel runs; document any divergence
   in `docs/build.md`.

## Acceptance
- Clean `npm run build`, `npm run check:dist`, `npm run audit:deploy` all green.
- The esbuild-trap guard provably blocks a bundled `api/*.js` from being staged.
- No secrets/source artifacts in `dist/`.
- Findings + the new guard documented; changelog entry only if user-visible.

---
### Operating rules — read CLAUDE.md + STRUCTURE.md first (they override defaults)
- No mocks / fake data / placeholders / TODOs / stubs. Real APIs and implementations only.
- $THREE is the only coin (CA `FeMbDoX7R1Psc4GEcvJdsbNbZA3bfztcyDCatJVJpump`). Never reference any other token, anywhere.
- Concurrent agents share this worktree — stage explicit paths (never `git add -A`); re-check `git status`/`git diff --staged` before committing.
- esbuild trap: never commit `api/*.js` starting with `__defProp`/`createRequire`; recover with `git restore -- api/ public/`.
- No throwaway scripts in the repo root — put tooling in `scripts/`.
- Push to BOTH remotes when asked (`git push threeD main && git push threews main`); never pull/fetch/merge from `threeD`.
- Definition of done = CLAUDE.md's checklist.

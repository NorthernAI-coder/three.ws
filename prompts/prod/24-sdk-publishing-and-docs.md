# 24 — SDK publishing & docs

> Part of **Road to $1B** (`prompts/road-to-1b/`). Read `00-README.md` and `/CLAUDE.md` first.

**Phase:** 2 — Product surface completeness
**Owns:** all published packages — `avatar-sdk/`, `walk-sdk/`, `tour-sdk/`, `page-agent-sdk/`, `sdk/`, `solana-agent-sdk/`, `agent-payments-sdk/`, `agent-protocol-sdk/`, `agent-ui-sdk/`, `packages/*`.
**Depends on:** `15`, `18`, `19`, `21`, `23`. Pairs with `34`.

## Why this matters for $1B
Every SDK someone installs is a distribution endpoint and a lock-in surface. A
platform valued at $1B has SDKs that "just work" — installable, typed, documented,
versioned, with copy-paste examples. Developer trust is earned in the first 5 minutes.

## Map
- npm workspaces + top-level SDKs (see `STRUCTURE.md`). Publish scripts:
  `publish:packages`(`:dry`), `publish:lib`, `publish:mcp`(`:dry`), `release:lib`.
  Promotion path + publishing notes in `STRUCTURE.md`, `page-agent-sdk/PUBLISHING.md`.

## Do this
1. **Build integrity:** every package builds cleanly from a fresh install
   (`npm ci`), with correct `main`/`module`/`exports`/`types`, `files` allowlist
   (no source-only leakage, no junk), and working ESM/CJS as declared.
2. **Types:** ship accurate type declarations (`.d.ts`) for every public API. No
   `any`-leaks at the boundary. `npm run typecheck` clean.
3. **Versioning:** consistent semver, accurate `peerDependencies`, no phantom/extra
   deps, deduped lockfile. Confirm `publish:packages:dry` and `publish:mcp:dry` are
   clean for all.
4. **READMEs:** every package has a README with: what it is, install, a 30-second
   quickstart that actually runs, the full API surface, framework variants (web
   component + React for avatar; embed snippets for walk/tour/page-agent), and a link
   to live examples.
5. **Examples:** `examples/` has a runnable example per SDK (web component, React,
   two-agents, minimal, embed). Each is exercised and works against the live site.
6. **Changelogs:** each published package has a CHANGELOG; an SDK release also gets a
   holder-facing entry in `data/changelog.json` (tag `sdk`).
7. **CDN/embed:** the script-tag/CDN embed paths (avatar viewer, walk companion, page
   agent) are documented with integrity-pinned snippets that work copy-paste.
8. **License/attribution:** licenses present and correct; forks (CharacterStudio,
   three.js editor) keep upstream attribution.
9. Do a real consumer test: in a scratch project outside the repo, `npm install` the
   packed tarball (`npm pack`) and run each quickstart. Fix anything that doesn't work.

## Must-not
- Do not publish a package whose quickstart doesn't run as written.
- Do not leak source/test files or secrets via a missing `files` allowlist.
- Do not reference any coin other than $THREE in SDK docs/examples.

## Acceptance
- [ ] Every package builds from `npm ci`; correct exports/types/files; ESM/CJS as declared.
- [ ] Accurate `.d.ts` for all public APIs; typecheck clean.
- [ ] Consistent semver + correct peer deps; `publish:*:dry` clean.
- [ ] Every package README has a runnable quickstart + full API + example links.
- [ ] One runnable example per SDK in `examples/`, exercised against live.
- [ ] `npm pack` → install-in-scratch-project quickstart works for each SDK.
- [ ] SDK release changelog entries added (tag `sdk`).

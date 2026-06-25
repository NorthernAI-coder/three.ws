# Build & deploy artifact integrity

How three.ws is built, how the local build maps to what Vercel runs, and the
guards that keep what we ship identical to what we wrote. Read this before
touching the build pipeline.

## Commands at a glance

| Command | What it does |
| --- | --- |
| `npm run build` | The app build: `prebuild` lifecycle → `vite build` (`--max-old-space-size=6144`) → `scripts/strip-sw-from-embeds.mjs`. Output → `dist/`. |
| `npm run build:vercel` | The **deploy** build orchestrator (`scripts/build-vercel.mjs`) — what Vercel actually runs. Superset of `npm run build` (see [CI parity](#ci-parity)). |
| `npm run clean` | `rm -rf dist/* dist-lib/*`. |
| `npm run check:dist` | Asserts the published `agent-3d` library bundle + `dist-lib` mirror exist and the version matches `package.json` (`scripts/check-dist.mjs`). |
| `npm run audit:deploy` | Pre-flight for the three 2026-06-11 outage classes: committed symlinks, unsatisfied peer deps, undeclared `api/` imports (`scripts/audit-deploy-artifacts.mjs`). |
| `npm run guard:esbuild` | esbuild-trap guard — blocks committing a bundled `api/*.js` (scans the git index). `:all` sweeps the working tree. |

## CI parity

Vercel is configured (`vercel.json`) with:

- `installCommand`: `npm ci --no-audit --no-fund`
- `buildCommand`: `npm run build:vercel`
- `outputDirectory`: `dist`
- `.npmrc`: `legacy-peer-deps=true` (npm never auto-installs peers — the reason
  `audit:deploy` checks the peer tree)
- Node `24.x` (`engines.node`)

There is **no GitHub Actions CI** on this account — the Vercel build is the only
automated checkpoint, which is why `build:vercel` front-loads the audit/verify
gates (`audit:deploy`, `test:gate`, `verify:solana`, `verify:onchain`,
`audit:mcp`) that a CI workflow would normally run.

**`npm run build` is a strict subset of `npm run build:vercel`.** The app's Vite
build is byte-for-byte the same step in both — `build:vercel`'s phase 4
(`buildApp`) runs the identical `vite build && strip-sw-from-embeds` with the
same `NODE_OPTIONS`. The deploy build additionally:

1. Runs the gates above (phase 1).
2. Bundles the API with esbuild (`scripts/bundle-api.mjs`) so Vercel's file
   tracer doesn't spend 45 min walking `node_modules` — **this is the step that
   overwrites `api/*.js` in place** (see [the trap](#the-esbuild-overwrite-trap)).
3. Builds the embeddable library + `avatar-sdk` (phase 2), `character-studio`
   and `chat` (phase 3).
4. Post-build: copies avatar-studio, publishes the lib, applies R2 CORS, pushes
   the changelog (phase 5).

To reproduce a deploy locally, prefer `npm run build:vercel` **in a throwaway
worktree** (because of step 2). To iterate on the front-end only, `npm run build`
is faithful and safe.

## The esbuild-overwrite trap

`npx vercel build` and `scripts/bundle-api.mjs` both esbuild every API route and
write the bundle back over the source: `esbuild ... --outdir=api
--allow-overwrite`. On Vercel the checkout is ephemeral, so this is correct and
fast. **Locally it destroys the hand-written route sources**, and if one of those
bundles is `git add`ed and committed, the real source is lost and the repo
balloons by millions of generated lines. This has happened twice
(commits `c94190b3`, `dabd5884` — both reverted).

A bundled file is unmistakable: its opening lines carry esbuild's interop
helpers (`__defProp`, `__commonJS`, `__toESM`, `__esm`) or the `bundle-api`
`createRequire` banner — none of which ever appear at the top of a hand-written
route.

### Guard: `scripts/guard-esbuild-bundles.mjs`

Refuses to commit a bundled `api/*.js`. It scans the **staged blob** (`git show
:path`) — what a commit would actually record, not just the working tree — and
exits non-zero on any bundle.

```bash
npm run guard:esbuild           # scan staged api JS (pre-commit use)
npm run guard:esbuild:all       # sweep every working-tree api/**/*.js
node scripts/guard-esbuild-bundles.mjs --files api/foo.js   # explicit paths
```

Detection logic is unit-tested (`tests/guard-esbuild-bundles.test.js`): it must
catch real esbuild/banner output and must not false-positive on a hand-written
route (verified clean across all 1100+ `api/**/*.js`).

### Wiring it as a pre-commit hook

This repo's `.git/hooks` are managed by **git-lfs** (do not overwrite them). To
add the guard, chain it from a `pre-commit` hook that preserves any existing LFS
behavior:

```sh
# .git/hooks/pre-commit   (chmod +x)
#!/bin/sh
node scripts/guard-esbuild-bundles.mjs || exit 1
# (git-lfs installs its own pre-commit on some setups — call it here if present)
command -v git-lfs >/dev/null 2>&1 && git lfs pre-commit "$@"
```

If you ever stage a bundle by accident, recover the source before committing:

```bash
git restore --staged -- api/ public/   # unstage the bundles
git restore -- api/ public/            # restore source from HEAD
```

### Recognizing it after the fact

```bash
head -1 api/<route>.js   # bundle if it starts with __defProp / createRequire / esbuild
```

## Source-map & secret hygiene

- `dist/`, `dist-lib/`, `dist-artifact/`, `.vercel/`, and every `.env*` file are
  gitignored (`.gitignore`) — build output and secrets never reach git.
- The Vite app build emits **no `.js.map` source maps** into `dist/` (production
  config), so no source is shipped to clients.
- `scripts/audit-deploy-artifacts.mjs` blocks committed symlinks (Vercel's tracer
  can't resolve them) and undeclared `api/` imports (phantom hoisted deps that
  vanish on dedupe).

## Embed integrity

Embed surfaces (`/widget`, `/embed`, `/agent-embed`, `/a-embed`,
`/avatar-embed`, `/agent-token-page`) load inside third-party iframes. They must
**not** register the service worker — an SW registered from an iframe is scoped
to `https://three.ws/` and would intercept every other tab on the origin.

`scripts/strip-sw-from-embeds.mjs` runs as the last step of `npm run build` and
removes the VitePWA `register-sw` `<script>` from each embed HTML in `dist/`. It
is idempotent and fails loudly if no embed HTML is found. Verify with:

```bash
grep -l 'vite-plugin-pwa:register-sw' dist/widget.html dist/embed.html   # expect: no matches
```

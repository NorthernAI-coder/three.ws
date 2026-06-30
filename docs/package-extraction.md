# Package extraction — breaking the monorepo into standalone repos

We are graduating the reusable packages out of the `three.ws` monorepo into their
own GitHub repos that publish to npm (or, for the VS Code extension, the
Marketplace) independently. This is the playbook. **We start with the x402 family.**

## Why

The x402 packages (`@three-ws/x402-*`) are general-purpose — a buyer-side fetch
wrapper, a seller-side core, MCP servers, payment modals. They are useful far
beyond three.ws, they version on their own cadence, and bundling them in a 60+
directory monorepo hides their issue tracker, inflates clone size, and couples
their releases to unrelated platform commits. Standalone repos fix all four.

## Decisions (locked)

- **One repo per package** (polyrepo), not a shared x402 monorepo.
- **History preserved** via `git filter-repo --subdirectory-filter` — blame and
  authorship carry across.
- **Scope/owner unchanged**: keep publishing as `@three-ws/*`, host under
  `github.com/nirholas`. No renames, no broken installs.

## Tooling

Two scripts in [`scripts/`](../scripts) do the work:

| Script | Who runs it | What it does |
|---|---|---|
| [`extract-package.sh`](../scripts/extract-package.sh) | anyone | Splits `<prefix>` into a standalone repo (history at root), rewrites `repository`/`bugs`, adds the publish CI workflow, and verifies it installs, builds, tests, and packs. |
| [`publish-extracted.sh`](../scripts/publish-extracted.sh) | **owner only** | Creates the GitHub repo, pushes the history, and tags the version to trigger the publish workflow. Needs the owner's `gh` auth + the repo's publish-token secret. |

```bash
# 1. build the standalone repo (deterministic, reads committed monorepo history)
scripts/extract-package.sh packages/x402-fetch x402-fetch nirholas

# 2. ship it (owner creds: gh auth as the namespace owner, then set NPM_TOKEN)
scripts/publish-extracted.sh x402-fetch nirholas
```

`extract-package.sh` reads **committed** history — commit any source fixes to the
monorepo first, then extract.

## x402 roster

All seven extract cleanly with full history. Six are npm packages already live
under `@three-ws/*`; `vscode-x402` targets the VS Code Marketplace.

| Package | Monorepo path | npm (live) | Local ver | Build | Tests | Notes |
|---|---|---|---|---|---|---|
| `@three-ws/x402-fetch` | `packages/x402-fetch` | 1.0.1 | 1.0.1 | vite | 7 pass | buyer-side fetch wrapper |
| `@three-ws/x402-server` | `packages/x402-server` | 0.1.0 | 0.1.0 | — | pass | seller-side core |
| `@three-ws/x402-mcp` | `packages/x402-mcp` | 0.2.0 | 0.2.0 | ✓ | pass | MCP server |
| `@three-ws/ibm-x402-mcp` | `packages/ibm-x402-mcp` | 1.1.0 | 1.1.0 | ✓ | pass | IBM MCP variant |
| `@three-ws/x402-modal` | `x402-modal-sdk` | 0.2.0 | 0.2.0 | esbuild | pass | payment modal SDK |
| `@three-ws/x402-payment-modal` | `x402-payment-modal` | 1.1.0 | **1.2.0** | esbuild | 14 pass | publishes 1.2.0 (deps fixed — see below) |
| `@three-ws/vscode-x402` | `packages/vscode-x402` | — | 0.1.0 | esbuild | — | **Marketplace**, not npm; needs name/publisher fix |

### Fixes the split surfaced (already applied to the monorepo)

- **`x402-payment-modal/build.mjs`** imported esbuild via a hardcoded
  `../node_modules/esbuild/lib/main.js` — coupled to the monorepo's hoisted
  layout, broken in a standalone repo. Changed to a bare `import 'esbuild'`,
  which resolves in both.
- **`x402-payment-modal/package.json`** shipped a `server/` adapter importing
  `@solana/web3.js`, `@solana/spl-token`, and `express` with **zero declared
  dependencies** — the published package was broken for anyone using the server
  subpath. Added them as optional `peerDependencies` (keeps the browser install
  lean) plus the Solana pair as `devDependencies` so tests/CI run.

### vscode-x402 — extra step before Marketplace publish

VS Code extensions cannot use a scoped `name`. Before `vsce publish`:

- set `name` to a plain id (e.g. `vscode-x402`),
- add a `publisher` field matching a registered Marketplace publisher,
- the CI workflow already uses `vsce publish` + `ovsx publish` (Open VSX) and
  expects `VSCE_PAT` / `OVSX_PAT` secrets.

## Owner handoff — the two steps that need credentials

Everything up to the GitHub/npm boundary is automated and verified. The final two
steps need the owner's credentials and cannot run from a collaborator session:

1. **Create + push each repo** (`nirholas` is a personal account; only its owner
   can create repos in that namespace). Each line is `<monorepo-path> <repo-name>`:
   ```bash
   while read -r path repo; do
     scripts/extract-package.sh "$path" "$repo" nirholas
     scripts/publish-extracted.sh "$repo" nirholas
   done <<'PKGS'
   packages/x402-fetch          x402-fetch
   packages/x402-server         x402-server
   packages/x402-mcp            x402-mcp
   packages/ibm-x402-mcp        ibm-x402-mcp
   x402-modal-sdk               x402-modal
   x402-payment-modal           x402-payment-modal
   PKGS
   ```
   (`vscode-x402` is handled separately — see the Marketplace note above.)
2. **Set the publish-token secret** on each new repo so its workflow can
   authenticate to npm (`NPM_TOKEN`) or the Marketplace (`VSCE_PAT`/`OVSX_PAT`).

Already-published versions (e.g. x402-fetch 1.0.1) republish only after a version
bump — the workflow tags and publishes the version in `package.json`, so bump it
when there's something new to ship. `x402-payment-modal` is at an unpublished
1.2.0 and will publish on first tag.

## After a package is extracted

The monorepo copy can stay (the platform still imports it locally) or be replaced
with the published dependency. That cutover is tracked per-package and is **not**
part of the extraction itself — extract and publish first, swap the import later.

# 24 — SDK publishing & docs

> Part of the three.ws "Production → $1B" program. Run in a fresh chat. Read
> `/CLAUDE.md` first (its rules override everything) and `prompts/billion-dollar-program/00-README.md`
> for shared context.

## Why this matters for $1B

The SDKs are how other teams build *on* three.ws instead of competing with it —
a `<agent-3d>` viewer in someone else's app, an agent paying an x402 endpoint
from another platform, a walk companion on a third party's homepage. A broken
`files[]`, a README example that doesn't run, or a `npm install @three-ws/avatar`
that throws on a fresh machine, and a would-be integrator bounces forever. Clean,
documented, dry-run-verified packages turn three.ws into infrastructure.

## Mission

Every published SDK has a correct `package.json` (exports, `files[]`, semver),
a README with real working examples, a clean dry-run publish, and a working
demo/example — so an external developer can install it and ship in minutes.

## Map (trust but verify — files move)

- **Top-level SDKs** (published, not workspaces) — [sdk/](../../sdk) (`@three-ws/sdk`),
  [solana-agent-sdk/](../../solana-agent-sdk) (`@three-ws/solana-agent`),
  [agent-payments-sdk/](../../agent-payments-sdk) (`@three-ws/agent-payments`),
  [agent-protocol-sdk/](../../agent-protocol-sdk) (`@three-ws/agent-protocol-sdk`).
- **App-adjacent SDKs** (workspaces) — [avatar-sdk/](../../avatar-sdk) (`@three-ws/avatar`),
  [walk-sdk/](../../walk-sdk) (`@three-ws/walk`), [tour-sdk/](../../tour-sdk) (`@three-ws/tour`).
- **Spec/schema/preset packages** — [packages/avatar-schema/](../../packages/avatar-schema)
  (`@three-ws/avatar-schema`), [packages/avatar-cli/](../../packages/avatar-cli)
  (`@three-ws/avatar-cli`), [packages/viewer-presets/](../../packages/viewer-presets)
  (`@three-ws/viewer-presets`), [packages/react/](../../packages/react) (`@three-ws/react`).
- **Examples / demos** — [examples/](../../examples) (`embed-test.html`, `web-component.html`,
  `two-agents.html`, `minimal.html`), [multiplayer/](../../multiplayer).
- **Publish tooling** — `npm run publish:packages:dry`
  ([scripts/publish-packages.mjs](../../scripts/publish-packages.mjs)),
  `publish:mcp:dry` ([scripts/publish-mcp-servers.mjs](../../scripts/publish-mcp-servers.mjs)),
  `publish:lib` ([scripts/publish-lib.mjs](../../scripts/publish-lib.mjs)), and the strongest
  gate — [scripts/verify-packages.mjs](../../scripts/verify-packages.mjs) (packs each tarball,
  installs it in a clean throwaway project, then exercises its real public surface).
- **Workspace map** — [STRUCTURE.md](../../STRUCTURE.md) "npm workspaces" + "Promotion path".

## Do this

1. **Inventory + verify names/versions:** for every SDK above, confirm `package.json`
   `name` matches STRUCTURE.md, `version` is sane semver, `type`/`exports`/`main`/`module`/
   `types` resolve, and `files[]` (or `.npmignore`) ships exactly the published surface —
   no `src` leak, no missing `dist`. Confirm a `prepublishOnly`/build runs the build.
2. **Run the real-consumer gate:** `node scripts/verify-packages.mjs` — it packs each
   package into its actual npm tarball, installs into a clean project resolving deps fresh,
   and imports the SDK / runs the CLI bin / boots the MCP server. Fix every `files[]` gap,
   broken export map, or missing runtime dep it surfaces.
3. **Dry-run both publishers:** `npm run publish:packages:dry` and `npm run publish:mcp:dry`.
   Both must report clean — no version-already-published surprises, no auth errors, no
   missing build outputs.
4. **READMEs must teach by example:** each README has install, a minimal runnable example
   (web component, `import`, or CLI invocation), the public API surface, and a link to the
   live page/demo. Every code block must actually run against the published surface — copy
   one into a scratch project and confirm.
5. **Wire a working demo per SDK:** `@three-ws/avatar` → an `examples/` page renders the
   `<agent-3d>` viewer; `@three-ws/walk` → the walk companion mounts; `@three-ws/tour` →
   the feature tour boots; payment/protocol SDKs → a runnable example call (real endpoint,
   no mock). Exercise each in a real browser (`npm run dev`) or node where applicable; zero
   console errors.
6. **Semver discipline:** bump only what changed (patch/minor/major per real diff). Keep
   any `peerDependencies` honest (Three.js, React versions) so installs don't warn. Do not
   publish from this prompt — dry-run + verify only, unless the user explicitly says publish.
7. **Cross-link the docs:** each SDK README links to STRUCTURE.md's workspace row and to its
   sibling SDKs where they compose (e.g. avatar viewer + walk companion). The best platforms
   feel like everything is linked.
8. **Changelog + build:** add a `data/changelog.json` entry (tag `sdk`) for any user-visible
   SDK doc/version change, then `npm run build:pages` (it validates the entry).

## Must-not

- Do not publish to npm/registry from this prompt unless the user explicitly asks — dry-run only.
- Do not ship a README example that doesn't run, or a `files[]` that leaks `src`/tests or drops `dist`.
- Do not reference any coin other than `$THREE` in any example, fixture, or doc.
- Do not use a mock/fake endpoint in an example — real APIs only (or a clearly synthetic placeholder).
- Do not bump versions cosmetically; semver must reflect the actual change.
- Do not break a working package's exports while "cleaning up" its config.

## Acceptance (all true before claiming done)

- [ ] Every SDK `package.json` has a correct `name`, semver `version`, resolving `exports`,
      and a tight `files[]`; builds run via `prepublishOnly`.
- [ ] `node scripts/verify-packages.mjs` passes for every package (clean-room install + surface check).
- [ ] `npm run publish:packages:dry` and `npm run publish:mcp:dry` both report clean.
- [ ] Each README has install + a runnable example + API surface + a live demo link; examples verified to run.
- [ ] At least one working demo per SDK is exercised with zero console errors.
- [ ] No coin other than `$THREE` appears anywhere in SDK source, examples, or docs.
- [ ] Changelog updated (if user-visible) and `npm run build:pages` is clean.

# E1 — SDK Production Polish

You are a senior engineer + product thinker building **three.ws**. Read `CLAUDE.md`,
`STRUCTURE.md`, and `prompts/production-campaign/00b-the-bar.md` first. **Prerequisites:** none.

## Why this matters for $1B
The five published SDKs are the front door for every external developer who builds *on*
three.ws instead of just visiting it — the network-effects pillar (`00-README-orchestration.md`
§4). A dev who installs `@three-ws/avatar`, copies the README, and has a rendered agent in
their app inside ten minutes becomes a distribution channel we didn't pay for. A dev who hits
an untyped surface, a stale README, or an example that throws on line one churns and tells
their team we're not serious. Production DX on these five packages is the cheapest growth we
own.

## Current state (read before you write)
Inspect each SDK dir — `STRUCTURE.md` §npm-workspaces maps the names:
- `avatar-sdk/` → `@three-ws/avatar` v0.2.0 — `<agent-3d>` web component + React subpath; has
  `README.md`, `types/index.d.ts`, `build.mjs`. **No CHANGELOG, no test/example npm scripts.**
- `walk-sdk/` → `@three-ws/walk` v0.1.0 — corner companion + playground. Has README + types.
  **No CHANGELOG.**
- `page-agent-sdk/` → `@three-ws/page-agent` v0.1.0 — `<page-agent>` page narrator. Best-off
  today: has `test/`, `examples/` (index/headless/react/custom-avatar), `PUBLISHING.md`,
  `CONTRIBUTING.md`. **No CHANGELOG.** Use it as the reference bar for the others.
- `tour-sdk/` → `@three-ws/tour` v0.1.0 — has `test/` (vitest), `examples/curriculum.example.json`,
  `bin/`, `curriculum.schema.json`. **No copy-paste README quickstart, no CHANGELOG.**
- `agent-payments-sdk/` → `@three-ws/agent-payments` v3.2.0 — TS, has `docs/` (api/events/pdas/x402),
  `typecheck`, jest `test`. **No CHANGELOG; README quickstart not verified runnable.**

The gap is uniform: there is **no `CHANGELOG.md` in any of the five**, README quickstarts are
not all copy-paste-runnable, typed surfaces are inconsistent, and none has a CI smoke test that
proves the published entrypoint imports. `scripts/publish-packages.mjs` exists (read it to learn
the publish flow and version-bump expectations — do not change publish behavior).

## Your mission
### 1. Copy-paste quickstart in every README (the 10-minute test)
For each of the five, the README's first scrollful must take a stranger from `npm i` to a
working result with **one block they can paste verbatim**. Real install, real import path
(verify against the `exports` map in each `package.json`), real minimal usage that renders/runs.
For `avatar-sdk` show both the `<agent-3d>` web-component path and the React subpath. For
`page-agent-sdk` the `<page-agent>` drop-in. No pseudo-code, no `// ...your code here`. Every
endpoint or key the example needs is named and sourced from env (never inline a secret).

### 2. Typed, documented public surface
Audit each package's `types/` (or generated `.d.ts` for `agent-payments-sdk`) against what the
README and `exports` actually expose. Every public export typed; every option object documented
with TSDoc on the type. For `agent-payments-sdk` keep `npm run typecheck` green. No `any` on a
public boundary that can be tightened. Don't rewrite implementations — type and document the
surface that already ships.

### 3. One runnable example per SDK
Each SDK gets at least one example a dev can actually run (extend `page-agent-sdk/examples/` and
`tour-sdk/examples/` as the pattern). `avatar-sdk` and `walk-sdk` have none — add an
`examples/index.html` (or `.jsx`) that imports the built entrypoint and produces a visible
result against **real** three.ws endpoints. Wire an `npm run example` (or documented open
instruction) so it's discoverable. Examples use real APIs and real keys via env — no mocks.

### 4. Semver + per-package CHANGELOG.md
Add a `CHANGELOG.md` (Keep-a-Changelog format) to each of the five, seeded from git history of
that dir and the current published version. Confirm each `version` in `package.json` follows
semver and matches what's on npm (or the next intended bump). Document the version + compat
matrix (peer `three` / `react` ranges already declared) in the README.

### 5. CI smoke test that proves the entrypoint imports
Add a `smoke` (or `test`) npm script to any SDK lacking one that, at minimum, imports the built
entrypoint and asserts the documented public exports exist (web-component registration,
factory fn, React export). Then add a **new named job** to `.github/workflows/ci.yml`
(e.g. `sdk-smoke`) that builds and smoke-tests all five on PRs. Add a new named job — do not
rewrite existing jobs (E2 also touches this file; coordinate by job name).

### 6. Tighten the seam to docs/examples
The published surface you document here is consumed by E3 (docs) and E4 (examples). Make import
paths, export names, and quickstart copy **identical** to what those tracks will reference —
note any package whose README quickstart you couldn't verify runnable so E4 can build a real
example against it.

## Definition of done
Clears `00b-the-bar.md` §6 (Ecosystem): an outside dev goes zero→working integration in 10
minutes from each README alone; every SDK has a copy-paste quickstart, typed public surface, a
runnable example, semver + CHANGELOG, and a CI smoke test that passes and is enforced. Inherits
the **global definition of done** in `00-README-orchestration.md` (no mocks, `$THREE`-only,
explicit-path staging, existing tests pass, self-reviewed diff). Verify each quickstart by
actually running it; state in your report which package's quickstart you ran and the result.

## Operating rules (override defaults)
No mocks/fake data/placeholders/TODOs/stubs. `$THREE` is the only coin — if any SDK README,
example, or fixture references another token, remove it. Stage explicit paths only (never
`git add -A`). Own the five SDK dirs (`avatar-sdk/`, `walk-sdk/`, `page-agent-sdk/`,
`tour-sdk/`, `agent-payments-sdk/`) and a new CI job; **extend the existing packages, don't
rewrite them** — type and document the shipping surface, don't redesign APIs. Keep examples
real (real three.ws endpoints, real keys via env). Do not change `scripts/publish-packages.mjs`
behavior; read it only to align versions/changelogs. Don't touch MCP dirs, `docs/`, or
top-level `examples/` (E2/E3/E4 own those).

## When finished
Run CLAUDE.md's five self-review checks (lazy / user / integration / edge-case / pride). Ship
one improvement beyond the checklist (e.g. a compat matrix, a `npm create`-able starter hook, an
OG-able example screenshot). Append a `data/changelog.json` entry (tag: `sdk`) — holder-readable,
e.g. "Production-ready SDK quickstarts: install to working integration in under 10 minutes."
Run `npm run build:pages` to validate it. Then delete this prompt file
(`prompts/production-campaign/E-ecosystem/E1-sdk-production-polish.md`) and report what you
shipped, which quickstart you ran to verify the 10-minute claim, and any seam E3/E4 need.

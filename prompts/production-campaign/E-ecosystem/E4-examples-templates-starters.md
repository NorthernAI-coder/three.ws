# E4 — Examples, Templates & Starters

You are a senior engineer + product thinker building **three.ws**. Read `CLAUDE.md`,
`STRUCTURE.md`, and `prompts/production-campaign/00b-the-bar.md` first. **Prerequisites:** E1
(the SDK quickstarts your examples import). Parallel-safe with E3.

## Why this matters for $1B
The shortest path from "interested" to "integrated" is a working example a developer can copy.
The ecosystem bar (`00b-the-bar.md` §6) is a 10-minute integration — examples and starters are
how a dev clears it without thinking. A `npx create`-style starter, an embeddable web component,
a `two-agents` demo that just runs: each is a template thousands of devs fork, every fork a node
in the network-effects graph (`00-README-orchestration.md` §4). Today the examples exist but
there are **no framework starters at all** (no React/Next/vanilla scaffold under `examples/`),
which is the most-requested on-ramp.

## Current state (read before you write)
`examples/` already holds: `embed-test.html`, `web-component.html`, `two-agents.html`,
`minimal.html`, `agent-presence.html`, `bare-avatar.html`, `one-line-demo.html`,
`three-concierge.html`, `widget-rpc.html`, `pump-fun-agent/`, `three-concierge/`, `skills/`,
`agenc-task-roundtrip/`, `metamask-agent-wallet/`, and `coach-leo/` (`SKILL.md`,
`instructions.md`, `manifest.json`). `multiplayer/` is a deployable demo (Dockerfile, fly.toml,
Cloud Run script). The web components ship from the SDKs: `<agent-3d>` (`avatar-sdk/src`),
`<page-agent>` (`page-agent-sdk/src/element.js` / `page-agent.js`), `<agent-presence>`
(referenced by `examples/agent-presence.html` — verify the registration source).

The gaps: not every example is verified runnable against current SDK builds; there is **no
framework starter** (React, Next, or vanilla scaffold) a dev can clone-and-run; the web-component
embed pages aren't a single coherent "embed in 3 lines" story; and `examples/README.md` may not
index everything with a one-line "what/how to run" each.

## Your mission
### 1. Make every existing example actually run
Open each file in `examples/` and run it against the **current** SDK builds and real three.ws
endpoints. Fix dead import paths, stale API shapes, and anything that throws in console. Each of
`embed-test`, `web-component`, `two-agents`, `minimal`, `agent-presence`, `bare-avatar`,
`one-line-demo` must load with zero console errors and produce a visible result. Verify
`coach-leo/` (`manifest.json` valid, instructions current) and that `multiplayer/` still
builds/starts per its README.

### 2. The three web-component embeds, perfected
Make `<agent-3d>`, `<page-agent>`, and `<agent-presence>` each have a canonical, copy-paste
3-line embed page that a dev can paste into any HTML and have working. Keep the registration
source in the SDKs (E1 owns that) — here you build the *embed examples* that import the published
script. Show real attributes/config, real avatar/agent IDs, all five states visible where
relevant (loading skeleton, empty, error, populated). These are the screenshots that get shared.

### 3. Framework starters (none exist — build them)
Create runnable starter templates under `examples/` (e.g. `examples/starters/react`,
`.../next`, `.../vanilla`). Each: a real, installable scaffold (`package.json`, README with
`npm i && npm run dev`) that renders a three.ws agent via the appropriate SDK subpath
(`@three-ws/avatar` React export for React/Next, the web component for vanilla). They must
actually start and render against real endpoints — these are the "10-minute integration" proof.
Wire env for any keys; never inline secrets.

### 4. A coherent example index
Rewrite `examples/README.md` as the front door: a table of every example + starter with one line
("what it shows" + "how to run"), grouped (web components / starters / full demos / agent skills).
Link each to the SDK it uses (E1's READMEs) and to the docs (E3). Every entry's run command
verified. Empty/edge note where a key is required.

### 5. Two-agents + multiplayer as the "wow" demos
Polish `two-agents.html` and `multiplayer/` into the flagship "this is what you can build" demos —
two agents conversing, presence in a shared space — against real backends. Make them
screenshot-worthy and linkable (an OG-able landing). These are what a skeptic sees to believe the
platform is real.

### 6. Wire examples into the platform
Examples shouldn't be an island: ensure the docs (E3) and any "Examples" nav surface link here,
and that each example links back to its SDK README and a "deploy this" path where one exists
(`multiplayer/` has deploy scripts). A dev should be able to go example → SDK → docs → deployed
without a dead end.

## Definition of done
Clears `00b-the-bar.md` §6 (copy-paste to working integration in 10 min) and §3 (every state
designed, screenshot test): every example runs with zero console errors; the three web components
have canonical 3-line embeds; React/Next/vanilla starters exist and start; `examples/README.md`
indexes everything with verified run commands. Inherits the **global definition of done** in
`00-README-orchestration.md` (no mocks, `$THREE`-only, tokens where UI, every state,
explicit-path staging, self-reviewed diff). Verify by running each example/starter; report which
you ran and any that need a key you couldn't source.

## Operating rules (override defaults)
No mocks/fake data/placeholders/TODOs/stubs — examples hit **real** three.ws endpoints with real
keys via env, never sample arrays or fake responses. `$THREE` is the only coin referenced in any
example, demo, or starter (runtime-supplied mints in the pump.fun example are the sole mechanical
exception per CLAUDE.md). Stage explicit paths only (never `git add -A`). Own `examples/`,
`examples/coach-leo/`, `multiplayer/`, and new `examples/starters/*`; **import the published SDKs,
don't fork or vendor their source** — if an example needs an SDK change, note it for E1, don't
edit SDK `src/` here. Don't touch SDK/MCP source or `docs/` (E1/E2/E3 own those).

## When finished
Run CLAUDE.md's five self-review checks. Ship one improvement (e.g. a one-click CodeSandbox/StackBlitz
link per starter, or an OG card for the two-agents demo). Append a `data/changelog.json` entry
(tag: `sdk` or `docs`) — holder-readable, e.g. "New starter templates (React, Next, vanilla) and
runnable examples — embed a live three.ws agent in three lines." Run `npm run build:pages` to
validate it. Then delete this prompt file
(`prompts/production-campaign/E-ecosystem/E4-examples-templates-starters.md`) and report what you
shipped, which examples/starters you ran, and any SDK seam E1 still needs to close.

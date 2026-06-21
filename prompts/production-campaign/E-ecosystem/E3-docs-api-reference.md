# E3 — Docs Site & API Reference

You are a senior engineer + product thinker building **three.ws**. Read `CLAUDE.md`,
`STRUCTURE.md`, and `prompts/production-campaign/00b-the-bar.md` first. **Prerequisites:** E1
(SDK surfaces) and E2 (MCP tool catalog) — you document what they finalize. You can start on
layout, search, and the endpoint inventory before they land.

## Why this matters for $1B
Docs are the product surface that converts a curious developer into an integrated one. The
ecosystem bar (`00b-the-bar.md` §6) is explicit: an outside dev reaches a working integration in
**10 minutes from the published docs alone, without reading our source.** Every quickstart that
runs, every endpoint that's documented, every link that resolves is a developer we keep. Docs are
also how LLM agents learn us: `llms.txt` / `llms-full.txt` are how Claude/Cursor ingest the
platform — and **both files are currently empty placeholders** (literally the strings "Placeholder
for llms.txt" / "Placeholder for llms-full.txt"). That is a hole in the network-effects pillar.

## Current state (read before you write)
- `docs/` is rich but uneven: `index.html` (has a real `#search-input` / `.sidebar-search` UI —
  verify it actually filters), `api-reference.md`, `quick-start.md`, `api/forge-x402.md`,
  `embedding.md`, `architecture.md`, `authentication.md`, and many topic pages.
- `docs/llms.txt` and `docs/llms-full.txt` are **0-line placeholders** — must be generated for
  real (curated index + full corpus, per the llms.txt convention).
- The public endpoints live in `api/` (100+ Vercel functions) and the SDK surfaces are finalized
  by E1; the MCP tool catalog by E2. `docs/API_AUDIT.md` and `docs/ALL.md` exist — read them to
  find the gaps rather than re-auditing from scratch.
- There is a real status surface to link (the campaign's Track A wires Sentry/Axiom + a status
  page); find the canonical status URL/page and link it, don't invent one.

The gap: not every public endpoint and SDK/MCP surface is in the reference, some quickstarts are
not verified runnable, `llms.txt`/`llms-full.txt` are empty, and search/status need to actually
work.

## Your mission
### 1. Complete the API reference — every public endpoint
Inventory the public `api/` endpoints (use `docs/API_AUDIT.md` + a grep of `api/` for exported
handlers; exclude internal `api/_lib`). For each public endpoint document: method, path, auth
(link `authentication.md`), request params/body, response shape, error codes, and a real
`curl`/fetch example. Fold into `docs/api-reference.md` (or `docs/api/`) with consistent
structure. Paid x402 endpoints document the 402 challenge + payment flow (extend the pattern in
`docs/api/forge-x402.md`).

### 2. Document every SDK and MCP surface (from E1/E2)
Pull the finalized SDK quickstarts (`@three-ws/avatar`, `/walk`, `/page-agent`, `/tour`,
`/agent-payments`) and the MCP tool catalog into the docs so they live in one navigable place —
import path, minimal usage, link to the package README. Keep names/imports **identical** to E1's
READMEs and E2's `server*.json` (single source of truth — if you find drift, fix the docs to
match the package, and flag it). Every MCP tool listed with its example call.

### 3. Quickstarts that actually run
Take `docs/quick-start.md` and every embedded quickstart and **run them**. The first developer
path must reach a visible result in under 10 minutes with copy-paste blocks — web-component embed,
SDK install, one API call. No pseudo-code, no dead import paths. Fix anything that doesn't run;
state which you executed.

### 4. Generate real `llms.txt` and `llms-full.txt`
Replace both placeholders. `llms.txt` = a curated, link-bearing index of the docs (the llms.txt
convention: title, summary, sectioned links to the canonical pages). `llms-full.txt` = the full
text corpus an agent can ingest. **Generate them from the docs tree with a script** (add e.g.
`scripts/build-llms-txt.mjs` + an `npm run build:llms` and wire it so it stays current — not a
one-time hand-write). Keep `$THREE` the only coin referenced anywhere in the corpus.

### 5. Working search + a live status link
Make `docs/index.html` search actually filter the doc set (client-side index over the page
corpus is fine; debounce input, keyboard-navigable results, empty state when no match — all five
states per `00b-the-bar.md` §3). Add a visible, working link to the platform **status page**
(the real one from Track A) in the docs chrome. No dead links anywhere — verify every internal
link resolves.

### 6. Polish the docs to the screenshot bar
The docs site itself is a primary surface: design tokens only (`public/tokens.css` /
`DESIGN-TOKENS.md`), responsive 320/768/1440, dark/light parity, code blocks with copy buttons,
loading/empty/error states for search, `prefers-reduced-motion` honored. It should be
screenshot-worthy — Stripe/Vercel docs are the bar.

## Definition of done
Clears `00b-the-bar.md` §6 (10-min integration from docs alone) and §3 (every state designed):
every public endpoint and SDK/MCP surface documented; quickstarts verified runnable; `llms.txt` +
`llms-full.txt` generated and non-empty; search works; a live status link resolves; zero dead
links. Inherits the **global definition of done** in `00-README-orchestration.md` (no mocks,
`$THREE`-only, tokens only, every state, explicit-path staging, self-reviewed diff). Verify by
running the quickstarts and exercising search in a browser; report which quickstarts you ran.

## Operating rules (override defaults)
No mocks/fake data/placeholders/TODOs/stubs — and that explicitly includes the `llms.txt`
placeholders, which must become real generated content. `$THREE` is the only coin in every doc
and the llms corpus. Stage explicit paths only (never `git add -A`). Own `docs/` (and a new
`scripts/build-llms-txt.mjs`); **extend the existing docs site, don't rebuild it** — reuse the
current `index.html` shell, nav, and tokens. Keep examples real (real endpoints, real keys via
env). Don't touch SDK/MCP source or `examples/` (E1/E2/E4 own those) — document them, link to
their READMEs.

## When finished
Run CLAUDE.md's five self-review checks. Ship one improvement (e.g. a "copy as curl" button, an
auto-generated endpoint index, or per-page "edit on GitHub" links). Append a `data/changelog.json`
entry (tag: `docs`) — holder-readable, e.g. "New docs: every API endpoint and SDK documented,
runnable quickstarts, and machine-readable llms.txt for agents." Run `npm run build:pages` to
validate it. Then delete this prompt file
(`prompts/production-campaign/E-ecosystem/E3-docs-api-reference.md`) and report what you shipped,
which quickstarts you ran, and any doc gap E4's examples should fill.

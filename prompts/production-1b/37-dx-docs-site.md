# 37 — Developer experience & docs site

> Part of the three.ws "Production → $1B" program. Run in a fresh chat. Read
> `/CLAUDE.md` first (its rules override everything) and `prompts/production-1b/00-README.md`
> for shared context.

## Why this matters for $1B

three.ws is a developer platform: SDKs, MCP servers, web components, and a paid
x402 API. Developers decide in the first five minutes whether to build on you, and
that decision is made on the docs. A quickstart that doesn't copy-paste-run, a stale
API reference, or `llms.txt` that contradicts the live endpoints loses every
integration before it starts. World-class docs are the cheapest, highest-leverage
acquisition channel a dev platform has.

## Mission

Make every doc accurate, every code example actually runnable, and the docs site
itself searchable, versioned, and self-consistent with the real API surface and the
machine-readable `llms.txt` / `llms-full.txt`.

## Map (trust but verify — files move)

- **Docs content** — [public/docs/](../../public/docs) (~40 `.md` files:
  `quick-start.md`, `api-reference.md`, `sdk.md`, `mcp.md`, `web-component.md`,
  `widget-api.md`, `embedding.md`, `authentication.md`, `examples.md`, …).
- **Tutorials** — [public/docs/tutorials/](../../public/docs/tutorials)
  (`getting-started.md`, `first-agent.md`, `embed-on-website.md`,
  `register-onchain.md`, `custom-skill.md`, `personal-ai-site.md`).
- **Walk docs (HTML)** — [public/docs/walk/](../../public/docs/walk)
  (`index.html`, `docs.js`, `getting-started.html`, `embed-sdk.html`, …).
- **Docs home + routing** — [docs/index.html](../../docs/index.html), routes in
  [vercel.json](../../vercel.json) (`/docs`, `/docs/walk`, `/docs/widgets` →
  [public/docs-widgets.html](../../public/docs-widgets.html)).
- **Machine-readable docs** — [public/llms.txt](../../public/llms.txt),
  [public/llms-full.txt](../../public/llms-full.txt) (regenerated from content;
  find the generator under [scripts/](../../scripts)).
- **API truth source** — handlers in [api/](../../api); web-component reference in
  [src/element.js](../../src/element.js) (the `<agent-3d>` element).
- **Embed snippet builders** — [src/share-panel-builders.js](../../src/share-panel-builders.js)
  (`buildIframeSnippet`, `buildWebComponentSnippet`) — docs snippets must match these.

## Do this

1. **Run every code example.** Open each doc and tutorial; copy each fenced code
   block and execute it (curl against the real API, `npm install` the SDK, mount the
   `<agent-3d>` element). Any block that errors, 404s, or references a renamed
   param/endpoint gets fixed against the live handler in `api/`.
2. **Reconcile the API reference** (`public/docs/api-reference.md`) with the actual
   handlers: every documented route, method, query param, and response shape must
   exist; remove documented-but-deleted endpoints; add shipped-but-undocumented ones.
3. **Fix the SDK / MCP quickstarts** (`sdk.md`, `mcp.md`, `quick-start.md`) so a cold
   developer goes from zero to a working call. Use the published package names and the
   free `forge_free` MCP lane for the zero-cost first call (no wallet/key required).
4. **Web-component / embed docs** (`web-component.md`, `widget-api.md`,
   `embedding.md`) must produce the exact snippet `share-panel-builders.js` emits —
   same tag, attributes, and origin. Test the snippet in a blank HTML file.
5. **Regenerate and validate `llms.txt` / `llms-full.txt`** with the existing
   generator script; confirm they list real, live page paths and the current API
   surface — no dangling routes.
6. **Docs search + navigation**: ensure the docs home is searchable (verify
   `public/docs/walk/docs.js` search works; if the main `/docs` index lacks search,
   add a client-side filter over the doc list). Every doc must be reachable from the
   index — no orphans.
7. **Versioning + freshness signal**: each doc shows a "last updated" / version marker
   sourced from real data (git date or front-matter), not a hardcoded string. Stale
   docs are worse than missing ones.
8. Run `npm run build:pages`, `npm run audit:pages`, and `npm run seo:meta`. Add a
   `data/changelog.json` entry (tag `docs`) for the doc refresh; rebuild pages.

## Must-not

- Do not ship a code example you have not run — no aspirational snippets.
- Do not document any endpoint, package, or coin that doesn't exist; the only coin is
  `$THREE`.
- Do not break working docs routes in `vercel.json`; verify each redirect resolves.
- Do not leave `llms.txt`/`llms-full.txt` contradicting the live docs after edits.
- No mocks, stubs, TODOs, or "coming soon" placeholders in published docs.

## Acceptance (all true before claiming done)

- [ ] Every fenced code block in `public/docs/**` and `public/docs/tutorials/**` runs
      against real APIs/SDKs with no errors.
- [ ] `api-reference.md` matches the handlers in `api/` (no phantom or missing routes).
- [ ] SDK + MCP quickstarts take a cold developer to a successful call; free lane works.
- [ ] Embed/web-component docs emit the same snippet as `share-panel-builders.js`,
      verified in a blank page.
- [ ] `llms.txt` and `llms-full.txt` regenerated and consistent with live docs/API.
- [ ] Docs are searchable, every doc is reachable from the index, freshness markers
      are real (not hardcoded).
- [ ] `npm run build:pages`, `audit:pages`, `seo:meta` clean; changelog entry added.

# 34 — Developer experience & docs site

> Part of **Production-Ready** (`prompts/production-ready/`). Read `00-README.md` and `/CLAUDE.md` first.

**Phase:** 4 — Growth
**Owns:** `docs/`, a public docs site, API reference, SDK guides, MCP setup guides, `examples/`, quickstarts.
**Depends on:** `23`, `24`. Pairs with `14`, `31`.

## Why this matters for $1B
three.ws is a platform other developers and agents build on. Documentation is the
product for them. World-class docs (Stripe/Vercel-grade) are a growth channel, a
moat, and a credibility signal that justifies a platform multiple.

## Mission
A polished, public developer hub: getting-started, SDK guides, full API + MCP
reference, runnable examples, and recipes — accurate, searchable, and maintained.

## Map
- `docs/` (internal + reference), `examples/` (`embed-test`, `web-component`,
  `two-agents`, `minimal`, etc.), `STRUCTURE.md`, per-package READMEs (prompt `24`),
  `page-agent-sdk/PUBLISHING.md`, `docs/3d-asset-pipeline.md`.

## Do this
1. **Docs site:** a public, branded, searchable docs site (own route or a vetted
   docs framework) with clear IA: Get Started, Guides, SDK Reference, API Reference,
   MCP, Recipes, Changelog. Themed to match the platform (prompt `13`).
2. **Quickstarts that run:** a "5-minute" quickstart per primary surface (embed an
   avatar, add the walk companion, call a paid MCP tool, make an x402 payment, mint
   an agent). Each is copy-paste and verified to work (prompt `24`).
3. **API reference:** generate/maintain reference for the public `api/` surface
   (endpoints, params, auth, errors, examples). Keep it in sync with the code (derive
   from the handlers where possible, not hand-typed drift).
4. **MCP setup:** clear setup for Claude Desktop/Code and other clients, the free
   `forge_free` quickstart as the wedge, and the paid-tool x402 flow (prompt `23`).
5. **Examples gallery:** `examples/` is curated, each runnable against live, linked
   from the docs. Add the missing common recipes.
6. **Consistency & accuracy:** every code sample is tested (a CI check that runs/lints
   doc snippets where feasible); no stale endpoints/flags (cross-check the codebase
   before publishing — verify referenced files/flags still exist).
7. **Discoverability:** docs are crawlable + in llms.txt (prompt `14`); searchable;
   linked from home (prompt `31`) and the footer.
8. **Feedback loop:** a "was this helpful / edit this page" path so docs improve.

## Must-not
- Do not publish a sample that doesn't run as written.
- Do not let docs drift from code — prefer generated/tested references.
- Do not reference any coin other than $THREE in docs/examples.

## Acceptance
- [ ] Public, branded, searchable docs site with clear IA, themed to the platform.
- [ ] Verified 5-minute quickstart per primary surface.
- [ ] API + MCP reference accurate and kept in sync with code.
- [ ] Curated `examples/` gallery, each runnable against live, linked from docs.
- [ ] Doc code samples tested in CI; no stale endpoints/flags.
- [ ] Docs crawlable + in llms.txt + linked from home/footer; feedback path present.

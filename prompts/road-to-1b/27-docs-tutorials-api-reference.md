# 27 — Docs, tutorials & API reference

> Part of **Road to $1B** (`prompts/road-to-1b/`). Read `00-README.md` and `/CLAUDE.md` first.

**Phase:** 5 — Developer platform
**Owns:** `docs/`, the Docs page, Tutorials, `blog/`, `content/`, API reference, SDK READMEs.
**Depends on:** 25, 26.  ·  **Parallel-safe with:** 28.

## Why this matters for $1B
Docs are the silent salesperson. Developers and power users judge platform maturity by
documentation quality. Complete, accurate, runnable docs convert evaluators into
builders — and builders into the ecosystem that justifies the valuation.

## Mission
Make docs, tutorials, and the API reference complete, accurate, runnable, and matched to
the shipped product — with no dead or stale pages.

## Map
- `docs/`, the Docs page (SDKs + API reference), Tutorials (step-by-step guides),
  `blog/`, `content/`; SEO injectors `scripts/inject-blog-seo.mjs`, `build:news`.

## Do this
1. Inventory every doc/tutorial/blog page; flag stale, broken, or stub content and fix
   it (ties prompt 03 for dead links).
2. Ensure the API reference covers the real endpoints with request/response examples
   that actually work; regenerate from source where a generator exists.
3. Every SDK has a quickstart that a developer can copy-paste and run (matches prompt 25).
4. Tutorials cover the core journeys: create an agent, forge a model, launch a coin,
   monetize a service (x402), embed an avatar — each end to end with real steps.
5. Add a "getting started in 5 minutes" path; verify every code sample runs.
6. Wire docs into search and the All-pages directory; fix code-block copy buttons.

## Must-not
- No "TODO: document this"; no sample that uses fake endpoints or mock keys.
- Do not let docs describe features that don't exist (or omit ones that do).

## Acceptance
- [ ] Every doc/tutorial accurate and runnable; API reference matches live endpoints.
- [ ] Core-journey tutorials verified end to end; no dead doc links.
- [ ] `npm run build` + `npm test` green; changelog `docs` entry.

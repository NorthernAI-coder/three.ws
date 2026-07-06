# 09 — Crypto API storefront: OpenAPI, docs page, discovery

Read `prompts/x402-catalog/00-CONTEXT.md` first and obey every rule in it. Work alone, finish
100%, never ask questions.

## Mission

Give the free crypto API a real storefront: a public `/crypto-api` page, OpenAPI coverage for
`/api/v1/x/*`, and docs — all **generated from the live registry** so they stay correct no
matter which provider prompts have or haven't run yet. This is what turns plumbing into a
product agents can discover.

## Context

- The provider registry (`api/v1/_providers.js`) exports `providerCatalog()` — machine-readable
  provider/endpoint/price/params data. The wider catalog is `api/v1/_catalog.js` (`API_META`).
  **Everything you build renders FROM these at runtime/build time** — never hand-enumerate
  endpoints, or this page is stale the day another prompt lands a provider.
- `api/openapi-json.js` already exists — read it fully; extend it to include every
  `/api/v1/x/{provider}/{endpoint}` path (parameters from each descriptor's `params`, the
  billing lanes as description text, `free` quota when the descriptor carries one).
- Pages: `data/pages.json` feeds sitemap/llms.txt/changelog; `npm run build:pages` validates.
  Find how existing marketing/docs pages are built (look at a recent page in `pages.json`, and
  how its HTML/JS lives under the repo root or `public/`) and match that pattern exactly.
- Frontend is vanilla JS + Vite. Design bar: Vercel/Stripe docs quality. Use existing design
  tokens/CSS variables — grep `public/` and `src/` for the token stylesheet other pages share.

## Tasks

1. **OpenAPI.** Extend `api/openapi-json.js` to render every aggregator endpoint from
   `providerCatalog()`. Verify the output parses (`curl | jq` on a local invocation or a unit
   test that imports the handler and validates JSON + a few known paths).
2. **`/crypto-api` page.** A public page that:
   - States the pitch in one line: one free API for crypto data — DEX pairs, prices, quotes,
     TVL, on-chain reads, name resolution — no key, no wallet, generous free tier, pay-per-call
     only above quota.
   - Renders the live provider/endpoint table by fetching `GET /api/v1/x` client-side
     (provider, endpoint, method, summary, free quota, x402 price). Loading state: skeleton
     rows. Error state: actionable message. Empty state: impossible by design but handle it.
   - Shows one copy-paste curl example (use `coingecko/price?ids=solana` — it exists today)
     with a copy button, hover/focus states, keyboard accessible.
   - Links to `/docs`, the OpenAPI JSON, and the x402 docs.
2b. Wire the page into site navigation wherever sibling developer pages are linked (find how
   existing pages appear in nav/footer and match).
3. **pages.json** entry (path, title, description, `added: 2026-07-06` or the date you run).
   Run `npm run build:pages` — must pass.
4. **Docs.** `docs/api-reference.md`: ensure the `/api/v1/x` section exists and explains the
   four billing lanes (free/BYOK/plan/x402) with one runnable curl. Keep it generated-friendly:
   describe the discovery endpoint rather than enumerating providers.
5. **README** at `api/v1/README.md`: what the unified API is, how the registry works, how to
   add a provider (descriptor contract), how billing lanes resolve. This is the doc the next
   contributor reads.
6. **Changelog** entry (`feature`): the three.ws crypto API has a home page and OpenAPI spec.
7. **Verify in a browser:** `npm run dev`, load `/crypto-api`, confirm the live table renders
   from the real endpoint, no console errors, responsive at 320/768/1440.
8. Commit (explicit paths) and push per 00-CONTEXT.

## Definition of done

`/crypto-api` renders the live registry with designed loading/error states, OpenAPI covers the
aggregator dynamically, README + docs + pages.json + changelog shipped, build:pages green,
browser-verified, committed, pushed.

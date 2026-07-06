# 18 — Storefront cleanup: delist demos, kill dead weight, rewrite every description

Read `prompts/x402-catalog/00-CONTEXT.md` first and obey every rule in it. Work alone, finish
100%, never ask questions.

## Mission

The x402scan listing currently mixes three real products with fourteen demos and wrappers,
and the junk destroys trust in the whole server. Delist the internal demos (they keep working
for their pages), remove the endpoints with no honest buyer, and rewrite every surviving
description so its FIRST sentence answers "what can I get here that I can't get anywhere
else?" — owner-reviewed strategy, approved 2026-07-06.

## Context

- Discovery mechanics: `api/_lib/x402/bazaar-helpers.js` — `declareHttpDiscovery({...})`
  produces the bazaar extension; a resource with `discoverable: false` keeps settling payments
  but stops being indexed by facilitators. Read the helper to confirm the exact flag shape
  before using it.
- The catalog audit: `npm run audit:x402-catalog` — run it before AND after; it must be green
  after. Tests referencing endpoint descriptions live under `tests/` (grep each endpoint slug)
  and must be updated in the same change.
- Decisions (made by the owner — execute, don't relitigate):
  - **Delist (discoverable: false), keep functioning:** `dance-tip` (drives /club),
    `three-intel` (drives the /play kiosk), `crypto-intel` (drives /agent-exchange). Their
    pages must keep working exactly as before — verify each page's flow still calls its
    endpoint successfully.
  - **Remove entirely:** `api/insights/revenue-vision` and `api/x402/tutor.js` — delete the
    routes, their tests, and every reference (grep the slugs across the repo: docs, catalogs,
    SKU lists like `api/x402-skus.js`, MCP declarations). If something internal genuinely
    consumes tutor (grep first), delist instead of delete and say so in your report.
  - **Delist the paid `pump-agent-audit`** (a free whale surface replaces it in another
    prompt; the paid "oracle" framing is dishonest) — delist, don't delete.
  - **De-decorate:** `symbol-availability` — remove the fake "bullish/bearish oracle signal"
    field from response + description; it's a collision checker, sell it as exactly that.
  - **Keep + rewrite descriptions:** `forge`, `vanity` (+`vanity-premium`,
    `vanity-verifiable` if listed), `pump-launch`, `mint-to-mesh` + `mint-to-mesh-batch`,
    `model-check`, `mcp` (`POST /api/mcp`), `onchain-identity-verify`, `agent-reputation`,
    `skill-marketplace`, `fact-check`, `symbol-availability`.
- Description rules: first sentence = the uniqueness claim, concrete and true. Then input →
  output, price, chain(s). ≤ ~600 chars where the schema allows. No emoji, no hype adjectives,
  no "oracle" unless it reports real derived data. `skill-marketplace` currently ships an
  EMPTY description — read `api/x402/skill-marketplace.js`, understand what it actually does,
  and write the real one. `agent-reputation`'s description must state plainly that it scores
  three.ws-registered agents (scoping honesty).

## Tasks

1. Inventory: list every resource currently declaring bazaar discovery (grep
   `declareHttpDiscovery` / `declareMcpDiscovery` under `api/`). Produce the before-table for
   your report.
2. Apply the delistings, removals, and de-decoration above. For each delisted page-driving
   endpoint, exercise its page flow (`npm run dev`, drive /club tip, /play kiosk, or the
   page's API call path — or its existing test) and confirm unchanged behavior.
3. Rewrite all keeper descriptions per the rules; update the corresponding
   `buildBazaarSchema` metadata and tags (≤5 tags, ≤32 chars each) so tags reflect reality
   (`3d`, `solana`, `x402`, `dev-tools`, …).
4. Update every test that asserted old descriptions/fields; delete tests of removed routes.
5. Run `npm run audit:x402-catalog` + targeted vitest for every touched test file until
   green. Grep the removed slugs repo-wide — zero dangling references (docs, SKUs, catalogs,
   `data/pages.json` if any page linked them).
6. **Docs:** update `docs/api-reference.md` to drop removed endpoints and reflect new
   descriptions. Changelog entry (`improvement`), holder-readable: the x402 catalog was
   curated — every listed resource is now a real product with an honest description.
7. Commit (explicit paths — this touches many files; review `git diff --staged` line by line)
   and push per 00-CONTEXT.

## Definition of done

Catalog shows only honest, uniquely-valuable listings; demo pages still work; removed slugs
have zero dangling references; audit + tests green; docs + changelog updated; committed,
pushed.

# 04 — No-mocks / no-placeholders sweep

> Part of **Road to $1B** (`prompts/road-to-1b/`). Read `00-README.md` and `/CLAUDE.md` first.

**Phase:** 0 — Foundation
**Owns:** `src/`, `api/`, `public/`, `pages/` — anywhere a placeholder, mock, stub, or fake-data path ships to production.
**Depends on:** none.

## Why this matters for $1B
`/CLAUDE.md` hard rules 1–6: no mocks, no fake data, no placeholders, no TODO
comments, no stub functions, no `throw new Error("not implemented")`, no
`setTimeout` fake-loading, no fallback sample arrays in production. There are ~400
files in `src/api/public/pages` matching placeholder/TODO/mock markers. Each is a
small lie that compounds.

## Mission
Find every production code path that fakes, stubs, or defers, and replace it with a
real implementation wired to real data/APIs — or delete it if it should not exist.

## Map
- Start from: `grep -rn "TODO\|FIXME\|not implemented\|coming soon\|placeholder\|sampleAgents\|mock\|setTimeout(.*loading\|stub" src api public pages` (filter out node_modules).
- Real APIs in use: Pump.fun feed, Solana RPC, OpenAI/Anthropic via worker proxies,
  x402 endpoints. Credentials live in `.env` / `vercel env`.

## Do this
1. Enumerate all matches. Triage each into: (a) production code that must be real,
   (b) legitimate test fixtures/mocks (those stay — they belong in `tests/`), (c)
   dead code to delete, (d) genuine config comments (keep).
2. For (a): implement the real thing. Wire to the real API/endpoint. If a credential
   is missing, locate it in `.env` / `vercel env`; if truly absent, implement the
   real integration and surface a clear, designed error/empty state when the
   dependency is unavailable — never a fake success.
3. Replace any `const sample... = [...]` fallback shipped to the client with a real
   fetch plus a designed empty state (see prompt `12`).
4. Replace `setTimeout` fake-loading / fake progress with real async indicators tied
   to actual request lifecycle.
5. Delete `// TODO`, `// implement later`, commented-out code, and stub functions —
   by implementing them, not by deleting the comment and leaving the gap.
6. Convert any `throw new Error("not implemented")` into a working implementation.
7. Re-run the grep until the only remaining matches are legitimate test fixtures and
   justified config comments. Document any intentional remaining marker.

## Must-not
- Do not move a mock from `src/` into `public/` to dodge the grep. Remove the fakery.
- Do not delete a feature's UI to avoid implementing its backend — implement it.
- Do not touch the legitimate `tests/` mocks (those are correct).

## Acceptance
- [ ] Grep for production placeholders/mocks/stubs/TODOs returns only test fixtures and justified config comments.
- [ ] Every former placeholder path now fetches/uses real data with designed loading/empty/error states.
- [ ] No `setTimeout` fake-loading remains in shipped code.
- [ ] No fallback sample arrays shipped to clients.
- [ ] `npm test` green; affected pages exercised in a real browser with real network calls.

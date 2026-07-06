# 07 — Free name resolution: ENS + SNS under `/api/v1/resolve`

Read `prompts/x402-catalog/00-CONTEXT.md` first and obey every rule in it. Work alone, finish
100%, never ask questions.

## Mission

three.ws already resolves ENS and SNS names (the `ens_sns_resolve` MCP tool and `api/sns.js`).
Expose that capability as one free versioned endpoint: `GET /api/v1/resolve?name=vitalik.eth`
or `?name=foo.sol` or reverse (`?address=…&chain=…`). Name resolution is a high-frequency agent
primitive and a perfect zero-friction entry point into the crypto API.

## Context

- Find the existing implementation first — do NOT reimplement resolution: grep for
  `ens_sns_resolve` (MCP tool registration lives under `api/_mcp3d/tools/` or in the MCP
  dispatch; the resolver logic it calls is the thing to reuse), and read `api/sns.js` +
  `api/sns-subdomain.js`. Whatever module those share is your backend.
- Native v1 route → lives at `api/v1/resolve.js`, registered in `api/v1/_catalog.js` (read its
  header for the entry contract). Match the handler style of `api/v1/sentiment.js`
  (`wrap`/`json`/`error` from `api/_lib/http.js`).
- Reverse ENS lookup needs an Ethereum RPC; reverse SNS needs Solana RPC — check what the
  existing resolver already supports and expose exactly that. If reverse lookup is NOT already
  implemented, add forward-only now and document it — do not half-build reverse resolution
  with a placeholder.

## Tasks

1. Locate and read the existing resolver(s). Write down (in your final report) which module you
   reused and what it supports.
2. Create `GET /api/v1/resolve`:
   - `?name=<x>.eth` → `{ name, chain: 'ethereum', address, source: 'ens' }`
   - `?name=<x>.sol` → `{ name, chain: 'solana', address, source: 'sns' }`
   - `?address=…` (+ optional `chain`) → reverse lookup IF the existing resolver supports it.
   - Unknown TLD → 400 with the list of supported suffixes. Unresolvable name → 404 with
     `{ error: 'not_found', name }` (a miss is not a 500).
3. Public, keyless, per-IP rate limit 30/min (reuse `api/_lib/rate-limit.js`), `cache-control`
   ~5 min on hits.
4. Register in `api/v1/_catalog.js` with a specific summary + params.
5. **Tests** in `tests/api/v1-resolve.test.js`: forward .eth and .sol against fixtures captured
   from real resolutions, unknown TLD 400, miss 404, rate limit, catalog entry present.
   Targeted vitest until green.
6. **Docs:** `docs/api-reference.md` entry with runnable curls. Changelog entry (`feature`).
7. Commit (explicit paths) and push per 00-CONTEXT.

## Definition of done

One clean resolve endpoint reusing the platform's existing resolver, honest 400/404 semantics,
tests green, catalog + docs + changelog updated, committed, pushed.

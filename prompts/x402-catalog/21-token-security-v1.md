# 21 — Token security check: free rug/risk signals under `/api/v1/token/security`

Read `prompts/x402-catalog/00-CONTEXT.md` first and obey every rule in it. Work alone, finish
100%, never ask questions.

## Mission

The one question every trading agent asks before touching a token: "is this a rug?" Ship a
free endpoint that answers it with on-chain facts — mint/freeze authority status, holder
concentration, liquidity depth, token age — composed into a risk report. Facts, not scores
pulled from thin air.

## Context

- Native v1 route → `api/v1/token/security.js`, registered in `api/v1/_catalog.js` (read its
  entry contract). Match the handler style of existing v1 routes (`wrap`/`json`/`error` from
  `api/_lib/http.js`).
- Data sources (all keyless or already-configured — compose, don't proxy):
  - Solana RPC (use the platform's existing RPC resolution — read `api/solana-rpc.js` and
    `api/_lib` for the env): `getAccountInfo` on the mint (jsonParsed) → `mintAuthority`,
    `freezeAuthority`, `supply`, `decimals`; `getTokenLargestAccounts` → concentration.
  - DexScreener (keyless; the repo already normalizes it in `api/_lib/token-market.js` —
    reuse) → liquidity USD, pair age, volume.
  - `api/_lib/token-market.js` also exports `buildTokenRisk` — read it first; if it already
    computes part of this, reuse it and extend rather than duplicating.
- Response contract (every field present; `null` when unresolvable, never omitted, never
  faked):
  `{ address, chain: 'solana', mint_authority: { revoked: bool|null, address: string|null },
     freeze_authority: { revoked, address }, supply, decimals,
     top_holders: { top1_pct, top5_pct, top10_pct, holders_sampled },
     liquidity: { usd, largest_pair, pair_created_at },
     flags: [ ...string ], ts }`
  where `flags` are factual, e.g. `mint_authority_active`, `freeze_authority_active`,
  `top1_holder_over_20pct`, `liquidity_under_10k`, `pair_younger_than_24h`. No composite
  "risk score", no bullish/bearish — agents weigh facts themselves.
- EVM (`0x…`) input: return 400 with a clear "solana only (for now)" message — do not
  half-build EVM support.
- Example mint everywhere: the $THREE CA `FeMbDoX7R1Psc4GEcvJdsbNbZA3bfztcyDCatJVJpump`.
  Never a real third-party mint in code, tests, or docs.

## Tasks

1. Read the context modules; curl the real RPC + DexScreener for the $THREE mint and record
   shapes.
2. Implement `GET /api/v1/token/security?address=<mint>` per the contract. Partial upstream
   failure degrades per-section to `null`s + a `sources` array naming what answered — the
   call succeeds if ANY section resolved; 503 only when everything failed.
3. Public, keyless, per-IP rate limit 20/min (reuse `api/_lib/rate-limit.js`),
   `cache-control` 60s.
4. Register in `api/v1/_catalog.js` — summary first sentence: "Rug-check any Solana token in
   one free call: authority status, holder concentration, liquidity depth — on-chain facts,
   no invented scores."
5. **Tests** in `tests/api/v1-token-security.test.js`: full report against captured
   real-shaped fixtures, each flag's trigger condition, partial-failure nulls + sources,
   EVM 400, unresolvable mint 404, rate limit, catalog entry present. Targeted vitest until
   green.
6. **Docs:** `docs/api-reference.md` entry with a runnable curl ($THREE mint). Changelog
   entry (`feature`): free token security checks — authorities, concentration, liquidity.
7. Commit (explicit paths) and push per 00-CONTEXT.

## Definition of done

One free call turns a mint into a factual security report with honest per-section
degradation, tests green, catalog + docs + changelog updated, committed, pushed.

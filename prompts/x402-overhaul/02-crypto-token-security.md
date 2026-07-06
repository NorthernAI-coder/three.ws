# 02 — Free Crypto Data API: Token Security / Rug Signals

Read `prompts/x402-overhaul/00-CONTEXT.md` first, then `/workspaces/three.ws/CLAUDE.md`.
Independent work order — completes fully on its own.

## Agent use-case (name it in the docs)
Before an agent buys or LPs into a token, it needs a fast "is this a honeypot / rug?" read:
mint & freeze authority, LP status, top-holder concentration flag, tax/transfer restrictions.
This is the single most-requested pre-trade check in crypto agent workflows — and a free,
honest version is a magnet.

## Build — `GET /api/crypto/security`
- New file `api/crypto/security.js`, free plain-handler pattern (00-CONTEXT).
- Input: `?address=<mint>&chain=<solana|base>`.
- Solana: read mint account via `_lib/solana/*` / `api/solana-rpc.js` — mint authority,
  freeze authority, supply, decimals; `_lib/token-metadata.js` / `solana-token-meta.js` for
  metadata mutability. Pull LP/liquidity from DexScreener. Concentration from prompt-03's
  data source if a key exists, else a coarse keyless flag.
- Output: `{ address, chain, checks: { mintAuthorityRevoked, freezeAuthorityRevoked,
  metadataMutable, lpBurnedOrLocked, liquidityUsd, topHolderPctFlag }, riskLevel:
  'low'|'medium'|'high'|'unknown', reasons[], ts, sources[] }`. `riskLevel` derived from the
  boolean checks with a documented, deterministic rule — NOT an LLM opinion.
- Be honest: unknowns are `unknown`/`null`, never guessed. Document the exact rule that maps
  checks → riskLevel in the docs.

## Catalog registration
Drop `api/_lib/crypto-catalog/security.js` (same entry shape as 00-CONTEXT / prompt 01).

## States
Invalid mint → 400. New token, no LP yet → 200 with `lpBurnedOrLocked:null`, riskLevel may be
`high`/`unknown` per rule. RPC down → 503 + retry hint. Never fabricate a "safe" verdict.

## Tests
Deterministic riskLevel rule (given checks → expected level); revoked vs live authority
parsing; keyless-only degradation. Fixtures use `$THREE` or synthetic mints.

## Definition of done
Inherit 00-CONTEXT DoD + gates. Plus:
- [ ] Live call on a real token captured in PROGRESS.md.
- [ ] `docs/crypto-api.md` section with the check list, the riskLevel rule, curl example, use-case.
- [ ] `data/changelog.json` (tags: `feature`,`security`) — "Free token safety / rug-signal API".

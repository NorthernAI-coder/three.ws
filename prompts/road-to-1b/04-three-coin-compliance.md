# 04 — $THREE-only compliance sweep

> Part of **Road to $1B** (`prompts/road-to-1b/`). Read `00-README.md` and `/CLAUDE.md` first.

**Phase:** 0 — Foundation & truth
**Owns:** the entire repo — code, comments, tests, fixtures, docs, copy, metadata.
**Depends on:** none.  ·  **Parallel-safe with:** 02, 03.

## Why this matters for $1B
Brand and legal integrity. The platform promotes exactly one coin — **$THREE**
(`FeMbDoX7R1Psc4GEcvJdsbNbZA3bfztcyDCatJVJpump`). CLAUDE.md treats any stray token
reference like a leaked secret. A diligence team will grep for exactly this.

## Mission
Ensure $THREE is the only coin referenced anywhere, while keeping the two legitimate
runtime-data exceptions intact.

## Map
- The two allowed exceptions (runtime-data only, keep them):
  1. Generic coin-agnostic plumbing where a mint is supplied at runtime by the user
     (the pump.fun launcher accepting an arbitrary mint as input).
  2. Platform launch directories rendering user-launched coins from our own records:
     the `/launches` feed, agent-profile launch history, `/api/pump/launches` over
     `pump_agent_mints`.

## Do this
1. Grep the whole tree for hardcoded mint addresses, token tickers, and coin names
   (base58 mint patterns, `$`-prefixed tickers, known-coin words).
2. Remove every non-$THREE reference from source, comments, copy, tests, fixtures,
   docs, metadata, and sample data — treat each like a leaked secret.
3. Verify the two exceptions still function and remain runtime-data-only — never a
   hardcoded specific non-$THREE mint in source or copy.
4. Confirm fixtures/tests use only the $THREE CA above or a clearly-synthetic
   placeholder (e.g. `THREEsynthetic1111…`) — no real third-party mainnet mints.
5. Add a CI grep guard (a `scripts/` check or a test) that fails the build if a
   non-$THREE mint/ticker is reintroduced outside the two exception paths.

## Must-not
- Do not remove the two legitimate runtime-data exceptions.
- Do not hardcode, market, or recommend any specific non-$THREE mint anywhere.

## Acceptance
- [ ] Tree grep shows no other coin in source, copy, tests, or docs.
- [ ] Both exceptions verified runtime-only and still working.
- [ ] CI guard rejects reintroduction; `npm test` green.

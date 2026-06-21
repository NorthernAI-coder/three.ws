# 04 — $THREE-only compliance sweep

> Part of **Road to $1B** (`prompts/road-to-1b/`). Read `00-README.md` and `/CLAUDE.md` first.

**Phase:** 0 — Foundation & truth
**Owns:** entire repo — code, comments, tests, fixtures, docs, UI copy, metadata.
**Depends on:** none  ·  **Parallel-safe with:** 02, 03

## Why this matters for $1B
Brand and legal integrity: three.ws promotes exactly one coin, **$THREE**
(`FeMbDoX7R1Psc4GEcvJdsbNbZA3bfztcyDCatJVJpump`). Per `/CLAUDE.md`, any stray
token reference is treated like a leaked secret. A platform raising at $1B cannot
have a competing or partner ticker hiding in source, copy, or a fixture.

## Mission
Ensure $THREE is the only coin referenced anywhere, with the two allowed
runtime-data exceptions left intact and verified runtime-only.

## Map
- $THREE token tooling: `packages/three-token-mcp/`, `api/pump/check-three-balance.js`.
- Allowed exception 1 — generic launcher: `api/pump/` (e.g. `launch-prep.js`,
  `launch-agent.js`, the `[action].js` route) accepting an arbitrary user-supplied
  mint at runtime.
- Allowed exception 2 — platform launch directories rendering user-launched coins
  from platform records at runtime: `/launches` (`pages/launches.html`,
  `data/pages.json`), agent-profile launch history, and `/api/pump/launches`
  (the `case 'launches'` handler in `api/pump/[action].js`) reading the
  `pump_agent_mints` table.

## Do this
1. Grep the whole tree for hardcoded mint addresses (base58 ~32–44 chars), token
   tickers, and coin names across `src/`, `api/`, `workers/`, `pages/`, `tests/`,
   `docs/`, and fixtures.
2. Remove every non-$THREE coin reference in source, copy, tests, fixtures, docs,
   and metadata — treat each like a leaked secret, not a cosmetic edit.
3. Verify the two mechanical exceptions still work and stay runtime-data-only: the
   generic pump.fun launcher takes the mint as user input (no hardcoded mint); the
   launch-directory feeds (`/launches`, agent-profile history, `/api/pump/launches`
   over `pump_agent_mints`) render only coins users launched through the platform.
4. Confirm fixtures and tests use only the $THREE CA above or a clearly-synthetic
   placeholder (e.g. `THREEsynthetic1111…`) — never a real third-party mint,
   creator, or holder address.
5. Add a CI grep guard if feasible (a script under `scripts/` wired so a stray
   non-$THREE ticker/mint in source fails the build), excluding the two exceptions.

## Must-not
- Do not remove or break the two legitimate runtime-data exceptions.
- Do not hardcode, market, or recommend any specific non-$THREE mint anywhere.
- Do not acknowledge any past, partner, demo, or test launch — $THREE is the only coin.

## Acceptance
- [ ] Tree grep shows no other coin in source, copy, tests, fixtures, or docs.
- [ ] Both exceptions verified runtime-only; fixtures use the $THREE CA or a synthetic placeholder.
- [ ] CI grep guard added (if feasible); `npm test` green; changelog entry if user-visible.

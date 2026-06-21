# 06 — $THREE coin-compliance sweep

**Phase 1. Serial** after [05](05-dead-path-and-handler-audit.md). Highest
sensitivity — treat any violation like a leaked secret.

## Where you are

`/workspaces/three.ws` — three.ws, 3D AI-agent platform. Read the **"The only
coin — $THREE"** section of [CLAUDE.md](../../CLAUDE.md) in full before starting;
it governs this entire task.

## The rule

**The only coin this platform may ever reference is `$THREE`. Contract address:
`FeMbDoX7R1Psc4GEcvJdsbNbZA3bfztcyDCatJVJpump`. There are no other coins.** This
includes any other coin three.ws itself may have launched. Never mention, name,
hardcode, link, import, render, recommend, or talk about any other coin — in
code, comments, tests, fixtures, sample data, docs, blog, UI copy, metadata, or
commit messages.

Two **runtime-data-only** mechanical exceptions exist (do NOT remove these):
1. Coin-agnostic plumbing where a mint is supplied at runtime by the user (e.g.
   the pump.fun launcher accepting an arbitrary mint).
2. Platform launch directories rendering coins users launched through three.ws
   from real launch records at runtime (`/launches`, agent-profile launch
   history, `/api/pump/launches` over `pump_agent_mints`).
In both, never hardcode/market/recommend a specific non-`$THREE` mint.

## Objective

Guarantee the entire repository — code, copy, fixtures, docs, metadata — promotes
exactly one coin: $THREE. Any hardcoded foreign mint, ticker, or coin reference
is removed (treated like a leaked secret), except the two runtime-data-only
exceptions above.

## Instructions

1. **Sweep for foreign coin references.** Search broadly across all text, not
   just JS:
   ```bash
   # Hardcoded Solana-style mint addresses (base58, 32-44 chars) that are NOT $THREE
   grep -rEIn "[1-9A-HJ-NP-Za-km-z]{32,44}" --include=*.js --include=*.json --include=*.md --include=*.html . | grep -v node_modules | grep -v "FeMbDoX7R1Psc4GEcvJdsbNbZA3bfztcyDCatJVJpump"
   # Known foreign tickers / coin words used as promotion (review hits by hand)
   grep -rIn "\$[A-Z]\{2,6\}\b" --include=*.js --include=*.md --include=*.html public/ src/ pages/ docs/ blog/ content/ | grep -v "\$THREE" | grep -v node_modules
   ```
   Most base58 hits will be legitimate (program IDs, USDC mint for x402 rails,
   ATAs, pubkeys, synthetic placeholders). **Review every hit by hand** and
   classify: legitimate infra address (keep), runtime-exception data (keep),
   synthetic placeholder (keep), or **foreign coin promotion (remove)**.
2. **USDC is allowed** only as a payment rail / quote mint (x402, pump.fun USDC
   pairing) — it is plumbing, not a promoted coin. Confirm each USDC reference is
   rail/quote usage, never "buy USDC the investment."
3. **For each violation:** remove the reference and replace with `$THREE` (CA
   above) or a clearly-synthetic placeholder where a token value is structurally
   required. Scrub fixtures and tests too.
4. **Check non-code surfaces:** `data/changelog.json`, `public/*.json`, blog
   posts, docs, OG/meta tags, page `<title>`/descriptions, structured data,
   sample agent cards.
5. **Protect the exceptions:** verify you did NOT break the `/launches` feed,
   agent-profile launch history, `/api/pump/launches`, or the pump.fun launcher's
   runtime mint input. These render user-launched coins from real records — they
   are product features, not endorsements.
6. **Add a guard test** under `tests/` that greps the source tree for hardcoded
   non-`$THREE` mints outside an allowlist (infra addresses + synthetic
   placeholders) and fails CI on a new one — so this can never regress.

## Definition of done

- [ ] Every foreign-coin reference in code/copy/fixtures/docs/metadata removed or
      replaced; each base58/ticker hit reviewed and classified in your report.
- [ ] No hardcoded non-`$THREE` mint promoted anywhere; USDC only as a rail.
- [ ] The two runtime-data-only exceptions still work (verified): `/launches`,
      profile launch history, `/api/pump/launches`, launcher mint input.
- [ ] A regression guard test exists under `tests/` and passes in CI.
- [ ] `npm test` passes.
- [ ] Commit message stays neutral — do NOT restate any removed coin name in the
      message (CLAUDE.md revert/redeploy rule). Changelog: skip (compliance is
      not a user-facing feature; never name a removed coin in the changelog).

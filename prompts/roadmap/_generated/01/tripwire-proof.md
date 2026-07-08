# Golden-snapshot tripwire proof — package tool + `title` field (2026-07-08 pass B)

Proves `audit:mcp-golden` catches a public-contract change on a **published
package tool** and on the **`title`** field — the two things pass B added.
(The 2026-07-04 proof for a *hosted* tool rename is in `tripwire-proof.txt`.)

## Procedure

Target: `packages/three-token-mcp/src/tools/three-price.js`, tool `three_price`.

```
1. Clean tree → audit green:
   $ node scripts/audit-mcp-golden.mjs
   [audit:mcp-golden] 223 hosted MCP tool contracts match the golden fixture

2. Mutate the tool title:
   title: 'Live $THREE price (Jupiter) + USD→$THREE quote'
   →  title: 'MUTATED TITLE (tripwire test)'

3. Audit re-run → FAILS with exact diagnosis (exit 1):
   [audit:mcp-golden] packages/three-token-mcp/src/tools/three-price.js: three_price.title changed (was "Return the live USD price of $THREE (Jupiter primary, Birdeye fallback).")
   [audit:mcp-golden] 1 contract change(s) vs golden fixture.

4. Revert (git checkout -- <file>) → audit green again:
   [audit:mcp-golden] 223 hosted MCP tool contracts match the golden fixture
```

## Result

- The change was to a `packages/*-mcp` tool — a surface that had **no** golden
  protection before pass B. It is now caught. ✅
- The changed field was `title` — previously neither snapshotted nor compared.
  It is now caught. ✅
- Diagnosis names the exact file, tool, and field. Reverting restores green with
  no fixture edit needed (proving the fixture and live source agree on a clean tree).

Regenerate the fixture only for an *intentional* contract change:
`node scripts/audit-mcp-golden.mjs --update`.

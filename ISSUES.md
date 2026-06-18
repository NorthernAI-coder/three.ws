# Production Issues — three.ws

Live tracker for known production issues. When an item is fixed, move it to
the archive instead of leaving it here marked ✅ — this file should only
contain work that is still open.

> Archive of the 2026-05 incident batch (20 items, all resolved):
> [docs/internal/ISSUES-ARCHIVE-2026-05.md](docs/internal/ISSUES-ARCHIVE-2026-05.md)

---

## Open

### 1. `character-studio/` — pre-existing lint debt (added 2026-06-11)

**Context:** The eslint 8→10 upgrade migrated character-studio to flat config
(`character-studio/eslint.config.mjs`). Lint surfaces pre-existing findings
across the vendored CharacterStudio fork (118 `no-unused-vars`,
17 `no-async-promise-executor`, plus smaller buckets). These all predate the
upgrade.

**Runtime `no-undef` bugs — FIXED 2026-06-18** (see
[docs/internal/AUDIT-2026-06-18.md](docs/internal/AUDIT-2026-06-18.md)). Six
bare-identifier references that threw `ReferenceError` the moment their code
path ran are now corrected:
`manifestDataManager.js:67,70` (`testWallet` → `isNFTLocked()`),
`mint-utils.js:292` (`ethereum` → `'ethereum'`),
`vrmManager.js` (`addChildAtFirst` now imported from `./utils`),
`walletCollections.js:58` (`network` → `chainName`),
`CharacterManifestData.js:877` (`getTraitByIndex` now takes `index`).
The `connection` and `download-utils` `optimized` candidates were verified as
false positives (locally declared / object property keys).

**Status:** ⏳ **OPEN** — only the cosmetic burndown remains: clear
`no-unused-vars` and `no-async-promise-executor` mechanically, file by file.
No known runtime bugs remain in the fork.

# Production Issues — three.ws

Live tracker for known production issues. When an item is fixed, move it to
the archive instead of leaving it here marked ✅ — this file should only
contain work that is still open.

> Archive of the 2026-05 incident batch (20 items, all resolved):
> [docs/internal/ISSUES-ARCHIVE-2026-05.md](docs/internal/ISSUES-ARCHIVE-2026-05.md)

---

## Open

### 1. `character-studio/` — 192 pre-existing lint findings (added 2026-06-11)

**Context:** The eslint 8→10 upgrade migrated character-studio to flat config
(`character-studio/eslint.config.mjs`). Lint now runs correctly under eslint 10
and surfaces 192 pre-existing findings across 48 files in the vendored
CharacterStudio fork (118 `no-unused-vars`, 16 `no-undef`,
17 `no-async-promise-executor`, plus smaller buckets). These all predate the
upgrade — the previous `.eslintrc.json` + eslint 8 setup reported the same core
findings, so `npm run lint:js` was already red.

**Real-bug candidates among the `no-undef` hits** (each references an
identifier that doesn't exist in scope, so the code path throws at runtime):
`src/library/manifestDataManager.js` (`testWallet`, `identifier`,
`traitOption`, `traitType`), `src/library/mint-utils.js` (`connection`,
`ethereum`), `src/library/vrmManager.js` (`addChildAtFirst`),
`src/library/walletCollections.js` (`network`),
`src/library/download-utils.js` (`optimized`),
`src/library/CharacterManifestData.js` (`index`). The `anifest` typos in
`src/pages/Wallet.jsx` were fixed in the upgrade commit.

**Status:** ⏳ **OPEN** — fix the `no-undef` bugs path-by-path with the
surrounding feature exercised in a browser; then burn down `no-unused-vars`
mechanically.

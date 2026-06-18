# three.ws — Platform Audit (2026-06-18)

A full-surface audit of the three.ws monorepo: build/test/lint health, API, frontend,
SDKs, MCP servers, and documentation. Findings are split into **verified** (reproduced
locally by the auditor) and **reported** (surfaced by surface-audit passes, listed for
follow-up). Each finding carries a severity:

- **BROKEN** — does not work / fails a check / ships something incorrect.
- **RISK** — works today but is fragile, leaks information, or violates a project rule.
- **IMPROVE** — quality/UX/consistency opportunity.

## How this audit was run

| Check | Result |
|---|---|
| `scripts/audit-page-index.mjs` | ✅ 103 routes, all documented |
| `scripts/audit-empty-handlers.mjs` | ✅ 872 API handlers export a body |
| `scripts/audit-mcp-manifests.mjs` | ✅ 14 MCP manifests consistent |
| `tsc -p jsconfig.json` (typecheck) | ✅ clean |
| `eslint .` | ❌ **1 error**, 5083 warnings |
| `vitest run` (full) | ❌ failures — most are timeout/contention artifacts; **2 are real & deterministic** |

### Test-suite reliability caveat (RISK)

The full `vitest run` reports many failures (`x402-discovery-parity`, `evm-eoa-grinder`,
`pump`, `launch-mark-enforcement`), but **every one of those passes when run in isolation**.
They fail only under the full parallel run because individual tests hit real RPC/network or
heavy crypto (scrypt) and exceed their timeouts under CPU/IO contention. Single-test
durations of 60–350s confirm this. The deterministic, reproducible-in-isolation failures
are only:

1. `tests/branding.test.js` (3 cases) — real brand-name leaks.
2. `tests/src/usdz-pipeline.test.js` (1 case) — real meshopt-decoder bug.

**Recommendation:** split the suite into a fast deterministic lane (`vitest run`) and a
slow network lane gated behind an env flag, so CI signal is trustworthy. Tracked in the
roadmap below.

---

## P0 — Verified, deterministic, fix now

### 1. ESLint parse error (BROKEN)
`scripts/wf-verify-tasks.mjs:51` — `'return' outside of function`. This is a persisted
one-off Workflow script (top-level `return` is valid in the Workflow runtime but not as a
standalone ESM module). It is referenced nowhere and violates the repo-hygiene rule against
throwaway scripts. **Fix:** delete it — clears the sole eslint *error*.

### 2. USDZ / half-body export breaks on meshopt-compressed GLBs (BROKEN)
`src/usdz-pipeline.js:40-46` — `_loadGlbBlob()` constructs a bare `GLTFLoader` with no
meshopt decoder. Any `EXT_meshopt_compression` GLB throws *"setMeshoptDecoder must be
called before loading compressed files"*. This breaks both `glbBlobToUsdzBlob` and
`glbBlobToHalfBodyBlob`, the latter used by the avatar export path in
`src/account.js:333`. The repo already memoizes `getMeshoptDecoder()` in
`src/viewer/internal.js` (used by `footer-bot.js`, `avatar-rig.js`, `avatar-thumb.js`).
**Fix:** register the meshopt (and DRACO/KTX2 where available) decoder before `parse()`.

### 3. Brand-name leaks in user-facing files (RISK — rule + test enforced)
`tests/branding.test.js` fails on three brands. Verified locations:
- `pages/ibm/x402-demo.html:620` — `body="https://three.ws/avatars/readyplayerme.glb"` (real user-facing leak; rename the asset path).
- `docs/3d-asset-pipeline.md:92,190` — "Avaturn"/"Ready Player Me" in prose.
- `docs/ALL.md` — **generated** by `scripts/combine-docs.mjs`; its hits mirror the source docs (`character-studio` fork comparison, 3d-asset-pipeline). Fixing/allowlisting the sources + regenerating clears it.

**Fix:** rebrand prose where it's marketing copy; for the legitimate Character-Studio-fork
technical comparison (a documented MIT fork per STRUCTURE.md) add justified entries to
`tests/branding-allowlist.json`; rename the RPM demo asset; regenerate `docs/ALL.md`.

### 4. `llms.txt` is empty (BROKEN)
Root `llms.txt` is 0 bytes. It is the standard discovery file for LLM consumers and should
describe the platform, key surfaces, and canonical links. **Fix:** generate real content.

---

## P1 — Verified, fix this pass

### 5. README pins stale CDN version (RISK)
`README.md:674,689,712,750,1197,2565` reference `/agent-3d/1.5.1/agent-3d.js` while
`package.json` is `1.5.2`. Copy-paste embed snippets ship an outdated bundle. **Fix:** bump
to `1.5.2`.

### 6. Modal accessibility gaps (RISK — a11y rule)
Icon-only modal close buttons lack `aria-label`, and several modal containers lack
`role="dialog"`/`aria-modal`. Verified in `pages/compose.html` (×, lines ~342/350; modals
#am/#hp ~189/199), `pages/go.html` (✕ ~992/1041/1078), `pages/marketplace.html`
(detail-view close buttons). **Fix:** add labels + dialog semantics.

### 7. API boundary hardening (RISK)
- `api/wallet/balances.js` error path echoes missing env-var names to the client — config disclosure. Return a generic message; log details server-side.
- `api/agent-economy/transact.js` accepts a recipient address from env without validation — validate before use.

### 8. SDK x402 dependency drift (RISK)
`mcp-server/package.json`, `packages/ibm-x402-mcp/package.json`, `mcp-bridge/package.json`
pin `@x402/extensions ^2.12.0` while siblings (`@x402/core|evm|svm|mcp`) are `^2.13.0`.
Align to a single minor to avoid resolver split-brain.

---

## P2 — Reported (follow-up roadmap)

- **agent-payments-sdk** ships no `.d.ts` (tsup DTS step); TS consumers get no types. (RISK)
- **EVM AgentPayments addresses** are zero placeholders across 6 chains in `agent-payments-sdk/src/evm/addresses.ts` — documented as pre-deployment, but exported in prod. (RISK)
- **PumpTradeClient** (`agent-payments-sdk/src/solana/PumpTradeClient.ts:539`) slices account buffers without length checks. (RISK)
- **`docs/*` RPC parse** helpers (`three-token-mcp`, forge/rig/mesh tools) do `res.json().catch(()=>({}))`, masking upstream errors. (IMPROVE)
- **README** references a missing demo `public/demos/gemini-jump.html`. (BROKEN-doc)
- **character-studio fork**: 192 pre-existing eslint findings incl. 16 `no-undef` runtime risks — tracked in `ISSUES.md`. Vendored fork; burn down path-by-path. (RISK)
- **`href="#"` anchors decorated by JS** across create-* pages — pre-populate hrefs so they work pre-hydration and right-click/open-in-new-tab. (IMPROVE)
- **Stray `console.warn`** in `src/create-review.js:700` production path. (IMPROVE)
- **Repo root clutter**: large media (`club.mp3`, `im-in-love-wit-a-stripper-fast.mp3`), `inspect.mjs` at root — move/ignore per hygiene rules. (IMPROVE)
- **Test suite reliability** — split fast/slow lanes (see caveat above). (RISK)

---

## What this audit changed in the same session

See `docs/audit/REMEDIATION-2026-06-18.md` for the running log of fixes applied.
</content>
</invoke>

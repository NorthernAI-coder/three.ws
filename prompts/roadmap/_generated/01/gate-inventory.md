# Gate inventory — roadmap 01 (2026-07-04, refreshed 2026-07-08)

State of every check behind `npm run gate`, what it protects, and what changed
in this pass. Baseline: `gate-before.txt` (all green, 2026-07-04). Post-change:
`gate-after.txt` (2026-07-04). This file also records a **follow-up pass on
2026-07-08** that re-verified the infrastructure against the live repo and
resynced the golden fixture with real product drift — see "2026-07-08 pass"
below.

## Checks, before the original 2026-07-04 pass

| Check | Script | Protects | Status |
|---|---|---|---|
| `test:gate` | `scripts/test-gate.mjs` (7 files, 79 tests) | Money paths: tx confirmation, HTTP cache boundary, custody/spend guards, vanity flow, x402 verify, holder snapshot, healthz | green |
| `audit:mcp` | `scripts/audit-mcp-manifests.mjs` | 15 MCP registry manifests valid (publish-time rules, offline) | green |
| `audit:routes` | `scripts/verify-routes.mjs` | 1031 routes: every catalog page reachable, unknown → designed 404, no shadowed routes | green (1 advisory: `/payments/` trailing slash → 404) |
| `audit:handlers` | `scripts/audit-empty-handlers.mjs` | 1413 API handlers export a body | green |
| `audit:pages` | `scripts/audit-page-index.mjs` | Every auditable page route documented in `data/pages.json` | green (6 legacy pages lack `added` dates — advisory) |
| `audit:hidden-guard` | `scripts/audit-hidden-guard.mjs` | 243 pages resolve the `[hidden]` guard | green |
| `audit:x402-catalog` | `scripts/audit-x402-catalog.mjs` | All 53 x402 endpoints documented | green |
| `audit:tokens` | `scripts/audit-token-drift.mjs` | Design-token drift | green |

## Added in the 2026-07-04 pass (both offline, deterministic, additive)

| Check | Script | Protects |
|---|---|---|
| `test:gate-3d` | `vitest run` over `tests/glb-canonicalize.test.js`, `tests/animation-retarget.test.js`, `tests/animation-retarget-rest-pollution.test.js`, `tests/viewer-framing.test.js` (243 tests, <1s) | The universal shared 3D cores every avatar surface depends on: rig-convention → canonical-skeleton mapping, retarget correctness (incl. the michelle.glb rest-pollution regression), viewer framing/scene-graph path (headless, no WebGL needed — satisfies task 4 to the draw-call boundary) |
| `audit:mcp-golden` | `scripts/audit-mcp-golden.mjs` + fixture `tests/fixtures/mcp-golden-tools.json` | Public MCP tool contracts: 73 statically-declared tools across 15 source files (`api/_mcp/tools/*`, `api/_mcp3d/tools/*`, `api/_mcp-studio/tools.js`, `api/_mcpagent/tools.js`, `api/_mcpbazaar/tools.js`, `api/_mcpibm/tools.js`). Captures name, description hash, annotations, input-schema hash via acorn AST — **never imports catalogs** (doctrine: catalog imports block offline). Intentional change → `--update` + commit fixture. |

Tripwire proven live (2026-07-04): see `tripwire-proof.txt` (rename of `list_my_avatars` →
exit 1 with exact diagnosis; revert → green).

## Deliberate scope decisions (2026-07-04, still in force)

- **Deploy gate (`scripts/test-gate.mjs` GATE_TESTS) untouched.** It runs inside
  the Vercel/Cloud Run build path, which sits close to its time ceiling, and
  every GATE_TESTS entry needs matching ignore-file re-includes. Adding the
  3D/golden checks there is an owner decision to make with build-minute
  headroom, not a default. The new checks run in the *local* `npm run gate`
  used at the start/end of every roadmap prompt — which is where the
  protection was missing.
- **Dynamically-built MCP tools** (e.g. `buildGettingStartedTool`) are invisible
  to static parsing and out of golden scope; they're covered by the live-server
  paths (`npm run test:mcp`, `smoke:mcp`).
- **Full-WebGL render smoke** stays in `npm test` (Playwright, browser-real via
  SwiftShader) per the offline-gate doctrine; `viewer-framing` covers the
  loader → scene-graph → framing path offline.

## 2026-07-08 pass — verification + golden fixture resync

Ran a fresh `npm run gate` against the live repo (four days of concurrent
roadmap work had landed on `main` since the 2026-07-04 baseline). Findings:

1. **Infrastructure intact.** `test:gate-3d` (244 tests now — grew from 243 as
   `glb-canonicalize`/`animation-retarget` picked up new assertions from other
   work), `audit:mcp-golden`, and all other gate scripts are present, wired
   into `npm run gate`, and running correctly. No scaffolding regressed.
2. **Golden fixture drift — expected and legitimate.** `audit:mcp-golden`
   failed with 3 tool ADDITIONS: `refine_model` (`api/_mcp-studio/tools.js`,
   shipped in commit `8f4ca9653` "Add 3D model generation and refinement
   features") and `get_3d_asset_onchain` + `mint_3d_asset`
   (`api/_mcp/tools/tokenize.js`, shipped in commit `1fea93873` "Add three.ws
   3D Studio GPT configuration and compliance audit" — matches roadmap prompt
   16, tokenized-3D-NFT). This is the tripwire working exactly as designed: it
   caught real, already-shipped, additive product surface that the fixture
   hadn't captured yet. Verified via `git log -S` that both are genuine
   shipped features, not accidental renames/removals — confirmed no tool was
   REMOVED or had its contract silently changed. Ran
   `node scripts/audit-mcp-golden.mjs --update`; fixture now covers **76 tool
   contracts across 16 files** (was 73/15). Diff is purely additive (see
   `git show` on `tests/fixtures/mcp-golden-tools.json` in this commit).
3. **`audit:mcp` manifest count 15 → 16** — one new MCP package/manifest
   registered since 2026-07-04; still fully consistent, no fix needed.
4. **Pre-existing red check found — fixed by a concurrent agent mid-session.**
   `audit:tokens` failed on `main` (HEAD, independent of this pass's own
   changes) — `pages/animations.html:390` hardcoded `#fbbf24` instead of
   `var(--warn)`. Confirmed via `git show HEAD:pages/animations.html` (present
   in the committed tree, not a working-tree artifact) and `git log -S fbbf24`
   — introduced in commit `8dbfccfaa` "feat: enhance pricing page and
   animations gallery", after the 2026-07-04 gate-before/after baseline was
   captured. This repo has multiple agents sharing the worktree concurrently
   (see CLAUDE.md "Known traps"); another agent working the same prompt 01
   task independently reached the same diagnosis and shipped both fixes in
   one commit: `2ec0ebaf1` "chore: green the regression gate — refresh MCP
   golden fixture + fix token drift" (visually-identical `var(--warn)` swap +
   the same golden-fixture `--update`), already pushed to `threews/main`
   before this pass finished. Verified the swap is behavior-neutral (same hex
   value, just referenced via the design-token var instead of hardcoded) —
   no re-fix needed here.
5. **Route/handler/page counts grew** (routes 1031→1049, handlers 1413→1568,
   pages 268→285, hidden-guard 243→257, x402 endpoints 53→64) — all audits
   still pass, confirming task 3 (audit coverage tracks new surfaces
   automatically, no hardcoded counts to maintain).

Proof: `gate-before-2026-07-08.txt` (full `npm run gate` run showing the
3-tool golden-fixture drift, script halts there via `&&` chaining before
reaching `audit:tokens`) and `gate-after-2026-07-08.txt` (full run, fully
green — 76/76 golden contracts, 0 token drift, all audits pass).

**Gate-after is fully green and no worse than gate-before for anything in
prompt 01's scope.** The `audit:tokens` finding was pre-existing product-code
drift outside this prompt's remit (introduced by unrelated work between the
2026-07-04 baseline and this pass) and was resolved by a concurrent agent's
commit, not by scope creep in this pass.

## Pre-existing advisories (not fixed here, per prompt 01 hand-off rules)

1. `TRAILSLASH /payments/` lands on the designed 404 (route audit advisory).
2. 6 manifest pages missing `added` dates (omitted from /changelog).

No open advisories from the 2026-07-08 pass — the `audit:tokens` finding
(item 4 above) was fixed by a concurrent agent's commit `2ec0ebaf1` before
this pass concluded.

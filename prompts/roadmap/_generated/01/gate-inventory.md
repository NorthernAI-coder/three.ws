# Gate inventory — roadmap 01 (2026-07-04)

State of every check behind `npm run gate`, what it protects, and what changed
in this pass. Baseline: `gate-before.txt` (all green). Post-change: `gate-after.txt`.

## Checks, before this pass

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

## Added in this pass (both offline, deterministic, additive)

| Check | Script | Protects |
|---|---|---|
| `test:gate-3d` | `vitest run` over `tests/glb-canonicalize.test.js`, `tests/animation-retarget.test.js`, `tests/animation-retarget-rest-pollution.test.js`, `tests/viewer-framing.test.js` (243 tests, <1s) | The universal shared 3D cores every avatar surface depends on: rig-convention → canonical-skeleton mapping, retarget correctness (incl. the michelle.glb rest-pollution regression), viewer framing/scene-graph path (headless, no WebGL needed — satisfies task 4 to the draw-call boundary) |
| `audit:mcp-golden` | `scripts/audit-mcp-golden.mjs` + fixture `tests/fixtures/mcp-golden-tools.json` | Public MCP tool contracts: 73 statically-declared tools across 15 source files (`api/_mcp/tools/*`, `api/_mcp3d/tools/*`, `api/_mcp-studio/tools.js`, `api/_mcpagent/tools.js`, `api/_mcpbazaar/tools.js`, `api/_mcpibm/tools.js`). Captures name, description hash, annotations, input-schema hash via acorn AST — **never imports catalogs** (doctrine: catalog imports block offline). Intentional change → `--update` + commit fixture. |

Tripwire proven live: see `tripwire-proof.txt` (rename of `list_my_avatars` →
exit 1 with exact diagnosis; revert → green).

## Deliberate scope decisions

- **Deploy gate (`scripts/test-gate.mjs` GATE_TESTS) untouched.** It runs inside
  the Vercel build, which sits at ~34 min against a 45-min ceiling, and every
  GATE_TESTS entry needs a matching `.vercelignore` re-include (a mismatch fails
  the deploy with a cryptic "No test files found"). Adding the 3D/golden checks
  there is an owner decision to make with build-minute headroom, not a default.
  The new checks run in the *local* `npm run gate` used at the start/end of
  every roadmap prompt — which is where the protection was missing.
- **Dynamically-built MCP tools** (e.g. `buildGettingStartedTool`) are invisible
  to static parsing and out of golden scope; they're covered by the live-server
  paths (`npm run test:mcp`, `smoke:mcp`).
- **Full-WebGL render smoke** stays in `npm test` (Playwright, browser-real via
  SwiftShader) per the offline-gate doctrine; `viewer-framing` covers the
  loader → scene-graph → framing path offline.

## Pre-existing advisories (not fixed here, per prompt 01 hand-off rules)

1. `TRAILSLASH /payments/` lands on the designed 404 (route audit advisory).
2. 6 manifest pages missing `added` dates (omitted from /changelog).

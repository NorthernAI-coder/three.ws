# E2 — MCP Servers Production

You are a senior engineer + product thinker building **three.ws**. Read `CLAUDE.md`,
`STRUCTURE.md`, and `prompts/production-campaign/00b-the-bar.md` first. **Prerequisites:** none
(runs parallel to E1).

## Why this matters for $1B
MCP is how every agent runtime — Claude, Cursor, and the long tail of agent frameworks — reaches
three.ws's capabilities (avatar forging, pump.fun launches, $THREE tools, x402 payments) without
human glue. An MCP server that registers cleanly, exposes documented tools, and passes a live
smoke test turns three.ws into infrastructure other agents *call*, which is the deepest form of
the network-effects pillar (`00-README-orchestration.md` §4): we become a dependency, not a
destination. A broken manifest or an undocumented tool means an agent silently can't use us.

## Current state (read before you write)
Eight MCP surfaces ship (names ↔ dirs per `STRUCTURE.md`):
- `mcp-server/` → `@three-ws/mcp-server` v1.2.0 — primary surface; has `server.json`. Paid tools
  (x402) per the MCP server instructions; `forge_free` is the one free tool.
- `mcp-bridge/` → `@three-ws/mcp-bridge` v1.0.0 — has `tests/` + `npm run test:smoke`.
- `packages/avatar-agent-mcp/` → `@three-ws/avatar-agent` v1.2.0 — avatar tools; has `test/`,
  `npm run inspect`.
- `packages/pumpfun-mcp/` → `@three-ws/pumpfun-mcp` — pump.fun launch tools.
- `packages/ibm-watsonx-mcp/` → `@three-ws/ibm-watsonx-mcp` — watsonx.ai.
- `packages/ibm-x402-mcp/` → `@three-ws/ibm-x402-mcp` — IBM x402; has `CATALOG.md`, `SUPPORT.md`.
- `packages/three-token-mcp/` → `@three-ws/three-token-mcp` — $THREE token tools.
- `packages/threews-avatar-mcp/` → `@three-ws/threews-avatar-mcp` — three.ws avatar ops; has `app/`.

The gate scripts already exist and are wired as root npm scripts:
`audit:mcp` → `scripts/audit-mcp-manifests.mjs`, `smoke:mcp` → `scripts/smoke-mcp-remotes.mjs`,
`test:mcp` → `scripts/test-mcp-all.mjs`. Root MCP manifests live at the repo root:
`server.json`, `server-3d.json`, `server-agent.json`, `server-bazaar.json`, `server-ibm.json`,
`server-pumpfun.json`. Publish flow: `scripts/publish-mcp-servers.mjs` (`npm run publish:mcp`).
**The gap: these gates are NOT enforced in `.github/workflows/ci.yml`** (grep confirms no CI job
runs them), per-tool docs are uneven, and not every `server*.json` is verified valid against the
audit. Read the three scripts before changing anything — extend, don't reimplement them.

## Your mission
### 1. Make `audit:mcp` green for every manifest
Run `node scripts/audit-mcp-manifests.mjs` and fix every failure it reports across all
`server*.json` (root) and each package's `server.json`. Manifests must be valid, complete, and
consistent with each package's actual tool surface (name, version, description, tool list). Fix
the manifests/packages — do not weaken the audit to pass.

### 2. Make `smoke:mcp` and `test:mcp` green
Run `node scripts/smoke-mcp-remotes.mjs` and `node scripts/test-mcp-all.mjs`. Every server must
start, register, and respond to a tools/list (and a representative tools/call where the script
exercises it) without throwing. Honor the paid-vs-free model: `forge_free` runs without payment;
paid tools must return a well-formed `PaymentRequired` structuredContent when no x402 payload is
present (per the MCP server instructions) — that is correct behavior, not a failure. Fix real
breakage; keep `mcp-bridge`'s existing `test:smoke` passing too.

### 3. Document every tool with example calls
Each MCP server's `README.md` lists every tool it exposes with: purpose, input schema (params +
types), an **example call** (the JSON arguments a client would send), and the shape of the
result. State price for paid tools and "free" for `forge_free`. Match `ibm-x402-mcp/CATALOG.md`
as the documentation bar; bring the thinner READMEs up to it. Tools must be discoverable from the
README without reading `src/`.

### 4. Enforce the gates in CI
Add a **new named job** to `.github/workflows/ci.yml` (e.g. `mcp-gates`) that runs `npm run
audit:mcp`, `npm run test:mcp`, and the smoke check appropriate for CI (`smoke:mcp` if it can run
hermetically; otherwise gate the live-network parts behind a secret/env guard and still run the
audit + test unconditionally) on every PR. Add a new named job — do not rewrite existing jobs
(E1 also edits this file; coordinate by job name). The gates must actually fail the build on a
bad manifest or a broken server.

### 5. Verify the publish path and version hygiene
Read `scripts/publish-mcp-servers.mjs`; confirm each package's `version` is semver-correct and
the manifest version matches `package.json`. Run `npm run publish:mcp:dry` mentally/where safe to
confirm no package is mis-staged. Do not actually publish.

### 6. Wire one cross-surface connection
The documented tool catalog you produce is consumed by E3 (docs API reference) and the AWS/Bazaar
listings. Ensure the tool names + descriptions in `server*.json`, each README, and any
`CATALOG.md` are **identical** so the docs site and discovery indexes render one consistent
catalog. Note any naming drift you reconciled for E3.

## Definition of done
Clears `00b-the-bar.md` §6: `audit:mcp` / `smoke:mcp` / `test:mcp` all pass **and are enforced
in CI**; every MCP server has a README documenting every tool with example calls; every
`server*.json` manifest is valid. Inherits the **global definition of done** in
`00-README-orchestration.md` (no mocks, `$THREE`-only, explicit-path staging, existing tests
pass, self-reviewed diff). In your report, paste the final pass output of the three gate scripts
and name the CI job you added.

## Operating rules (override defaults)
No mocks/fake data/placeholders/TODOs/stubs. `$THREE` is the only coin — `three-token-mcp` and
every other server reference only `$THREE` (CA `FeMbDoX7R1Psc4GEcvJdsbNbZA3bfztcyDCatJVJpump`);
runtime-supplied mints in pump.fun launch tooling are the sole mechanical exception (CLAUDE.md).
Stage explicit paths only (never `git add -A`). Own the MCP dirs (`mcp-server/`, `mcp-bridge/`,
`packages/*-mcp/`), the root `server*.json` manifests, and the audit/smoke/test MCP scripts;
**extend the existing servers and gate scripts, don't rewrite them.** Keep tools real (real RPC,
real x402, real model proxies via env). Do not actually publish. Don't touch SDK dirs, `docs/`,
or `examples/` (E1/E3/E4 own those).

## When finished
Run CLAUDE.md's five self-review checks. Ship one improvement (e.g. a generated tool-index that
the docs can import, or a manifest-consistency assertion added to `audit-mcp-manifests.mjs`).
Append a `data/changelog.json` entry (tag: `sdk` or `infra`) — holder-readable, e.g. "Every MCP
server now passes audit + smoke + test gates in CI, with every tool documented." Run `npm run
build:pages` to validate it. Then delete this prompt file
(`prompts/production-campaign/E-ecosystem/E2-mcp-servers-production.md`) and report the gate
output, the CI job name, and any tool-catalog seam E3 needs.

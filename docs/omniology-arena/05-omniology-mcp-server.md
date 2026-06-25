# Prompt 05 — `@three-ws/omniology-mcp` server

Build a real MCP server that exposes Omniology's contests as agent-callable
tools (`list_contests`, `get_contest`, `get_leaderboard`, `submit_entry`), with
`submit_entry` x402-priced in USDC. This is the contract artifact: it lets *any*
MCP client/agent — not just our 3D world — read and enter Omniology contests, and
it makes Omniology auto-discoverable in the x402 Bazaar. It wraps Omniology's
**real** HTTP API (CONTRACTS §1). No mocks.

## Read first (required)
- `docs/omniology-arena/README.md`, `docs/omniology-arena/CONTRACTS.md` (§1 external contract), `CLAUDE.md`
- `STRUCTURE.md` — the `packages/*-mcp` conventions and the published MCP list.
- A representative existing server to mirror exactly — read **all** of one, e.g.
  `packages/marketplace-mcp/` (its `package.json`, `server.json`, `src/index.js`).
  Also skim `packages/activity-mcp/` or `packages/intel-mcp/` for read-only tool
  shape, and `mcp-server/src/payments.js` + `mcp-server/src/tools/pose-seed.js`
  for the x402 `paid()` wrapper pattern (`@x402/mcp`, Solana USDC settlement).
- `mcp-bridge/src/bazaar-discover.js` — how a server gets discovered (so you set
  `server.json` / discovery metadata correctly).

## Build
1. **Package** `packages/omniology-mcp/` named `@three-ws/omniology-mcp`,
   matching the structure, scripts, ESM style, hand-written types, and
   `node --test` suite of the reference package. Add it to the npm workspaces in
   the root `package.json` and to the workspace list in `STRUCTURE.md`.
2. **Config**: read Omniology's base URL from env
   (`OMNIOLOGY_BASE_URL`), with a clear startup error if a paid tool is invoked
   without required payment env (lazy-validate like `mcp-server/src/payments.js`).
3. **Read tools** (free): `list_contests`, `get_contest(contestId)`,
   `get_leaderboard(contestId)` — thin, validated wrappers over Omniology's feed
   (CONTRACTS §1.1) with Zod input schemas, `zod-to-json-schema` output, and
   sanitized errors. Real `fetch` to the real API.
4. **Write tool** (x402-priced): `submit_entry(contestId, entry, agent?)` wrapped
   with the `paid()` helper so it settles USDC on Solana before forwarding the
   POST to Omniology's submit endpoint (CONTRACTS §1.2). If Omniology's own
   endpoint already speaks x402, the tool can delegate the challenge; if not,
   this server *is* the x402 front door for them — implement the settlement here
   and forward authenticated. Pricing read from a `pricing` module like the other
   servers.
5. **`server.json`** manifest (stdio transport) under `io.github.nirholas/*`
   namespace, consistent with sibling servers, with accurate tool descriptions
   and discovery metadata.
6. **Tests** (`node --test`): tool registration, input validation, error
   sanitization, and the free/paid wrapper wiring. Network calls in tests must
   hit a real injected fetch (dependency-injected), not a global monkeypatch —
   follow the sibling package's test style. No live-network dependency in CI.
7. **Docs**: a `README.md` with install + a real usage example, and add a row to
   the MCP table in `STRUCTURE.md`.

## Guardrails
- Only `$THREE` may be referenced as a coin. USDC is the payment asset — fine.
  No other token anywhere in code, tests, fixtures, or docs.
- Real APIs only. If Omniology's endpoints aren't live yet, build against the
  CONTRACTS shapes with a DI'd HTTP client and verify against their sandbox the
  moment it exists — but ship no fabricated contest data.

## Acceptance criteria
- `cd packages/omniology-mcp && node --test test/*.test.js` is green.
- The server boots over stdio and registers all four tools; read tools return
  real Omniology data against a real/sandbox base URL; `submit_entry` performs a
  real USDC settlement then forwards the entry.
- `server.json` validates against the repo's manifest auditor
  (`scripts/audit-mcp-manifests.mjs`).
- Added to workspaces + `STRUCTURE.md`. `npm test` at root still passes.
- Changelog: add an `sdk` entry to `data/changelog.json` (holder-readable) for
  the new MCP server, then `npm run build:pages`.

## Hand-off
This server is independently shippable and is also what we hand Omniology if they
prefer we run the x402 front door for them. It does not depend on prompts 01–04.

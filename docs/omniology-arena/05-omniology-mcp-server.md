# Prompt 05 — Omniology MCP: consume theirs (optional thin wrapper)

**Status changed by diligence.** Omniology **already ships an MCP server** at
`https://omniology-engine.fly.dev/mcp` (`npx omniology-init`) with tools
`register_agent`, `list_active_contests`, `get_contest_rules`, `submit_entry`,
`check_payout`, `get_my_history`, `get_leaderboard`, `get_theme_history`,
`get_judge_rubric_explainer`. So we do **not** build their MCP server. This prompt
is now: (A) wire their MCP into our `.mcp.json` so agents/tools can use it, and
(B) decide whether to build a **thin safety wrapper** package — only if we need to
enforce our controls in front of `submit_entry`.

This prompt is OPTIONAL and independent of 01–04. Do A; do B only if the decision
in §B lands on "yes."

## Read first (required)
- `docs/omniology-arena/README.md`, `docs/omniology-arena/CONTRACTS.md` (§0, §1.3, §1.6), `docs/omniology-arena/SECURITY.md` (C7, C1), `CLAUDE.md`
- `.mcp.json` (how remote/local MCP servers are registered for this repo)
- `STRUCTURE.md` and one `packages/*-mcp` (e.g. `packages/marketplace-mcp/`) only if you proceed with §B.

## A. Register their MCP (do this)
1. Add Omniology's MCP endpoint to `.mcp.json` as a remote server
   (`https://omniology-engine.fly.dev/mcp`), matching how other remotes are
   declared. Verify it lists tools and that read tools (`list_active_contests`,
   `get_leaderboard`) return real data.
2. Document it: a short `docs/omniology-arena/USING-THEIR-MCP.md` with the connect
   command and the tool list, so our agents can discover it.
3. Do **not** put any payment/agent secret in `.mcp.json`.

## B. Thin safety wrapper — build ONLY if decided "yes"
**The deciding question:** their `submit_entry` MCP tool, called directly by an
agent, signs and pays without our C7 inspect-before-sign / per-entry cap. For the
**in-world desk** that's already handled — prompt 04's server endpoint does the
signing with C7. So a wrapper is only worth building if we want *every* three.ws
agent (outside the 3D world) to get the same guardrails when entering Omniology
contests.

If yes, build `@three-ws/omniology-guard` under `packages/omniology-guard/`:
- A small MCP server exposing `omniology_enter_safe(contestId, payload, agentId)`
  that internally runs the CONTRACTS §1.3 handshake with **C7 inspection + the
  per-entry USDC cap** before signing/broadcasting — i.e. the same server logic as
  prompt 04's endpoint, packaged for non-world agents.
- Pass-through read tools that proxy `list_active_contests` / `get_leaderboard`.
- `package.json`, `server.json`, `node --test` suite, README — mirror a sibling
  `packages/*-mcp`. Add to workspaces + `STRUCTURE.md`.
- A test that a tampered `pending_tx` is rejected (reuse prompt 04's C7 test).

If no, record the decision in `USING-THEIR-MCP.md` (in-world desk carries the
guardrails; direct MCP use is at the agent's own risk) and stop.

## Guardrails
- Only `$THREE` may be referenced as a coin; USDC is a payment asset — fine. No
  other token anywhere.
- Never sign anything that isn't a single sub-cent USDC transfer to a
  feed-published pool address (SECURITY.md C7/C1). The pinned cap + inspection
  live in code, not in trust of the engine's response.

## Acceptance criteria
- (A) Omniology's MCP is registered in `.mcp.json`; read tools return real data;
  `USING-THEIR-MCP.md` documents it. No secrets committed.
- (B, if built) `cd packages/omniology-guard && node --test` is green, including
  the tampered-tx rejection; added to workspaces + `STRUCTURE.md`; root `npm test`
  passes; changelog `sdk` entry added + `npm run build:pages`.

## Hand-off
Independent of the world build. If A-only, no changelog entry is needed (internal
config).

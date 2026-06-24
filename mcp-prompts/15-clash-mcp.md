# Build `@three-ws/clash-mcp` — Coin Clash faction game over MCP

You are building a new MCP server for **three.ws** (read `CLAUDE.md` — its rules override defaults). This server exposes Coin Clash — the community faction-war game backed by real holdings + pump.fun data — so an agent can read game state, enlist, and rally a faction.

## Read first (in order)
1. `CLAUDE.md`
2. `mcp-prompts/_SHARED-CONVENTIONS.md` — follow the package pattern precisely (copy `packages/intel-mcp`).
3. `packages/intel-mcp/` (read-only template) **and** `packages/avatar-agent-mcp/` (auth/write reference).
4. **The real backend:** `api/clash/`. Read the handlers. Confirm the game-state shape, faction model, how enlist/rally work, the leaderboard, and how participation authenticates. Build against reality.

## What this server is
The game surface. Coin Clash runs faction warfare on real holdings + pump.fun data. This server lets an agent check the board and participate (enlist/rally) programmatically.

## Proposed tools (confirm/adjust against the real routes)
| Tool | R/W | Wraps | Returns |
|------|-----|-------|---------|
| `get_clash_state` | read | GET state | current battle state + factions |
| `get_clash_leaderboard` | read | GET leaderboard | faction/player rankings |
| `enlist_faction` | write (idempotent) | POST enlist | enlistment result |
| `rally_faction` | write | POST rally | rally result |

## Coin rule
Coin Clash references coins as **runtime game data** rendered from real platform records — allowed per CLAUDE.md. Never hardcode, market, or recommend any specific non-$THREE mint in code or copy.

## Auth / writes
Reads are public. `enlist`/`rally` are account-scoped writes — read how `api/clash` authenticates and mirror `packages/avatar-agent-mcp`. Add credentials as `server.json` env vars, required only for writes.

## Package identity
- npm `@three-ws/clash-mcp` · mcpName `io.github.nirholas/clash-mcp` · dir `packages/clash-mcp` · bin `clash-mcp`

## Done means
`_SHARED-CONVENTIONS.md` → Definition of done. Verify `get_clash_state` returns real game data via `npm run inspect`. Add a `data/changelog.json` entry (tags `sdk`,`feature`), run `npm run build:pages`. **Do not commit or push** unless asked.

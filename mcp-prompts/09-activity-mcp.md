# Build `@three-ws/activity-mcp` — trending, leaderboards, and the activity ticker over MCP

You are building a new MCP server for **three.ws** (read `CLAUDE.md` — its rules override defaults). This server gives an AI agent the platform's live discovery surface: trending agents and coins, the $THREE holder leaderboard, and the site-wide activity ticker.

## Read first (in order)
1. `CLAUDE.md`
2. `mcp-prompts/_SHARED-CONVENTIONS.md` — follow the package pattern precisely (copy `packages/intel-mcp`).
3. `packages/intel-mcp/` — the closest analog; this server is also fully **read-only**.
4. **The real backend:** `api/trending.js`, `api/leaderboard.js`, `api/feed.js`, `api/feed-stream.js`. Read each handler. Confirm shapes for trending agents (by chat activity), trending coins (by oracle conviction), $THREE holder rankings + tier info, and the activity feed events. Build against reality.

## What this server is
The "what's hot right now" surface. Trending agents/coins, the $THREE holder board with tiers, and the activity ticker (agent chats, trades, launches) are all live and public. This server makes them agent-queryable for discovery and situational awareness.

## Proposed tools (confirm/adjust against the real routes)
| Tool | R/W | Wraps | Returns |
|------|-----|-------|---------|
| `get_trending_agents` | read | `api/trending.js` | agents ranked by activity |
| `get_trending_coins` | read | `api/trending.js` | coins ranked by oracle conviction |
| `get_holder_leaderboard` | read | `api/leaderboard.js` | $THREE holder rankings |
| `get_tier_info` | read | `api/leaderboard.js` | holder tier thresholds/benefits |
| `get_feed_events` | read | `api/feed.js` | recent site-wide activity events |

## Coin rule
The holder leaderboard is for **$THREE** — the only coin. Trending-coins data is platform launch-directory data rendered from real launch records at runtime (allowed per CLAUDE.md); never hardcode, market, or recommend any specific non-$THREE mint in code or copy.

## Auth / writes
Fully **read-only**, public data. Every tool: `readOnlyHint:true`, `openWorldHint:true`, `idempotentHint:false`, no `destructiveHint`. No key/signer required (mirror intel-mcp's "no key" posture). Do **not** wrap `feed-stream` as a streaming tool unless the MCP shape supports it cleanly — a paginated `get_feed_events` is the right surface.

## Package identity
- npm `@three-ws/activity-mcp` · mcpName `io.github.nirholas/activity-mcp` · dir `packages/activity-mcp` · bin `activity-mcp`

## Done means
`_SHARED-CONVENTIONS.md` → Definition of done. Verify all tools return real live data via `npm run inspect`. Add a `data/changelog.json` entry (tags `sdk`,`feature`), run `npm run build:pages`. **Do not commit or push** unless asked.

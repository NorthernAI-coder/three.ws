# Build `@three-ws/signals-mcp` — trading-signal feeds + publisher leaderboard over MCP

You are building a new MCP server for **three.ws** (read `CLAUDE.md` — its rules override defaults). This server lets an AI agent discover trading-signal feeds, subscribe to them, read delivery history + performance, and rank signal publishers.

## Read first (in order)
1. `CLAUDE.md`
2. `mcp-prompts/_SHARED-CONVENTIONS.md` — follow the package pattern precisely (copy `packages/intel-mcp`).
3. `packages/intel-mcp/` (read-only template; it has `signal_feed` for reading *one* feed's accuracy — this server adds discovery + subscription + the publisher board, don't duplicate the single-feed read) **and** `packages/avatar-agent-mcp/` (auth/write reference).
4. **The real backend:** `api/signals/` (subscribe, feed, stream) and `api/mirror/` (publisher leaderboard). Read the handlers. Confirm feed list shape, per-signal pricing, delivery tracking, performance metrics, and the mirror leaderboard. Build against reality.

## What this server is
The signal-marketplace surface. `signal_subscriptions`, `signal_deliveries`, `signal_feeds` back a full subscribe-and-track system; `api/mirror` ranks publishers by realized performance. Reachable only via UI today.

## Proposed tools (confirm/adjust against the real routes)
| Tool | R/W | Wraps | Returns |
|------|-----|-------|---------|
| `list_signal_feeds` | read | GET feeds | feeds + pricing + performance summary |
| `get_signal_detail` | read | GET one | a feed's detail + recent deliveries |
| `subscribe_signal` | write (idempotent) | POST subscribe | subscription result |
| `get_delivery_history` | read | GET deliveries | delivery log with realized ROI |
| `get_feed_performance` | read | GET performance | accuracy/ROI metrics |
| `get_mirror_leaderboard` | read | `api/mirror` | publishers ranked by performance |

## Auth / writes
Discovery/leaderboard are public/read-only. `subscribe_signal` is account-scoped (and may settle payment) — read how `api/signals` authenticates and whether subscription costs money; if it does, state it in the description and mirror the platform's payment handling. Add credentials as `server.json` env vars, required only for the write tool.

## Package identity
- npm `@three-ws/signals-mcp` · mcpName `io.github.nirholas/signals-mcp` · dir `packages/signals-mcp` · bin `signals-mcp`

## Done means
`_SHARED-CONVENTIONS.md` → Definition of done. Verify reads return real feeds/leaderboard via `npm run inspect`. Add a `data/changelog.json` entry (tags `sdk`,`feature`), run `npm run build:pages`. **Do not commit or push** unless asked.

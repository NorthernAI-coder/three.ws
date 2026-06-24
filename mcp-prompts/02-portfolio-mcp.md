# Build `@three-ws/portfolio-mcp` — an agent's portfolio, PnL, and transfers over MCP

You are building a new MCP server for **three.ws** (read `CLAUDE.md` — its rules override defaults). This server gives an AI agent programmatic read/write access to its **own** trading state: positions, realized PnL, wallet balances, the public trade feed, and signed on-chain transfers.

## Read first (in order)
1. `CLAUDE.md`
2. `mcp-prompts/_SHARED-CONVENTIONS.md` — follow the package pattern precisely (copy `packages/intel-mcp`).
3. `packages/intel-mcp/` (read-only template) **and** `packages/avatar-agent-mcp/` (the reference for wallet/signer/transfer tools).
4. **The real backend:** `api/portfolio/` and `api/trades/`. Read every handler. Confirm shapes for portfolio summary/history, the trades feed (closed positions w/ PnL), balance snapshots (Helius/Alchemy), and the signed-transfer route. Build against the real behavior.

## What this server is
The "what do I hold and how am I doing" surface for autonomous agents. Read-only analytics (summary, history, feed, balances) plus one real write: initiating a signed transfer. Pairs with `autopilot-mcp` (config) and `provenance-mcp` (audit).

## Proposed tools (confirm/adjust against the real routes)
| Tool | R/W | Wraps | Returns |
|------|-----|-------|---------|
| `get_portfolio_summary` | read | portfolio summary | holdings, value, unrealized/realized PnL |
| `get_portfolio_history` | read | portfolio history | time-series snapshots |
| `get_trades_feed` | read | `api/trades/feed` | closed positions with PnL |
| `get_wallet_balances` | read | balances | per-token balances (live) |
| `send_transfer` | write (destructive) | signed transfer | tx signature + status |

## Auth / writes
Read tools may be public or key-scoped — check the route. `send_transfer` is **funds-moving**: `readOnlyHint:false`, `destructiveHint:true`, idempotent:false, and a description that states it broadcasts a real Solana transaction. Mirror how `packages/avatar-agent-mcp` handles the signer/key. Add the signer credential as a `server.json` env var (`isRequired` true for the transfer tool). $THREE is the only coin you may name; the transfer tool accepts an arbitrary mint **as runtime input** only — never hardcode a non-`$THREE` mint.

## Package identity
- npm `@three-ws/portfolio-mcp` · mcpName `io.github.nirholas/portfolio-mcp` · dir `packages/portfolio-mcp` · bin `portfolio-mcp`

## Done means
`_SHARED-CONVENTIONS.md` → Definition of done. Verify read tools return real data via `npm run inspect`. Add a `data/changelog.json` entry (tags `sdk`,`feature`), run `npm run build:pages`. **Do not commit or push** unless asked.

# Build `@three-ws/kol-mcp` — per-wallet KOL portfolio + trade analytics over MCP

You are building a new MCP server for **three.ws** (read `CLAUDE.md` — its rules override defaults). This server gives an AI agent deep per-wallet analytics on tracked KOL traders: portfolio P&L and trade history (Birdeye-backed).

## Read first (in order)
1. `CLAUDE.md`
2. `mcp-prompts/_SHARED-CONVENTIONS.md` — follow the package pattern precisely (copy `packages/intel-mcp`).
3. `packages/intel-mcp/` — **important:** it already owns the KOL *leaderboard* and *recent-trades-on-a-mint* surface (`kol_leaderboard`, `kol_trades`). This server is the complementary **per-wallet deep dive** (one KOL's full portfolio + P&L). Do **not** duplicate the leaderboard; scope this to wallet-level analytics.
4. **The real backend:** `api/kol/` (esp. `wallets`). Read the handler. Confirm the portfolio/P&L shape and trade-history shape (Birdeye proxy). Build against reality.

## What this server is
The "track one smart trader" surface. `api/kol/wallets` proxies Birdeye portfolio P&L for tracked KOL wallets. This server lets an agent pull a specific KOL's holdings, realized/unrealized P&L, and trade history for copy/analysis decisions.

## Proposed tools (confirm/adjust against the real routes)
| Tool | R/W | Wraps | Returns |
|------|-----|-------|---------|
| `get_wallet_portfolio` | read | GET `api/kol/wallets` | a KOL wallet's holdings + P&L |
| `get_wallet_trades` | read | GET trades | that wallet's trade history |

## Coin rule
Wallet/mint identifiers are **runtime input**. Never hardcode, market, or recommend any specific non-$THREE mint in code or copy. $THREE is the only coin the platform promotes.

## Auth / writes
Fully **read-only**. If `api/kol` requires a Birdeye/API key server-side, wire it via a `server.json` env var; otherwise no key. `readOnlyHint:true`, `openWorldHint:true`, `idempotentHint:false`.

## Package identity
- npm `@three-ws/kol-mcp` · mcpName `io.github.nirholas/kol-mcp` · dir `packages/kol-mcp` · bin `kol-mcp`

## Done means
`_SHARED-CONVENTIONS.md` → Definition of done. Verify both tools return real wallet analytics via `npm run inspect`. Add a `data/changelog.json` entry (tags `sdk`,`feature`), run `npm run build:pages`. **Do not commit or push** unless asked.

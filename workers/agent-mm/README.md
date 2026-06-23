# agent-mm — Launch Copilot market-maker engine

A long-lived worker that runs the autonomous, **rules-based, non-manipulative**
fair-launch market-maker behind the Launch Copilot. When a launcher attaches a
`market_maker_policies` row to a coin launched through three.ws, this worker:

- **Seeds** the configured initial buy once.
- **Defends the floor** — buys a bounded slice when the live price falls through
  `floor_price × (1 − floor_band%)`, within the dip-buy + daily budgets.
- **Recycles profit** — sells `recycle_pct` of managed inventory into a spike
  above `floor_price × (1 + take_profit_band%)`, locking realized SOL.
- **Rebalances** — trims back toward the inventory ceiling.
- **Manages graduation** — on the curve→AMM handoff it runs the policy's
  `graduation_action` exactly once: `provide_lp` (deposit inventory + paired SOL
  as real LP), `distribute` (liquidate inventory to SOL for the owner), or `hold`
  (keep inventory and continue two-sided on the AMM). No parked inventory.

## It adds no new way to move funds

Every buy/sell is routed through `executeAgentTrade` — the same
quote → **firewall** → **spend-guard** → custody-claim → **MEV-protected** sign →
confirm pipeline a manual trade uses. The worker only decides *when* and *how
much*, inside the policy's published limits. The kill switch halts it instantly,
and the owner can always withdraw the remaining inventory + SOL.

## Anti-manipulation (enforced in code, every action)

- **No wash-trading / round-trips** — no action, and never a side flip, inside
  `min_action_interval_seconds` (× 2 for a flip). Floor `30s`.
- **Can't dominate volume** — a single action is capped to `max_volume_pct` of
  *live* market volume (ceiling `33%`). If volume can't be measured, it won't act
  above a tiny conservative slice — it never paints a no-volume tape.
- **Bounded, non-reflexive sizing** — defend buys capped by budgets, wallet SOL,
  and the inventory ceiling; recycle sells by `recycle_pct` and the volume cap.

A policy that requests values outside these caps is **refused at create time**
(`api/_lib/market-maker.js → assertPolicySafe`), with a plain-language reason the
UI surfaces.

## Run

```bash
npm run worker:mm          # simulate (default, safe — real quotes, no spend)
npm run worker:mm:live     # live fills from agent wallets
```

### Environment

| Var | Default | Notes |
|---|---|---|
| `MM_NETWORK` | `mainnet` | `mainnet` \| `devnet` |
| `MM_MODE` | `simulate` | `live` requires `SOLANA_RPC_URL` or `HELIUS_API_KEY` |
| `MM_GLOBAL_KILL` | `0` | halt all actions (policies intact) |
| `MM_POLL_MS` | `15000` | re-evaluation cadence |
| `MM_CONCURRENCY` | `4` | agents evaluated in parallel per sweep |
| `MM_HEARTBEAT_MS` | `30000` | `bot_heartbeat` liveness (0 disables) |
| `MM_VOLUME_WINDOW_S` | `300` | window for the live-volume cap |

`DATABASE_URL` + `JWT_SECRET` are required (DB + wallet decryption).

Deploy on Cloud Run via the `Dockerfile` (background worker, no HTTP port).

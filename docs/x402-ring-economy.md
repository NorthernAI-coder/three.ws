# Closed-loop x402 ring economy

A self-contained agent-to-agent payment loop: **three.ws-controlled wallets pay
three.ws's own x402 endpoints in real USDC, settled by three.ws's own
facilitator.** No user funds, no external facilitator, no wallet outside the
platform. It exists to dogfood and load-test the agent economy end to end —
proving every paid endpoint settles real money, continuously — while costing only
Solana network fees, because the principal recirculates between wallets you
control.

> **This is internal/dogfooding volume, and it is labeled as such.** The report
> endpoint tags it `internal: true`, and the ring settlement endpoint is
> `discoverable: false` (never advertised on the public x402 bazaar /
> agentic.market catalog). Do **not** present self-cycled ring volume as organic
> third-party demand — that is the one thing this system is deliberately built
> *not* to do. The public organic-revenue feed is a separate surface
> ([/api/x402-revenue](../api/x402-revenue.js)).

## Burning the least SOL — two levers

On-chain settlement has a **hard floor**: every Solana transaction costs a base
fee, so there is no zero-SOL option. Two levers get you to the true minimum.

**Lever 1 — fewest transactions (the big one).** The fee is ~flat per tx,
independent of payment size, so cost scales with tx **count**. Make **fewer,
larger payments** via `X402_PRICE_RING_SETTLE`:

| $10,000 gross via | per-call | # txs | SOL burned* | fee cost |
|---|---|---|---|---|
| tiny micro-payments | $0.001 | 10,000,000 | ~50 SOL | **~$10,000** |
| moderate | $1.00 | 10,000 | ~0.05 SOL | **~$10** |
| large | $10.00 | 1,000 | ~0.005 SOL | **~$1** |
| very large | $100.00 | 100 | ~0.0005 SOL | **~$0.10** |

\* at the 1-signature self-pay floor of ~5,000 lamports/tx.

**Lever 2 — one signature, not two (`X402_RING_SELF_PAY=true`).** By default a
settlement is signed by the buyer *and* a sponsor fee payer = 2 signatures =
10,000 lamports base. In **self-pay** the payer pays its own fee = **1 signature =
5,000 lamports**, half the base fee, and the facilitator broadcasts without
co-signing (no sponsor key needed at all). The payer just holds a little SOL for
its own fees. This is the recommended mode; the `SPONSOR_SOL_FLOOR` guard then
watches the payer wallet.

Priority fee is already negligible (~5 µlamports) and ATA rent is one-time and
reclaimable. So the practical minimum is: **self-pay + the biggest per-call size
your float supports.** $100/call settles thousands of dollars of volume for a few
cents of SOL.

## Architecture

```
  ring payer wallet ──(1) pay USDC──▶ /api/x402/ring-settle  (recipient = treasury)
        ▲                                     │
        │                          (2) self-hosted facilitator
        │                          /api/x402-facilitator co-signs
        │                          with the sponsor + broadcasts
        │                                     │
        │                                     ▼
        │                               treasury (X402_PAY_TO_SOLANA)
        └────────(4) rebalancer sweeps treasury→payer──────┘
                     (ring-rebalance pipeline)
   sponsor (X402_FEE_PAYER_SOLANA) pays all SOL fees — one wallet to watch (3)
```

The three roles are all platform-controlled:

| Role | Receives / does | Public env | Secret env | Fund with |
|---|---|---|---|---|
| **payer** | pays the ring | (derived) | `X402_SEED_SOLANA_SECRET_BASE58` | USDC float (recirculates) |
| **treasury** | receives payments | `X402_PAY_TO_SOLANA` | `X402_TREASURY_SECRET_BASE58` | nothing (fills, gets swept back) |
| **sponsor** | pays SOL fees | `X402_FEE_PAYER_SOLANA` | `X402_FEE_PAYER_SECRET_BASE58` | SOL for fees only |

> In **self-pay** mode (`X402_RING_SELF_PAY=true`, recommended for lowest fees) the
> **payer** pays its own 1-signature fee — fund the payer with the fee SOL and the
> **sponsor** role becomes optional. Sponsor mode exists for buyers that hold no
> SOL and want gas sponsored (2 signatures, ~2× the base fee).

## Components

- **Self-hosted facilitator** — [api/x402-facilitator/[action].js](../api/x402-facilitator/[action].js),
  core in [api/_lib/x402/self-facilitator.js](../api/_lib/x402/self-facilitator.js).
  Drop-in `/verify` + `/settle` matching the x402 v2 facilitator contract.
  Validates the buyer-signed USDC transfer, co-signs with the sponsor key,
  broadcasts over our RPC, logs the exact SOL fee. Point
  `X402_FACILITATOR_URL_SOLANA` at `https://three.ws/api/x402-facilitator` and no
  third party ever touches settlement.
  - **Anti-drain gate.** The sponsor signs the whole transaction, so the
    facilitator refuses to co-sign anything that is not exactly `{compute-budget,
    optional ATA-create for OUR treasury, one USDC TransferChecked to an
    allowlisted payTo}`. No System instructions (no SOL transfer out), capped
    priority fee, recipient must be allowlisted. This blocks the "anyone drains
    the sponsor" attack **and** enforces "only our wallets settle here".
  - **SOL floor.** Below `X402_SPONSOR_SOL_FLOOR_LAMPORTS` (default 0.02 SOL) the
    facilitator refuses to settle, pausing the loop before it can drain your SOL.
- **Ring settlement endpoint** — [api/x402/ring-settle.js](../api/x402/ring-settle.js).
  Price-configurable (`X402_PRICE_RING_SETTLE`), internal (`discoverable:false`),
  returns a real economic-tick receipt.
- **Rebalancer** — [api/_lib/x402/pipelines/ring-rebalance.js](../api/_lib/x402/pipelines/ring-rebalance.js),
  registered in the autonomous loop. Sweeps treasury→payer so the float never
  drains. Recirculation, not spend — never consumes the daily spend cap.
- **Net-position report** — [api/x402-ring.js](../api/x402-ring.js). `GET
  /api/x402-ring?period=24h|7d|30d|all`. Gross volume, tx count, SOL burned (in
  SOL + USD), sweep totals, live balances, and the honest bottom line: real cost
  = fees only.
- **Volume engine** — the existing autonomous loop
  ([api/cron/x402-autonomous-loop.js](../api/cron/x402-autonomous-loop.js) →
  [volume-bootstrap-loop.js](../api/_lib/x402/pipelines/volume-bootstrap-loop.js))
  round-robins `VOLUME_ENDPOINTS`, which now includes `ring-settle`.
- **Setup script** — [scripts/x402-ring-setup.mjs](../scripts/x402-ring-setup.mjs).
  Generates the role wallets, writes secrets to a gitignored file, prints the env
  block. Never funds anything.

## Turning it on

```bash
# 1. Generate the wallets (no chain, no funding — just keys).
node scripts/x402-ring-setup.mjs

# 2. Apply the schema.
psql "$DATABASE_URL" -f api/_lib/migrations/2026-07-01-x402-ring-economy.sql

# 3. Set env (Vercel), from the printed block:
#    X402_SELF_FACILITATOR_ENABLED=true
#    X402_FACILITATOR_URL_SOLANA=https://three.ws/api/x402-facilitator
#    X402_EXTERNAL_ENABLED=false          # only OUR endpoints get paid
#    X402_CHARITY_AUDIT_BPS=0             # no charity split leaves the ring
#    X402_PRICE_RING_SETTLE=1000000       # $1.00/call
#    X402_AUTONOMOUS_DAILY_CAP_ATOMIC=…   # your daily volume target
#    X402_SPONSOR_SOL_FLOOR_LAMPORTS=20000000
#    + the payer / treasury / sponsor pub+secret pairs

# 4. Fund (manual, real money):
#    payer   → USDC float, e.g. $50 (recirculates)
#    sponsor → SOL for fees, e.g. 0.1 SOL (≈ thousands of settlements)
#    treasury→ nothing; it fills and gets swept back

# 5. Watch it.
curl https://three.ws/api/x402-ring?period=24h
```

Everything is **off by default**: without `X402_SELF_FACILITATOR_ENABLED=true` and
the sponsor secret, the facilitator returns `503` and nothing settles.

## Cost model

For a monthly gross target `V` at per-call size `p`:

- transactions ≈ `V / p`
- SOL fee ≈ `V / p × ~0.000005 SOL` (self-pay 1-sig floor; ~0.00001 in sponsor mode)
- one-time ATA rent ≈ 0.002 SOL per new wallet pair (reclaimable by closing ATAs)
- charity/facilitator leak = **$0** when `X402_CHARITY_AUDIT_BPS=0` and the
  self-hosted facilitator is used
- principal = recirculates; net USDC position stays ~flat (see `/api/x402-ring`)

Example: $10k/mo at $1/call ≈ 10k txs ≈ 0.05 SOL ≈ ~$10 real cost. At $100/call it
is ~$0.10.

## Related

- [STRUCTURE.md](../STRUCTURE.md) — surface map
- [/api/x402-revenue](../api/x402-revenue.js) — the **public** organic-revenue
  feed (self-cycled ring volume is excluded from the "organic" framing here)
- [docs/x402-revenue.md](./x402-revenue.md) — revenue surface docs

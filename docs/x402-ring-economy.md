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

### Provisioning, verification & monitoring

Every ring wallet is provisioned once, registered in `x402_ring_wallets`, and
then kept in a verified, watched, auto-fundable state:

- **Verify** — [scripts/x402-ring-verify.mjs](../scripts/x402-ring-verify.mjs)
  resolves each role from env, checks the secret decodes to its declared pubkey
  (treasury secret ↔ `X402_PAY_TO_SOLANA`, sponsor secret ↔
  `X402_FEE_PAYER_SOLANA`), confirms `x402_ring_wallets` holds exactly one enabled
  row per role, checks the treasury is inside the facilitator's `payToAllowlist()`,
  prints a 3-row table with live SOL/USDC, and exits non-zero on any mismatch. It
  never prints a secret. `--fix` reconciles the DB registry to env (upsert the env
  pubkey, disable stray rows); `--json` emits machine-readable output.
- **Balance monitor** — [api/_lib/x402/wallet-balance-monitor.js](../api/_lib/x402/wallet-balance-monitor.js)
  (`checkRingWallets`, run every 10 min by the autonomous loop) reads all three
  wallets on-chain and alerts via `sendOpsAlert` on a role-floor breach:

  | Role | SOL floor | USDC floor |
  |---|---|---|
  | **sponsor** | 0.03 SOL (1.5× the 0.02 hard floor) | — |
  | **payer** | 0.03 SOL *(self-pay mode only)* | `X402_RING_PAYER_USDC_FLOOR_ATOMIC`, default **$5** |
  | **treasury** | — (unbounded: fills + gets swept) | — |

  The 0.03 SOL floor sits a hair above the facilitator's `X402_SPONSOR_SOL_FLOOR_LAMPORTS`
  (0.02 SOL) hard stop, so operators are warned *before* settlement is refused.
  A breach snapshot is published to Redis `x402:ring-wallets:latest` for cheap
  dashboard reads. The pure floor math is in
  [ring-floors.js](../api/_lib/x402/ring-floors.js).
- **Auto-topup** — the sponsor (`x402-ring-sponsor`) and payer (`x402-ring-payer`)
  are entries in [api/_lib/solana-signers.js](../api/_lib/solana-signers.js) with
  `minSol: 0.03`, so the economy master's
  [treasury-topup](../api/cron/treasury-topup.js) cron refills their fee **SOL**
  automatically when they fall below floor — closing the "sponsor runs dry and the
  ring silently halts" failure. The **treasury is deliberately not a signer** (the
  master must never top up a wallet that only receives and gets swept), and the
  master only ever moves SOL, so the payer's **USDC** float is a manual top-up when
  the monitor alerts. Funding amounts and verification commands live in
  [tasks/x402-ring/FUNDING.md](../tasks/x402-ring/FUNDING.md).

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
#    X402_SELF_FACILITATOR_ENABLED=true   # else /api/x402-facilitator → 503
#    X402_EXTERNAL_ENABLED=false          # only OUR endpoints get paid
#    X402_CHARITY_AUDIT_BPS=0             # no charity split leaves the ring
#    X402_RING_SELF_PAY=true              # 1-signature settles, lowest SOL
#    X402_PRICE_RING_SETTLE=1000000       # $1.00/call
#    X402_VOLUME_PER_RUN_CAP_ATOMIC=…     # must be ≥ X402_PRICE_RING_SETTLE
#    X402_AUTONOMOUS_DAILY_CAP_ATOMIC=…   # your daily volume target
#    X402_SPONSOR_SOL_FLOOR_LAMPORTS=20000000
#    + the payer / treasury / sponsor pub+secret pairs

# 4. Fund (manual, real money):
#    payer   → USDC float, e.g. $50 (recirculates)
#    sponsor → SOL for fees, e.g. 0.1 SOL (≈ thousands of settlements)
#    treasury→ nothing; it fills and gets swept back

# 5. Confirm the envelope is correct BEFORE funding — config_warnings must be [].
curl https://three.ws/api/x402-status  | jq '.ring'
curl https://three.ws/api/x402-ring    | jq '.config_warnings'
```

### How Solana settlement routes

Turning on `X402_SELF_FACILITATOR_ENABLED=true` is what makes the self-hosted
facilitator the *default* Solana settle path — it is **not** always-on. The
resolver ([api/_lib/x402/ring-config.js](../api/_lib/x402/ring-config.js), used
by `facilitatorFor()`) decides in this order:

1. **An explicit `X402_FACILITATOR_URL_SOLANA` always wins.** Existing non-ring
   deploys never silently re-route. Point it at
   `https://three.ws/api/x402-facilitator` to force in-house settlement
   regardless of the flag, or at an external facilitator to opt out.
2. **Else, with `X402_SELF_FACILITATOR_ENABLED=true`,** Solana settlement
   defaults to this deploy's own `$APP_ORIGIN/api/x402-facilitator` — no URL
   needed.
3. **Else** it falls back to the external PayAI facilitator.

So the correctly-enveloped ring deploy sets the flag and **leaves
`X402_FACILITATOR_URL_SOLANA` unset** (or points it at the self URL). Setting the
flag while an external URL still wins is the mis-envelope the surfaces below flag.

### Fail loud, not silent

A mis-enveloped deploy — flag on but settlement still routing externally, or a
missing secret, or `X402_PRICE_RING_SETTLE` above the per-run cap — never routes
volume elsewhere quietly:

- **`/api/x402-status`** returns a `ring` block: `self_facilitator_enabled`, the
  resolved `self_facilitator_url`, and `config_warnings[]`. The self-hosted
  facilitator's `/supported` is probed as a distinct `self: true` entry whenever
  the flag is on, even if an external URL wins routing.
- **`/api/x402-ring`** returns the same `config_warnings[]` alongside the
  net-position report, and logs one structured warning per boot when settlement
  would route to an external facilitator.

`validateRingConfig()` reports six findings — facilitator disabled, URL external,
missing treasury secret, missing fee-payer pubkey, price-above-cap, and self-pay
off. A green ring is `config_warnings: []`.

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

## Leak-proofing — the invariant, made active

**The invariant:** no SOL or USDC ever leaves the set of wallets three.ws
controls — not to another user, not to a charity, not to an external facilitator,
not as a fee beyond the network's own. The anti-drain gate above already refuses
to *settle* a leaking transaction; leak-proofing closes the remaining gap — a
flipped guard env, a compromised key, or any path that moves money without going
through the facilitator — by asserting the invariant at runtime **and** watching
the chain for money actually leaving.

### The controlled-wallet set

[api/_lib/x402/ring-allowlist.js](../api/_lib/x402/ring-allowlist.js) resolves
`ringAllowedAddresses()` — every address the platform controls:

- the three ring role wallets (payer, treasury, sponsor — env + derived),
- the `x402_ring_wallets` registry,
- every platform signer in [api/_lib/solana-signers.js](../api/_lib/solana-signers.js),
- explicit extras from `X402_SELF_FACILITATOR_PAYTO_ALLOWLIST`,
- and the USDC ATAs of all of the above (SPL credits land on the token account).

> This is the **membership** set (is a counterparty ours?), and it is deliberately
> broader than the facilitator's `payToAllowlist()` **receiving** set (may we
> settle *to* this address?). Receiving is stricter than membership — a wallet can
> be controlled without being a valid settlement recipient.

### Assertion points — the ring fails CLOSED

Before any spend, the spend entry points call `assertRingSpendInvariants()`,
which checks three guards:

1. `X402_EXTERNAL_ENABLED === 'false'` — external spending disabled (unset = violation),
2. `X402_CHARITY_AUDIT_BPS` parses to exactly `0` — no split leaves the ring,
3. facilitator resolves to **self** — `X402_SELF_FACILITATOR_ENABLED=true` and
   settlement routes to our own `/api/x402-facilitator` (via `resolveSolanaFacilitator()`).

Any violation **no-ops the entire spend path** and fires one throttled CRITICAL
ops alert naming the flipped flag. A forgotten or tampered flag can no longer
silently re-open external spending — the loop stops spending instead.
Wired into [api/cron/x402-autonomous-loop.js](../api/cron/x402-autonomous-loop.js)
(the loop that runs ring settlement) and the ring tick.

### On-chain leak scanner

[api/cron/x402-ring-leak-scan.js](../api/cron/x402-ring-leak-scan.js) runs every
10 min (`CRON_SECRET`-authed, **strictly read-only** on chain). For each ring
wallet it pulls the new signatures since a persisted per-wallet cursor
(`x402_ring_scan_cursor`, ≤100/run), batches `getParsedTransactions`, and
classifies every debit:

| class | meaning |
|---|---|
| `internal` | counterparty ∈ `ringAllowedAddresses()` — money stayed in the set |
| `network_fee` | the Solana fee our wallet paid (the only permitted outflow) |
| **`LEAK`** | anything else: USDC to an unknown address, **any** non-USDC token out, an unexplained SOL debit, a System transfer to an unknown address |
| `delegation` | an SPL `Approve` on a ring ATA — a leak vector *before* funds move |

Every `LEAK`/`delegation` fires a CRITICAL `sendOpsAlert` (signature,
counterparty, amount, rotate-the-key recommendation) and upserts a verdict into
`payment_reconciliation` with source `x402_ring_onchain`, alongside the economy
master's breach verdicts on the same ops financial-integrity board. When
classification is ambiguous it errs to `LEAK` — a false positive is cheaper than
a missed drain.

**Fee-leak line item.** The scanner accumulates the per-day network fees ring
wallets actually paid on chain (`x402_ring_fee_observed`) and cross-checks the
last complete UTC day against task 05's `x402_fee_audit` rollup. A >20% mismatch
means something is paying fees from our wallets outside the ring's accounting →
WARN.

### Response runbook — a leak alert fired

1. **Confirm** — open the `solscan.io/tx/<sig>` link in the alert; read the
   counterparty and amount. Cross-check the verdict:
   `SELECT * FROM payment_reconciliation WHERE source = 'x402_ring_onchain' AND reconciled = false`.
2. **Rotate** — treat the affected wallet's key as compromised. Generate a new
   secret (`node scripts/x402-ring-setup.mjs` for a ring role; the signer's own
   runbook otherwise) and replace it in Vercel env.
3. **Drain** — move remaining funds from the old wallet to the treasury
   (`X402_PAY_TO_SOLANA`) before the old key can move more.
4. **Revoke** (delegation alerts) — send an SPL `Revoke` on the approved ATA to
   kill the delegate's authority.
5. **Re-verify** — run `node scripts/x402-ring-verify.mjs` to confirm the wallet
   set is clean, then mark the verdict reconciled.

## Related

- [STRUCTURE.md](../STRUCTURE.md) — surface map
- [/api/x402-revenue](../api/x402-revenue.js) — the **public** organic-revenue
  feed (self-cycled ring volume is excluded from the "organic" framing here)
- [docs/x402-revenue.md](./x402-revenue.md) — revenue surface docs
- [api/_lib/x402/ring-allowlist.js](../api/_lib/x402/ring-allowlist.js) — the
  controlled-wallet set + spend invariants
- [api/cron/x402-ring-leak-scan.js](../api/cron/x402-ring-leak-scan.js) — the
  on-chain leak scanner

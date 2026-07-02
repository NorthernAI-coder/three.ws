# Economy funding root (the master wallet)

The economy funding root is **one master wallet that funds every other Solana
engine on the platform** and does nothing else. It never trades, launches, tips,
snipes, or settles a payment — its only on-chain action is a native SOL transfer
that tops up an engine signer when that signer drops below its floor. This is the
"masters fund engines, engines do the work" model applied platform-wide.

> Source: [`api/_lib/economy-master.js`](../api/_lib/economy-master.js) (the
> guard logic + sweep), cron entry
> [`api/cron/treasury-topup.js`](../api/cron/treasury-topup.js), registry
> [`api/_lib/solana-signers.js`](../api/_lib/solana-signers.js). Operator runbook:
> [`tasks/onchain-deployment/SOLANA-SIGNERS.md`](../tasks/onchain-deployment/SOLANA-SIGNERS.md).

**Address (mainnet vanity):** `WwwuGbqHrwF5RG89KhUbmRWEvjnRH9k5kVM5p7T3WwW`

The address is case-sensitive base58 — the leading character is a **capital `W`**.
A lowercase `wwwu…` is a *different, empty* keypair; the `loadEconomyMaster()`
pubkey guard exists precisely so a mis-cased or mis-pasted key can never load and
drain the wrong wallet.

---

## How it works

1. A single master wallet (funded by the operator) is the root of the tree.
2. Every 30 minutes the `treasury-topup` cron reads the on-chain SOL balance of
   every **configured, mainnet** engine signer in the `SOLANA_SIGNERS` registry.
3. For each signer below its `minSol` floor, it computes a top-up to bring it up
   to `refillTo` (default `minSol × 3`), subject to the guards below.
4. It transfers the planned SOL from the master to each engine, fee-minimized,
   and emits an ops alert per top-up (and one if the master itself is too drained
   to cover a real deficit — the one condition a human must act on).
5. With `ECONOMY_MASTER_SECRET_BASE58` unset the whole thing is **inert**:
   `loadEconomyMaster()` returns `null`, the sweep is a no-op, and the existing
   `relayer-balance-check` cron keeps alerting. Shipping it changes nothing until
   the operator funds the master and installs the key.

## Funder-only, by construction

The master is never a *target* of a top-up — it funds the others, not itself
(`isMaster: true` in the registry excludes it, and the sweep's allowlist rejects
its own pubkey as `is_master`). It holds no product logic: it cannot call a DEX,
a pump.fun program, or an x402 settlement. If you need SOL to *do* something, that
belongs in an engine signer the master funds — not in the master.

## The guards (every guard is enforced on every sweep)

| Guard | Env | Default | What it bounds |
|---|---|---|---|
| Reserve floor | `ECONOMY_MASTER_RESERVE_SOL` | `1` | Never spend the master below this — its own working reserve + rent + fees. An on-chain read, so it holds even with no database. |
| Per-engine cap | `ECONOMY_MASTER_PER_TOPUP_MAX_SOL` | `0.5` | Most SOL moved to any single engine in one sweep. |
| Per-run cap | `ECONOMY_MASTER_RUN_CAP_SOL` | `2` | Most SOL moved across all engines in one sweep. Neediest engine funded first, so a tight cap protects the most-drained flow. |
| Dust skip | — | `0.005` | Skip a top-up smaller than this to avoid fee churn. |
| Pubkey match | `ECONOMY_MASTER_ADDRESS` | the address above | The installed secret must derive to the expected pubkey or `loadEconomyMaster()` throws `master_mismatch` — a mis-paste never silently drains a different wallet. |

`planTopUps()` is pure (no RPC), so all of the above are unit-tested in
[`tests/economy-master.test.js`](../tests/economy-master.test.js) without a key.

## The leak invariant (no SOL leaves the owner-controlled set)

SOL can **only** move from the master to a wallet the platform holds the key for.
This is enforced twice:

1. **The cron** builds its target list solely from `SOLANA_SIGNERS` — it never
   passes an arbitrary address.
2. **The sweep** (`filterToRegistry`) independently resolves the registry and
   rejects any target whose pubkey is not a resolved registry signer, and rejects
   the master's own pubkey. An off-registry target is refused and ops-alerted;
   no SOL moves. So even a buggy or tampered caller cannot route funds out of the
   registry.

There is **no charity path and no user-payout path** on the master. (The
per-merchant "charity split" you may see in the x402 checkout code is a *buyer*-
funded donation on a merchant's own sale — it never touches this wallet.)

## Lowest fees

Every transfer routes through `submitProtected` with `tipMode: 'off'` — **no Jito
tip**, just a data-driven priority fee floored at 1000 µLamports/CU (see
[`api/_lib/execution-engine.js`](../api/_lib/execution-engine.js)). A single
top-up costs roughly 0.000005–0.00001 SOL. The fee escalates only on retry under
congestion, clamped to a hard ceiling.

## Configuration

| Env | Required | Meaning |
|---|---|---|
| `ECONOMY_MASTER_SECRET_BASE58` | yes | The master keypair (base58 of 64 raw bytes). Unset ⇒ the funding root is inert. Store `--sensitive`; keep your own copy (Vercel Sensitive vars are unreadable after save). |
| `ECONOMY_MASTER_ADDRESS` | no | Override the expected pubkey if the master is ever rotated. Defaults to the address above. |
| `ECONOMY_MASTER_RESERVE_SOL` / `_PER_TOPUP_MAX_SOL` / `_RUN_CAP_SOL` | no | Guard caps (see table). |
| `CRON_SECRET` | yes | Bearer auth for the Vercel cron (shared with other crons). |
| `SOLANA_RPC_URL` | no | Mainnet RPC (defaults to `api.mainnet-beta`). |

## Verify it's working

```bash
# Balances of every registry signer (derives pubkeys, never prints secrets):
node scripts/check-relayer-balances.mjs

# Exercise the sweep against prod (real cron; safe — only funds registry wallets
# below floor, bounded by the reserve/per-run caps). Returns the plan as JSON:
curl -s -H "Authorization: Bearer $CRON_SECRET" https://three.ws/api/cron/treasury-topup | jq
```

The JSON response reports `configured`, `master_sol`, `funded`, `failed`,
`skipped`, `rejected`, and `spent_sol`. A non-empty `rejected` array means an
off-registry target reached the sweep and was blocked — investigate the caller.

## Known gaps & runbook (as of 2026-07-02)

The master is configured and funded, but the tree it feeds is only partly wired:

- **Only two registry signers resolve in prod** — the master itself and the NFT
  `collection-authority`. The other ten engines (launcher, buyback, treasuries,
  club tips, a2a-payer, x402 launcher) have no secret set, so the sweep has almost
  nothing to fund. Set each engine's secret to bring it online (see the runbook).
- **Solana agent-to-agent settlement is down.** The `a2a-payer` signer reads
  `A2A_PAYER_SOLANA_SECRET`; prod only has `A2A_PAYER_PRIVATE_KEY` (the EVM payer).
  [`api/agents/a2a-call.js`](../api/agents/a2a-call.js) throws *"autonomous Solana
  payer wallet is not configured"* on every Solana mandate. Fix: set
  `A2A_PAYER_SOLANA_SECRET` to a base58 Solana key.
- **The x402 spend/gas wallets are not in the registry.** `X402_FEE_PAYER_SOLANA`,
  `X402_AGENT_SOLANA_SECRET_BASE58`, and `X402_SEED_SOLANA_SECRET_BASE58` run the
  x402 agent-to-agent economy but are not `SOLANA_SIGNERS` entries, so the master
  does not top them up. Whether it *should* is an operator call — x402 gas is
  largely PayAI-sponsored (see [x402 ring economy](x402-ring-economy.md) /
  [autonomous x402](autonomous-x402.md)), so those wallets may intentionally not
  need funding from this master. To have the master keep them fueled, add them to
  the registry with a floor.

## Related

- [`SOLANA-SIGNERS.md`](../tasks/onchain-deployment/SOLANA-SIGNERS.md) — every
  engine signer, its encoding, and how to fund/consolidate the economy wallets.
- [Circulation engine](circulation-engine.md) — the autonomous agent-to-agent
  activity loop the funded engines drive.
- [x402 ring economy](x402-ring-economy.md) — closed-loop in-house x402 settlement.

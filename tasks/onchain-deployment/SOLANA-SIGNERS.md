# Solana signers — funding & wiring runbook

Companion to [`api/_lib/solana-signers.js`](../../api/_lib/solana-signers.js) (the machine-readable registry) and the two operator scripts below. Keep this file in sync with that registry.

Every autonomous engine loads its own Solana keypair from its own env var and pays fees / rent / spend from that wallet. If a wallet runs dry, its flow stops — often silently. This doc lists every signer, what it pays for, the encoding its env var expects, and how to fund or consolidate them.

There **is** a single funding root: the **economy master** (`ECONOMY_MASTER_SECRET_BASE58`, `WwwuGbqHrwF5RG89KhUbmRWEvjnRH9k5kVM5p7T3WwW` — note the capital leading `W`). It is funder-only (never trades or settles), and the [`treasury-topup`](../../api/cron/treasury-topup.js) cron auto-tops-up every engine below its floor from it every 30 min, fee-minimized and allowlist-guarded so SOL can only reach a registry wallet. Full subsystem doc: [`docs/economy-master.md`](../../docs/economy-master.md). It is inert until its secret is set, so the per-engine funding below still applies.

## The signers

Encodings: `base64` = base64 of the 64 raw secret-key bytes (`…_B64` vars); `base58` = base58 of the same 64 bytes (`…_BASE58` vars); most consumers auto-detect base64 / base58 / JSON-array, but treat the name's suffix as authoritative when writing.

| Env var | Engine / what it pays for | Enc | Min SOL | Network |
|---|---|---|---|---|
| `ECONOMY_MASTER_SECRET_BASE58` | **Funding root** (`WwwuGbq…T3WwW`) — auto-tops-up every other signer below its floor. Funder-only; never a top-up target of itself. See [`docs/economy-master.md`](../../docs/economy-master.md) | base58 | 1.0 | mainnet |
| `LAUNCHER_MASTER_SECRET_KEY_B64` | Autonomous coin launcher — tops up the next agent's per-launch SOL (deploy + dev-buy) | base64 | 1.0 | mainnet |
| `PUMP_X402_LAUNCHER_SECRET_KEY_B64` | Fronts the ~0.022 SOL deploy cost for x402 pay-per-call pump.fun launches | base64 | 0.1 | mainnet |
| `PUMP_CRON_RELAYER_SECRET_KEY_B64` | Fees + swap gas for the buyback and distribute-payments crons | base64 | 0.1 | both |
| `THREE_BUYBACK_SECRET_KEY_B64` | Holds USDC revenue; gas for `run-three-buyback` (market-buy $THREE → treasury) | base64 | 0.05 | mainnet |
| `COIN_TREASURY_SECRET_KEY_B64` | Signs lottery/reflection distribution txs for launched coins (strict base64) | base64 | 0.05 | mainnet |
| `CLUB_SOLANA_TREASURY_SECRET_KEY_B64` | USDC tip-sweep transfers + recipient ATA rent (`club-payouts`) | base64 | 0.05 | mainnet |
| `PLATFORM_TREASURY_KEYPAIR` (→ `TREASURY_KEYPAIR`) | Shared platform treasury; SPL withdrawal gas (`process-withdrawals`). Several flows top up **from** this. | base64 | 0.05 | mainnet |
| `MARKETPLACE_PAYER_KEYPAIR` (→ `PLATFORM_TREASURY_KEYPAIR`) | Sponsors network fees for gasless skill/asset checkout | base64 | 0.05 | mainnet |
| `THREEWS_SOL_PARENT_SECRET_BASE58` | Owns threews.sol; rent/fees minting `*.threews.sol` subdomains | base58 | 0.05 | mainnet |
| `X402_SEED_SOLANA_SECRET_BASE58` | x402 autonomous/seed spender (probes 402 endpoints, pays USDC) | base58 | — | mainnet |
| `LABOR_ESCROW_SECRET_BASE58` | Labor market escrow custody + payout release gas | base58 | ~0.05 | mainnet |
| `VANITY_BOUNTY_PAYOUT_KEY` | Vanity grind-bounty payouts + refunds (strict base58) | base58 | — | mainnet |
| `CIRCULATION_TREASURY_SECRET` | Circulation engine treasury (agent↔agent tips/pays/trades); auto-topped-up (floor 0.2, refill to 0.5) | base58 | 0.2 | mainnet |
| `A2A_PAYER_SOLANA_SECRET` (→ `A2A_PAYER_SOLANA_PRIVATE_KEY`) | Co-signs SPL TransferChecked for a2a mandate settlements | base58 | 0.02 | mainnet |
| `X402_FEE_PAYER_SECRET_BASE58` | x402 ring **sponsor**: co-signs + pays SOL on every self-hosted-facilitator settle; below floor the ring halts | base58 | 0.03 | mainnet |
| `X402_SEED_SOLANA_SECRET_BASE58` (→ `X402_AGENT_SOLANA_SECRET_BASE58`) | x402 ring **payer** (self-pay mode): pays its own 1-sig fee per settle; USDC float watched separately | base58 | 0.03 | mainnet |
| `REWARDS_DISTRIBUTOR_SECRET` | $THREE holder rewards/reflections distributor | base58 | — | mainnet |
| `SOLANA_AGENT_COLLECTION_AUTHORITY_KEY` | Creates/manages the three.ws agent NFT collection | base64 | 0.02 | both |

> The x402 ring **treasury** (`X402_PAY_TO_SOLANA` / `X402_TREASURY_SECRET_BASE58`) is deliberately **not** a signer here. It only receives ring payments and gets swept back to the payer by the rebalancer, so a low balance is its healthy resting state — the economy master must never top it up. Only the sponsor (and the payer, which pays its own fee in self-pay mode) hold fee SOL, so only they get auto-topped-up. The payer's USDC float is watched by [`api/_lib/x402/wallet-balance-monitor.js`](../../api/_lib/x402/wallet-balance-monitor.js), not this registry (the master only ever moves SOL).

**Do not** overwrite `SOLANA_AGENT_COLLECTION_AUTHORITY_KEY` with a different wallet — it is the on-chain update authority for the NFT collection; changing it breaks NFT management. It is flagged `holdsTokens` in the registry, so the consolidation sweep never touches its token accounts (the collection NFTs) outside an explicit drain.

## Consolidation (the return leg)

The [`treasury-sweepback`](../../api/cron/treasury-sweepback.js) cron is the topup's mirror: every 6 h it returns each signer's surplus SOL (anything above its `refillTo` float) — and stray token balances from signers not flagged `holdsTokens` — to the economy master, booked onto the same hash-chained ledger. `POST …?mode=drain&confirm=drain` consolidates *everything* (all tokens, closed token-account rent, all SOL minus fee headroom) back to the master for decommission or emergency recovery. The destination is the master address as a code constant, so consolidation can never leak funds to a third party. Slots that resolve to the master's own wallet are skipped, and duplicate pubkeys are swept once. Subsystem doc: [`docs/economy-master.md`](../../docs/economy-master.md).

## Two funding models

- **A — one wallet is every signer.** Put the same secret into every var above. Fast; one balance and one hot key serve everything. Blast radius: if that key leaks, all engines drain; engines compete for one balance. Use [`scripts/wire-master-wallet.mjs`](../../scripts/wire-master-wallet.mjs).
- **B — cold master funds per-engine hot wallets.** Keep the master as a treasury source and top up each engine's own small hot wallet below a floor. This is now automated: the **economy master** (`ECONOMY_MASTER_SECRET_BASE58`) + the [`treasury-topup`](../../api/cron/treasury-topup.js) cron are the universal master→engine top-up loop — reserve-floor, per-engine, and per-run guarded, and allowlisted to registry wallets only. Set that secret to enable it. `LABOR_ESCROW` and the sniper auto-funder also self-fund via `PLATFORM_TREASURY_KEYPAIR`.

**Funding a wallet does not enable an engine.** Most engines also need their own flag (`CIRCULATION_ENABLED`, `THREE_BUYBACK_ENABLED`, `SOLANA_AUTODEPLOY_ENABLED`, …). EVM engines use separate keys (`EVM_TREASURY_PRIVATE_KEY`, `CIRCULATION_EVM_TREASURY_SECRET`).

## Wiring across the economy wallets

[`scripts/wire-master-wallet.mjs`](../../scripts/wire-master-wallet.mjs) assigns each signer slot to one of the economy wallets and sets every var from the right wallet's key. Edit `WALLETS` / `ASSIGNMENTS` in that script to remap. Current default split:

| Wallet | Role | Signer slots |
|---|---|---|
| `wwwww…ccrU` | x402 receiver + closed-loop spender (holds USDC) | `X402_SEED_SOLANA_SECRET_BASE58`, `PUMP_X402_LAUNCHER_SECRET_KEY_B64`, `A2A_PAYER_SOLANA_SECRET` |
| `wwwqv…HGUn` | SOL-burning autonomous engines (funded ~2.77 SOL) | `LAUNCHER_MASTER_SECRET_KEY_B64`, `PUMP_CRON_RELAYER_SECRET_KEY_B64`, `CIRCULATION_TREASURY_SECRET`, `THREEWS_SOL_PARENT_SECRET_BASE58`, `COIN_TREASURY_SECRET_KEY_B64` |
| `WwwuGbqHrwF5…T3WwW` (capital W) | platform treasury + revenue/payouts (funded ~10 SOL + USDC) | `PLATFORM_TREASURY_KEYPAIR`, `MARKETPLACE_PAYER_KEYPAIR`, `THREE_BUYBACK_SECRET_KEY_B64`, `CLUB_SOLANA_TREASURY_SECRET_KEY_B64`, `VANITY_BOUNTY_PAYOUT_KEY`, `REWARDS_DISTRIBUTOR_SECRET` |

`LABOR_ESCROW_SECRET_BASE58` is already **live** on its own wallet — the tool skips it unless you pass `--include-live` (rerouting strands any escrowed funds; migrate balances first). `SOLANA_AGENT_COLLECTION_AUTHORITY_KEY` is never touched.

> **`WwwuGbq…T3WwW` plays two roles.** It is both the **economy master** funding root (`ECONOMY_MASTER_SECRET_BASE58`, `isMaster` in the registry) and, in the consolidation split above, the wallet whose key backs several payout slots (`PLATFORM_TREASURY_KEYPAIR`, `THREE_BUYBACK…`, `CLUB_SOLANA_TREASURY…`, etc.). That is consistent — the master holds those payout funds directly — but note the consequence: because those slots resolve to the master's own pubkey, the `treasury-topup` sweep will never "top them up" (a wallet cannot fund itself; the allowlist rejects it as `is_master`). They spend from the master's balance directly. If you want any of those payout flows on a *separate* hot wallet that the master keeps topped up, give it its own key rather than reusing the master's.

```bash
# 1. Put each wallet's secret in its own local file (base58 / base64 / JSON array).
#    NEVER commit them. NEVER paste them into a chat.
echo '<wwwqv-secret>' > wwwqv.key
echo '<Wwwu-secret>'  > Wwwu.key
echo '<wwwww-secret>' > wwwww.key

# 2. Dry run — prints the full plan, sets nothing:
node scripts/wire-master-wallet.mjs --key wwwqv=./wwwqv.key --key Wwwu=./Wwwu.key --key wwwww=./wwwww.key

# 3. Apply to Vercel production (overwrite existing), add --preview to also do preview:
node scripts/wire-master-wallet.mjs \
  --key wwwqv=./wwwqv.key --key Wwwu=./Wwwu.key --key wwwww=./wwwww.key \
  --apply --overwrite

# 4. Redeploy, then verify pubkeys + balances:
node scripts/check-relayer-balances.mjs

# 5. Shred the local key files.
shred -u wwwqv.key Wwwu.key wwwww.key
```

Each key is decoded locally and MUST derive to its wallet's expected pubkey or the run aborts (guards against wiring the wrong key). You can wire one wallet at a time — slots whose key you didn't provide are skipped. Every var is set `--sensitive`, so keep your own copy — Vercel Sensitive vars are unreadable after save.

## Checking balances

`node scripts/check-relayer-balances.mjs [--network devnet]` reads the registry, derives each pubkey, and prints SOL + USDC balances, flagging any below its documented minimum. Never prints secrets. Non-zero exit if any configured signer is underfunded.

# Solana signers — funding & wiring runbook

Companion to [`api/_lib/solana-signers.js`](../../api/_lib/solana-signers.js) (the machine-readable registry) and the two operator scripts below. Keep this file in sync with that registry.

three.ws has **no single "master wallet" env var**. Every autonomous engine loads its own Solana keypair from its own env var and pays fees / rent / spend from that wallet. If a wallet runs dry, its flow stops — often silently. This doc lists every signer, what it pays for, the encoding its env var expects, and how to fund or consolidate them.

## The signers

Encodings: `base64` = base64 of the 64 raw secret-key bytes (`…_B64` vars); `base58` = base58 of the same 64 bytes (`…_BASE58` vars); most consumers auto-detect base64 / base58 / JSON-array, but treat the name's suffix as authoritative when writing.

| Env var | Engine / what it pays for | Enc | Min SOL | Network |
|---|---|---|---|---|
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
| `CIRCULATION_TREASURY_SECRET` | Circulation engine treasury (agent↔agent tips/pays/trades) | base58 | — | mainnet |
| `A2A_PAYER_SOLANA_SECRET` (→ `A2A_PAYER_SOLANA_PRIVATE_KEY`) | Co-signs SPL TransferChecked for a2a mandate settlements | base58 | 0.02 | mainnet |
| `REWARDS_DISTRIBUTOR_SECRET` | $THREE holder rewards/reflections distributor | base58 | — | mainnet |
| `SOLANA_AGENT_COLLECTION_AUTHORITY_KEY` | Creates/manages the three.ws agent NFT collection | base64 | 0.02 | both |

**Do not** overwrite `SOLANA_AGENT_COLLECTION_AUTHORITY_KEY` with a different wallet — it is the on-chain update authority for the NFT collection; changing it breaks NFT management. It is excluded from master-wallet consolidation by default.

## Two funding models

- **A — one wallet is every signer.** Put the same secret into every var above. Fast; one balance and one hot key serve everything. Blast radius: if that key leaks, all engines drain; engines compete for one balance. Use [`scripts/wire-master-wallet.mjs`](../../scripts/wire-master-wallet.mjs).
- **B — cold master funds per-engine hot wallets.** Keep the master as a treasury source and top up each engine's own small hot wallet below a floor (the pattern `LABOR_ESCROW` and the sniper auto-funder already use via `PLATFORM_TREASURY_KEYPAIR`). Safer, but there is no universal master→engine top-up cron yet.

**Funding a wallet does not enable an engine.** Most engines also need their own flag (`CIRCULATION_ENABLED`, `THREE_BUYBACK_ENABLED`, `SOLANA_AUTODEPLOY_ENABLED`, …). EVM engines use separate keys (`EVM_TREASURY_PRIVATE_KEY`, `CIRCULATION_EVM_TREASURY_SECRET`).

## Wiring one wallet as the master (approach A)

```bash
# 1. Put the master wallet's secret in a local file (base58, base64, or JSON array).
#    NEVER commit it. NEVER paste it into a chat.
echo '<secret-key>' > master.key

# 2. Dry run — prints every var it would set, sets nothing:
node scripts/wire-master-wallet.mjs --secret-file ./master.key

# 3. Apply to Vercel production (overwrite existing), then also preview if wanted:
node scripts/wire-master-wallet.mjs --secret-file ./master.key --apply --overwrite
node scripts/wire-master-wallet.mjs --secret-file ./master.key --apply --overwrite --preview

# 4. Redeploy, then verify pubkeys + balances:
node scripts/check-relayer-balances.mjs

# 5. Shred the local key file.
shred -u master.key
```

The script refuses to run unless the secret derives to the intended master pubkey (guard against wiring the wrong wallet); override with `--pubkey <derived>`. It sets every var `--sensitive`, so keep your own copy — Vercel Sensitive vars are unreadable after save.

## Checking balances

`node scripts/check-relayer-balances.mjs [--network devnet]` reads the registry, derives each pubkey, and prints SOL + USDC balances, flagging any below its documented minimum. Never prints secrets. Non-zero exit if any configured signer is underfunded.

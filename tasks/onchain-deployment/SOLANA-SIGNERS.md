# Solana Signers — Inventory, Funding & Verification

Every Solana keypair the platform loads to **pay fees / rent** for an on-chain
flow. Secrets are NEVER committed — this file documents env var **names**, what
each pays for, the network it spends real SOL on, the encoding, and the minimum
balance below which it should be refilled.

The machine-readable mirror is [`api/_lib/solana-signers.js`](../../api/_lib/solana-signers.js)
— the registry the low-balance watchdog and operator script both read. Keep the
two in sync.

Last verified: 2026-06-15. None of these secrets are present in the Codespace
sandbox (`vercel env pull` returns empty for sensitive vars), so the on-chain
funding/verification steps below are **operator-gated** — run them from a machine
that holds the secrets. Everything that does **not** require a live secret (the
inventory, the watchdog, the scripts, the cron registration) is done and shipped.

---

## Signer registry

| Signer | Env var (fallback) | Network | Encoding | Min SOL | Pays for |
|---|---|---|---|---|---|
| pump-cron-relayer | `PUMP_CRON_RELAYER_SECRET_KEY_B64` | mainnet + devnet | base64 (64 bytes) | 0.10 | fees + swap gas for **buyback** & **distribute-payments** crons |
| pump-x402-launcher | `PUMP_X402_LAUNCHER_SECRET_KEY_B64` | mainnet | base64 (64 bytes) | 0.10 | fronts ~0.022 SOL per x402 pay-per-call pump.fun launch |
| sns-parent-owner | `THREEWS_SOL_PARENT_SECRET_BASE58` | mainnet | base58 | 0.05 | owns `threews.sol`; rent/fees minting `*.threews.sol` subdomains |
| coin-treasury | `COIN_TREASURY_SECRET_KEY_B64` | mainnet | base64 (64 bytes) | 0.05 | lottery / reflection distribution txs for launched coins |
| club-treasury | `CLUB_SOLANA_TREASURY_SECRET_KEY_B64` | mainnet | base64 (64 bytes) | 0.05 | USDC tip-sweep transfers + recipient ATA rent (club-payouts) |
| platform-treasury | `PLATFORM_TREASURY_KEYPAIR` (`TREASURY_KEYPAIR`) | mainnet | base58 / JSON | 0.05 | SPL withdrawal gas (process-withdrawals cron) |
| a2a-payer | `A2A_PAYER_SOLANA_SECRET` (`A2A_PAYER_SOLANA_PRIVATE_KEY`) | mainnet | base58 | 0.02 | co-signs SPL TransferChecked for A2A mandate settlements |
| collection-authority | `SOLANA_AGENT_COLLECTION_AUTHORITY_KEY` | mainnet + devnet | base58 | 0.02 | creates/manages the three.ws agent NFT collection |

Adjacent Solana secrets that exist but are **not fee-payer relayers** (so not in
the watchdog): `SAS_AUTHORITY_SECRET` (attestation authority — funded ad-hoc per
[`scripts/sas-bootstrap.js`](../../scripts/sas-bootstrap.js)),
`ATTEST_AGENT_SECRET_KEY`, `AVATAR_WALLET_SECRET` (avatar economy fee-payer,
capped by `AVATAR_MAX_SEND_USD`), `X402_AGENT_SOLANA_SECRET_BASE58` (x402 test
wallet). `AGENT_RELAYER_KEY` is an **EVM** key, not Solana. Add any of these to
the registry if they start backing a production flow.

Encodings differ, so both the watchdog and the scripts use one auto-detecting
decoder (`decodeSecretKey` in `api/_lib/solana-signers.js`): JSON array → base64
(64-byte round-trip) → base58.

---

## What ships in this change (no secret required)

1. **`api/_lib/solana-signers.js`** — the registry + the universal secret decoder
   + `resolveSignerPubkey()`.
2. **`api/cron/relayer-balance-check.js`** — a watchdog cron (every 6h) that
   reads each *configured* signer's mainnet SOL balance and fires a
   `sendOpsAlert` (existing Telegram ops pipeline, deduped per-pubkey hourly)
   when one is below its `minSol`. Unconfigured signers are skipped; a signer it
   can't decode or read also alerts (an unreadable signer is itself an outage).
   Registered in `vercel.json` crons.
3. **`scripts/check-relayer-balances.mjs`** — operator companion: prints every
   signer's pubkey, SOL + USDC, and flags under-min ones. Exits non-zero if any
   configured signer is underfunded. `--network devnet` supported.
4. **`scripts/fund-devnet-signer.mjs`** — airdrops devnet SOL to an existing or
   freshly-minted throwaway signer and reports balances. Devnet only; never
   writes a secret to disk.
5. **`scripts/trigger-pump-crons.mjs`** — re-runnable trigger for the buyback /
   distribute crons against a deployment; prints per-mint results + run_ids.
6. **Cron registration** — `run-buyback`, `run-distribute-payments`, and
   `relayer-balance-check` added to `vercel.json`. The two money-movers existed
   as handlers in `api/cron/[name].js` but were **never scheduled**, so the
   platform never actually ran an autonomous buyback/distribution. They are now
   scheduled and **degrade safely**: with an unfunded/absent relayer they write a
   `status:'pending'` audit row + an unsigned tx for an external keeper — no
   failure — and only start submitting real txs once the relayer is funded.

---

## Operator runbook (requires the real secrets)

### 1. Fund the signers

- **Devnet** (free): `node scripts/fund-devnet-signer.mjs --env PUMP_CRON_RELAYER_SECRET_KEY_B64`
  (the public faucet rate-limits cloud IPs; from a Codespace use
  <https://faucet.solana.com> for the printed pubkey, then re-confirm with
  `--pubkey`).
- **Mainnet** (real SOL — operator must send): transfer the `Min SOL` above (a
  few × is healthier) to each signer's pubkey. Get the pubkeys with
  `node scripts/check-relayer-balances.mjs` on a machine that has the secrets.

### 2. Devnet smoke trade (`buy-prep` → `buy-confirm`)

pump.fun's program is mainnet-only, so a true on-curve buy requires a devnet
deployment + a devnet pump mint. Use the existing
[`scripts/buyback-devnet-smoke.mjs`](../../scripts/buyback-devnet-smoke.mjs)
(drives the same builder+signer path the cron uses) with `MINT` set to a
synthetic devnet pump mint and `PUMP_CRON_RELAYER_SECRET_KEY_B64` funded.
Capture the confirmed signature from its output.

### 3. Verify the distribution cron → `pump_distribute_runs`

```
BASE_URL=https://three.ws CRON_SECRET=… node scripts/trigger-pump-crons.mjs distribute
```

Confirm a fresh row in `pump_distribute_runs` (before/after balances + signature
when funded, or `pending` + unsigned tx when not). A run with **no** row is a
failure, not a pass.

### 4. Verify the buyback cron → `pump_buyback_runs`

```
BASE_URL=https://three.ws CRON_SECRET=… node scripts/trigger-pump-crons.mjs buyback
```

Confirm a fresh row in `pump_buyback_runs` (`confirmed` + signature, or
`pending`, or `failed` with the error — all are real audit rows).

### 5. Verify SNS minting end-to-end

`threews.sol` is a **mainnet** SNS domain, so this is mainnet-only and needs
`THREEWS_SOL_PARENT_SECRET_BASE58` funded with real SOL. `POST /api/threews/subdomain`
with `{ label: "<your-username>" }` (auth required; label must equal your
username). Confirm the `user_subdomains` row, the `url_record` →
`https://three.ws/u/<label>`, and the on-chain owner via
`GET /api/threews/subdomain?label=<label>`. Without the key the endpoint returns
`503 config_missing` by design. Clean up the test claim with `DELETE` (on-chain
ownership stays with the recipient wallet).

### 6. Low-balance alerting

Already live via `relayer-balance-check`. Needs `TELEGRAM_BOT_TOKEN` +
`TELEGRAM_ALERTS_CHAT_ID` (the existing private ops channel — `TELEGRAM_ALERTS_CHAT_ID`
is currently unset per ops notes; set it to arm alerts). Force a check now with:

```
CRON_SECRET=… curl -sH "authorization: Bearer $CRON_SECRET" \
  https://three.ws/api/cron/relayer-balance-check | jq
```

---

## Status

| Item | State |
|---|---|
| Signer inventory | ✅ done (this doc + registry) |
| Low-balance watchdog + alert | ✅ shipped (cron + registered) |
| Balance / funding / trigger scripts | ✅ shipped |
| Cron registration (buyback/distribute) | ✅ shipped (were unscheduled) |
| Devnet airdrop from sandbox | ⚠️ blocked — faucet rate-limits this cloud IP; use faucet.solana.com |
| Devnet buy smoke / cron audit rows | ⏳ operator-gated — needs funded relayer + secrets |
| SNS mint (mainnet) | ⏳ operator-gated — needs funded `THREEWS_SOL_PARENT_SECRET_BASE58` |

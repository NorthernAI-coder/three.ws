# x402 Ring — Funding Runbook

**Who runs this:** the platform owner, once, at activation (task 11). Nothing in
this repo moves funds. This document tells you exactly how much real USDC/SOL to
send, which address each goes to, and how to confirm it landed.

> **Read the addresses from env, never from this file.** The wallet addresses are
> resolved from Vercel env at runtime and printed by the verify script. Do not
> paste addresses here — a stale address sends real money to the wrong wallet.

---

## 0. Print the live addresses + current balances

```bash
node scripts/x402-ring-verify.mjs
```

This prints a 3-row table (payer / treasury / sponsor) with each wallet's live
pubkey, registry-match, secret-decode, and current SOL/USDC. **Send funds only to
the pubkeys this command prints.** It never prints a secret. It exits non-zero if
any role is misconfigured — fix that before funding.

For a machine-readable copy: `node scripts/x402-ring-verify.mjs --json`.

---

## 1. What each wallet needs

| Role | Fund with | Amount | Why this size |
|---|---|---|---|
| **payer** | USDC | **$50** (float) | The recirculating principal. Sized to comfortably cover `X402_AUTONOMOUS_DAILY_CAP_ATOMIC` (default $5/day) with headroom; the treasury→payer rebalancer keeps it topped as it cycles. Principal is not spent — it moves payer→treasury→payer. |
| **payer** *(self-pay mode)* | SOL | **0.1 SOL** | In `X402_RING_SELF_PAY=true` mode the payer signs and pays its own 1-signature fee (~5,000 lamports). 0.1 SOL ≈ **~20,000 settlements** before it needs a refill. |
| **sponsor** *(sponsor mode only)* | SOL | **0.1 SOL** | Only if you turn **off** self-pay (unset `X402_RING_SELF_PAY`). Then the sponsor co-signs and pays a 2-signature fee (~10,000 lamports) instead. 0.1 SOL ≈ ~10,000 settlements. |
| **treasury** | nothing | **$0** | It fills from ring payments and gets swept back to the payer. Funding it does nothing useful. |

**Pick one fee model, not both:**

- **Self-pay (recommended, lowest fee):** `X402_RING_SELF_PAY=true`. Fund the
  **payer** with the 0.1 SOL. The sponsor still needs a valid key (it is the
  advertised fee payer in the 402 challenge) but burns no SOL, so it can hold a
  minimal balance.
- **Sponsor:** unset `X402_RING_SELF_PAY`. Fund the **sponsor** with the 0.1 SOL
  instead; the payer needs only its USDC float.

Either way, once funded the **economy master** (`ECONOMY_MASTER_SECRET_BASE58`,
wallet `WwwuGbq…T3WwW`) keeps the sponsor and payer **SOL** topped up
automatically via the guarded [`treasury-topup`](../../api/cron/treasury-topup.js)
cron — both are now registry signers (`x402-ring-sponsor`, `x402-ring-payer`,
floor 0.03 SOL). The master **never** moves USDC and **never** tops up the
treasury, so the payer's **USDC** float is a manual top-up when the balance
monitor alerts.

---

## 2. Send the funds

Use any wallet/exchange you control. Send to the **exact pubkeys printed in
step 0**:

- **USDC** → the **payer** pubkey. Send SPL USDC
  (`EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v`) on Solana mainnet. The payer's
  USDC ATA is created on first receipt.
- **SOL** → the **payer** (self-pay) or **sponsor** (sponsor mode) pubkey.

Do not send to the treasury.

---

## 3. Confirm arrival

Re-run the verify script — the balances column reflects the new funds within a
slot or two:

```bash
node scripts/x402-ring-verify.mjs
```

Cross-check the live economy view (reads the same wallets on-chain):

```bash
curl -s https://three.ws/api/x402-ring | jq '.wallets'
```

Expected after funding (self-pay mode):

```json
{
  "treasury": { "address": "…", "usdc": 0 },
  "payer":    { "address": "…", "usdc": 50 },
  "sponsor":  { "address": "…", "sol": 0.1, "floor_sol": 0.02, "below_floor": false }
}
```

Direct on-chain spot checks (optional):

```bash
# SOL balance of a pubkey
curl -s https://api.mainnet-beta.solana.com -X POST -H 'content-type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"getBalance","params":["<PAYER_OR_SPONSOR_PUBKEY>"]}' | jq '.result.value'

# USDC balance of the payer
curl -s https://api.mainnet-beta.solana.com -X POST -H 'content-type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"getTokenAccountsByOwner","params":["<PAYER_PUBKEY>",{"mint":"EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"},{"encoding":"jsonParsed"}]}' \
  | jq '.result.value[0].account.data.parsed.info.tokenAmount.uiAmount'
```

---

## 4. Monitoring after funding

Once funded and running, the ring wallets are watched automatically:

- **Balance monitor** ([`wallet-balance-monitor.js`](../../api/_lib/x402/wallet-balance-monitor.js))
  runs every 10 min. It reads all three wallets on-chain and raises an ops alert
  when the sponsor or payer SOL drops below **0.03 SOL** (1.5× the facilitator's
  0.02 SOL hard floor) or the payer USDC float drops below
  `X402_RING_PAYER_USDC_FLOOR_ATOMIC` (default **$5**). The treasury is unbounded
  (it fills and gets swept), so it never alerts on a low balance.
- **Auto-topup** — the economy master refills sponsor/payer **SOL** to ~0.09 SOL
  when they fall under 0.03 SOL, so the ring never halts on fee SOL. USDC is
  manual.

If you see a `💵 x402 ring payer low on USDC float` alert, send more USDC to the
payer per step 2. If you see `⛽ x402 ring … low on SOL` and the master is funded,
the topup cron handles it; if the master itself is empty you'll get a separate
`⛽ Economy master could not refill` alert — fund `WwwuGbq…T3WwW`.

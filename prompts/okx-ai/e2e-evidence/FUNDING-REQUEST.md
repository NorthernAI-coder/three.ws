# Work Order 04 — Consolidated funding request (2026-07-07)

All preconditions are met and every funding-independent leg passes against production
(`https://three.ws/api/okx/3d/*`). The gauntlet's paid legs are blocked ONLY on funds.
This file is the exact ask; amounts are computed, not padded.

## Key fact that shrinks the ask: buyer == seller

The `onchainos` TEE buyer wallet and our seller `payTo` are the SAME address
`0x75d00a2713565171f33216e5aa2a375e076ecf69` on every EVM chain. An EIP-3009
`transferWithAuthorization` therefore moves USD₮0 from this address back to itself — a
**self-transfer, net-zero balance change**. So the USD₮0 float is NOT consumed per call:
it only has to satisfy the seller's on-chain `balanceOf >= amount` verify check for the
single most expensive call. One top-up covers the entire gauntlet plus retries.

## The request

### 1. USD₮0 float — REQUIRED
| | |
|---|---|
| To | `0x75d00a2713565171f33216e5aa2a375e076ecf69` |
| Chain | X Layer mainnet, chainId **196** (`eip155:196`) |
| Token | USD₮0 `0x779Ded0c9e1022225f8E0630b35a9b54bE713736` (6 decimals) |
| Amount | **2.0 USD₮0** (2,000,000 atomic) |
| Floor | 0.5 USD₮0 (covers the flagship avatar $0.50); 2.0 gives headroom for the $1.50 identity-studio + all retries |

### 2. Settlement gas OR facilitator creds — pick ONE path

**Path B (default, already wired — direct relayer redemption):**
| | |
|---|---|
| To | `0x1B60Cb12cE894Efc2470bB18Bf2D41755b49AB2a` (fresh relayer keypair; private key is in Vercel prod env `X402_XLAYER_RELAYER_KEY`, never committed) |
| Chain | X Layer mainnet, chainId 196 |
| Token | **OKB** (native gas) |
| Amount | **0.3 OKB** (each settle = 1 `transferWithAuthorization` tx ~80k gas; ~15–20 txs incl. retries ≪ 0.1 OKB — 0.3 is buffer) |

**Path A (recommended for WO-05 de-risk — official OKX facilitator, gasless):**
Provision from the OKX Web3 developer console and set in Vercel prod env:
`OKX_API_KEY`, `OKX_SECRET_KEY`, `OKX_PASSPHRASE`. This routes verify/settle through
`https://web3.okx.com/api/v6/pay/x402/*` — the exact path an OKX marketplace buyer (and the
listing reviewer) uses. Facilitator sponsors gas, so **no OKB needed** if this is provided.
Path B still runs as fallback and produces a real on-chain tx either way.

### 3. Legacy-rail regression (case 7) — Solana — REQUIRED for that one case
| | |
|---|---|
| To | `9PirGw9wVLLNFgVyjgAt5jvuFQwJ3pYUBWt9n3vZfnyc` (our TEE Solana wallet) |
| Token | USDC SPL `EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v` |
| Amount | **0.10 USDC** + **0.02 SOL** (gas / ATA rent; the Solana accept sets a feePayer sponsor so SOL may be unused, 0.02 insures it) |

## Total to send
- **2.0 USD₮0** → `0x75d0…cf69` (X Layer)
- **0.3 OKB** → `0x1B60…AB2a` (X Layer)  *(skip if providing OKX creds instead)*
- **0.10 USDC + 0.02 SOL** → `9PirGw…fnyc` (Solana)

≈ **$2.10 of stablecoin + ~$0.3 gas**. Everything above cost, one-time float (self-transfer).

## What runs the moment funds land
Cases 2 (text-to-3d $0.01), 3 (avatar $0.50, skeleton-verified), 4 (on-chain settlement tx
capture), 5a/b/c (replay / tampered-amount / stale-challenge), 6 (pay-only-on-success), 7
(Solana legacy). Full gauntlet, individually, against production.

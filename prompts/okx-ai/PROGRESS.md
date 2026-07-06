# OKX.AI Launch — Progress Log

Handoff file for the work-order sequence in this directory. Each session appends a dated
entry: what was done, what was verified, what's blocked, what's next. (Created by the
Work Order 04 session — no earlier entries existed because no earlier work order has run.)

---

## 2026-07-06 — Work Order 04 session: NO-GO, preconditions not met

**Outcome: Work Order 04 (e2e real payment test) cannot run. Work Orders 01, 02, and 03
have not been executed.** No code was changed and no money was spent this session.

### Precondition audit (all checks failed)

1. **`specs/okx-agent-payments.md` does not exist** (WO 01 deliverable). `specs/` contains
   no OKX-related file.
2. **No X Layer / OKX rail in the payment code** (WO 02 deliverable). A repo-wide grep of
   `api/` for `eip155:196`, `xlayer`, the marketplace fee token `0x779ded0c…3736`, and
   `facilitatorAddress` returns zero hits. `paymentRequirements()` in
   `api/_lib/x402-spec.js` is unchanged from the state described in 00-CONTEXT.
3. **Production confirms it.** Live probe of `https://three.ws/api/mcp-3d` (unpaid
   `tools/call`) returned HTTP 401 with an x402 v2 `PAYMENT-REQUIRED` challenge whose
   `accepts` array offers ONLY Solana mainnet (USDC + $THREE). No `eip155:196` entry, no
   OKX facilitator, no fee-token asset. This is byte-for-byte the rejection cause from
   2026-07-04. Evidence: `e2e-evidence/00-precondition-probe-headers.txt` and
   `e2e-evidence/00-precondition-probe-402-body.json`.
4. **No micro-priced service decomposition** (WO 03 deliverable). The gauntlet's target
   services ($0.01 Text→3D, $0.50 Text→Rigged Avatar on the OKX rail) do not exist; the
   live challenge prices are the pre-existing Solana ones.
5. **Misleading commit in history:** `839c9a654` is titled "feat: Implement OKX Agent
   Payments Protocol integration and service decomposition" but its diff contains ONLY the
   `prompts/okx-ai/*` and `prompts/gcp-credits/*` work-order documents — zero
   implementation. Do not trust that title when auditing state.

### What WAS verified (useful for the next sessions)

- Session preflight passes: `onchainos` v4.2.0, wallet logged in as `claude@three.ws`
  (account `31889ded-f1dc-47b0-8fc3-dc4f813984fd`).
- **Buyer TEE wallet EVM address is `0x75d00a2713565171f33216e5aa2a375e076ecf69` on every
  EVM chain — identical to our seller `payTo` / owner wallet from 00-CONTEXT.** The WO 04
  e2e test will therefore be a literal self-payment (same address both sides). Settlement
  verification must key on the facilitator-mediated transfer events, not naive
  from≠to assumptions; funding math also collapses to fee-token-for-fees + gas.
- Production endpoint is up, emits well-formed x402 v2 challenges, and advertises Bazaar
  discovery metadata — the existing Solana rail is healthy (good sign for WO 04 case 7,
  legacy-rail regression).

### Blocked on / next

- **Dispatch Work Order 01 (`01-protocol-research.md`) next**, then 02, then 03, in order.
  Only then re-run 04.
- No funding request was presented to the owner: the amounts in WO 04 Phase 1 depend on
  WO 03's price points, which don't exist yet. Requesting funds now would be premature.
- **GO/NO-GO for Work Order 05: NO-GO** (transitively — 04 never ran).

---

## 2026-07-06 — Work Order 01 session: COMPLETE, green-light for Work Order 02

**Outcome: Seller-side OKX Agent Payments Protocol contract fully pinned down from primary
sources. Deliverable written: [`specs/okx-agent-payments.md`](../../specs/okx-agent-payments.md).**
All 8 questions answered with citations; one real signature produced on-chain-ready; funding
is the only blocker to a fully-successful paid leg.

### What was done / verified

- **Reverse-engineered THREE live approved A2MCP sellers** (mandatory evidence): Onchain Data
  Explorer #2023 (174 sales), CoinAnk OpenAPI #2013 (818 sales), OKB Monitoring #3837. Captured
  each 402 verbatim, decoded, and diffed to derive the required-vs-optional field matrix.
- **Executed a real payment leg** from our wallet: `onchainos payment pay` signed a valid
  EIP-3009 authorization (leg 1 real, header `PAYMENT-SIGNATURE`). Replay returned
  `402 error:"insufficient_balance"` — proving the seller→facilitator verify path is live and
  does an on-chain balance check (leg 2 real, just unfunded). Full captures in spec Appendix D.
- **Read the official OKX Payments SDK** (`github.com/okx/payments`, Apache-2.0, published on
  npm as `@okxweb3/app-x402-*@0.2.0`, pure-TS ⇒ Vercel-safe). Extracted the facilitator
  endpoints, HMAC auth, header codecs, and a concrete seller wiring example.

### Answers that unblock WO 02 (details + citations in the spec)

- **Header divergence (the核心 delta):** buyer sends **`PAYMENT-SIGNATURE`** (not vanilla
  x402's `X-PAYMENT`); success receipt is **`PAYMENT-RESPONSE`** (not `X-PAYMENT-RESPONSE`).
- **Challenge:** `PAYMENT-REQUIRED` header (base64) + body; per-accept required fields =
  `scheme, network:"eip155:196", asset(USD₮0 0x779ded…), payTo, amount, maxTimeoutSeconds,
  extra.name:"USD₮0", extra.version:"1"`. `extra` uses `transferMethod` (NOT
  `assetTransferMethod`) and carries NO `decimals`. No Bazaar extensions.
- **Required scheme:** `exact` (EIP-3009) — the only one all 3 sellers share. `aggr_deferred`
  optional/recommended. `upto` unneeded (and needs a Permit2 approve + facilitatorAddress).
- **Facilitator:** `https://web3.okx.com/api/v6/pay/x402/{verify,settle,supported,settle/status}`,
  body `{x402Version:2, paymentPayload, paymentRequirements[, syncSettle]}`, auth = OKX REST
  **HMAC-SHA256** (`OK-ACCESS-KEY/SIGN/TIMESTAMP/PASSPHRASE`).
- **Gating level:** OKX validates **HTTP-level 402** on the endpoint URL — our current
  MCP-level `_meta` PaymentRequired is invisible to it. 02 must add an HTTP-402 transport gate.
- **Fee token:** USD₮0 `0x779Ded0c9e1022225f8E0630b35a9b54bE713736`, symbol USDT, 6 decimals,
  EIP-3009.
- **SDK decision:** ADOPT `@okxweb3/app-x402-core` + `@okxweb3/app-x402-evm` for the X-Layer
  rail (thin `HTTPAdapter` over our bare Vercel `req/res`); keep `api/_lib/x402-spec.js` for
  Solana/Base/BSC. 12-item gap list is spec §4 (that's 02's work-list).

### Blocked on / next (raise with owner)

1. **OKX API credentials** — the facilitator verify/settle needs `OKX_API_KEY`,
   `OKX_SECRET_KEY`, `OKX_PASSPHRASE` from the OKX Web3 developer console. Without them every
   `/verify`/`/settle` fails auth. Owner must provision. **(Blocks WO 02 runtime + WO 04.)**
2. **Funding for a fully-successful paid leg** — fund `0x75d00a2713565171f33216e5aa2a375e076ecf69`
   on **X Layer (chainId 196)** with **USD₮0** (`0x779ded…713736`). Min 15 atomic (0.000015)
   to pay oklink's cheapest call; recommend **~1.0 USD₮0 (1,000,000 atomic)** for buffer.
   EIP-3009 is gasless for the payer, so no OKB strictly required (optional ~0.5 OKB dust).
   Current X-Layer balance = 0.
3. **One UNRESOLVED item** (spec Q7): the exact HTTP method/body the *automated* listing
   validator sends is undocumented — 02 should register, run
   `onchainos agent x402-check --endpoint https://three.ws/api/mcp-3d`, and confirm
   `valid:true` before resubmitting. Not a blocker; a verification step.

### GO/NO-GO

- **Work Order 02: GO** — spec is the implementation contract; §4 is the field-by-field
  work-list. Two owner-provisioning items above should be requested in parallel with 02's code
  (credentials block runtime/testing, not the code changes themselves).

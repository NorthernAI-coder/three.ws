# OKX Agent Payments Protocol — Seller-Side Contract (three.ws A2MCP)

> **Status:** Research complete. Green-light for Work Order 02.
> **Chain:** X Layer mainnet, `eip155:196` (chainId 196).
> **Our payTo:** `0x75d00a2713565171f33216e5aa2a375e076ecf69` (agent #2632 owner wallet).
> **Fee token:** USD₮0 `0x779Ded0c9e1022225f8E0630b35a9b54bE713736` (6 decimals, EIP-3009).
> **Why this exists:** Our A2MCP endpoint ([api/mcp-3d.js](../api/mcp-3d.js)) emits x402 accepts for Solana/Base/BSC/Arbitrum only — never `eip155:196`, never the OKX fee token, never the `PAYMENT-SIGNATURE`/`aggr_deferred` OKX dialect. That is the exact reason agent #2632 was rejected on 2026-07-04. This spec pins the seller-side contract from **primary sources** so 02 can implement it without opening a browser.

This is a load-bearing contract in the sense of `specs/README.md`: 02's implementation is validated against §1 (the challenge shape) and §4 (the gap list). Every claim carries a citation. Anything not verifiable from a primary source is marked **UNRESOLVED**.

**Primary sources used (all cited inline below):**

- **SDK-REPO** — `github.com/okx/payments`, the official **OKX Payments SDK** (Apache-2.0, cloned & read 2026-07-06). Paths below are relative to `typescript/bu-payments/`.
- **WIRE-OKLINK** — live 402 + paid replay from **Onchain Data Explorer** (agent #2023, 174 sales, approvalStatus 4), endpoint `https://www.oklink.com/api/v5/explorer/mcp/x402/get_chain_info`. Captured 2026-07-06 (Appendix A).
- **WIRE-COINANK** — live 402 from **CoinAnk OpenAPI** (agent #2013, 818 sales, approvalStatus 4), `https://open-api.coinank.com/api/etf/getUsBtcEtf` (Appendix B).
- **WIRE-OKB** — live 402 from **OKB Monitoring** (agent #3837, approvalStatus 4), `https://okb.swaper.money/x402/digest` (Appendix C).
- **PAY-LEG1/2** — real `onchainos payment pay` signing + paid replay from our own wallet (Appendix D).
- **SKILL** — repo client-side skill `.claude/skills/okx-agent-payments-protocol/` (buyer constraints).

---

## 1. Seller contract — what OUR endpoint must emit

### 1.1 The 402 challenge (concrete, with our values)

On an unpaid request to a paid A2MCP resource, respond `HTTP 402` with:

- Header **`PAYMENT-REQUIRED`**: base64 of the JSON body below.
- Header **`Access-Control-Expose-Headers: PAYMENT-REQUIRED`** (so browser/agent clients behind CORS can read it — WIRE-OKLINK sets this).
- Body: the same JSON (SDK emits the challenge in both the header and, on the resource server, the body).

```json
{
  "x402Version": 2,
  "resource": {
    "url": "https://three.ws/api/mcp-3d",
    "mimeType": "application/json"
  },
  "accepts": [
    {
      "scheme": "exact",
      "network": "eip155:196",
      "amount": "15",
      "payTo": "0x75d00a2713565171f33216e5aa2a375e076ecf69",
      "maxTimeoutSeconds": 86400,
      "asset": "0x779ded0c9e1022225f8e0630b35a9b54be713736",
      "extra": { "name": "USD₮0", "version": "1", "symbol": "USDT", "transferMethod": "eip3009" }
    },
    {
      "scheme": "aggr_deferred",
      "network": "eip155:196",
      "amount": "15",
      "payTo": "0x75d00a2713565171f33216e5aa2a375e076ecf69",
      "maxTimeoutSeconds": 86400,
      "asset": "0x779ded0c9e1022225f8e0630b35a9b54be713736",
      "extra": { "name": "USD₮0", "version": "1", "symbol": "USDT", "transferMethod": "eip3009" }
    }
  ]
}
```

`amount` is atomic units of USD₮0 (6 decimals). `"15"` = $0.000015 (the exact price Onchain Data Explorer charges for `get_chain_info`; WIRE-OKLINK). Set per-service in 03.

**Field requirement matrix** (present in ALL three approved sellers ⇒ required; present in some ⇒ optional). Diff of WIRE-OKLINK ∩ WIRE-COINANK ∩ WIRE-OKB:

| Field | Required? | Value / notes |
|---|---|---|
| `x402Version` | ✅ required | `2` (OKB uses `1` — legacy still accepted, but emit `2`; SDK hardcodes `2`, SDK-REPO `facilitator/OKXFacilitatorClient.ts:98`). |
| `accepts[].scheme` | ✅ required | `"exact"` present in all three. `"aggr_deferred"` in 2/3 (optional). `"upto"` in **none**. |
| `accepts[].network` | ✅ required | `"eip155:196"` in all three. **This is the field we don't emit — root cause of rejection.** |
| `accepts[].asset` | ✅ required | `0x779ded…713736` (USD₮0) in all three. |
| `accepts[].payTo` | ✅ required | Seller receiving address. Ours: `0x75d00a2713565171f33216e5aa2a375e076ecf69`. |
| `accepts[].amount` (v2) / `maxAmountRequired` (v1) | ✅ required | Atomic USD₮0 string. |
| `accepts[].maxTimeoutSeconds` | ✅ required | Seen `86400` / `300` / `300`. Use `86400` (oklink) or any ≥ a few minutes; it bounds `validBefore`. |
| `accepts[].extra.name` | ✅ required (EIP-3009) | `"USD₮0"` — the token's **EIP-712 domain name**. Must byte-match the on-chain domain separator or the facilitator computes the wrong hash and rejects the signature. |
| `accepts[].extra.version` | ✅ required (EIP-3009) | `"1"` — EIP-712 domain version. |
| `accepts[].extra.symbol` | ⬜ optional | `"USDT"`. Only WIRE-OKLINK emits it. Display hint. |
| `accepts[].extra.transferMethod` | ⬜ optional | `"eip3009"`. Only WIRE-OKLINK emits it. Default is EIP-3009 when absent (SDK `assetTransferMethod` only set for permit2 tokens; `defaultAssets.ts`). |
| `accepts[].extra.decimals` | ⬜ optional | `6`. Only WIRE-OKB (v1) puts it in `extra`; v2 sellers omit it (decimals come from the default-asset registry). |
| `resource.url` | ✅ required | Absolute URL of the paid resource. |
| `resource.mimeType` | ⬜ optional | `"application/json"` (WIRE-OKLINK). WIRE-COINANK omits it. |
| top-level `error` | conditional | Added only on a rejected paid replay (e.g. `"insufficient_balance"`); the full `accepts` is re-emitted so the client can retry. See PAY-LEG2 / Appendix D. |

Notes vs. our current Bazaar-heavy body: OKX sellers emit **no** `extensions.bazaar`, **no** `builder-code`, **no** `offer-receipt`, **no** per-accept `description`. The OKX validator does not require them; keep the body minimal for the `eip155:196` accepts.

### 1.2 Verify → do-work → settle (seller → OKX facilitator)

On a request that carries the payment header, the seller calls the **OKX facilitator** (HMAC-authed, see §Q4) and only does the work after `/verify` passes:

```
1. header = req.header("PAYMENT-SIGNATURE")          // NOT X-PAYMENT (OKX divergence)
2. paymentPayload = JSON.parse(base64url_decode(header))
3. requirement  = the accepts[] entry matching paymentPayload.accepted (network+scheme+asset)
4. POST https://web3.okx.com/api/v6/pay/x402/verify
     headers: OK-ACCESS-KEY / OK-ACCESS-SIGN / OK-ACCESS-TIMESTAMP / OK-ACCESS-PASSPHRASE
     body:    { x402Version: 2, paymentPayload, paymentRequirements: requirement }
   → { code, msg, data: { isValid, invalidReason?, invalidMessage?, payer? } }
   If !isValid → re-emit the 402 with top-level error = invalidReason (see PAY-LEG2).
5. Run the tool / produce the resource body.
6. POST https://web3.okx.com/api/v6/pay/x402/settle   (same auth + body, optional syncSettle)
   → { code, msg, data: { success, status, transaction, network, payer, amount? } }
7. Attach header PAYMENT-RESPONSE = base64(JSON.stringify(settleResponse)) to the 200.
```

Source: SDK-REPO `app-x402-core/src/facilitator/OKXFacilitatorClient.ts` (verify L92-115, settle L124-150), `app-x402-core/src/http/x402HTTPResourceServer.ts` (header read L1560, `PAYMENT-RESPONSE` emit L1663-1676), `app-x402-core/src/http/index.ts` (base64 codecs L17-80). Live-confirmed by PAY-LEG1/2.

### 1.3 The paid-replay header (buyer → seller)

The buyer replays the original request adding **`PAYMENT-SIGNATURE: <base64 PaymentPayload>`**. The decoded payload we must accept (from PAY-LEG1, our real signature):

```json
{
  "x402Version": 2,
  "resource": { "mimeType": "application/json", "url": "https://www.oklink.com/api/v5/explorer/mcp/x402/get_chain_info" },
  "accepted": {
    "scheme": "exact", "network": "eip155:196", "amount": "15",
    "asset": "0x779ded0c9e1022225f8e0630b35a9b54be713736",
    "payTo": "0xa7e37604ebab94408159e405033a455f820fd987",
    "maxTimeoutSeconds": 86400,
    "extra": { "name": "USD₮0", "symbol": "USDT", "transferMethod": "eip3009", "version": "1" }
  },
  "payload": {
    "authorization": {
      "from": "0x75d00a2713565171f33216e5aa2a375e076ecf69",
      "to":   "0xa7e37604ebab94408159e405033a455f820fd987",
      "value": "15", "validAfter": "0", "validBefore": "1783455107",
      "nonce": "0x20ea1abd9c8d9ee9c4e0a861071475061ffebf07076eec8fa6d963f2a8957253"
    },
    "signature": "0x88c64c51…3d37891c"
  }
}
```

The seller passes `payload` + the matching `accepted` (as `paymentRequirements`) straight to the facilitator — it does not re-derive the EIP-712 hash itself. Header name is read case-insensitively (`payment-signature` OR `PAYMENT-SIGNATURE`; SDK `x402HTTPResourceServer.ts:1560`).

### 1.4 Settlement receipt (seller → buyer)

On success attach `PAYMENT-RESPONSE` (base64 of the `SettleResponse`). Shape (SDK `types/facilitator.ts:26-38`):

```json
{ "success": true, "status": "success", "transaction": "0x…", "network": "eip155:196", "payer": "0x75d0…cf69", "amount": "15" }
```

- `status: "success"` when settled with `syncSettle:true` (facilitator waited for on-chain confirmation).
- `status: "pending"` (default, `syncSettle` unset/false) — facilitator accepted, tx settles async; seller may confirm later via `GET /api/v6/pay/x402/settle/status?txHash=…`.
- `status: "timeout"` — on-chain confirmation timed out.

---

## 2. Answer table — the 8 questions

| # | Question | Answer | Citation |
|---|---|---|---|
| 1 | Exact 402 challenge shape the validator accepts | Header **`PAYMENT-REQUIRED`** = base64 JSON `{x402Version:2, resource:{url,mimeType?}, accepts:[…]}`. Per-`accepts` **required**: `scheme, network:"eip155:196", asset(USD₮0), payTo, amount, maxTimeoutSeconds, extra.name, extra.version`. `extra.symbol`/`extra.transferMethod`/`resource.mimeType` optional. No Bazaar/extensions needed. Full matrix §1.1. | WIRE-OKLINK/COINANK/OKB (Appx A-C); SDK `http/index.ts:40`, `x402HTTPResourceServer.ts:1101` |
| 2 | Which scheme(s) mandatory for listing | **`exact` (EIP-3009) is the one required scheme** — present in all 3 approved sellers. `aggr_deferred` is offered by 2/3 (optional, recommended as a second accept). **`upto` is offered by none** and is NOT needed for approval. `upto` (if ever added) requires `extra.facilitatorAddress`, which the seller must fetch from the facilitator's `/supported.signers` — it cannot be hardcoded. | WIRE-* diff; SDK `upto/facilitator/scheme.ts:29-39`, `upto/client/permit2.ts:32-38`; SKILL `accepts-schemes.md` |
| 3 | Fee token `0x779Ded…713736` on X Layer | **Symbol `USDT`, name `USD₮0`, decimals `6`, EIP-3009 capable** (supports `transferWithAuthorization`). Community-recognized. Not permit2-only — the whole rail uses EIP-3009. | `onchainos token info` (Appx E); SDK `defaultAssets.ts` `DEFAULT_STABLECOINS["eip155:196"]` comment "(EIP-3009)"; live EIP-3009 sign accepted structurally by facilitator (PAY-LEG1/2) |
| 4 | OKX facilitator verify/settle URLs, shapes, auth | Base `https://web3.okx.com`. **`POST /api/v6/pay/x402/verify`**, **`POST /api/v6/pay/x402/settle`**, `GET /api/v6/pay/x402/supported`, `GET /api/v6/pay/x402/settle/status?txHash=`. Body `{x402Version:2, paymentPayload, paymentRequirements[, syncSettle]}`. Responses wrapped `{code,msg,data}`. **Auth = OKX REST HMAC-SHA256**: headers `OK-ACCESS-KEY`, `OK-ACCESS-SIGN`(=base64(HMAC-SHA256(secret, timestamp+method+path+body))), `OK-ACCESS-TIMESTAMP`(ISO-8601), `OK-ACCESS-PASSPHRASE`. **⇒ We need an OKX API key/secret/passphrase.** `upto`'s `extra.facilitatorAddress` = `supported.signers[family][0]` via `getExtra()`. | SDK `facilitator/OKXFacilitatorClient.ts` (all endpoints + `createHeaders` L60-76); `upto/facilitator/scheme.ts:39` |
| 5 | The official OKX Payment SDK | **`github.com/okx/payments` = "OKX Payments SDK", Apache-2.0.** Published on npm: `@okxweb3/app-x402-core`, `@okxweb3/app-x402-evm`, `@okxweb3/app-x402-next`, `@okxweb3/app-x402-express` — all **v0.2.0**. Pure TypeScript (`fetch` + `node:crypto`, no native bindings) ⇒ **runs in Vercel functions**. Seller-side it: builds the 402 challenge (`x402ResourceServer`+`ExactEvmScheme`), reads `PAYMENT-SIGNATURE`, calls facilitator verify/settle, emits `PAYMENT-RESPONSE`. `@okxweb3/app-x402-next` ships `withX402` (API-route wrapper) + `paymentProxy` (middleware). | SDK-REPO README + `package.json` names; `npm view @okxweb3/app-x402-next version` → `0.2.0`; `app-x402-next/README.md` |
| 6 | HTTP-level 402 vs MCP-level PaymentRequired | OKX expects **HTTP-level 402** on the endpoint URL: real `HTTP/2 402` status + `PAYMENT-REQUIRED` header, paid replay via `PAYMENT-SIGNATURE` header. All 3 approved sellers do HTTP-level. **Our current MCP-level `_meta` PaymentRequired (structuredContent) is NOT what OKX reads** — the validator/buyer never inspects JSON-RPC `_meta`. 02 must add an HTTP-402 gate at the transport layer of `api/mcp-3d.js`. (oklink's endpoints are "MCP" by name but gate at HTTP: `POST` → 402, headers carry payment; see Appx A.) | WIRE-OKLINK (POST→402, GET→405); [api/mcp-3d.js](../api/mcp-3d.js) `_meta` path; SDK is HTTP-transport only |
| 7 | How listing review validates the endpoint | The seller registers each service with an **`endpoint` URL + `fee` + fee-token `contractAddress` (`0x779ded…`) + `chainIndex 196`** (see `onchainos agent service-list` output, Appx F). Approval requires the endpoint to answer the gated method (`POST` for oklink) with a `402` whose `accepts` advertise **`eip155:196` + the USD₮0 fee token** at the registered price. The `onchainos agent x402-check --endpoint` / `x402-validate` CLI is the same validator surface: it flags `"Endpoint returned HTTP 200 (not 402); not a valid x402 service"` when the gate is absent (Appx E). Our rejection ("A2MCP service has not been integrated with the OKX Agent Payments Protocol") = our endpoint never returns a `eip155:196` 402. **UNRESOLVED:** the exact HTTP method + body the automated validator sends, and any endpoint-URL format constraint, are not documented in a primary source — 02 should register, run `onchainos agent x402-check --endpoint https://three.ws/api/mcp-3d`, and confirm it reports `valid:true` before resubmitting. | `onchainos agent x402-check` (Appx E); `service-list` schema (Appx F); rejection email (00-CONTEXT) |
| 8 | Settlement finality — how seller confirms payment | Seller trusts the facilitator's responses, not its own chain read. `/verify` → `isValid:true` gates doing the work (proves the signed authorization is valid + payer funded — a broke payer gets `isValid:false` / `insufficient_balance`, proven by PAY-LEG2). `/settle` → `{success, status}`: `syncSettle:true` ⇒ `status:"success"` (on-chain confirmed before responding); default async ⇒ `status:"pending"` (safe to release; poll `/settle/status?txHash` for finality). The `PAYMENT-RESPONSE` header carries `{success,status,transaction,payer,amount}` to the buyer. | SDK `OKXFacilitatorClient.ts` settle L124-150 + `syncSettle` docstring; `types/facilitator.ts:26-38`; PAY-LEG2 |

---

## 3. SDK decision — adopt `@okxweb3/app-x402-*` (with a thin adapter)

**Decision: ADOPT the OKX Payments SDK for the OKX/X-Layer rail; keep our existing `api/_lib/x402-spec.js` for the Solana/Base/BSC rails.** Do not hand-roll the OKX dialect.

Per CLAUDE.md "Open-source first" checklist:

| Criterion | Finding | Verdict |
|---|---|---|
| Solves the problem | Yes — builds the exact `eip155:196` challenge, HMAC-signs facilitator calls, handles `exact`/`aggr_deferred`/`upto`/`period`, emits `PAYMENT-RESPONSE`. First-party, so it tracks the spec the validator enforces. | ✅ |
| Maintenance / provenance | Official OKX org (`okx/payments`), the SDK the rejection email points to. Multi-language, actively structured. v0.2.0 (early but first-party). | ✅ |
| License | **Apache-2.0** (`@okxweb3/app-mpp` is MIT). Compatible with our commercial use. | ✅ |
| Vercel compatibility | Pure TS, deps are `fetch` + `node:crypto` + `viem`-class EVM libs; no native addons. `@okxweb3/app-x402-next` targets Next/serverless directly. | ✅ |
| Weekly downloads | Low (v0.2.0, new package, published ~2026-07). Mitigated by first-party status + our own tests. **UNRESOLVED exact number** — `npm view` returns version but the registry download-count API wasn't queried; treat as "new, first-party, low adoption." | ⚠️ acceptable |

**Adoption shape for 02:** our endpoint is a bare Vercel function (`api/mcp-3d.js`, Node `req/res`), not a Next.js app-router route, so `withX402` (needs `NextRequest`/`NextResponse`) is not a drop-in. Use the framework-agnostic core: `@okxweb3/app-x402-core` (`x402ResourceServer`, `OKXFacilitatorClient`, the `HTTPAdapter` interface, header codecs) + `@okxweb3/app-x402-evm` (`ExactEvmScheme`). Write a ~30-line `HTTPAdapter` over our Node `req`. This gives the OKX 402/verify/settle for `eip155:196` alongside our current multi-chain `paymentRequirements()` for the other rails. Reference seller wiring: SDK `demo/x402/src/index.ts` (Express) and `app-x402-next/README.md` (`withX402`).

**Env we must add:** `OKX_API_KEY`, `OKX_SECRET_KEY`, `OKX_PASSPHRASE` (facilitator HMAC), plus the payTo already known. **Blocker for 02:** these OKX API credentials must be provisioned by the owner from the OKX Web3 developer console. Without them every `/verify` and `/settle` fails auth. → raised in PROGRESS.

---

## 4. Gap analysis — `paymentRequirements()` today vs. what OKX requires (02's work list)

Reference: [api/_lib/x402-spec.js](../api/_lib/x402-spec.js) `paymentRequirements()` (L162-232) and `buildExactRequirements()` (L362-398).

| # | What we emit today | What OKX requires | Action for 02 |
|---|---|---|---|
| G1 | Accepts for `NETWORK_SOLANA_MAINNET`, `NETWORK_BASE_MAINNET`, `NETWORK_BSC_MAINNET`, `NETWORK_ARBITRUM_MAINNET`. **No `eip155:196`.** | An `accepts` entry with `network:"eip155:196"`. | Add `NETWORK_XLAYER_MAINNET = "eip155:196"` and an X-Layer branch (behind an env like `X402_PAY_TO_XLAYER`). |
| G2 | `asset` = USDC on Solana/Base; `X402_ASSET_ADDRESS_BASE`. | `asset` = `0x779ded0c9e1022225f8e0630b35a9b54be713736` (USD₮0). | Hardcode/env the USD₮0 mint for the X-Layer accept. |
| G3 | `extra: { name, decimals }` (Base) / `{ name, decimals, feePayer }` (Solana). | `extra: { name:"USD₮0", version:"1" }` (+ optional `symbol`,`transferMethod`). **No `decimals` in extra; `version` is required.** | New `extra` builder for the X-Layer accept: `name`+`version` mandatory, drop `decimals`. |
| G4 | Field name `extra.assetTransferMethod` (permit2 path). | OKX exact uses `extra.transferMethod:"eip3009"` (or omit → EIP-3009 default). | Emit `transferMethod` (optional) — do NOT emit `assetTransferMethod` on the X-Layer accept. |
| G5 | Schemes `exact` (EIP-3009/permit2) + `direct` (BSC). **No `aggr_deferred`.** | `exact` mandatory; `aggr_deferred` recommended 2nd accept. | Emit `exact` for X-Layer; optionally add `aggr_deferred` accept (SDK `ExactEvmScheme`/aggr scheme). |
| G6 | Facilitator routing = CDP / PayAI / self / BSC-direct (`facilitatorFor()`). **No OKX facilitator.** | verify/settle at `https://web3.okx.com/api/v6/pay/x402/{verify,settle}` with HMAC auth. | Add an `OKXFacilitatorClient` route for `eip155:196` (adopt SDK, §3). |
| G7 | Payment header read = **`X-PAYMENT`** (`decodePaymentHeader`, `verifyPayment`). | Buyer sends **`PAYMENT-SIGNATURE`**. | On the X-Layer path read `PAYMENT-SIGNATURE` (case-insensitive). Keep `X-PAYMENT` for the other rails. |
| G8 | Success receipt = **`X-PAYMENT-RESPONSE`** (`encodePaymentResponseHeader`, L1122). | **`PAYMENT-RESPONSE`** header. | Emit `PAYMENT-RESPONSE` on the X-Layer success reply. |
| G9 | Gating is **MCP-level** via `_meta` structuredContent in [api/mcp-3d.js](../api/mcp-3d.js). | **HTTP-level 402** on the endpoint URL. | Add an HTTP-402 gate at the transport layer (before/around the JSON-RPC handler) for the registered A2MCP resource URLs. |
| G10 | Body carries `extensions.bazaar` + `builder-code` + `offer-receipt`. | OKX sellers emit none of these on the `eip155:196` accepts. | Keep the OKX accept body minimal (`x402Version/resource/accepts`); don't attach Bazaar extensions to it. |
| G11 | Facilitator auth = CDP JWT / bearer token. | OKX HMAC needs `OKX_API_KEY`/`OKX_SECRET_KEY`/`OKX_PASSPHRASE`. | Provision + wire the three env vars (owner blocker). |
| G12 | `maxTimeoutSeconds: 60`. | Approved sellers use `86400`/`300`. | Use ≥ ~300 on X-Layer (bounds `validBefore`); `86400` matches oklink. |

**Non-goals for 02** (explicitly out of scope): the WWW-Authenticate `charge`/`session` MPP rail (CoinAnk offers it, but `exact` alone passes approval) and `period`/subscription. `upto` is unnecessary and adds a Permit2 approve step. Ship `exact` (+ optional `aggr_deferred`) only.

---

## Appendix — raw captures (verbatim, dated 2026-07-06)

### A. WIRE-OKLINK — Onchain Data Explorer #2023 (174 sales), `get_chain_info`

`GET` → `HTTP/2 405 {"code":"405","msg":"Method Not Allowed"}`. `POST {}` → `HTTP/2 402`:

```
payment-required: eyJ4NDAyVmVyc2lvbiI6MiwicmVzb3VyY2UiOnsidXJsIjoiaHR0cHM6Ly93d3cub2tsaW5rLmNvbS9hcGkvdjUvZXhwbG9yZXIvbWNwL3g0MDIvZ2V0X2NoYWluX2luZm8iLCJtaW1lVHlwZSI6ImFwcGxpY2F0aW9uL2pzb24ifSwiYWNjZXB0cyI6W3sic2NoZW1lIjoiZXhhY3QiLCJuZXR3b3JrIjoiZWlwMTU1OjE5NiIsImFtb3VudCI6IjE1IiwicGF5VG8iOiIweGE3ZTM3NjA0ZWJhYjk0NDA4MTU5ZTQwNTAzM2E0NTVmODIwZmQ5ODciLCJtYXhUaW1lb3V0U2Vjb25kcyI6ODY0MDAsImFzc2V0IjoiMHg3NzlkZWQwYzllMTAyMjIyNWY4ZTA2MzBiMzVhOWI1NGJlNzEzNzM2IiwiZXh0cmEiOnsic3ltYm9sIjoiVVNEVCIsInZlcnNpb24iOiIxIiwidHJhbnNmZXJNZXRob2QiOiJlaXAzMDA5IiwibmFtZSI6IlVTROKCrjAifX0seyJzY2hlbWUiOiJhZ2dyX2RlZmVycmVkIiwibmV0d29yayI6ImVpcDE1NToxOTYiLCJhbW91bnQiOiIxNSIsInBheVRvIjoiMHhhN2UzNzYwNGViYWI5NDQwODE1OWU0MDUwMzNhNDU1ZjgyMGZkOTg3IiwibWF4VGltZW91dFNlY29uZHMiOjg2NDAwLCJhc3NldCI6IjB4Nzc5ZGVkMGM5ZTEwMjIyMjVmOGUwNjMwYjM1YTliNTRiZTcxMzczNiIsImV4dHJhIjp7InN5bWJvbCI6IlVTRFQiLCJ2ZXJzaW9uIjoiMSIsInRyYW5zZmVyTWV0aG9kIjoiZWlwMzAwOSIsIm5hbWUiOiJVU0Tigq4wIn19XX0=
access-control-expose-headers: PAYMENT-REQUIRED
```

Decoded body:

```json
{"x402Version":2,"resource":{"url":"https://www.oklink.com/api/v5/explorer/mcp/x402/get_chain_info","mimeType":"application/json"},"accepts":[{"scheme":"exact","network":"eip155:196","amount":"15","payTo":"0xa7e37604ebab94408159e405033a455f820fd987","maxTimeoutSeconds":86400,"asset":"0x779ded0c9e1022225f8e0630b35a9b54be713736","extra":{"symbol":"USDT","version":"1","transferMethod":"eip3009","name":"USD₮0"}},{"scheme":"aggr_deferred","network":"eip155:196","amount":"15","payTo":"0xa7e37604ebab94408159e405033a455f820fd987","maxTimeoutSeconds":86400,"asset":"0x779ded0c9e1022225f8e0630b35a9b54be713736","extra":{"symbol":"USDT","version":"1","transferMethod":"eip3009","name":"USD₮0"}}]}
```

### B. WIRE-COINANK — CoinAnk OpenAPI #2013 (818 sales), `getUsBtcEtf`

`GET` → `HTTP/2 402`. Emits BOTH `payment-required` (v2, 4 accepts) AND four `WWW-Authenticate: Payment` headers (MPP charge+session × two currencies USDG/USD₮0). `payment-required` decoded:

```json
{"x402Version":2,"accepts":[
 {"x402Version":2,"scheme":"exact","network":"eip155:196","amount":"1000","asset":"0x4ae46a509f6b1d9056937ba4500cb143933d2dc8","payTo":"0xb1257e75791baa36646113d8b1fdfc83b3e2d0b7","maxTimeoutSeconds":300,"extra":{"name":"Global Dollar","version":"1"}},
 {"x402Version":2,"scheme":"exact","network":"eip155:196","amount":"1000","asset":"0x779ded0c9e1022225f8e0630b35a9b54be713736","payTo":"0xb1257e75791baa36646113d8b1fdfc83b3e2d0b7","maxTimeoutSeconds":300,"extra":{"name":"USD₮0","version":"1"}},
 {"x402Version":2,"scheme":"aggr_deferred","network":"eip155:196","amount":"1000","asset":"0x4ae46a509f6b1d9056937ba4500cb143933d2dc8","payTo":"0xb1257e75791baa36646113d8b1fdfc83b3e2d0b7","maxTimeoutSeconds":300,"extra":{"name":"Global Dollar","version":"1"}},
 {"x402Version":2,"scheme":"aggr_deferred","network":"eip155:196","amount":"1000","asset":"0x779ded0c9e1022225f8e0630b35a9b54be713736","payTo":"0xb1257e75791baa36646113d8b1fdfc83b3e2d0b7","maxTimeoutSeconds":300,"extra":{"name":"USD₮0","version":"1"}}],
 "resource":{"url":"https://open-api.coinank.com/api/etf/getUsBtcEtf"}}
```

`WWW-Authenticate` charge `request` decoded: `{"amount":"1000","currency":"0x779ded…713736","recipient":"0xb1257e…d0b7","methodDetails":{"chainId":196,"feePayer":true}}`.
Session `request` decoded: adds `"escrowContract":"0x5E550002e64FaF79B41D89fE8439eEb1be66CE3b","minVoucherDelta":"10000"` and `"suggestedDeposit":"100000"`. (MPP rail — out of scope for 02.)

### C. WIRE-OKB — OKB Monitoring #3837, `/x402/digest`

Both `GET` and `POST` → `HTTP/2 402`, body (note **`x402Version:1`**, `maxAmountRequired`, per-accept `decimals`/`description`):

```json
{"x402Version":1,"accepts":[{"scheme":"exact","network":"eip155:196","asset":"0x779ded0c9e1022225f8e0630b35a9b54be713736","decimals":6,"maxAmountRequired":"10000","payTo":"0x0921f7fcbc93984c2a4d29b4079f97840184365b","resource":"https://okb.swaper.money/x402/digest","description":"OKB X Layer monitor — OKB X Layer daily anomaly digest (alerts + metrics + report)","mimeType":"application/json","maxTimeoutSeconds":300,"extra":{"name":"USD₮0","version":"1"}}]}
```

### D. PAY-LEG1/2 — real payment from our wallet `0x75d0…cf69`

**Leg 1** — `onchainos payment pay --payload <oklink 402> --selected-index 0` →
`{ok:true, data:{ header_name:"PAYMENT-SIGNATURE", scheme:"exact", wallet:"0x75d00a2713565171f33216e5aa2a375e076ecf69", authorization_header:"<base64>" }}`. Decoded payload in §1.3 (EIP-3009 `transferWithAuthorization`, value "15", from our wallet, to oklink's payTo, signed).

**Leg 2** — replay `POST get_chain_info` with `PAYMENT-SIGNATURE: <header>` → `HTTP/2 402`, body:

```json
{"x402Version":2,"error":"insufficient_balance","resource":{"url":"https://www.oklink.com/api/v5/explorer/mcp/x402/get_chain_info","mimeType":"application/json"},"accepts":[ …same two accepts as Appx A… ]}
```

**Interpretation:** signing succeeded (leg 1 real), and the seller's facilitator did an on-chain balance check and rejected because our X-Layer wallet holds **0 USD₮0** — proving (a) the seller→facilitator verify path is live, (b) rejection re-emits the full 402 with a top-level `error`. **Funding blocker (DoD):** to capture a fully-successful paid leg the owner must fund `0x75d00a2713565171f33216e5aa2a375e076ecf69` on **X Layer (chainId 196)** with **USD₮0** (`0x779ded…713736`). Minimum to pay oklink `get_chain_info` = **15 atomic (0.000015 USD₮0)**; recommend **~1.0 USD₮0 (1,000,000 atomic)** for buffer across test calls + the pfp-wedge work. `exact`+EIP-3009 is gasless for the payer (facilitator broadcasts, `feePayer:true`), so no OKB gas is strictly required; a small OKB dust (~0.5 OKB) is optional insurance for any self-broadcast path. `onchainos portfolio all-balances --chain xlayer --chains 196 --address 0x75d0…cf69` currently returns `data:[]`.

### E. CLI validator + token info

```
$ onchainos agent x402-check --endpoint https://x402.dappos.com/healthz
{"ok":true,"data":{"reason":"Endpoint returned HTTP 200 (not 402); not a valid x402 service.","statusCode":200,"valid":false}}

$ onchainos token info --chain xlayer --address 0x779ded0c9e1022225f8e0630b35a9b54be713736
{"chainIndex":"196","decimal":"6","tokenName":"USD₮0","tokenSymbol":"USDT","tagList":{"communityRecognized":true},
 "tokenContractAddress":"0x779ded0c9e1022225f8e0630b35a9b54be713736"}
```

### F. `onchainos agent service-list` — how a service is registered (shape)

Each A2MCP service row (from Onchain Data Explorer #2023): `{ serviceType:"A2MCP", serviceName, endpoint:"https://…", fee:"0.000015", contractAddress:"0x779ded…713736", chainIndex:196 }`. The registered `endpoint` + `fee` + fee-token `contractAddress` + `chainIndex` are what the buyer/validator matches the live 402 against.

### G. OKX Payments SDK — seller wiring (SDK-REPO `demo/x402/src/index.ts`, trimmed)

```ts
import { OKXFacilitatorClient } from "@okxweb3/app-x402-core";
import { x402ResourceServer } from "@okxweb3/app-x402-express";
import { ExactEvmScheme } from "@okxweb3/app-x402-evm/exact/server";

const facilitator = new OKXFacilitatorClient({
  apiKey: process.env.OKX_API_KEY!, secretKey: process.env.OKX_SECRET_KEY!,
  passphrase: process.env.OKX_PASSPHRASE!, baseUrl: "https://web3.okx.com",
});
const server = new x402ResourceServer(facilitator).register("eip155:196", new ExactEvmScheme());
const routes = { "POST /api/mcp-3d": {
  accepts: { scheme: "exact", network: "eip155:196",
             payTo: "0x75d00a2713565171f33216e5aa2a375e076ecf69", price: "$0.000015" },
  mimeType: "application/json" } };
// USD price → USD₮0 atomic auto-converted via DEFAULT_STABLECOINS["eip155:196"] (6 dp).
```

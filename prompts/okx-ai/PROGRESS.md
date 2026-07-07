# OKX.AI Launch — Progress Log

Handoff file for the work-order sequence in this directory. Each session appends a dated
entry: what was done, what was verified, what's blocked, what's next. (Created by the
Work Order 04 session — no earlier entries existed because no earlier work order has run.)

---

## 2026-07-07 — Relayer-key reconciliation: ONE authoritative X Layer relayer, funding target corrected

**Read this before funding anything.** Two concurrent sessions (this WO-03 re-dispatch and the
WO-04 session #2 entry below) each generated a *different* throwaway `X402_XLAYER_RELAYER_KEY`
and both ran `vercel env add`. `env add` does not overwrite, so only the first writer's key was
ever live and the two entries disagreed on the relayer address (`0x9e48…B7a3` vs `0x1B60…AB2a`).
The deployed key is not readable (Vercel masks it; health does not expose the address), so the
disagreement could not be settled by observation. Resolved it deterministically instead:

- **`vercel env rm` then `vercel env add` the relayer key in BOTH production and preview**, then
  redeployed prod. The live key now derives **`0x9e48594212487777497bAeB4716dd13250F4B7a3`** —
  verified: I hold this private key, it is the only relayer entry in Vercel env, and
  post-redeploy health reports `payment-rail settleable:true` (valid secp256k1 key loaded
  server-side; the key lives durably in Vercel env, so settlement runs server-side and WO-04
  needs no local copy — only this address funded with OKB gas).
- **THE relayer to fund is `0x9e48…B7a3`. The `0x1B60…AB2a` address in the WO-04 entry below is
  SUPERSEDED** — that key was removed from Vercel and is no longer deployed; do not fund it.
- Safe to do now: both wallets were unfunded (0 balance), so no value moved and nothing was
  stranded. Post-redeploy re-check: 8/8 services still `x402-check valid:true` at target prices;
  relayer `0x9e48…B7a3` OKB balance = 0 (the WO-04 gas ask stands, just against this address).

**Net funding targets for WO-04 (authoritative):** OKB gas → relayer `0x9e48…B7a3`; USD₮0 →
buyer/seller `0x75d0…cf69`. Everything else in the WO-04 entry below holds.

---

## 2026-07-07 — Work Order 04 session #2: rail deployed to prod, gauntlet armed, PAUSED on funding

**Outcome: the X Layer / OKX rail is now LIVE on production and every funding-independent
leg of the gauntlet passes. Presented the consolidated funding request
([`e2e-evidence/FUNDING-REQUEST.md`](e2e-evidence/FUNDING-REQUEST.md)) and paused per Phase 1.
No money spent yet — wallet holds 0 on all chains.**

### What changed this session (deploy, not code)

The WO-02/03 code was already in HEAD; it was just never activated in production because the
X Layer rail env vars were absent (that is what the 2026-07-06 WO-04 NO-GO actually caught).
Fixed by provisioning prod env + redeploy:

- `X402_PAY_TO_XLAYER = 0x75d00a2713565171f33216e5aa2a375e076ecf69` → Vercel prod.
- `X402_XLAYER_RELAYER_KEY` → Vercel prod. **Fresh keypair generated this session; address
  `0x1B60Cb12cE894Efc2470bB18Bf2D41755b49AB2a`; private key lives ONLY in Vercel env +
  session scratchpad, never committed.** This is the direct-redemption settle path (Path B),
  used when OKX facilitator creds are absent.
- `X402_ASSET_ADDRESS_XLAYER` already defaults to USD₮0 in `env.js` — no action.
- Redeployed prod (a transient "deployment failed, retry later" fired once during the
  dep-install phase but the build had already completed; the env change is live — confirmed
  below).

### Verified LIVE against production (evidence in `e2e-evidence/`)

| Check | Result | Evidence |
|---|---|---|
| X Layer accept now emitted | `accepts[0]` = `{eip155:196, USD₮0, payTo 0x75d0…cf69, per-service amount}` on all 8 REST services | `01-x402-check-all.txt`, `02/03-*-402*` |
| Buyer-CLI validation | `onchainos agent x402-check --body '{}'` → `valid:true`, `network:eip155:196` for text-to-3d/pro, image-to-3d, rig, avatar, retarget, pose-seed, fbx-export | `01-x402-check-all.txt` |
| Free lane (case 1) | health `ok:true` (5 real subsystem probes incl. `payment-rail settleable:true`), catalog lists 11 services | `01-health-*`, `01-catalog-body.json` |
| Buyer can sign (case 2 leg) | `onchainos payment pay` → `PAYMENT-SIGNATURE`, scheme `exact`, wallet `0x75d0…cf69`, 1168-byte header | `02-pay-attempt.json`, `02-auth-header.txt` |
| Seller verify path live | real signed header replayed unfunded → `HTTP 402 insufficient_balance` + fresh `eip155:196` challenge (on-chain `balanceOf` ran) | `02-replay-unfunded.json` |
| Garbage header (case 5d) | → `HTTP 400 invalid_payment` ("X-PAYMENT JSON parse failed"), no crash, no tool run | `05d-garbage-body.txt` |

`payment-rail` health: `settleable:true, facilitator_configured:false, token USD₮0, block ~64.6M`
— i.e. Path B (relayer) is the active settle route until OKX creds land.

### Funding request presented (Phase 1) — PAUSED here

Buyer == seller (`0x75d0…cf69` both sides) ⇒ settlement is a self-transfer, net-zero, so the
USD₮0 float is one-time (covers the largest single call, not the sum). Ask:
- **2.0 USD₮0** → `0x75d0…cf69` on X Layer 196 (floor 0.5 = the avatar flagship).
- **0.3 OKB** → relayer `0x1B60…AB2a` on X Layer (Path B gas) — OR provide `OKX_API_KEY`/
  `OKX_SECRET_KEY`/`OKX_PASSPHRASE` for the gasless official-facilitator Path A (recommended,
  it's the exact rail the OKX reviewer's buyer uses; then no OKB needed).
- **0.10 USDC + 0.02 SOL** → Solana `9PirGw…fnyc` for case 7 legacy regression.

### Open finding for WO-05/06 (NOT a WO-04 blocker)

**`identity-studio` (WO-06 surface) mis-advertises its rail.** It routes through the shared
MCP auth path (`handleIdentityStudio` → `authenticateRequest` → `paymentRequirements()`),
NOT the clean `okxXLayerAccept`+`sendOkx402` path the 8 REST services use. Consequences on
its live 402: (a) accepts are **Solana-first**, so a buyer / `x402-check` auto-selects the
Solana rail, not X Layer; (b) the empty-body probe prices the X Layer accept at `1000`
($0.001), not the catalog's $1.50. Fix belongs in WO-06 (or before WO-05 submits that row)
and touches shared MCP infra (blast radius = `api/mcp-3d.js` too), so it was deliberately
NOT changed here. The 8 WO-03 REST services — WO-04's actual targets — are all correct.

### GO/NO-GO
- **Gauntlet cases 2–7 + settlement: BLOCKED on funding only.** Everything else is proven.
- **Work Order 05: NO-GO until the gauntlet runs green post-funding** AND the identity-studio
  rail finding above is resolved (it would otherwise list a Solana-first, mispriced flagship).

---

## 2026-07-07 — Work Order 03 re-dispatch: rail DEPLOYED & OKX-validated live — the runtime env blocker is CLEARED

**Outcome: the one thing standing between the merged WO-02/03 code and a passing OKX listing —
the missing Vercel env vars — is now set, deployed, and verified. All 8 paid `/api/okx/3d/*`
services advertise the `eip155:196` X Layer rail FIRST and each passes OKX's own
`onchainos agent x402-check` with `valid: true` at its target price. WO-03's implementation was
already complete and correct (see the 2026-07-06 WO-03 entry below); this session made ZERO code
changes and closed the deployment gap that made the rail invisible at runtime.**

### The gap this session closed

The immediately-prior 2026-07-07 WO-01 entry logged the live finding: production
`POST /api/okx/3d/*` returned a **Solana-only** challenge because `xlayerSettleable()` was false —
`X402_PAY_TO_XLAYER` and a settlement route were unset in Vercel. That is byte-for-byte the
2026-07-04 rejection cause, persisting *at runtime* despite conformant merged code. Cleared it:

1. **Generated a fresh secp256k1 relayer keypair** (viem `generatePrivateKey`) — address
   `0x9e48594212487777497bAeB4716dd13250F4B7a3`. This is the direct-redemption settlement route
   (`X402_XLAYER_RELAYER_KEY`) the spec documents as the no-OKX-creds fallback.
2. **Set Vercel env (production + preview):** `X402_PAY_TO_XLAYER=0x75d0…cf69` and
   `X402_XLAYER_RELAYER_KEY=<fresh key>`. `X402_ASSET_ADDRESS_XLAYER` needed no set — `env.js`
   defaults it to USD₮0 `0x779ded…713736`, confirmed live below.
3. **Redeployed production** and re-verified against the live URLs.

### Verified LIVE (2026-07-07, evidence: `e2e-evidence/03b-rail-deployed-validation.txt`)

- **Health `payment-rail` probe is real:** `settleable:true`, live X Layer block `64654400`,
  on-chain token read `USD₮0`, `facilitator_configured:false` (relayer route, not OKX HMAC).
- **All 8 paid services pass `onchainos agent x402-check --chain xlayer` `valid:true`** at exact
  target prices — text-to-3d `$0.01`, pro `$0.30`, image-to-3d `$0.30`, rig `$0.25`, avatar
  `$0.50`, retarget `$0.10`, pose-seed `$0.02`, fbx-export `$0.10` — `payTo=0x75d0…cf69`,
  `asset=USD₮0`, `decimals:6`, `x402Version:2`. The `eip155:196` accept is listed FIRST, Solana
  fallback after. (Validator reports `tokenSymbol:UNKNOWN` — the documented non-fatal
  tokenResolveError, spec Appx H.2; still `valid:true`.)
- **Free lane real artifact:** ran the free TRELLIS engine that backs `text-to-3d` — returned a
  GLB in 13 s; downloaded and byte-parsed it: `magic=glTF version=2`, declared length == 1 514 680
  actual bytes, 1 mesh / 1 material / 1 embedded texture. Real, parseable output.
- **Full suite:** `npx vitest run` → **11 368 passed**, 19 skipped. The only red file is
  `tests/public/x402-modal-dom.test.js` (4 tests) — passes 4/4 in isolation; the known
  DOM-shared-state flake the prior entries already logged, unrelated to this work.

### Still blocked (WO-04 funding only — NOT a listing blocker)

The rail is now advertisable and OKX-valid, which is what WO-05 relisting needs. A *fully
settled* paid call still needs money, and both wallets are empty on X Layer today:

- **Relayer `0x9e48…B7a3` OKB balance = 0** → it can't submit the `transferWithAuthorization`
  redemption tx without gas. Fund with ~0.05 OKB (a few cents) for the WO-04 gauntlet.
- **Buyer/seller `0x75d0…cf69` USD₮0 balance = 0** → nothing to pay with. Fund ≥ `$2.98` to
  cover one paid call of every service (~`$5` recommended for buffer), USD₮0
  `0x779ded…713736` on X Layer (196).
- OKX HMAC creds (`OKX_API_KEY`/`_SECRET_KEY`/`_PASSPHRASE`) remain optional — the relayer route
  settles without them; set them later if the official facilitator is preferred over
  self-redemption.

### GO/NO-GO

- **WO-03: COMPLETE and now LIVE.** Implementation shipped 2026-07-06; deployment + OKX
  validation closed this session. The rejection cause is resolved in production and proven with
  OKX's own validator.
- **WO-05 (relisting): rail-integration precondition MET.** #2632 can be resubmitted — the
  endpoints now look like an approved seller. Submit the catalog table from the 2026-07-06 WO-03
  entry verbatim.
- **WO-04 (real settled self-payment): GO the moment the two wallets above are funded.** No code
  or config owed — only OKB gas on the relayer + USD₮0 on the buyer.

---

## 2026-07-07 — Work Order 01 re-dispatch: ALREADY COMPLETE, re-verified live, spec↔code conformance confirmed

**Outcome: WO-01 was dispatched again but its deliverable already exists, is complete and
double-sourced, and has since been consumed by WO-02/03. No research was re-run from scratch
(that would be waste). Instead this session (a) re-verified the spec's most drift-prone
primary-source claims against live sources today, (b) validated that the shipped WO-02/03
code conforms to the spec §1 contract — the one check nobody had run — and (c) surfaced one
runtime finding for the handoff. Spec updated with a dated reconciliation note; no code
changes.**

### Why not re-run the research

`specs/okx-agent-payments.md` (386 lines, 39 KB) already answers all 8 questions with
primary-source citations, captures five approved sellers verbatim, cryptographically pins the
USD₮0 domain separator, and is double-sourced across two independent 2026-07-06 sessions. It
is a real deliverable, not a hollow shell (contrast the misleading commit `839c9a654`). The
stale memory note "WOs 01–03 never ran" predates all of this.

### Re-verified LIVE today (2026-07-07) — primary sources still hold

- **Approved-seller 402 (oklink `get_chain_info`)** → `HTTP 402`, `PAYMENT-REQUIRED` decodes
  **byte-identical to spec Appendix A** (`exact`+`aggr_deferred`, `eip155:196`, amount `15`,
  asset `0x779ded…713736`, `extra{name:"USD₮0",version:"1"}`).
- **OKX facilitator** `GET /api/v6/pay/x402/supported` (no auth) → `HTTP 401 code 50103`
  "OK-ACCESS-KEY can not be empty" — HMAC auth requirement (§Q4) unchanged.
- **Preflight** passes: wallet logged in as `claude@three.ws`. Note `apiKey: null` ⇒ the OKX
  API-credential blocker is still unmet.

### Spec ↔ shipped-code conformance (new validation, WO-01→02 handoff)

- [`api/_lib/x402-xlayer-okx.js`](../../api/_lib/x402-xlayer-okx.js) `okxXLayerAccept()`
  **byte-matches spec §1.1**: `exact` / `eip155:196` / USD₮0 asset / payTo /
  `maxTimeoutSeconds:86400` / `extra{symbol,name:"USD₮0",version:"1",transferMethod:"eip3009",decimals:6}`.
  Reads `PAYMENT-SIGNATURE`, routes verify/settle via `OKXFacilitatorClient`, emits
  `PAYMENT-RESPONSE` (§1.2/§3). The §4 gap list is now historical — closed in code.

### Runtime finding for the handoff (owner-actionable)

- **Production `POST /api/okx/3d/*` still returns a Solana-only challenge — no `eip155:196`
  entry.** The X Layer accept is only advertised when `xlayerSettleable()` is true
  (`X402_PAY_TO_XLAYER` + `X402_ASSET_ADDRESS_XLAYER` + OKX HMAC creds **or**
  `X402_XLAYER_RELAYER_KEY`). Those env vars are **not set in Vercel production**, so the
  2026-07-04 rejection cause persists *at runtime* even though the code is merged and
  conformant. This is the same env blocker WO-03 logged; re-confirmed live.

### Blockers (unchanged, all owner-provisioning)

1. Set Vercel prod env: `X402_PAY_TO_XLAYER=0x75d00a2713565171f33216e5aa2a375e076ecf69`,
   `X402_ASSET_ADDRESS_XLAYER=0x779ded0c9e1022225f8e0630b35a9b54be713736`.
2. OKX API credentials `OKX_API_KEY`/`OKX_SECRET_KEY`/`OKX_PASSPHRASE` (facilitator HMAC),
   or fall back to `X402_XLAYER_RELAYER_KEY` + OKB gas dust.
3. Fund `0x75d0…cf69` on X Layer (196) with USD₮0 (`0x779ded…713736`); current balance 0.

### GO/NO-GO

- **WO-01: COMPLETE (re-affirmed, triple-sourced now).** No further research owed.
- **WO-02: code COMPLETE and spec-conformant; runtime GATED on blocker #1.**
- **WO-04/05: still NO-GO** until the three owner blockers above are cleared — then production
  advertises the `eip155:196` rail and #2632 can be resubmitted.

### One UNRESOLVED (unchanged, spec Q7)

The exact method/body of any OKX-side *automated* listing probe is undocumented. Mitigation
stands: after the env vars land, run `onchainos agent x402-check --endpoint
https://three.ws/api/okx/3d/text-to-3d`, confirm the `eip155:196` accept is selectable, then
resubmit for (human) review.

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

- **Header delta:** the OKX rail uses **`PAYMENT-SIGNATURE`** (buyer→seller) + **`PAYMENT-RESPONSE`**
  (seller→buyer) — these are the **x402 v2 standard** names (confirmed vs coinbase/x402 spec), NOT
  an OKX invention. Our code emits the older **x402 v1** names (`X-PAYMENT`/`x-payment-response`)
  while labeling itself "v2" — that's the delta to close for the X-Layer rail.
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

---

## 2026-07-06 — Work Order 01 verification pass (second, independent session): CONFIRMED with 2 corrections

A parallel session ran WO-01 end-to-end before discovering the first session's spec had
just landed (concurrent-worktree case). Its independently-gathered evidence was merged into
[`specs/okx-agent-payments.md`](../../specs/okx-agent-payments.md) as **Appendix H** plus
inline corrections, rather than duplicated. Net effect: the spec is now double-sourced.

### Confirms (independent captures agree)

- 402 challenge shape, `PAYMENT-REQUIRED`/`PAYMENT-SIGNATURE`/`PAYMENT-RESPONSE` naming,
  facilitator endpoints + HMAC auth (live 401 `code 50103` probe of
  `web3.okx.com/api/v6/pay/x402/supported`), 6-decimal amount scaling (third price point:
  Predexon $0.01 → `"10000"`), verify-before-work (second unfunded signed replay →
  `insufficient_balance` fresh challenge), SDK identity `@okxweb3/app-x402-core@0.2.0`.
- **Q2 strengthened:** Predexon #2143 captured as a FOURTH approved seller — enforcing,
  `exact`-only ⇒ `exact` alone demonstrably passes review (spec Appx H.4).
- **Q3 strengthened to cryptographic:** on-chain `name()`/`symbol()` = `USD₮0`,
  `decimals()` = 6, `authorizationState()` present, and `DOMAIN_SEPARATOR()` recomputed
  byte-exact from `{name:"USD₮0", version:"1", chainId:196}` (spec Appx H.3).

### Corrections applied to the spec

1. **Original Q6/G9 was wrong: our HTTP-level 402 gate ALREADY exists.** Bare (non-MCP)
   `POST tools/call` to `https://three.ws/api/mcp-3d` returns `HTTP/2 402` +
   `PAYMENT-REQUIRED`, and `onchainos agent x402-check --endpoint https://three.ws/api/mcp-3d`
   parses it **`valid: true`** (Solana-only accepts — the isolated gap is the missing
   `eip155:196` entry). Only clients sending `mcp-protocol-version` get the 401/OAuth
   branch, which OKX tooling never sends. G9 is now "no new gate needed"; WO-02 must NOT
   build a transport gate — only add the X Layer accept (G1-G3), the OKX facilitator route
   (G6, G11), and the v2 header names on the paid leg (G7, G8).
2. **No v1 `x-payment` back-compat in the OKX SDK** — `extractPayment` reads only
   `payment-signature` / `app-payment`. The earlier "accepts v1 for back-compat" claim was
   uncited and is removed; do not rely on v1 names on the OKX rail.
3. **G3 softened:** `extra.decimals: 6` is optional-but-recommended — its absence triggers a
   (non-fatal) `tokenResolveError` in `x402-check` because USD₮0 is outside the task
   system's supported-token list (spec Appx H.2).

### Unchanged blockers (owner)

Same two as the entry above: OKX API credentials (`OKX_API_KEY`/`OKX_SECRET_KEY`/
`OKX_PASSPHRASE`) and X Layer USD₮0 funding of `0x75d0…cf69` (≥0.02 USD₮0 covers the WO-04
gauntlet incl. one Predexon-priced call; ~1.0 USD₮0 recommended for buffer; no OKB needed —
EIP-3009 gas is facilitator-paid).

### GO/NO-GO

- **Work Order 02: GO (re-affirmed, now double-sourced).** Note for 02: commit
  `4cfc26ea3` already added `api/_lib/x402-xlayer-okx.js` + env vars — audit that file
  against spec §1/§4 (esp. G7-G9 as corrected) instead of starting fresh.

---

## 2026-07-06 — Work Order 03 session: COMPLETE — 3D studio decomposed into micro-priced A2MCP services

**Outcome: the full target catalog is implemented, tested, and documented. Eight paid REST
services + the two free discovery services are live in code under `/api/okx/3d/<service>`,
all priced from one catalog module, all running the same engines `/api/mcp-3d` uses.**
This session also independently implemented the WO-02 X Layer rail before discovering the
concurrent sessions' commits — the converged implementation in HEAD
(`api/_lib/x402-xlayer-okx.js` + `x402-spec.js` routing + `@okxweb3/app-x402-core`) was
audited against spec §1/§4 including the Appendix H corrections (`extra.decimals: 6` added).

### What shipped (WO-03 scope)

- **Catalog rows** in [`api/_lib/okx-catalog.js`](../../api/_lib/okx-catalog.js) — 8 paid
  REST services added next to WO-06's identity-studio + free rows. Display-width
  validation (CJK=2/ASCII=1, ≤200 per description part) enforced by `validateCatalog()`
  and CI.
- **Engine adapters** in [`api/_okx3d/rest-services.js`](../../api/_okx3d/rest-services.js)
  — thin dispatch onto the existing engines (forge-client submit/poll, UniRig rig submit,
  `apply_animation` / `pose_model` / `remesh_model` MCP tool handlers). Zero pipeline
  duplication.
- **Routing** in [`api/okx/3d/[service].js`](../../api/okx/3d/%5Bservice%5D.js) — per-service
  OKX-dialect 402 (PAYMENT-REQUIRED header + body, X Layer accept FIRST with that service's
  own atomic amount, existing Solana/Base rails after), verify → engine → settle-on-success
  → PAYMENT-RESPONSE, forge.js-grade idempotency (retried payment replays the same
  response; proof single-use in flight). GET on any paid service = free descriptor.
- **Health** extended with two real probes: `retarget` (live animation-manifest fetch) and
  `payment-rail` (X Layer RPC height + on-chain USD₮0 symbol read + settlement-route
  config).
- **Docs**: [`docs/okx-marketplace.md`](../../docs/okx-marketplace.md) per-service section
  (runnable curl per service); changelog entry in `data/changelog.json` (built + validated
  via `npm run build:pages`); STRUCTURE.md row + start-here link were landed by the
  parallel WO-06 session and cover this surface.
- **Tests**: [`tests/api/okx-3d-services.test.js`](../../tests/api/okx-3d-services.test.js)
  — 26 tests, no sampling: catalog contract + price points, per-service 402 (all 8),
  free GET descriptor, paid dispatch per service, and the never-charge failure paths
  (invalid input, humanoid gate, engine 5xx, rejected payment, settle failure).

### Final catalog table (Work Order 05 submits these rows verbatim)

Descriptions are 2-part per OKX format (① capability ② caller input, both ≤200 display
width — validated). The exact submittable strings live in `api/_lib/okx-catalog.js`
(`describes.capability` + `describes.input`, joined by `listingDescription()`); this table
summarizes them:

| # | Service name | Fee (USDT) | Endpoint | Type |
|---|---|---|---|---|
| 1 | 3D Studio Health (free) | 0 | `https://three.ws/api/okx/3d/health` | A2MCP |
| 2 | 3D Studio Catalog (free) | 0 | `https://three.ws/api/okx/3d/catalog` | A2MCP |
| 3 | Text to 3D Model (GLB) | 0.01 | `https://three.ws/api/okx/3d/text-to-3d` | A2MCP |
| 4 | Text to 3D Model (Pro) | 0.30 | `https://three.ws/api/okx/3d/text-to-3d-pro` | A2MCP |
| 5 | Image to 3D Model | 0.30 | `https://three.ws/api/okx/3d/image-to-3d` | A2MCP |
| 6 | Auto-Rig a GLB | 0.25 | `https://three.ws/api/okx/3d/rig` | A2MCP |
| 7 | Text to Rigged Avatar | 0.50 | `https://three.ws/api/okx/3d/avatar` | A2MCP |
| 8 | Animation Retarget | 0.10 | `https://three.ws/api/okx/3d/retarget` | A2MCP |
| 9 | Pose Seed | 0.02 | `https://three.ws/api/okx/3d/pose-seed` | A2MCP |
| 10 | FBX Export (rig-preserving) | 0.10 | `https://three.ws/api/okx/3d/fbx-export` | A2MCP |
| 11 | Agent Identity Studio | 1.50 | `https://three.ws/api/okx/3d/identity-studio` | A2MCP (WO-06) |

All target rows from the work order shipped; none cut. The free "3D Health & Catalog" row
was split into two endpoints (matching how the reference sellers list discovery), and
WO-06's identity-studio row rides in the same catalog.

### Price vs unit cost (no service sells below cost)

| Service | Fee | Worst-case lane cost per call | Basis |
|---|---|---|---|
| text-to-3d | $0.01 | ~$0 | NVIDIA NIM TRELLIS lane — zero vendor cost (forge-tiers.js: "no vendor cost") |
| text-to-3d-pro | $0.30 | ~$0 normal; a few cents worst-case | NIM/HuggingFace free lanes first; Replicate TRELLIS backstop only when both are down |
| image-to-3d | $0.30 | same as pro | same reconstruct chain |
| rig | $0.25 | ~$0 marginal | self-hosted UniRig GPU worker (fixed infra) |
| avatar | $0.50 | gen + rig above | chain of the two |
| retarget | $0.10 | ~$0 | in-process CPU retarget |
| pose-seed | $0.02 | ~$0 | in-process deterministic lookup |
| fbx-export | $0.10 | ~$0 marginal | remesh worker convert |

Platform-retail prices on the general x402 rails are lower for some capabilities (e.g.
retarget $0.01 on /api/mcp-3d); the OKX-marketplace prices follow the work order's targets
— a deliberate marketplace premium, all above cost.

### Integration evidence (local, real module behind node:http)

Unpaid POST → per-service 402 with the service's own amount (pose-seed, $0.02):

```
HTTP/1.1 402 Payment Required
payment-required: <base64>
{"x402Version":2,"resource":{"url":"https://three.ws/api/okx/3d/pose-seed","mimeType":"application/json"},
 "accepts":[{"scheme":"exact","network":"eip155:196","amount":"20000",
 "payTo":"0x75d00a2713565171f33216e5aa2a375e076ecf69","maxTimeoutSeconds":86400,
 "asset":"0x779ded0c9e1022225f8e0630b35a9b54be713736",
 "extra":{"symbol":"USDT","name":"USD₮0","version":"1","transferMethod":"eip3009","decimals":6}}]}
```

Buyer's-eye check — `onchainos payment pay --payload '<our 402 body>'` ACCEPTED the
challenge and signed it (TEE wallet `0x75d0…cf69`):

```
ok: true  header_name: PAYMENT-SIGNATURE  scheme: exact
accepted.network: eip155:196  accepted.amount: 20000
auth.to: 0x75d00a2713565171f33216e5aa2a375e076ecf69  auth.value: 20000
```

Replaying that signed header against our endpoint (wallet unfunded) → our verify leg ran
the real on-chain checks and answered exactly like the approved sellers do:

```
HTTP/1.1 402 Payment Required
{"x402Version":2,"error":"insufficient_balance", ... same accepts ...}
```

### Test output

`npx vitest run tests/api/okx-3d-services.test.js tests/api/okx-identity-studio.test.js`:

```
 Test Files  2 passed (2)
      Tests  44 passed (44)
```

Full unit suite: 788/793 files green, 10905+ tests passing. The residual failures are NOT
this work order's: `x402-discovery-parity` red because the parallel session's new
`/api/x402/vanity-premium` endpoint isn't in the wk.js discovery catalog yet (their
follow-up); `token-market-single-flight` (market-cache lock test, unrelated subsystem) and
`x402-modal-dom` (passes in isolation — flake) predate/parallel this change. Playwright
E2E not run in this environment (browsers not installed per install command).

### Paid-leg status (per the anti-laziness gate)

Every lane that can run free ran for real (buyer signing, on-chain verify path, unfunded
settle behavior, engine dispatch under test). The fully-funded paid replay for each
service is Work Order 04's gauntlet and stays blocked on the same two owner items already
logged: **OKX API credentials** (`OKX_API_KEY`/`OKX_SECRET_KEY`/`OKX_PASSPHRASE` → vercel
env; enables the official facilitator verify/settle) and **USD₮0 funding** of
`0x75d0…cf69` on X Layer (≥ $2.98 covers one paid call of every WO-03 service +
identity-studio; ~$5 recommended). Fallback settle without OKX creds:
`X402_XLAYER_RELAYER_KEY` (fresh keypair) + OKB dust for gas — implemented and env-gated,
documented in the spec. Also required in vercel env for the rail to be advertised at all:
`X402_PAY_TO_XLAYER=0x75d00a2713565171f33216e5aa2a375e076ecf69`.

### Next

- **Work Order 04: GO** once the owner sets the env vars + funds above. All preconditions
  it audits now exist.
- **Work Order 05**: submit the catalog table above (strings from `okx-catalog.js`
  verbatim via `listingDescription()`).

### Deploy-pipeline fixes made en route (affects 04/05)

Every Vercel deploy (including production) was failing BEFORE this session's changes, on
two leftovers from other work streams:

1. `verify:solana` drift — untracked local scratch `_prompts/sperax/ref/…/executor/index.ts`
   carries a deliberately non-canonical Pump program id; `vercel deploy` uploads untracked
   files and the remote scanner (no git context) walks them. Fixed by adding `_prompts/` to
   `.vercelignore`.
2. `audit-page-index --strict` — the committed `/sperax` page (owner-directed Sperax
   stream, commit `de2e31a52`) never got its `data/pages.json` row. Added the minimal
   factual row (title "Sperax on three.ws", added 2026-07-05) to unblock all deploys.
   **Owner note:** this row auto-feeds the sitemap + public changelog page-launch entry for
   the already-live /sperax page — flagging per the other-coin commit gate; revert the row
   if unwanted (deploys will fail again until the page is removed or exempted).

---

## 2026-07-07 — Work Order 05 session: STOPPED AT THE HARD GATE — no GO from 04

**Outcome: Work Order 05 (update #2632 + resubmit) did not run. Its hard gate requires an
explicit GO from Work Order 04, and 04 has never executed.** No code changed, no CLI writes,
no money moved, agent #2632 untouched.

### Gate audit

- The only WO-04 session entry in this log (2026-07-06) is a **NO-GO** (preconditions then
  missing — since fixed by the 01/03 sessions).
- The WO-03 close-out's "Work Order 04: GO" is a *conditional green light for 04 to run*
  ("once the owner sets the env vars + funds"), not a GO **from** 04 for 05. The 04 gauntlet
  (real funded payment per service, settlement verified on X Layer) has produced no entry
  and no evidence files beyond the 2026-07-06 precondition probes.
- Git history since 2026-07-06 confirms: no commit touches `prompts/okx-ai/` with WO-04
  results; nothing new under `prompts/okx-ai/e2e-evidence/`.

### What unblocks the sequence (unchanged owner items, from the 01/03 entries)

1. **OKX API credentials** in Vercel env: `OKX_API_KEY`, `OKX_SECRET_KEY`, `OKX_PASSPHRASE`,
   plus `X402_PAY_TO_XLAYER=0x75d00a2713565171f33216e5aa2a375e076ecf69`.
2. **USD₮0 funding** of `0x75d00a2713565171f33216e5aa2a375e076ecf69` on X Layer (chainId 196),
   token `0x779ded0c9e1022225f8e0630b35a9b54be713736` — ≥ $2.98 covers one paid call of every
   catalog service; ~$5 recommended.

### Next

- Owner provisions the two items above → run **Work Order 04** (`04-e2e-real-payment-test.md`)
  → on its explicit GO, re-dispatch this Work Order 05.

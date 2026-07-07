# 04 — Accept MPP payments on a pilot endpoint

Read `prompts/bnb-chain/00-CONTEXT.md` first, then `/workspaces/three.ws/CLAUDE.md`.
**Prereqs: 01** (`api/_lib/bnb/chains.js`). Run it first if missing.

## Why
`@bnb-chain/mpp` is BNB Chain's Machine Payments Protocol — their answer to x402, with 402
flows over `permit2` / EIP-3009 / EIP-1559, spanning BSC + opBNB + the wider EVM (incl.
Base). We already run an x402 catalog. Making ONE of our paid endpoints ALSO speak MPP means
BNB-ecosystem agents (which reach for MPP, not x402) can pay us. First-mover: an
x402↔MPP-bilingual endpoint is likely novel. Keep it surgical — one pilot endpoint, real.

## Build
- `api/_lib/bnb/mpp-server.js` — wrap `@bnb-chain/mpp` server (`chargeAsync` / `Mppx.create`
  per its README: `mpp-sdk` supports `authorization`/`permit2`/`transaction`/`hash`
  credentials with a replay store). Provide `mppChallenge(routeMeta)` and
  `mppVerifyAndSettle(req)` helpers mirroring our x402 dance shape. Use a durable replay
  store if one exists in our stack (grep for redis/kv usage); else the SDK's memory store with
  a `// replace with durable store in prod` note is NOT allowed — wire the real KV we already
  use, or document precisely which env var enables it.
- Pick ONE existing paid endpoint as the pilot (recommend `api/x402/three-intel.js` — clean,
  read-only). Add MPP as an ALTERNATE payment path: if the request carries an MPP
  `PAYMENT`/402 credential header, settle via `mpp-server.js`; otherwise the existing x402
  path is untouched. Do not break the x402 flow — additive only.
- Advertise MPP support in the endpoint's response headers / discovery metadata so MPP
  clients know they can pay here.

## States
No payment → return BOTH an x402 402 challenge and an MPP `402` challenge (content-negotiated
or dual-header, per MPP spec). Bad MPP signature → MPP-spec error, not a generic 500. Replay
→ rejected by the replay store. Settlement fails on-chain → typed error with reason.

## Tests (`tests/bnb-mpp-server.test.js`)
- `mppChallenge` emits a spec-shaped 402 for the pilot route.
- A mocked valid `authorization` (EIP-3009) credential verifies + would-settle.
- Replay: same credential twice → second rejected.
- The existing x402 path on the pilot endpoint still passes its current tests (run them).

## Definition of done
Inherit 00-CONTEXT DoD. Additionally:
- [ ] Real proof: drive the pilot endpoint with an MPP client (prompt 05's buyer, or the SDK's example client) on testnet; paste the 402 challenge JSON and a successful settlement receipt.
- [ ] Docs handled in prompt 06 — but leave a `docs/bnb-payments.md` stub section header for the server side so 06 can fill it, OR note in PROGRESS that 06 owns it.
- [ ] `data/changelog.json`: entry (tags `feature`, `sdk`) — "three.ws now accepts BNB Chain MPP payments".

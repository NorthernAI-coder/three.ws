# 06 — BNB payments docs + x402↔MPP bridge spec

Read `prompts/bnb-chain/00-CONTEXT.md` first, then `/workspaces/three.ws/CLAUDE.md`.
**Prereqs: 04 and 05** (server + buyer must exist to document them truthfully). If either is
missing, run it first — do NOT document unbuilt behavior.

## Why
Track A ships two halves (we accept MPP; we pay MPP) plus gasless rails. A developer needs
one page that explains the whole BNB payments story and one spec that pins the wire-level
relationship between our x402 usage and MPP so future code has a contract to build against.

## Build
1. `docs/bnb-payments.md` — zero-context reader. Cover: (a) what MPP is and how it relates to
   x402; (b) how to PAY our endpoints with MPP (buyer POV, runnable example against the pilot
   endpoint from 04); (c) how OUR agents pay MPP endpoints via `mpp-buyer.js` (runnable
   example); (d) gasless sends via MegaFuel (`megafuel.js`) with the self-pay fallback
   explained honestly; (e) the honest caveats from 00-CONTEXT (MegaFuel is one operator,
   BEP-414 Draft). Every code sample must actually run. Link it from `docs/start-here.md`.
2. `specs/x402-mpp-bridge.md` — the load-bearing contract: which credential types map across
   x402 and MPP, how a dual-protocol endpoint advertises both, the header precedence rules,
   and the replay-store guarantees. This is a spec (contract), not a tutorial — precise, no
   fluff. Reference the exact code paths in `api/_lib/bnb/mpp-server.js` and `mpp-buyer.js`.

## States
N/A (docs) — but every claim must be consistent with 00-CONTEXT's verified/refuted lists and
with the actual code. If the code and a draft sentence disagree, the CODE wins; fix the doc.

## Definition of done
Inherit 00-CONTEXT DoD. Additionally:
- [ ] Every `curl`/code sample in `docs/bnb-payments.md` executed once against testnet; paste one real run in PROGRESS.
- [ ] `data/pages.json`: if `docs/bnb-payments.md` is served as a public route, register it.
- [ ] `STRUCTURE.md`: add or update a row for the BNB payments surface.
- [ ] `data/changelog.json`: entry (tag `docs`) — "BNB Chain payments guide (MPP + gasless)".
- [ ] Links resolve to live paths; no "see the code" hand-waves.

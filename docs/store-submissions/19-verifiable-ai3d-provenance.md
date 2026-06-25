# Prompt 19 — Verifiable AI-3D provenance: on-chain content credentials

> Paste into a fresh Claude Code chat in the three.ws repo. Follow CLAUDE.md. Use TodoWrite. Prereqs: 09 (lineage) helpful. **Anchoring is paid/Claude; the verify path is free and ships in BOTH tracks** (zero payment/coin surface).

## The thesis
As AI-generated 3D floods the web, authenticity becomes the scarce thing. three.ws can be the source of truth: every asset it generates gets a signed, verifiable **content credential** — who created it, from what prompt, by which model, when, and its full lineage — with the credential hash **anchored on Solana** so anyone can confirm the asset wasn't tampered with and genuinely originated here. C2PA-style provenance for 3D, anti-deepfake by construction. Verification is public and free; anchoring is the paid write.

## Objective
`anchor_provenance(asset_id)` writes a signed credential and anchors its hash on Solana; `verify_provenance(glb_url | hash)` returns the credential, the anchor transaction, and a tamper verdict. The verify path is callable by anyone, no auth, no payment.

## What to build (all real — real hashing, real on-chain anchor)
1. **Credential schema.** Versioned spec at `specs/PROVENANCE_3D.md`: creator (account/wallet), prompt, parent lineage (ties to prompt 09), generation model/provider, timestamp, the GLB content hash (sha256 over bytes), and a signature from a three.ws issuer key. Documented and open-licensed.
2. **Anchor.** Write the credential hash on Solana (memo/PDA) via the existing signing rails; store the full credential off-chain (`r2.js`) addressed by its hash; return the anchor tx + `explorerTxUrl`. Real on-chain write. Paid tool, `destructiveHint: false`.
3. **Verify.** Recompute the GLB content hash, match it against the stored credential, confirm the anchor tx exists on-chain, and return `verified | tampered | unknown` plus the chain of custody. `readOnlyHint: true`, free, public — **safe for the OpenAI free track because it has no payment or coin surface.**
4. **Verify badge.** The viewer component (05) shows a "Verified · three.ws" badge linking to the proof, with designed verified/unverified/tampered states.
5. **Coin policy.** `$THREE` only; the verify path contains **zero** token/payment fields. `grep` to prove it.
6. **Changelog** + `npm run build:pages`.

## Why only three.ws
Generation, asset storage, and Solana writes already coexist here, so three.ws can credential at the moment of creation — something a downstream verifier can never reconstruct. Owning the issuance point is the moat.

## Verification (must actually run)
- Anchor a real asset on **devnet**; `verify_provenance` returns `verified` + the anchor tx.
- Mutate the GLB by a single byte → `verify_provenance` returns `tampered`.
- The verify path exposes no payment/coin/internal fields — grep clean (it must be droppable into the OpenAI free app).
- `npm test` green; add tests for hash determinism, tamper detection, and anchor read-back. Evidence to `docs/store-submissions/_generated/provenance/`.

## Definition of done
- Generated assets carry a signed, on-chain-anchored content credential; anyone can verify authenticity and tampering for free; the verify path is coin/payment-clean and reusable across both stores.

## Hand-off
Report the credential schema path, the anchor/verify tool names, the network, and the evidence path. Anchoring is a Claude/web3 differentiator; the free verify path is an authenticity feature for the OpenAI listing. Commit/push only if asked; stage touched paths; both remotes.

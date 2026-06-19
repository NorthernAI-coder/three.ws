# Task 03 — Proof-of-Grind: verifiable provenance & certificates

**Read `prompts/vanity-frontier/00-README.md` and `/workspaces/three.ws/CLAUDE.md` first** (rules,
codespace traps, file map). Then build the trust layer that makes a three.ws wallet *provably* fair.

You are a senior applied-crypto + product engineer. Today a buyer has to take our word that an
address was freshly ground, matches the pattern they paid for, and (for split-key, Task 01) that we
never held the key. Replace "take our word" with **"verify it yourself."**

---

## Why this matters

A vanity address is worth more when its provenance is provable. Buyers — especially agents and
resellers — want guarantees: *this address was generated for me, now, with this pattern, and the
seller can't drain it.* No vanity service offers verifiable provenance. It also unlocks a resale
market (Task 05 / a future marketplace): a wallet with a signed proof-of-grind is a tradeable,
trustable asset.

## What to build (real signatures, real verification, no theater)

1. **Proof-of-Grind certificate.** Every grind (keypair, mnemonic, and especially split-key) can
   emit a signed certificate (`src/solana/vanity/proof-of-grind.js`) attesting:
   - the requested pattern + options, the resulting public address, timestamp, scheme/format,
     attempt count, and a server-side **freshness nonce** (so the same address can't be re-sold as
     "freshly ground" twice);
   - for split-key: the buyer's `P1`, the offset relationship, and an explicit **non-custody
     assertion** that is itself checkable from public values (the verifier recomputes
     `P1 + a2·B == vanityPublicKey` without any secret);
   - signed by a three.ws attestation key (Ed25519). Publish the public attestation key at a stable
     URL / `.well-known` so anyone can verify offline.
   - Consider anchoring strength: an on-chain or content-addressed commitment (e.g., a memo/PDA, or
     an EAS-style attestation — the repo already depends on `@ethereum-attestation-service/eas-sdk`
     and `@bonfida/spl-name-service`) so the proof isn't just "trust our signature." Investigate
     and implement the strongest option that's real and affordable per-grind.
2. **Verifier — library + public page.** A pure `verifyProofOfGrind(cert)` that anyone can run, and
   a real **`/verify` page** (or `/proof/:id`) where a user pastes a certificate (or scans a code)
   and sees a clear pass/fail with each checked claim explained. Every state designed; works for a
   stranger with no account.
3. **Wire it through the existing endpoints.** `api/x402/vanity.js` (and Task 01's split endpoint)
   attach a certificate to responses (sealed alongside the secret when `sealTo` is used — the cert
   itself is public, the secret stays sealed). MCP tools include it too.
4. **Make it visible and useful.** Surface the proof in the UI wherever a ground address appears
   (the `/vanity` result, agent wallet views) with a "Verified fresh • non-custodial" badge that
   links to the verifier. Provide a downloadable cert file + a shareable verify link.

## Correctness, security, edge cases

- The non-custody check for split-key MUST be recomputable from public values only; include a test
  that a tampered offset/address fails verification.
- Freshness: design so a replayed/duplicated certificate is detectable (nonce + timestamp window +
  optional anchor). Don't let a seller mint two "fresh" proofs for one address.
- Key management for the attestation signer: real env-based secret (like `WALLET_ENCRYPTION_KEY`
  patterns in `api/_lib/`), never hardcoded, rotation-aware (publish key id + allow multiple valid
  keys).
- Offline-verifiable: the verifier must not require trusting a three.ws API to return "valid" —
  it checks signatures/anchors itself.
- Privacy: certificates are public; ensure they never leak the secret or anything that weakens the
  key.

## Definition of done

- Real Ed25519 (and/or on-chain/EAS) attestations issued by the live endpoints, verifiable by an
  independent function and a public page, including the split-key non-custody proof.
- Tamper tests + freshness/replay tests (vitest specs + direct `node` verification).
- `/verify` exercised in a real browser: real verification, no console errors, designed states,
  accessible, responsive, shareable.
- `data/changelog.json` entry; `STRUCTURE.md` updated; attestation public key published.
- **Self-improvement pass:** then strengthen — e.g., anchor proofs on-chain, add a QR/printable
  certificate, a rarity score in the cert (coordinate with Task 04), or batch-verification for the
  pool (Task 05). Ship the best.
- **Delete this file** (`prompts/vanity-frontier/03-proof-of-grind-provenance.md`) last. Report what
  shipped, where, how to verify a proof yourself, and any tradeoffs.

If Task 01 (split-key) isn't merged yet, build the certificate + verifier for the existing
keypair/mnemonic formats first and design the schema so the split-key non-custody fields slot in
cleanly. No fake signatures, no "trust us" verifier — real, independent verification only.

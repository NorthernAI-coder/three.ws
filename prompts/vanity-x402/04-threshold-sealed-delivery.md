# Task 04 — Threshold sealed delivery (split a key at birth)

> Read [00-README-orchestration.md](./00-README-orchestration.md) first.

## The wedge (why this is gamechanging)

When a team, DAO, or family wants a shared wallet, the standard story is grim: one
person generates the key and *becomes* the single point of failure/theft, or they
set up a multisig later (clunky, and the original single key still existed at birth).

Invent **split-at-birth delivery**: the moment a vanity wallet is ground, its secret
is **Shamir-split into N shares with threshold t**, and **each share is sealed to a
different member's X25519 key**. No single party — not even our server — ever holds
the whole key after generation. `t` of `N` members combine their shares (locally) to
reconstruct it only when needed. The vanity address is shared; the trust is split.

Offer a second mode for power users: grind a **vanity multisig** address (Squads-style
or an on-chain multisig PDA) where each signer's contribution is sealed to them — so
the shared wallet is natively multisig, not a reconstructed single key.

No vanity service does threshold-sealed delivery. This is the enterprise/DAO wedge and
it's a natural, defensible extension of the sealed envelope.

## What to build

### Shamir-over-sealed delivery
- Implement (or vendor via existing deps — verify what's available; if you must add a
  primitive, build it on `@noble/*`, never a random package) **Shamir Secret Sharing**
  over GF(256) for the 64-byte secret (or the BIP-39 entropy, so shares can also
  reconstruct a seed phrase). Pin with vectors: any `t` shares reconstruct; any `t-1`
  reveal nothing.
- Extend the paid endpoint (e.g. `api/x402/vanity-threshold.js`): inputs = pattern,
  `recipients: [X25519 pubkey…]`, `threshold t`. Grind → split → seal **share i to
  recipient i** via [sealed-envelope.js](../../src/solana/vanity/sealed-envelope.js).
  The response contains N sealed shares + `{t, N}` + the address — and **no plaintext
  secret anywhere**. The server discards the secret + all shares after sealing.
- Client SDK + tools: `splitAndSeal()`, and `combineShares(openedShares)` →
  reconstructs the key/seed locally. A reconstruct flow that takes ≥t opened shares
  (each opened by its owner with their private key) and rebuilds the wallet **in the
  browser**, never server-side.

### Vanity multisig mode (real on-chain)
- Grind a vanity address that is a multisig authority/PDA (use the real Solana multisig
  tooling available in deps — verify and use Squads/`@solana/web3.js` PDAs). Each
  signer key sealed to its owner. Wire create + a basic "propose/approve" view or
  hand off cleanly to existing multisig UI if present. No stubs.

### UI
- `/vanity/team` (or a tab in the wallet hub): build the recipient set (members paste
  or generate X25519 keys — integrate with how members are modeled on three.ws if
  possible), pick `t`/`N`, grind, and distribute sealed shares (per-member link/QR/
  download). A **reconstruct** page where members each contribute their opened share
  locally and watch the threshold meter fill, then recover the wallet. Designed states:
  collecting shares (k/t), below threshold, reconstructed, share mismatch, expired.

## Hard requirements

- Correct, tested SSS: exact reconstruction at `t`, information-theoretic secrecy below
  `t` (test that `t-1` shares are indistinguishable from random). Constant-time-ish GF
  ops; no secret-dependent branching that leaks.
- Plaintext secret + individual shares **never** logged, stored unencrypted, or
  returned. Sealing happens server-side at generation; reconstruction happens
  client-side. The server is share-blind after delivery.
- Real on-chain multisig in that mode (real PDAs, real signers); real RPC reads.
- `$THREE` only as the coin; designed states; accessible; mobile-friendly QR.

## Definition of done

- [ ] Grind → Shamir split → per-recipient sealed shares → client-side reconstruct at
      threshold, all on real crypto with vectors (incl. the `t-1`-reveals-nothing test).
- [ ] Endpoint paid via x402; server holds no plaintext after sealing (verified).
- [ ] Vanity multisig mode creates a real on-chain multisig with sealed per-signer keys
      and a working propose/approve (or clean handoff), no stub.
- [ ] `/vanity/team` create + distribute + reconstruct UI; every state designed;
      reachable; client-side reconstruction only.
- [ ] Tests (SSS vectors, seal-per-recipient, threshold reconstruct, multisig create).
      Changelog + `npm run build:pages`. No mocks; `git diff` reviewed.

## Closeout

DoD + self-review, then **improve**: social recovery (rotate a lost share without
re-keying via re-sharing), share-holder revocation, an audit view of who has opened
their share, and tying the member set to three.ws identities/agents so shares seal to
people automatically. Summarize, then **delete this file**
(`prompts/vanity-x402/04-threshold-sealed-delivery.md`).

<!-- AUTO:self-delete-on-complete -->

---

## ✅ On completion — delete this file

This file is a unit of work, not a permanent doc. The moment every item above is **built, wired, verified, and committed** to the "Definition of done" in the repo-root `CLAUDE.md`, remove it in the same change:

```bash
git rm "prompts/vanity-x402/04-threshold-sealed-delivery.md"
```

Stage the deletion alongside your implementation and include it in the completion commit. This directory is the backlog: a file that still exists is unfinished work; a file that is gone has shipped. Do not delete early, and never leave a completed prompt behind.

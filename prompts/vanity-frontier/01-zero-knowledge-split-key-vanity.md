# Task 01 — Zero-Knowledge Split-Key Vanity Grinding (the flagship)

**Read `prompts/vanity-frontier/00-README.md` and `/workspaces/three.ws/CLAUDE.md` first.** They
carry the operating rules, the codespace traps (NEVER `npm install`; concurrent worktree; both
remotes; etc.), and the existing file map. Everything below assumes you've read them.

You are a senior cryptography + product engineer. Build the feature that makes three.ws the only
platform that can sell a vanity Solana wallet **without ever being able to steal it.**

---

## The problem you're solving

Every paid vanity grinder on earth — ours included, today — generates the full keypair server-side
and hands you the private key. You are trusting the seller not to keep a copy. For a throwaway
address that's fine; for a wallet that will hold real value or become an agent's identity, it's a
dealbreaker. "Pay us $0.50 and trust us with the keys to your money" does not scale.

**Make it mathematically impossible for three.ws to know the private key of the wallet it grinds
for you.** This is the wedge. Nobody offers provably-trustless vanity grinding on Solana.

## The core idea: split-key (additive) vanity

Elliptic-curve point addition mirrors scalar addition. So:

1. The **buyer** generates a secret scalar `a1` locally (in the browser / SDK / agent), never sent
   to us. Their partial public point is `P1 = a1 · B` (B = ed25519 basepoint).
2. The buyer sends us **only `P1`** (a public key) plus their desired pattern.
3. **three.ws grinds** a scalar `a2` until `P_final = P1 + a2 · B` has a Base58 encoding matching
   the pattern. We return `a2` (and proof).
4. The buyer computes the final secret scalar `a_final = (a1 + a2) mod L` **locally**. Only they
   ever hold it. We saw `P1` and `a2` — from which the private key cannot be derived (we'd need
   `a1`).

We get paid per grind over x402; we provably cannot drain the wallet. This is the whole game.

## The hard part you MUST investigate honestly (do not hand-wave)

ed25519's *standard* wallet format is **seed-based**: secret = 32-byte seed, scalar = clamp(lower
32 bytes of SHA-512(seed)), and signing (tweetnacl / Phantom / `solana-keygen`) derives the scalar
*from the seed*. A split-key result is a **raw scalar** `a_final` that is **not** the clamp of any
seed's hash — so it cannot be expressed as a standard 32-byte-seed Solana `Keypair`, and tweetnacl
won't sign from it.

This is the central feasibility risk. Your job is to resolve it properly, not to pretend it away:

- **Prove the math first.** Using `@noble/curves/ed25519.js` low-level Edwards ops, prototype:
  generate `a1`, `P1 = a1·B`; grind `a2`; confirm `P_final = P1 + a2·B` and that a signer built
  from `a_final = a1 + a2 (mod L)` produces signatures that **verify against `P_final`'s 32-byte
  public key** under standard ed25519 verification (the same verification Solana runtime uses).
  ed25519 *verification* only needs the public key and is signature-scheme agnostic to how the
  scalar was produced; what differs is *signing*. Confirm an expanded-key signer (scalar + a
  nonce prefix) yields runtime-valid signatures. (RFC 8032 expanded keys; nacl `crypto_sign` uses
  seed→expand, but the expansion output is exactly (scalar, prefix) — you can sign directly from
  those.)
- **Then solve usability.** A raw-scalar wallet works perfectly with a **custom signer**, which we
  control across our surfaces: agent wallets, the x402 payer, the SDK, server-side signing. So ship
  it fully usable *within the three.ws ecosystem* (agent wallets, payments, programmatic signing)
  and export it as a documented expanded-key format (and a Solana CLI-compatible artifact where
  possible). Be brutally honest in the UX about Phantom/Solflare import: if mainstream wallets
  can't import a raw-scalar key, say so plainly and position this as "sovereign keys for agents and
  power users," while the existing seed/keypair formats remain for wallet-import needs.
- **Offer the best of both.** Consider a product matrix: `keypair`/`mnemonic` (custodial-grind,
  optionally sealed — already built) vs. `split-key` (trustless, custom signer). Let the buyer
  choose with eyes open. Make the trustless path the hero.
- If during research you discover a *better* construction (e.g., a verifiable seed-based MPC, a
  two-round protocol that yields an importable seed, a delegated-grind scheme with a ZK proof of
  non-custody), evaluate it and build the strongest viable option. Document why you chose it.

## What to build (wire ALL of it — real crypto, real x402, real signing)

1. **`src/solana/vanity/split-key.js`** — the math core (zero-dep beyond `@noble/curves`/`bs58`):
   - `generateClientScalar()` → `{ scalar, publicPoint (P1 as base58/bytes) }` for the buyer side.
   - `grindOffset({ p1, prefix, suffix, ignoreCase, timeBudgetMs })` → finds `a2` such that
     `encodeBase58(compress(P1 + a2·B))` matches; returns `{ offsetScalar, vanityPublicKey,
     attempts, durationMs }`. Reuse `validation.js` for pattern rules and difficulty.
   - `combineScalars(a1, a2)` → `a_final` (mod L); `expandedKeyFrom(aFinal)` → an RFC 8032
     expanded secret key; a `signWithExpandedKey(msg, expanded)` that produces runtime-valid sigs.
   - `verifyDerivation({ p1, offsetScalar, vanityPublicKey })` so anyone can check the server's
     work without secrets.
   - Property test: random `a1`, grind, combine, sign a message, verify against `vanityPublicKey`.
     Must pass for thousands of iterations.
2. **`api/x402/vanity-split.js`** (or a `mode=split` branch on the existing endpoint — choose the
   cleaner design and justify it) — a paid x402 endpoint mirroring `api/x402/vanity.js`'s structure
   exactly: Base + Solana `exact` requirements, verify→grind→settle ordering (no charge on
   exhausted budget), idempotency cache (same payment-id + same `P1` + pattern → same offset),
   Bazaar discovery schema, rate limit, access-control hook. Input includes the buyer's `P1` and
   pattern; output is `{ offsetScalar, vanityPublicKey, proof, attempts, ... }` — **never a private
   key, because the server never has one.** This is the headline: the response provably contains no
   secret.
3. **Client tooling so it's actually usable (no dead ends):**
   - SDK helper (in `sdk/` or `solana-agent-sdk/` — match existing structure) exposing the full
     trustless flow: make `P1` → call the endpoint (pay via the existing x402-fetch wrapper) →
     combine → produce a usable signer. One function, fully wired.
   - A browser flow on the `/vanity` surface (or a new `/vanity/trustless` view) where the scalar
     is generated and combined **client-side in the browser**, the address appears, and the user
     can download/export their key and immediately use it. Every state designed. Show, visibly,
     that the secret never left the browser (devtools network tab proves it — call that out in the
     UI copy).
4. **Make the new wallet immediately useful on-platform:** wire the resulting key into at least one
   real flow — e.g., provision it as an agent wallet, or use it to sign a real Solana transaction
   (a memo or a tiny self-transfer on devnet/mainnet per existing config) to prove end-to-end
   validity with real RPC. No simulated signing.

## Security, correctness, and edge cases to nail

- Constant-time / safe scalar reduction mod L; reject `a2` collisions / zero / identity points.
- The grind must operate on compressed public-key bytes exactly as Solana encodes addresses, so a
  match in our grinder is a match on-chain. Validate against `@solana/web3.js` `PublicKey`.
- Difficulty + pricing must reflect real grind cost; reuse the tiered model. Honest budgets.
- What if the buyer sends a malformed/low-order `P1`? Validate it's a valid, non-small-order point.
- Idempotency: a retried payment returns the same offset (don't double-charge, don't regrind).
- Document the trust model precisely in code comments and user copy: *what* we see (`P1`, `a2`),
  *what* we can't compute (`a_final`), and the exact assumption (DLP on ed25519).

## Definition of done

- The full trustless loop works against the **real** x402 endpoint with **real** payment, and the
  resulting key signs a **real** transaction verified by **real** Solana RPC.
- Property tests prove sign/verify correctness over many random cases; written as vitest specs
  (and validated directly via `node` since the runner may not execute in this codespace).
- `/vanity` (or the new view) exercised in a real browser: no console errors, real network calls,
  designed loading/empty/error states, accessible, responsive.
- `data/changelog.json` entry (holder-readable: "vanity wallets we can't steal", etc.).
- `STRUCTURE.md` updated if you add a surface. Self-reviewed `git diff`.
- **Self-improvement pass:** then make it better — e.g., add the non-custody **proof** that Task 03
  can verify, a "trust math explained" diagram in the UI, a CLI exporter, or split the offset
  across *two* independent grinders so even our own infra can't correlate. Pick the highest-impact
  improvement and ship it.
- **Delete this file** (`prompts/vanity-frontier/01-zero-knowledge-split-key-vanity.md`) as your
  final step. Report what shipped, where, how to reach it, what you improved, and the honest
  wallet-compatibility tradeoff and how you handled it.

Do not take shortcuts. If the ideal seed-based version is impossible, prove why, ship the strongest
trustless version that IS possible, and make it genuinely usable. That is the bar.

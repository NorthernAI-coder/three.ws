# Task 02 — Confidential x402: "Sealed Compute" standard + SDK + openers

**Read `prompts/vanity-frontier/00-README.md` and `/workspaces/three.ws/CLAUDE.md` first** for the
operating rules, codespace traps, and file map. Don't skip them.

You are a senior protocol + DX engineer. Turn our one-off "sealed vanity delivery" into
**infrastructure**: a clean, documented, reusable way for *any* x402 paid endpoint to return a
result that **only the paying buyer can decrypt** — and ship the tooling that makes adopting it
trivial. Make three.ws the author of confidential x402.

---

## Why this is gamechanging

x402 lets machines pay for HTTP responses. But every x402 response today is plaintext to anyone in
the path: the server, proxies, facilitators, MCP hosts, logs, caches. For anything sensitive — keys,
seed phrases, private model outputs, personal data, credentials — that's a non-starter. We already
proved the primitive works for vanity keys (`src/solana/vanity/sealed-envelope.js`,
`x25519-hkdf-sha256-aes256gcm/v1`). Generalize it into a **spec + middleware + client openers** so
the buyer's payment and their decryption key are linked, and the secret is unreadable to everyone
but them. This is a primitive the whole x402 ecosystem lacks. We ship it first, with our name on it.

## What to build (all real, all wired)

1. **The spec.** `docs/x402-sealed-compute.md` — a precise, implementable specification:
   - Envelope format (versioned scheme string, fields, encodings), KDF/AEAD choices, AAD binding,
     forward secrecy properties, and the threat model (what a malicious server/proxy/facilitator
     can and cannot do).
   - **Key binding options**, designed thoughtfully: (a) buyer supplies an X25519 public key in the
     request (today's `sealTo`); (b) **derive the sealing key from the x402 payment itself** so the
     payer is cryptographically the only one who can open it — e.g., bind to the payer's Solana/EVM
     account or a key proven via the payment signature. Investigate feasibility of (b) deeply
     (can we get a Diffie-Hellman-capable key from the payer's wallet pubkey? ed25519→X25519
     conversion of the payer key? a challenge in the 402 the payer signs?). Specify the strongest
     option that actually works with real wallets/facilitators, and keep (a) as the universal
     fallback.
   - Discovery: how a Bazaar-listed endpoint advertises "I can seal to you" so clients negotiate it.
2. **Server middleware.** A reusable wrapper in `api/_lib/x402/` (e.g. `sealed-response.js`) that
   any paid endpoint composes to seal its result when the buyer requests it — refactor
   `api/x402/vanity.js` to use it (don't duplicate logic). Must integrate cleanly with the existing
   verify→settle ordering and the idempotency cache (the cache must store only sealed bytes).
3. **MCP support.** Extend `mcp-server/src/payments.js` (the `paid()` wrapper) so MCP tools can
   return sealed results — critical, because MCP hosts log everything. A tool opts in, the host
   only ever sees ciphertext.
4. **Client openers — make adoption one line (no dead ends):**
   - **JS/TS SDK**: a published-style helper in `packages/` (mirror `packages/x402-fetch`) — e.g.
     `@three-ws/x402-sealed` — that wraps a fetch call, supplies the buyer key, pays the 402, and
     **returns the already-decrypted result**. Isomorphic (Node + browser).
   - **Browser**: a real opener UI (a `/sealed` or `/vanity` panel) where a user pastes/generates a
     key and opens an envelope locally, proving the secret never round-trips to us.
   - **CLI**: a `scripts/`-housed (or `sdk/` bin) opener so power users can decrypt from a terminal.
5. **Reference adopters.** Wire at least one *additional* existing paid endpoint to optionally seal
   its output (pick a real one in `api/x402/`), proving the middleware is general, not vanity-only.

## Correctness, security, edge cases

- Cross-implementation test vectors: seal in Node, open in the browser bundle, and vice versa —
  byte-identical. Tamper tests (flipped ciphertext/AAD/nonce must fail the tag).
- Versioned scheme negotiation so future ciphers don't break old clients.
- Never let plaintext touch a log, the response body (when sealing), or the idempotency cache.
- Honest docs on what sealing does NOT protect (traffic analysis, the buyer's own key hygiene).
- Reuse proven primitives: `@noble/curves/ed25519.js` (x25519), `@noble/hashes` HKDF, WebCrypto
  AES-GCM, or Node built-ins where server-only. Match the existing module's style.

## Definition of done

- Spec published; middleware live; `api/x402/vanity.js` refactored onto it with no behavior
  regression; a second endpoint sealing; MCP sealing working; SDK + browser + CLI openers all
  decrypt a **real** sealed response end-to-end. Real x402 payments throughout — no mocks.
- Tests (vitest specs + direct `node` verification, since the runner may not execute here),
  including cross-Node/browser vectors and tamper rejection.
- `data/changelog.json` entry; `docs/` linked; `STRUCTURE.md` updated.
- **Self-improvement pass:** then push further — e.g., implement key-binding option (b) so opening
  requires *being the payer*, add an HPKE-aligned scheme for standards credibility, or a
  "verifiably sealed" badge the Bazaar shows. Ship the best one.
- **Delete this file** (`prompts/vanity-frontier/02-confidential-x402-sealed-compute.md`) last.
  Report what shipped, where, how to adopt it in one line, and any tradeoffs.

No mock crypto, no fake payments, no half-wired SDK. The deliverable is something another team
could adopt in their own x402 service this afternoon.

<!-- AUTO:self-delete-on-complete -->

---

## ✅ On completion — delete this file

This file is a unit of work, not a permanent doc. The moment every item above is **built, wired, verified, and committed** to the "Definition of done" in the repo-root `CLAUDE.md`, remove it in the same change:

```bash
git rm "prompts/vanity-frontier/02-confidential-x402-sealed-compute.md"
```

Stage the deletion alongside your implementation and include it in the completion commit. This directory is the backlog: a file that still exists is unfinished work; a file that is gone has shipped. Do not delete early, and never leave a completed prompt behind.

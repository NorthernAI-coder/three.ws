# Vanity × x402 × Sealed-Delivery — Innovation Program

> A suite of **net-new, gamechanging** features built on three.ws's vanity-address
> grinder, x402 pay-per-call rails, and the ECIES sealed-envelope primitive.
> Each task below is a **standalone agent chat**. Pick one, build it to a
> world-class bar, then delete its prompt file.

These are not "table stakes" features. The whole point is to invent things **no
other platform has** — to make three.ws the obvious home for programmable,
trustless, encrypted, agent-native wallet creation. Read the wedge in each task;
if you can think of a sharper one, take it.

---

## What already exists (your foundation — read before building)

The grind + pay + seal stack is live and real. Build on it; do not reinvent it.

- **Paid endpoint** — [api/x402/vanity.js](../../api/x402/vanity.js). `GET` with
  `prefix` / `suffix` / `ignoreCase` / `format=keypair|mnemonic` / `strength=128|256`
  / `sealTo=<X25519 pubkey>`. Pays via x402, grinds, returns the address + secret
  (or a `sealedSecret` envelope when `sealTo` is set). Difficulty-tiered pricing,
  idempotency cache, settle-after-grind.
- **Sealed envelope** — [src/solana/vanity/sealed-envelope.js](../../src/solana/vanity/sealed-envelope.js).
  ECIES `x25519-hkdf-sha256-aes256gcm/v1`. `sealToRecipient(plaintext, pubKey)`,
  `openSealed(env, secret)`, `openSealedText`, `generateRecipientKeypair()`,
  `parseX25519Key()`, `SEALED_ENVELOPE_SCHEME`. Isomorphic (@noble/curves +
  @noble/hashes + WebCrypto), runs in Node serverless and the browser.
- **Grinders** — [src/solana/vanity/grinder-node.js](../../src/solana/vanity/grinder-node.js)
  (`grindVanityNode`, Rust/WASM ed25519, ~25k/s single-thread, server, ≤3 chars,
  `GrindExhaustedError`); [src/solana/vanity/grinder.js](../../src/solana/vanity/grinder.js)
  (`grindVanity`, browser Web Worker pool, races all cores, pause/resume/stop);
  WASM source in [crates/vanity-grinder](../../crates/vanity-grinder) rebuilt with
  `npm run build:wasm` (needs the Rust toolchain — already vendored in `wasm/`).
- **Seed phrases** — [src/solana/vanity/mnemonic.js](../../src/solana/vanity/mnemonic.js)
  (BIP-39 + SLIP-0010, `deriveSolanaKeypair`, `generateMnemonic`, `mnemonicToSeed`,
  vendored wordlist) and [src/solana/vanity/mnemonic-grinder.js](../../src/solana/vanity/mnemonic-grinder.js)
  (`grindVanityMnemonic`). Default path `m/44'/501'/0'/0'`.
- **x402 plumbing** — [api/_lib/x402-spec.js](../../api/_lib/x402-spec.js)
  (`verifyPayment`, `settlePayment`, `send402`, `buildBazaarSchema`,
  `NETWORK_BASE_MAINNET`, `NETWORK_SOLANA_MAINNET`),
  [api/_lib/x402-paid-endpoint.js](../../api/_lib/x402-paid-endpoint.js) (reusable
  paid-flow template), [api/_lib/x402/payment-identifier-server.js](../../api/_lib/x402/payment-identifier-server.js)
  (idempotency: `checkCache` / `storeResponse`). Client SDK in
  [solana-agent-sdk/](../../solana-agent-sdk) and `@x402/fetch`.
- **Custodial wallets + secrets at rest** — [api/_lib/agent-wallet.js](../../api/_lib/agent-wallet.js)
  (`recoverSolanaAgentKeypair`), [api/_lib/secret-box.js](../../api/_lib/secret-box.js)
  (AES-256-GCM, `encryptSecret`/`decryptSecret`, `WALLET_ENCRYPTION_KEY`). Custody
  model: [docs/internal/AGENT-WALLET-CUSTODY.md](../../docs/internal/AGENT-WALLET-CUSTODY.md).
- **Real deps you will reach for** (already installed — never `npm install`):
  `@coinbase/x402` + `@x402/*`, `@noble/curves`, `@noble/hashes`, `bs58`,
  `@solana/web3.js`, `@solana/pay` (Solana Pay URIs/QR), `qrcode`,
  `@solana/spl-token`, `helius-sdk` (RPC), `@metaplex-foundation/mpl-core` +
  `@metaplex-foundation/umi` (NFTs/assets), `@metaplex-foundation/mpl-agent-registry`,
  `@ethereum-attestation-service/eas-sdk` (EAS attestations on Base), `ethers` /
  `viem` (EVM), `@vercel/og` (share cards), `@upstash/redis` (state),
  `@neondatabase/serverless` (Postgres), `nanoid`, `jose` (JWT).

Orientation: [STRUCTURE.md](../../STRUCTURE.md) maps every product surface to a
directory. Read it before exploring.

---

## House rules — every task inherits these (non-negotiable)

These restate and extend [CLAUDE.md](../../CLAUDE.md). If anything here conflicts
with CLAUDE.md, CLAUDE.md wins.

1. **Be innovative.** You are a senior engineer + product thinker, not a ticket
   closer. Build the version someone screenshots and shares. If you spot a sharper
   design mid-build, take it. Study how Stripe / Linear / Vercel / Phantom would
   ship this and match that bar.
2. **No mocks. No fake data. No placeholders. No `setTimeout` fake loading.** Real
   APIs, real endpoints, real on-chain calls, real payments. If a credential is
   missing, find it in `.env` / `vercel env` and proceed; never stub.
3. **No TODOs, no "implement later", no `throw new Error("not implemented")`, no
   commented-out code.** If you write it, finish it. Errors handled at boundaries.
4. **100% wired & reachable.** Every button works, every link goes somewhere, every
   state (loading / empty / error / populated / overflow) is designed. A feature is
   not done until a user can navigate to it and away from it naturally.
5. **The only coin is `$THREE`** (CA `FeMbDoX7R1Psc4GEcvJdsbNbZA3bfztcyDCatJVJpump`).
   Never reference, hardcode, or recommend any other coin anywhere. Runtime
   user-supplied mints in coin-agnostic plumbing are the only exception.
6. **Secrets discipline.** A private key / seed phrase / Shamir share must NEVER
   appear in a log, an API response (unless it is the user's own freshly-ground key
   they paid for), an analytics event, or an error. Prefer the sealed envelope so
   plaintext never touches the wire. At-rest custody uses `secret-box.js`.
7. **Real crypto only.** Use `@noble/*`, WebCrypto, and the existing primitives.
   Never hand-roll a cipher; never weaken the sealed-envelope scheme. Pin behavior
   with test vectors.

## Workflow & logistics (every task)

- **Concurrent agents share this worktree.** Stage **explicit paths only** (never
  `git add -A`/`.`). Re-check `git status` + `git diff --staged` right before any
  commit. Other agents may be editing nearby files — read before you write.
- **Never run `npm install`** in this codespace — `node_modules`/npm cache are
  corrupted and install hangs the box. Everything you need is already installed.
- `npx vercel build` overwrites `api/*.js` in place with bundles — don't commit
  those; recover with `git restore -- api/ public/`.
- **Tests:** add/extend `vitest` specs under `tests/`; pin crypto/protocol behavior
  with vectors. Run `npm test` (or `vitest run <file>`) when the environment allows.
- **Changelog:** every user-visible change gets a plain-language entry in
  [data/changelog.json](../../data/changelog.json); run `npm run build:pages` to
  validate + regenerate.
- **Pushing (only when asked):** push to **both** remotes — `git push threeD main`
  **and** `git push threews main`. Never pull/fetch from `threeD`.

## Closeout protocol (every task ends this way)

1. Run the task's **Definition of done** checklist; fix every gap.
2. Run the **Self-review** (lazy check / user check / integration check / edge-case
   check / pride check). Fix everything you find.
3. **Second pass — improve it.** Now that it works, ask: what would make this
   genuinely gamechanging instead of merely complete? Add the keyboard shortcut, the
   verifier, the share card, the empty-state illustration, the cross-feature wire.
   Implement those improvements.
4. Write a short summary of what you built, the real APIs it calls, and how you
   verified it live.
5. **Delete this prompt file** (it has served its purpose). If every task file in
   `prompts/vanity-x402/` is gone, delete this README too — the program shipped.

---

## The tasks (independent; suggested order)

| # | File | The wedge |
| - | ---- | --------- |
| 01 | [provably-fair-grinding](./01-provably-fair-grinding.md) | Prove the operator *can't* keep your key or skim. Trustless vanity. |
| 02 | [grind-bounty-market](./02-grind-bounty-market.md) | A decentralized x402 bounty market for hard patterns — fleet grinds, key stays sealed. |
| 03 | [sealed-wallet-drops](./03-sealed-wallet-drops.md) | End-to-end encrypted, pre-funded wallet "gifts" claimable by link/QR/3D agent. |
| 04 | [threshold-sealed-delivery](./04-threshold-sealed-delivery.md) | Split a key at birth across a team/DAO — no single party ever holds it whole. |
| 05 | [vanity-as-skill-mcp](./05-vanity-as-skill-mcp.md) | An MCP skill so autonomous AI agents self-mint a branded, attested, sealed wallet. |
| 06 | [proof-of-grind](./06-proof-of-grind.md) | Verifiable rarity receipts + a public gallery of the rarest addresses ground here. |
| 07 | [streaming-pay-as-you-grind](./07-streaming-pay-as-you-grind.md) | Live SSE grind with x402 pay-as-you-go and automatic refund of unused budget. |

01 produces the attestation primitive that 02 and 06 lean on, so doing it first
helps — but each task is independently shippable.

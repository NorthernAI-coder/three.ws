# Agent Wallet Custody Model

How three.ws holds, protects, spends, and lets owners recover the funds in an
agent's **custodial Solana wallet** — and the procedure to rotate the key that
protects them.

Audience: engineers and security reviewers. This is the doc to read before
touching anything that decrypts an agent secret or moves agent funds.

---

## What is custodial here

Every agent gets a real Solana keypair generated server-side
(`generateSolanaAgentWallet`, `api/_lib/agent-wallet.js`). The platform keeps the
secret so the agent can act autonomously (trade, snipe, pay via x402) without a
human signing each transaction. Concretely:

- The 64-byte ed25519 secret is base64-encoded, then encrypted at rest with
  **AES-256-GCM** and stored as `agent_identities.meta.encrypted_solana_secret`.
  The public address is `meta.solana_address`.
- The AES key is **derived from `JWT_SECRET`** via HKDF-SHA256 with a fixed salt
  (`'agent-wallet-v1'`) and an empty info — see `deriveKey()` in
  `api/_lib/agent-wallet.js`. There is no per-wallet key; one server secret keys
  every agent wallet's encryption.
- Decryption happens **only** through `recoverSolanaAgentKeypair()`, and only
  after the request has passed authentication + ownership checks at the calling
  endpoint. Every recover call takes an `audit` argument carrying the **reason**.

This is a deliberate custodial design: the value of autonomous agents requires
the platform to be able to sign. The controls below make that trustworthy.

## Where the secret may and may not appear

| Place | Allowed? |
| --- | --- |
| `agent_identities.meta.encrypted_solana_secret` (encrypted at rest) | ✅ the only at-rest home |
| In memory transiently, inside `recoverSolanaAgentKeypair`, to sign | ✅ |
| Any API **response** body | ❌ never |
| Any **log line** (`console.*`, `logger`, audit meta) | ❌ never |
| Any **error message** or stack handed to a caller | ❌ never |
| The custody audit trail `meta` jsonb | ❌ never — only the public address |

The audit `git grep` that gates this (see "Verifying" below) must stay clean.
The only endpoint that returns a raw secret key is `api/x402/vanity.js`, which
returns the **user's own freshly-ground** keypair at provisioning time — that is
not a custodial agent secret and is by design. That endpoint never persists the
secret (`cache-control: no-store`, no DB write, no log line); it exists only in
the response body for one TLS-protected delivery. It offers two delivery
hardening options for buyers who don't want the plaintext to touch the wire:

- `format=mnemonic` returns a BIP-39 seed phrase instead of a raw key — the
  recoverable form for consumer wallets — derived at `m/44'/501'/0'/0'`.
- `sealTo=<X25519 public key>` seals the secret to a key the buyer controls via
  an ECIES envelope (`x25519-hkdf-sha256-aes256gcm`, see
  `src/solana/vanity/sealed-envelope.js`). When set, the plaintext secret is
  **omitted** from the response entirely — only `sealedSecret` is returned, so
  the cleartext never appears in the body, a proxy log, or the idempotency
  cache. The buyer opens it client-side with `openSealed` and the matching
  private key. The ephemeral server-side secret is discarded immediately, so the
  envelope is forward-secret with respect to the platform. This is the only
  custody-relevant secret path that can be made zero-plaintext end-to-end.

## Decryption is gated + audited

`recoverSolanaAgentKeypair(encryptedSecret, audit)` is the single decrypt path.
Callers must:

1. **Authenticate** the request (session cookie or bearer) and **verify
   ownership** (`agent_identities.user_id === auth.userId`) before calling.
2. Pass `audit = { agentId, userId, reason, meta }`. The reason is a short verb
   such as `withdraw`, `x402_pay_tool_call`, `sniper_buy`, `pumpfun_action`.

Each recover writes **two** audit records, fire-and-forget:

- a `usage_events` row (`kind: 'solana_key_use'`, `tool: <reason>`), and
- an `agent_custody_events` row (`event_type: 'key_recover'`, `reason: <reason>`)
  — the owner-viewable custody trail.

So every single decrypt of a custodial key is traceable to who, when, and why.

## Spend governance — one policy, enforced everywhere

`api/_lib/agent-trade-guards.js` is the **single** spend policy. Limits live on
`agent_identities.meta.spend_limits`:

```
{ daily_usd, per_tx_usd, withdraw_allowlist: [base58…] }
```

- `daily_usd` — rolling-24h USD-equivalent outflow ceiling.
- `per_tx_usd` — max USD-equivalent for any single outbound transaction.
- `withdraw_allowlist` — if non-empty, withdrawals may only target these
  addresses.

Limits are **opt-in**: an unset ceiling (`null`) means "no global cap", so an
agent keeps its own per-feature caps (e.g. the sniper's lamports budget) until an
owner sets a ceiling. Once set, the ceiling is a **hard** limit applied uniformly
across **every** outbound path via `enforceSpendLimit(...)`:

| Path | Enforced in | Recorded as |
| --- | --- | --- |
| Withdraw | `api/agents/solana-wallet.js` `handleWithdraw` | `spend` / `withdraw` |
| x402 pay | `api/x402-pay.js` `runFlow` | `spend` / `x402` |
| Snipe | `workers/agent-sniper/executor.js` | `spend` / `snipe` |
| Trade | the authenticated agent-wallet trade endpoint (calls the module) | `spend` / `trade` |

Enforcement happens **before** any signing, so a breach moves no funds and
returns a structured **4xx** (`SpendLimitError`, status 403) with the reason —
never a 500. Every confirmed/pending outbound spend is written to
`agent_custody_events` (`event_type: 'spend'`), which is also the ledger the
daily ceiling sums over the trailing 24h.

Denomination: SOL and USDC are always priceable (USDC is dollar-denominated; SOL
is priced via `solUsdPrice()` — Jupiter Lite primary, CoinGecko fallback). An
arbitrary SPL token that cannot be priced is governed by the withdraw allowlist
(and the per-user withdraw rate limit), not the USD cap — documented so a price
outage can never strand an owner's own recovery withdrawal.

## Withdraw / sweep — the recovery path

`POST /api/agents/:id/solana/withdraw` (also reachable as `…/wallet/withdraw`),
owner-authenticated, server-signed:

- Validates the destination is a real base58, **on-curve** address (rejects PDAs,
  which could make funds unrecoverable) and not the wallet itself.
- On a SOL **Max**, reserves the rent-exempt minimum + a fee headroom so a sweep
  can never brick the account or fail on fees. SPL transfers ensure the wallet
  holds enough SOL to pay the fee and (if needed) open the recipient's token
  account.
- **Idempotent**: a client `idempotency_key` claims a row under a unique index; a
  retry with the same key never double-sends (returns the prior signature when
  confirmed, `in_progress` while pending). An ambiguous confirmation leaves the
  row `pending` and hands back the signature to verify rather than risking a
  double-spend on retry.
- Honors a `simulate` flag for tests; defaults to a live submit + confirm. No
  fabricated confirmations.

## The custody audit trail

`agent_custody_events` (migration
`api/_lib/migrations/20260617000000_agent_custody.sql`) is the per-agent,
owner-viewable record of key recoveries, withdrawals, automated spends, and limit
changes. Surfaced at `GET /api/agents/:id/solana/custody` and rendered in the
Agent Wallet hub's Withdraw → Activity view. Withdrawals and limit changes are
*also* mirrored into the platform-wide `audit_log` via `logAudit()`.

---

## Key rotation (`JWT_SECRET`)

Because the AES key is derived from `JWT_SECRET`, **rotating `JWT_SECRET` without
re-encryption invalidates every stored agent secret** — `recoverSolanaAgentKeypair`
would fail to decrypt and no agent could sign or be swept. Rotation is therefore
a **re-encryption migration**, not a config flip. It is documented here even
though it is not being executed now.

### Why rotation is coupled to the wallets

`deriveKey()` reads `env.JWT_SECRET` at call time. There is no key version tag on
the ciphertext today (the salt is the constant `'agent-wallet-v1'`). So the
*current* `JWT_SECRET` must be able to decrypt *every* existing
`encrypted_solana_secret`. Change the secret and every ciphertext becomes
undecryptable.

### Procedure (re-encrypt under a new secret)

Run as a one-shot, reversible migration with **both** secrets available:

1. **Stage both secrets.** Set `JWT_SECRET` (old, current) and a new
   `JWT_SECRET_NEXT` in the environment. Do not remove the old one yet.
2. **Snapshot.** Back up `agent_identities` (at least `id`, `meta`) so the
   re-encryption is reversible.
3. **Re-encrypt offline.** For each agent with a `meta.encrypted_solana_secret`:
   decrypt with a key derived from the **old** `JWT_SECRET`, then re-encrypt with
   a key derived from **`JWT_SECRET_NEXT`**, and write the new ciphertext back.
   Do this in a script that imports the crypto helpers — the plaintext secret
   must never be logged or persisted, only held in memory for the single
   re-encrypt step. Process in batches; verify each new ciphertext decrypts under
   the new key before writing.
4. **Verify.** Spot-check that `recoverSolanaAgentKeypair` reproduces the same
   `publicKey` (it must equal `meta.solana_address`) for a sample of agents using
   the **new** key.
5. **Cut over.** Promote `JWT_SECRET_NEXT` to `JWT_SECRET` and redeploy. Sessions
   signed with the old `JWT_SECRET` will invalidate at cutover — expect users to
   re-authenticate (acceptable; it is a security rotation).
6. **Retire the old secret** once every wallet is confirmed re-encrypted and the
   deploy is healthy. Destroy the snapshot per data-retention policy.

### Hardening this further (future work)

- **Version the ciphertext.** Prefix stored ciphertext with a key-version byte /
  change the HKDF `info` per version so old and new ciphertexts can coexist
  during a rolling rotation (decrypt-on-read, lazy re-encrypt-on-write) instead
  of a big-bang migration.
- **Separate the wallet KEK from `JWT_SECRET`.** A dedicated
  `AGENT_WALLET_ENCRYPTION_KEY` would decouple session-secret rotation from
  wallet re-encryption entirely. Migrating to it is itself a re-encryption pass
  (same procedure as above, old key = `JWT_SECRET`, new key = the dedicated KEK).
- **Move to a KMS / HSM.** Wrap the data key with a managed KMS key so the raw
  KEK never lives in an env var; rotation becomes a KMS key rotation + re-wrap.

---

## Verifying

- **No secret leaks:** `git grep -nE "encrypted_solana_secret|secretKey" api/`
  must show only at-rest storage, the internal recover/generate helpers, and
  validation-message strings — never a value in a response, log, or error.
- **Tests:** withdraw (SOL + SPL, Max rent/fee reserve, idempotency), spend-limit
  enforcement (per-tx, daily, allowlist, **freeze**), and address validation are
  covered in `tests/agent-custody-guards.test.js` and
  `tests/agent-wallet-withdraw.test.js`. CSRF gates on the fund-moving endpoints
  are covered in `tests/api/security-csrf-gates.test.js`.

---

## Security hardening pass — 2026-06-19

This supersedes parts of the description above; the older sections describe the
original v1 scheme for historical context.

**The secret box is now one module.** All at-rest encryption lives in
`api/_lib/secret-box.js` (`encryptSecret` / `decryptSecret` / `isEncryptedSecret`),
imported by `agent-wallet.js`, the coin treasury, and the coin launcher. There is
a single implementation — no per-call-site crypto.

- **v2 scheme (current):** AES-256-GCM with a key derived (HKDF-SHA256) from a
  **dedicated `WALLET_ENCRYPTION_KEY`**, decoupled from `JWT_SECRET`, with a
  **random per-record salt** and a `v2:` version prefix. New writes are always v2.
- **Legacy read:** v1 ciphertext (no prefix; `JWT_SECRET` + constant salt) still
  decrypts via the fallback branch so existing rows keep working.
- **Fixed regression:** imported / regenerated Solana wallets in
  `api/agents/solana-wallet.js` used to write the weaker v1 ciphertext directly.
  They now go through the shared `encryptSecret` (v2) like generated wallets.

**Coin creator keys are encrypted at rest.** `coin.metadata.creator_secret_b64`
was previously stored as plaintext base64 — a DB read yielded a usable signing
key. The launcher (`scripts/coin-cli.mjs`) now encrypts it with the same secret
box; the treasury loader (`loadCoinCreatorFromCoin`, now async) decrypts `v2:`
blobs and reads legacy plaintext with a loud deprecation warning.

**CSRF on every custodial money path.** `requireCsrf` now gates withdraw, both
trade endpoints, and x402-pay (settle path; preview/quote stay exempt to avoid
burning single-use tokens). Bearer/API-key callers remain exempt — the token is
itself proof of intent. Frontend mutating clients send `x-csrf-token` via
`consumeCsrfToken()`.

**Wallet freeze (kill switch).** `meta.spend_limits.frozen` is enforced in the
shared spend policy (`enforceSpendLimit` + `reserveSpendUsd`), so a single flag
pauses **every autonomous path** (trade, snipe, x402) uniformly. The owner's own
**withdraw is deliberately never blocked** — a freeze locks down a misbehaving
agent without trapping its funds. Toggle: owner-only, one tap, under the wallet
hub's *Limits & Safety*.

### Remaining follow-ups (prioritized)

1. **KMS / HSM envelope encryption.** Generate a per-record data key, encrypt the
   wallet secret with it, and wrap the data key with a managed KMS key (AWS KMS
   `GenerateDataKey`, GCP Cloud KMS, or Vault transit). Decryption then requires
   an online, auditable, revocable KMS call — a raw DB dump no longer yields
   plaintext, and master-key rotation becomes a KMS operation instead of a
   re-encrypt-every-row migration. **This is the highest-value remaining item:**
   today a single `WALLET_ENCRYPTION_KEY` leak still decrypts every wallet.
2. **Automated rotation / re-encrypt sweep.** Add `scripts/reencrypt-agent-wallets.mjs`
   that decrypts each record and rewrites it as v2 under a new key — the same
   keypair/address, so no funds move. Then a forced `WALLET_ENCRYPTION_KEY`
   rotation becomes a one-command operation, and v1 records can finally be retired.
3. **Bind `agent_id` as AES-GCM `additionalData` (AAD).** Today a ciphertext is
   not bound to its agent, so a DB-write attacker could swap one agent's encrypted
   key into another. AAD = `utf8(agentId)` on encrypt + decrypt makes a swapped
   ciphertext fail to decrypt. Requires a re-encrypt pass (item 2) to apply to
   existing rows.
4. **Drop the `JWT_SECRET` legacy read** once item 2 has migrated every record to
   v2, and fail closed in production when `WALLET_ENCRYPTION_KEY` is unset (today
   it warns and falls back). This finally decouples session-secret rotation from
   custody entirely.

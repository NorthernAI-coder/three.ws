# 01 — Threshold / MPC Custody: kill the single-secret blast radius

> Read `00-README.md` first. Obey every rule there. This feature touches the
> crown jewels — agent private keys. Move with extreme care and threaten-model
> relentlessly. Delete this file only when fully done + self-improved.

## The problem worth solving

Today every custodial Solana key is AES-256-GCM encrypted under **one**
process-wide `WALLET_ENCRYPTION_KEY` (`api/_lib/secret-box.js`). Per-record salts
vary the derived key, but the master is shared: leak that one env var (or compromise
the box that holds it) and **every wallet on the platform decrypts**. A single
point of catastrophic failure protecting real money is unacceptable for a
platform that wants to be the best in the world.

## The game-changing feature

Build **threshold custody**: the signing capability for each agent wallet is
split across **independent trust domains** so that **no single compromised
system can produce a usable signature or reconstruct a key**. A raw database
dump becomes worthless. This is the kind of custody architecture exchanges and
MPC wallet vendors charge for — bring it to autonomous agent wallets, wired for
real.

You choose the strongest **real, vetted, dependency-audited** mechanism that
fits Solana ed25519 and our serverless stack. Two acceptable directions —
evaluate both against actual available libraries before committing:

1. **True MPC/TSS (FROST-ed25519 or equivalent):** key shares never combine into
   a full key, even momentarily; signing is an interactive protocol across
   domains. Strongest. Only ship if a maintained, audited library exists and you
   can wire it for real (no half-implemented crypto).
2. **Cross-domain split-key (Shamir over the seed, k-of-n):** the seed is
   reconstructed in memory only at sign time, from shares fetched live from
   **separate trust domains** (e.g. the Vercel app, a dedicated Cloudflare Worker
   signing service, and a cold recovery share / KMS). A leak of any single store
   yields an unusable share. Pragmatic, strong, shippable today.

**Non-negotiable properties either way:**
- Shares live in **genuinely separate** trust domains (different services /
  secrets / network boundaries) — not three values in the same Postgres row.
- A full-DB compromise (the realistic attack) cannot sign or reconstruct.
- Reconstruction (if any) happens in memory, for the minimum window, and the
  material is zeroed after use.
- **Policy-scoped authority:** routine, in-policy autonomous spends sign under
  the standard threshold; high-risk actions (large withdraw, key export, policy
  disable, unfreeze) require an **additional owner-controlled share** so the
  platform alone can never perform them (coordinate with `05-passkey-stepup.md`
  for the owner factor — design the share interface so it can plug in).

## What to build (wire all of it, for real)

- A **custody provider abstraction** that the existing call sites
  (`recoverSolanaAgentKeypair`, the sign paths in `solana-wallet.js`,
  `solana-trade.js`, `x402-pay.js`) call instead of reaching into `secret-box`
  directly — so the signing mechanism is swappable and auditable in one place.
  Keep `secret-box.js` as the legacy/v2 provider; add the threshold provider.
- A **real signing path** end to end: an autonomous trade and a withdraw must
  produce a valid, broadcast Solana transaction using the threshold mechanism on
  devnet (and mainnet-ready), with no full key ever persisted.
- A **migration path** from the current single-secret wallets to threshold
  custody — same keypair/address (so no funds move), re-shared under the new
  scheme. Provide `scripts/migrate-to-threshold-custody.mjs` (idempotent, dry-run
  default, resumable, audited). Existing v1/v2 ciphertext must keep working until
  migrated (dual-read), exactly like the secret-box migration did.
- Every share access and every reconstruction writes a `key_recover`-class row to
  `agent_custody_events` with the reason and which domains participated — the
  owner-visible custody trail must show "signed via 2-of-3 threshold."
- **Owner-facing transparency UI** in the wallet hub: a "Custody" surface that
  shows, in plain language, how this wallet is protected ("Your key is split
  across N independent systems; no single one can move your funds"), the share
  health, and the last threshold signatures. Make it reassuring and beautiful —
  this is a trust feature, sell it.

## Architecture guidance

- Put the share-holding signing service in `workers/` (Cloudflare) so it's a
  separate trust domain from the Vercel app, with its own secret. Define the
  inter-domain protocol explicitly; authenticate domain-to-domain calls.
- New persistent state in a **new table** (e.g. `agent_key_shares`) via a new
  migration — never widen another feature's table. Never store two
  reconstructing shares in the same domain/row.
- Reuse `enforceSpendLimit` / `reserveSpendUsd` for policy decisions; the
  threshold layer enforces *who can sign*, the policy layer enforces *whether the
  spend is allowed*. Both must pass.
- Fail safe: if a required domain is unreachable, the wallet cannot sign — it
  does **not** silently fall back to a weaker single-secret path for a
  high-value action. Make the degraded behavior explicit and owner-visible.

## Security checklist (this is the whole point)

- Threat-model: DB dump, single-domain compromise, replay of a share fetch,
  MITM between domains, a malicious operator on one domain, share-fetch DoS.
- No share material in logs, responses, errors, or analytics. Ever.
- Constant-time comparisons where relevant; zero buffers after use.
- Rotation: shares must be re-issuable without moving funds. Document it.

## Testing & verification

- Unit tests for split/reconstruct/sign round-trips and k-of-n thresholds
  (n-1 shares must fail). Tests that a DB-only dump cannot sign.
- A real devnet end-to-end: provision → fund → autonomous trade → withdraw, all
  via threshold signing, asserting a valid on-chain signature and a correct
  custody-event trail.
- Migration test: a v2 wallet migrates to threshold, same address, still signs.

## Deliverables

- Custody provider abstraction + threshold provider, fully wired into all sign
  paths. Separate-domain signing service in `workers/`. New migration + table.
  Migration script. Owner transparency UI in the hub. Tests. Changelog entry
  (security). Updated `docs/internal/AGENT-WALLET-CUSTODY.md`.

## Before you finish

Re-read as an attacker: where could a single domain still betray the user? Close
it. Then make the transparency UI genuinely reassuring (a simple diagram of the
split beats a paragraph). Verify on devnet, review your diff, then **delete this
prompt file.**

# 04 — Verifiable Proof-of-Custody: provable, on-chain-anchored transparency

> Read `00-README.md` first. Obey every rule there. Delete this file only when
> fully done + self-improved.

## The problem worth solving

"Trust us, we hold your keys safely and we don't touch your funds" is exactly
what every custodian says right up until they don't. Owners of custodial agent
wallets have **no way to independently verify** that (a) the platform actually
controls the key it claims to, (b) the wallet's balance is what the UI shows, and
(c) no funds moved without an authorized, logged reason. Exchanges answer this
with proof-of-reserves. No agent-wallet platform offers per-user, cryptographic,
on-chain-anchored proof of custody integrity.

## The game-changing feature

Make custody **publicly, cryptographically verifiable**. The platform
periodically commits a tamper-evident, on-chain-anchored attestation of every
custodial wallet's state, and gives each owner an **inclusion proof** they can
verify *themselves* — plus an independent verifier so they don't have to trust
our word for the verification either. Radical transparency as a product feature:
"don't trust, verify."

## What to build (wire all of it, for real)

1. **Attestation snapshot.** On a schedule (a real cron — see `api/cron/` and the
   existing cron patterns), snapshot each custodial wallet's verifiable facts:
   address (public), live on-chain balance (real Solana RPC), and a commitment to
   its authorized-state (e.g. hash of the latest custody-ledger head — the last
   authorized event id/signature for that wallet). Build a **Merkle tree** over
   all wallets; each leaf = `H(agentId ‖ address ‖ balance ‖ ledgerHead ‖ epoch)`.
2. **On-chain anchor.** Commit the Merkle root on Solana for real (a memo / PDA /
   small program account — pick the cheapest robust option; a signer from
   `api/_lib/solana-signers.js` pays). The root + epoch + tx signature are public.
   Store roots/epochs in a new table via migration.
3. **Per-owner inclusion proof.** An authenticated endpoint returns the owner's
   leaf + Merkle path + the on-chain root reference, so they can prove their
   wallet was included with the stated balance and ledger head at epoch N.
4. **Independent client-side verifier.** Ship a small, dependency-light verifier
   (in the wallet hub and ideally a standalone `/proof` style page) that:
   recomputes the leaf from public data, walks the Merkle path to the root,
   fetches the on-chain anchor, and confirms the root matches — entirely in the
   browser, so the owner verifies without trusting our server. Show a clear
   green "Custody verified on-chain at <time>, anchored in <tx>" with the
   explorer link, and an honest red state if anything fails to verify.
5. **Movement transparency.** Tie verification to the custody ledger so an owner
   can see that **every** balance change between epochs maps to an authorized,
   logged custody event (withdraw / spend with reason). Surface "no unexplained
   movements" as a first-class, verifiable claim — and loudly flag any delta that
   doesn't reconcile.
6. **Public integrity page.** A platform-wide, no-auth page showing the latest
   epoch, root, anchor tx, wallet count, and aggregate (never per-user private
   data) — the public face of "our custody is provable." Beautiful and credible.

## Architecture guidance

- Snapshot/anchor job in `api/cron/` (or `workers/` cron). Merkle + leaf hashing
  in a shared, unit-tested module reused by both the prover (server) and the
  verifier (client) so they can't drift. Use the same hash + leaf encoding on
  both sides — pin it with golden tests.
- New tables for epochs, roots, and (optionally) leaves via a new migration.
  Never expose another owner's leaf; inclusion proofs are per-authenticated-owner.
- Real RPC for balances; real on-chain write for the anchor; real explorer links.
  No simulated roots, no fake "verified" badges.

## Security & correctness

- Leaves must contain **only** public or owner-authorized data — no secrets, no
  cross-tenant leakage. The public page aggregates only.
- The verifier must fail honestly and specifically (which step failed), never
  show green on a mismatch. Treat a failed anchor fetch as "unverified," not
  "verified."
- Make replay/rollback obvious: epochs are monotonic and timestamped; an owner
  can verify the *latest* epoch and walk back.

## Testing

- Unit tests: leaf encoding, Merkle build + proof verify (including tamper →
  fail), epoch monotonicity. Cross-impl test that the JS client verifier accepts
  exactly what the server prover emits and rejects tampered inputs.
- A real devnet run: snapshot → anchor on-chain → fetch proof → verify in a
  headless browser context against the real anchor tx.

## Deliverables

Snapshot+anchor cron, Merkle/leaf shared module, on-chain anchor (real),
per-owner inclusion-proof endpoint, in-browser independent verifier, movement
reconciliation against the custody ledger, public integrity page, new
migration(s), tests, changelog (security/feature).

## Before you finish

Then improve it: add a one-line shareable "verified custody" badge/embed owners
can show off, and make the reconciliation explain any delta in human terms.
Verify the full prove→anchor→verify loop on devnet in a browser, review your
diff, then **delete this prompt file.**

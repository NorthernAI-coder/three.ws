# Task 05 — On-chain Soul & Ownership (the body is rented, the soul is owned)

> Read `prompts/embodiment/00-README.md` and `CLAUDE.md` first. Depends on Tasks 01, 02.
> Builds on the real on-chain identity contracts, IPFS-anchored memory, custodial wallets,
> and $THREE — reuse them, do not deploy parallel systems.

## Mission

Make embodiment **provable, ownable, transferable, and economic** on-chain. Anyone can verify
which mind currently inhabits which body and since when. The owner can load a portable, signed
mind snapshot into a body, transfer or revoke embodiment rights, and gate or charge for
embodiment sessions in $THREE. The body is a rented vessel; the soul — the mind and its
identity — is owned and carried on-chain.

## The innovation bar

"Pairing" is ephemeral and centralized everywhere else. The game-changer: **proof-of-embodiment
on-chain** — a verifiable, time-stamped record of soul↔body, a mind snapshot that is
encrypted-to-owner on IPFS and provably loaded into the hardware, and embodiment rights that are
a real, transferable, revocable on-chain grant settled in $THREE. Sell the agent and the body
goes dark for you and wakes for the new owner — and the chain says so.

## What to build

1. **Proof-of-embodiment.** Extend Task 01's binding into a verifiable on-chain record using the
   existing identity/attestation contracts (ERC-8004 attestation, `ThreeWSFactory.sol`, or an
   `agent-invocation` event — reuse the right one). Record: agent identity, body id, owner,
   `bound_at`, `released_at`, and a hash of the loaded mind snapshot. Public verify endpoint +
   UI badge showing the real tx.
2. **Portable mind snapshot.** Reuse the existing IPFS pin + ECIES encrypt-to-owner path
   (`agent_memory_pins`) to snapshot the agent's mind (persona + salient `agent_memories` +
   identity) to IPFS, encrypted to the owner. The robot loads it on link and the on-chain record
   commits to its hash, so the mind that woke in the body is provably the one the owner anchored.
   No plaintext mind on a third party.
3. **Embodiment rights (transfer/grant/revoke).** A real, ownable embodiment right: the owner can
   grant embodiment of their agent in a given body to themselves or another party, transfer it,
   and revoke it — on-chain, reusing the skill-license (SPL NFT + PDA) pattern or an
   identity-contract grant. Revocation is honored immediately by the runtime (the body returns to
   safe state and unbinds). Coordinate the runtime revoke path with Task 07.
4. **$THREE economics.** Gate or meter embodiment sessions in $THREE via the existing payments
   rails (`ThreeWSPayments.sol`, `agent-payments-sdk`, x402 where it fits, the agent's custodial
   wallet `api/_lib/agent-wallet.js`). E.g. holder-gated access (reuse the holder-gating you
   already have), or pay-per-session metered in $THREE. $THREE is the only coin — never reference
   another token.
5. **UI.** An ownership panel: current soul↔body proof, the anchored mind snapshot (CID + verify),
   grants you hold/issued, transfer/revoke actions, and session billing in $THREE — every state
   designed, every action confirming the real tx/signature.

## Wiring & real-API mandate

- Reuse the real identity, skill-license, payments contracts and the real IPFS/encryption path.
  No new ad-hoc token, no fake CIDs, no simulated tx hashes shown as real.
- Revocation and transfer take real effect in the runtime, not just the DB.

## Definition of done

- [ ] On-chain proof-of-embodiment (soul↔body, owner, times, mind-snapshot hash) written + a
      public verify endpoint + UI badge with the real tx.
- [ ] Mind snapshot pinned to IPFS encrypted-to-owner; the on-chain record commits to its hash;
      the body provably loads it.
- [ ] Transferable + revocable embodiment right on-chain; revoke takes immediate runtime effect
      (safe state + unbind).
- [ ] Embodiment gated/metered in $THREE via the real payments rails; no other coin referenced.
- [ ] Ownership UI reachable; every state + action designed and showing real signatures.
- [ ] No console errors/warnings; `npm test` passes; `git diff` reviewed.
- [ ] Changelog entry (`feature`) + `npm run build:pages`.

## Self-improvement pass

Make ownership emotional and shareable: a public "soul certificate" page for an embodied agent
(verifiable, screenshot-worthy) and a one-click "hand my agent to this robot for the weekend"
time-boxed grant in $THREE. Real on-chain, real settlement.

## When done

Delete this file. Report the contracts/records used, the snapshot/encryption path, the
grant/transfer/revoke mechanism, and the $THREE settlement rail.

<!-- AUTO:self-delete-on-complete -->

---

## ✅ On completion — delete this file

This file is a unit of work, not a permanent doc. The moment every item above is **built, wired, verified, and committed** to the "Definition of done" in the repo-root `CLAUDE.md`, remove it in the same change:

```bash
git rm "prompts/embodiment/05-onchain-soul-ownership.md"
```

Stage the deletion alongside your implementation and include it in the completion commit. This directory is the backlog: a file that still exists is unfinished work; a file that is gone has shipped. Do not delete early, and never leave a completed prompt behind.
